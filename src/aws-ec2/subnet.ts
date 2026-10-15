import { AWSEC2Entity, AWSEC2Definition, AWSEC2State, xmlValue } from "./ec2-base.ts";

export interface SubnetDefinition extends AWSEC2Definition {
	vpc_id: string;
	cidr_block: string;
	availability_zone?: string;
	map_public_ip_on_launch?: boolean;
	tags?: Record<string, string>;
}

export interface SubnetState extends AWSEC2State {
	subnet_id?: string;
	state?: string;
	cidr_block?: string;
	/** @description Availability zone the subnet is in */
	availability_zone?: string;
}

/**
 * @description AWS EC2 Subnet entity.
 * Creates and manages VPC subnets for network segmentation.
 * Subnets are IP address ranges within a VPC for resource isolation.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.subnet_id` - Subnet ID for resource placement
 * - `state.cidr_block` - Subnet CIDR block
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-ec2/vpc` - The parent VPC
 * - `aws-rds/instance` - Place database in private subnets
 * - `aws-rds/db-subnet-group` - Group subnets for RDS
 */
export class Subnet extends AWSEC2Entity<SubnetDefinition, SubnetState> {
	/** Deleting fails with DependencyViolation while what uses it goes: retried for up to 10 minutes. */
	static deletion = { period: 15, attempts: 40 };

	protected getSubnetId(): string | undefined {
		return this.state.subnet_id;
	}

	override create(): void {
		const createParams: Record<string, any> = {
			VpcId: this.definition.vpc_id,
			CidrBlock: this.definition.cidr_block,
		};
		if (this.definition.availability_zone) {
			createParams.AvailabilityZone = this.definition.availability_zone;
		}

		const subnetId = this.findOwnId('DescribeSubnets', 'subnetId') || this.make(createParams);

		if (this.definition.map_public_ip_on_launch !== undefined) {
			this.makeEC2Request('ModifySubnetAttribute', {
				SubnetId: subnetId,
				'MapPublicIpOnLaunch.Value': String(this.definition.map_public_ip_on_launch)
			});
		}

		this.state.existing = false;
		this.state.subnet_id = subnetId;
		this.state.cidr_block = this.definition.cidr_block;
		this.state.state = 'available';
	}

	override update(): void {
		const subnetId = this.state.subnet_id;
		if (!subnetId) throw new Error("Subnet ID is missing");
		if (this.state.existing) return;
		if (this.definition.map_public_ip_on_launch !== undefined) {
			this.makeEC2Request('ModifySubnetAttribute', {
				SubnetId: subnetId,
				'MapPublicIpOnLaunch.Value': String(this.definition.map_public_ip_on_launch)
			});
		}
		this.setTags(subnetId, this.definition.tags);
	}

	override delete(): void {
		if (!this.state.subnet_id) return;
		if (this.state.existing) return;
		const subnetId = this.state.subnet_id;
		this.deleteIfExists('InvalidSubnetID.NotFound', () => this.makeEC2Request('DeleteSubnet', { SubnetId: subnetId }));
		this.state.subnet_id = undefined;
	}

	override checkReadiness(): boolean {
		if (!this.state.subnet_id) return false;
		const info = this.describeSubnetById(this.state.subnet_id);
		if (!info) return false;
		this.state.state = info.state;
		this.state.cidr_block = info.cidr;
		this.state.availability_zone = info.az;
		return info.state === 'available';
	}

	checkLiveness(): boolean {
		const subnetId = this.getSubnetId();
		if (!subnetId) {
			throw new Error("Subnet ID is missing");
		}
		const info = this.describeSubnetById(subnetId);
		if (!info) {
			throw new Error(`Subnet ${subnetId} not found`);
		}
		if (info.state !== 'available') {
			throw new Error(`Subnet ${subnetId} is not available (state: ${info.state})`);
		}
		return true;
	}

	/** Creates the subnet, tagged with its owner so a lost response can be recovered from. */
	private make(params: Record<string, any>): string {
		const resp = this.makeEC2Request('CreateSubnet', { ...params, ...this.tagSpecification('subnet', this.ownTags(this.definition.tags)) });
		const id = xmlValue(resp.body || '', 'subnetId');
		if (!id) throw new Error("Failed to parse SubnetId from CreateSubnet response");
		return id;
	}

	private describeSubnetById(subnetId: string): { subnetId: string; state: string; cidr: string; az: string } | null {
		const resp = this.makeEC2Request('DescribeSubnets', { 'SubnetId.1': subnetId });
		const body = resp.body || '';
		const idMatch = /<subnetId>(subnet-[^<]+)<\/subnetId>/i.exec(body);
		if (!idMatch) return null;
		const stateMatch = /<state>(.*?)<\/state>/i.exec(body);
		const cidrMatch = /<cidrBlock>(.*?)<\/cidrBlock>/i.exec(body);
		const azMatch = /<availabilityZone>([^<]*)<\/availabilityZone>/.exec(body);
		return { subnetId: idMatch[1], state: stateMatch ? stateMatch[1] : 'available', cidr: cidrMatch ? cidrMatch[1] : '', az: azMatch ? azMatch[1] : '' };
	}
}


