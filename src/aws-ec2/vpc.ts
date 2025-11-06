import { AWSEC2Entity, AWSEC2Definition, AWSEC2State } from "./base.ts";

export interface VPCDefinition extends AWSEC2Definition {
	/** Optional existing VPC ID to adopt */
	vpc_id?: string;
	/** CIDR block for the VPC, e.g. 10.0.0.0/16 */
	cidr_block?: string;
	/** Enable/disable DNS support */
	enable_dns_support?: boolean;
	/** Enable/disable DNS hostnames */
	enable_dns_hostnames?: boolean;
	/** Resource tags */
	tags?: Record<string, string>;
}

export interface VPCState extends AWSEC2State {
	vpc_id?: string;
	state?: string;
	cidr_block?: string;
}

export class VPC extends AWSEC2Entity<VPCDefinition, VPCState> {

	protected getVpcId(): string | undefined {
		return this.definition.vpc_id || this.state.vpc_id;
	}

	override create(): void {
		// If adopting an existing VPC by ID, just fetch and store state
		if (this.definition.vpc_id) {
			const info = this.describeVpcById(this.definition.vpc_id);
			if (!info) {
				throw new Error(`VPC ${this.definition.vpc_id} not found`);
			}
			this.state.existing = true;
			this.state.vpc_id = info.vpcId;
			this.state.state = info.state;
			this.state.cidr_block = info.cidr;
			return;
		}

		if (!this.definition.cidr_block) {
			throw new Error("cidr_block is required to create a VPC");
		}

		const resp = this.makeEC2Request('CreateVpc', {
			CidrBlock: this.definition.cidr_block
		});
		const body = resp.body || '';
		// EC2 Query API uses lowercase tag names (vpcId). Support both just in case.
		const idMatch = /<vpcId>(vpc-[^<]+)<\/vpcId>/i.exec(body);
		if (!idMatch) {
			throw new Error("Failed to parse VpcId from CreateVpc response");
		}
		const vpcId = idMatch[1];

		// Apply attributes
		if (this.definition.enable_dns_support !== undefined) {
			this.makeEC2Request('ModifyVpcAttribute', {
				VpcId: vpcId,
				'EnableDnsSupport.Value': String(this.definition.enable_dns_support)
			});
		}
		if (this.definition.enable_dns_hostnames !== undefined) {
			this.makeEC2Request('ModifyVpcAttribute', {
				VpcId: vpcId,
				'EnableDnsHostnames.Value': String(this.definition.enable_dns_hostnames)
			});
		}

		// Tags
		if (this.definition.tags && Object.keys(this.definition.tags).length > 0) {
			const tagParams: Record<string, any> = {
				'ResourceId.1': vpcId,
			};
			let idx = 1;
			for (const [k, v] of Object.entries(this.definition.tags)) {
				tagParams[`Tag.${idx}.Key`] = k;
				tagParams[`Tag.${idx}.Value`] = v;
				idx++;
			}
			this.makeEC2Request('CreateTags', tagParams);
		}

		this.state.existing = false;
		this.state.vpc_id = vpcId;
		this.state.cidr_block = this.definition.cidr_block;
		this.state.state = 'available';
	}

	override delete(): void {
		if (!this.state.vpc_id) return;
		if (this.state.existing) return; // do not delete adopted resources
		this.makeEC2Request('DeleteVpc', { VpcId: this.state.vpc_id });
		this.state.vpc_id = undefined;
		this.state.state = undefined;
	}

	override checkReadiness(): boolean {
		const vpcId = this.getVpcId();
		if (!vpcId) return false;
		const info = this.describeVpcById(vpcId);
		if (!info) return false;
		this.state.vpc_id = info.vpcId;
		this.state.state = info.state;
		this.state.cidr_block = info.cidr;
		return info.state === 'available';
	}

	checkLiveness(): boolean {
		const vpcId = this.getVpcId();
		if (!vpcId) {
			throw new Error("VPC ID is missing");
		}
		const info = this.describeVpcById(vpcId);
		if (!info) {
			throw new Error(`VPC ${vpcId} not found`);
		}
		if (info.state !== 'available') {
			throw new Error(`VPC ${vpcId} is not available (state: ${info.state})`);
		}
		return true;
	}

	private describeVpcById(vpcId: string): { vpcId: string; state: string; cidr: string } | null {
		const resp = this.makeEC2Request('DescribeVpcs', { 'VpcId.1': vpcId });
		const body = resp.body || '';
		const idMatch = /<vpcId>(vpc-[^<]+)<\/vpcId>/i.exec(body);
		if (!idMatch) return null;
		const stateMatch = /<State>(.*?)<\/State>/.exec(body);
		const cidrMatch = /<CidrBlock>(.*?)<\/CidrBlock>/i.exec(body);
		return { vpcId: idMatch[1], state: stateMatch ? stateMatch[1] : 'available', cidr: cidrMatch ? cidrMatch[1] : '' };
	}
}


