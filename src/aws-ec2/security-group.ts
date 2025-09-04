import { AWSEC2Entity, AWSEC2Definition, AWSEC2State } from "./base.ts";

export interface SecurityGroupRule {
	ip_protocol: string; // tcp | udp | icmp | -1
	from_port?: number;
	to_port?: number;
	cidr_blocks?: string[];
	source_security_group_id?: string;
}

export interface SecurityGroupDefinition extends AWSEC2Definition {
	vpc_id: string;
	group_name: string;
	group_description: string;
	group_id?: string;
	ingress?: SecurityGroupRule[];
	egress?: SecurityGroupRule[];
	tags?: Record<string, string>;
}

export interface SecurityGroupState extends AWSEC2State {
	group_id?: string;
	group_name?: string;
}

export class SecurityGroup extends AWSEC2Entity<SecurityGroupDefinition, SecurityGroupState> {

	override create(): void {
		// If adopting existing SG by ID
		if (this.definition.group_id) {
			this.state.group_id = this.definition.group_id;
			this.state.group_name = this.definition.group_name;
			this.state.existing = true;
			return;
		}

		const resp = this.makeEC2Request('CreateSecurityGroup', {
			GroupName: this.definition.group_name,
			GroupDescription: this.definition.group_description,
			VpcId: this.definition.vpc_id
		});
		const body = resp.body || '';
		const idMatch = /<groupId>(sg-[a-z0-9]+)<\/groupId>|<groupId>(sg-[A-Za-z0-9]+)<\/groupId>|<groupId>(sg-[^<]+)<\/groupId>/.exec(body) || /<groupId>(sg-[^<]+)<\/groupId>/.exec(body) || /<GroupId>(sg-[^<]+)<\/GroupId>/.exec(body);
		const fallbackMatch = /<GroupId>(sg-[a-z0-9]+)<\/GroupId>/.exec(body);
		const groupId = idMatch?.[1] || fallbackMatch?.[1];
		if (!groupId) {
			throw new Error("Failed to parse GroupId from CreateSecurityGroup response");
		}

		// Tagging
		if (this.definition.tags && Object.keys(this.definition.tags).length > 0) {
			let idx = 1;
			const tagParams: Record<string, any> = { 'ResourceId.1': groupId };
			for (const [k, v] of Object.entries(this.definition.tags)) {
				tagParams[`Tag.${idx}.Key`] = k;
				tagParams[`Tag.${idx}.Value`] = v;
				idx++;
			}
			this.makeEC2Request('CreateTags', tagParams);
		}


		// Ingress rules
		if (this.definition.ingress?.length) {
			const ingressRules: SecurityGroupRule[] = this.definition.ingress.map(r => ({
				ip_protocol: r.ip_protocol,
				from_port: r.from_port,
				to_port: r.to_port,
				cidr_blocks: r.cidr_blocks ? [...r.cidr_blocks] as string[] : undefined,
				source_security_group_id: r.source_security_group_id,
			}));
			this.authorizeRules('AuthorizeSecurityGroupIngress', groupId, ingressRules);
		}

		// Egress rules
		if (this.definition.egress?.length) {
			const egressRules: SecurityGroupRule[] = this.definition.egress.map(r => ({
				ip_protocol: r.ip_protocol,
				from_port: r.from_port,
				to_port: r.to_port,
				cidr_blocks: r.cidr_blocks ? [...r.cidr_blocks] as string[] : undefined,
				source_security_group_id: r.source_security_group_id,
			}));
			this.authorizeRules('AuthorizeSecurityGroupEgress', groupId, egressRules);
		}

		this.state.group_id = groupId;
		this.state.group_name = this.definition.group_name;
		this.state.existing = false;
	}

	override delete(): void {
		if (!this.state.group_id) return;
		if (this.state.existing) return;
		this.makeEC2Request('DeleteSecurityGroup', { GroupId: this.state.group_id });
		this.state.group_id = undefined;
	}

	private authorizeRules(action: 'AuthorizeSecurityGroupIngress' | 'AuthorizeSecurityGroupEgress', groupId: string, rules: ReadonlyArray<SecurityGroupRule>): void {
		let permIdx = 1;
		const params: Record<string, any> = { GroupId: groupId };
		for (const rule of rules) {
			params[`IpPermissions.member.${permIdx}.IpProtocol`] = rule.ip_protocol;
			if (rule.from_port !== undefined) params[`IpPermissions.member.${permIdx}.FromPort`] = String(rule.from_port);
			if (rule.to_port !== undefined) params[`IpPermissions.member.${permIdx}.ToPort`] = String(rule.to_port);
			// CIDR blocks
			if (rule.cidr_blocks?.length) {
				let rangeIdx = 1;
				for (const cidr of rule.cidr_blocks) {
					params[`IpPermissions.member.${permIdx}.IpRanges.member.${rangeIdx}.CidrIp`] = cidr;
					rangeIdx++;
				}
			}
			if (rule.source_security_group_id) {
				params[`IpPermissions.member.${permIdx}.UserIdGroupPairs.member.1.GroupId`] = rule.source_security_group_id;
			}
			permIdx++;
		}
		this.makeEC2Request(action, params);
	}
}


