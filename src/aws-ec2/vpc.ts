import { AWSEC2Entity, AWSEC2Definition, AWSEC2State, xmlValue } from "./ec2-base.ts";

/**
 * Definition interface for AWS EC2 VPC entity.
 * Configures VPC properties including CIDR block and DNS settings.
 * @interface VPCDefinition
 */
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

/**
 * State interface for AWS EC2 VPC entity.
 * Contains runtime information about the created VPC.
 * @interface VPCState
 */
export interface VPCState extends AWSEC2State {
	/** @description VPC ID */
	vpc_id?: string;
	/** @description VPC state (available, pending) */
	state?: string;
	/** @description VPC CIDR block */
	cidr_block?: string;
}

/**
 * @description AWS EC2 VPC entity.
 * Creates and manages Amazon VPC (Virtual Private Cloud) for isolated network environments.
 * Supports custom CIDR blocks, DNS configuration, and can adopt existing VPCs.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.vpc_id` - VPC ID for subnet and security group configuration
 * - `state.state` - VPC state (available, pending)
 * - `state.cidr_block` - VPC CIDR block
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-ec2/subnet` - Create subnets within the VPC
 * - `aws-ec2/security-group` - Define network access rules
 * - `aws-rds/instance` - Place databases in VPC subnets
 * - `aws-lambda/function` - Connect Lambda to VPC resources
 */
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

		const vpcId = this.findOwnId('DescribeVpcs', 'vpcId') || this.make();

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

		this.state.existing = false;
		this.state.vpc_id = vpcId;
		this.state.cidr_block = this.definition.cidr_block;
		this.state.state = 'available';
	}

	override update(): void {
		const vpcId = this.getVpcId();
		if (!vpcId) throw new Error("VPC ID is missing");
		if (this.state.existing) return; // an adopted VPC is not changed
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
		this.setTags(vpcId, this.definition.tags);
	}

	override delete(): void {
		if (!this.state.vpc_id) return;
		if (this.state.existing) return; // do not delete adopted resources
		const vpcId = this.state.vpc_id;
		this.deleteIfExists('InvalidVpcID.NotFound', () => this.makeEC2Request('DeleteVpc', { VpcId: vpcId }));
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

	/** Creates the VPC, tagged with its owner so a lost response can be recovered from. */
	private make(): string {
		const resp = this.makeEC2Request('CreateVpc', {
			CidrBlock: this.definition.cidr_block,
			...this.tagSpecification('vpc', this.ownTags(this.definition.tags)),
		});
		const id = xmlValue(resp.body || '', 'vpcId');
		if (!id) throw new Error("Failed to parse VpcId from CreateVpc response");
		return id;
	}

	private describeVpcById(vpcId: string): { vpcId: string; state: string; cidr: string } | null {
		const resp = this.makeEC2Request('DescribeVpcs', { 'VpcId.1': vpcId });
		const body = resp.body || '';
		const idMatch = /<vpcId>(vpc-[^<]+)<\/vpcId>/i.exec(body);
		if (!idMatch) return null;
		// The VPC's own state comes before those of its CIDR associations.
		const stateMatch = /<state>([^<]*)<\/state>/.exec(body);
		const cidrMatch = /<CidrBlock>(.*?)<\/CidrBlock>/i.exec(body);
		return { vpcId: idMatch[1], state: stateMatch ? stateMatch[1] : 'available', cidr: cidrMatch ? cidrMatch[1] : '' };
	}
}


