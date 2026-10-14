import { AWSEC2Entity, AWSEC2Definition, AWSEC2State, xmlValue, ec2ErrorCode } from "./ec2-base.ts";

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

/**
 * @description AWS EC2 Security Group entity.
 * Creates and manages VPC security groups for network access control.
 * Security groups act as virtual firewalls for inbound and outbound traffic.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.group_id` - Security group ID for resource associations
 * - `state.group_name` - Security group name
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-ec2/vpc` - The VPC containing this security group
 * - `aws-rds/instance` - Assign to database instances
 * - `aws-lambda/function` - Assign to Lambda functions in VPC
 */
export class SecurityGroup extends AWSEC2Entity<SecurityGroupDefinition, SecurityGroupState> {

	override create(): void {
		// If adopting existing SG by ID
		if (this.definition.group_id) {
			this.state.group_id = this.definition.group_id;
			this.state.group_name = this.definition.group_name;
			this.state.existing = true;
			return;
		}

		const groupId = this.findOwnId('DescribeSecurityGroups', 'groupId') || this.make();


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

		// Egress rules. A new group already allows all egress, and allowing
		// it again fails as a duplicate, so that rule is skipped.
		const egress = (this.definition.egress || []).filter(r => !(String(r.ip_protocol) === '-1' && (r.cidr_blocks || []).length === 1 && (r.cidr_blocks || [])[0] === '0.0.0.0/0' && !r.source_security_group_id));
		if (egress.length) {
			const egressRules: SecurityGroupRule[] = egress.map(r => ({
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
		const groupId = this.state.group_id;
		this.deleteIfExists('InvalidGroup.NotFound', () => this.makeEC2Request('DeleteSecurityGroup', { GroupId: groupId }));
		this.state.group_id = undefined;
	}

	/** Creates the group, tagged with its owner so a lost response can be recovered from. */
	private make(): string {
		const resp = this.makeEC2Request('CreateSecurityGroup', {
			GroupName: this.definition.group_name,
			GroupDescription: this.definition.group_description,
			VpcId: this.definition.vpc_id,
			...this.tagSpecification('security-group', this.ownTags(this.definition.tags)),
		});
		const groupId = xmlValue(resp.body || '', 'groupId');
		if (!groupId) throw new Error("Failed to parse GroupId from CreateSecurityGroup response");
		return groupId;
	}

	/**
	 * Allows the rules. A rule that exists already (allowed by an earlier
	 * attempt) fails the whole request, so then they are allowed one by one.
	 */
	private authorizeRules(action: 'AuthorizeSecurityGroupIngress' | 'AuthorizeSecurityGroupEgress', groupId: string, rules: ReadonlyArray<SecurityGroupRule>): void {
		try {
			this.authorize(action, groupId, rules);
		} catch (err) {
			if (ec2ErrorCode(err) !== 'InvalidPermission.Duplicate') throw err;
			for (const rule of rules) {
				try {
					this.authorize(action, groupId, [rule]);
				} catch (e) {
					if (ec2ErrorCode(e) !== 'InvalidPermission.Duplicate') throw e;
				}
			}
		}
	}

	private authorize(action: 'AuthorizeSecurityGroupIngress' | 'AuthorizeSecurityGroupEgress', groupId: string, rules: ReadonlyArray<SecurityGroupRule>): void {
		let permIdx = 1;
		const params: Record<string, any> = { GroupId: groupId };
		for (const rule of rules) {
			params[`IpPermissions.${permIdx}.IpProtocol`] = rule.ip_protocol;
			if (rule.from_port !== undefined) params[`IpPermissions.${permIdx}.FromPort`] = String(rule.from_port);
			if (rule.to_port !== undefined) params[`IpPermissions.${permIdx}.ToPort`] = String(rule.to_port);
			// CIDR blocks
			if (rule.cidr_blocks?.length) {
				let rangeIdx = 1;
				for (const cidr of rule.cidr_blocks) {
					params[`IpPermissions.${permIdx}.IpRanges.${rangeIdx}.CidrIp`] = cidr;
					rangeIdx++;
				}
			}
			if (rule.source_security_group_id) {
				params[`IpPermissions.${permIdx}.UserIdGroupPairs.1.GroupId`] = rule.source_security_group_id;
			}
			permIdx++;
		}
		this.makeEC2Request(action, params);
	}
}


