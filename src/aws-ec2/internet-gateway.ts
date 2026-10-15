import { AWSEC2Entity, AWSEC2Definition, AWSEC2State, ec2ErrorCode, xmlValue, xmlItems } from "./ec2-base.ts";

/**
 * Definition interface for AWS EC2 Internet Gateway entity.
 * @interface InternetGatewayDefinition
 */
export interface InternetGatewayDefinition extends AWSEC2Definition {
	/** @description VPC to attach the gateway to */
	vpc_id: string;
	/** @description Resource tags */
	tags?: Record<string, string>;
}

/**
 * State interface for AWS EC2 Internet Gateway entity.
 * @interface InternetGatewayState
 */
export interface InternetGatewayState extends AWSEC2State {
	/** @description Internet gateway ID, for routes to the internet */
	internet_gateway_id?: string;
	/** @description VPC the gateway is attached to */
	vpc_id?: string;
}

/**
 * @description AWS EC2 Internet Gateway entity.
 * Creates an internet gateway and attaches it to a VPC, so subnets whose
 * route table sends 0.0.0.0/0 to it reach the internet (and EKS nodes and
 * load balancers in them can be reached).
 *
 * The gateway is tagged monk.io/owner with the entity's path; a create
 * whose response was lost finds it by that tag rather than making another.
 *
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.internet_gateway_id` - for an `aws-ec2/route-table` route
 *
 * ## Composing with Other Entities
 * Works with:
 * - `aws-ec2/vpc` - The VPC it is attached to
 * - `aws-ec2/route-table` - Route 0.0.0.0/0 to it
 */
export class InternetGateway extends AWSEC2Entity<InternetGatewayDefinition, InternetGatewayState> {
	/** Deleting fails with DependencyViolation while what uses it goes: retried for up to 10 minutes. */
	static deletion = { period: 15, attempts: 40 };

	override create(): void {
		const id = this.findOwnId('DescribeInternetGateways', 'internetGatewayId') || this.make();
		this.state.internet_gateway_id = id;
		this.state.existing = false;
		this.attach(id, this.definition.vpc_id);
	}

	override update(): void {
		const id = this.state.internet_gateway_id;
		if (!id) {
			this.create();
			return;
		}
		if (this.state.vpc_id && this.state.vpc_id !== this.definition.vpc_id) {
			this.detach(id, this.state.vpc_id);
		}
		this.attach(id, this.definition.vpc_id);
		this.setTags(id, this.definition.tags);
	}

	override delete(): void {
		const id = this.state.internet_gateway_id;
		if (!id || this.state.existing) return;
		if (this.state.vpc_id) this.detach(id, this.state.vpc_id);
		try {
			this.makeEC2Request('DeleteInternetGateway', { InternetGatewayId: id });
		} catch (err) {
			if (ec2ErrorCode(err) !== 'InvalidInternetGatewayID.NotFound') throw err;
		}
		this.state.internet_gateway_id = undefined;
		this.state.vpc_id = undefined;
	}

	override checkReadiness(): boolean {
		const id = this.state.internet_gateway_id;
		if (!id) return false;
		const resp = this.makeEC2Request('DescribeInternetGateways', { 'InternetGatewayId.1': id });
		const attachment = xmlItems(resp.body || '', 'attachmentSet')[0];
		return attachment !== undefined && xmlValue(attachment, 'state') === 'available';
	}

	private make(): string {
		const resp = this.makeEC2Request('CreateInternetGateway', this.tagSpecification('internet-gateway', this.ownTags(this.definition.tags)));
		const id = xmlValue(resp.body || '', 'internetGatewayId');
		if (!id) throw new Error("Failed to parse InternetGatewayId from CreateInternetGateway response");
		return id;
	}


	private attach(id: string, vpcId: string): void {
		try {
			this.makeEC2Request('AttachInternetGateway', { InternetGatewayId: id, VpcId: vpcId });
		} catch (err) {
			// Attached already, by an earlier attempt.
			if (ec2ErrorCode(err) !== 'Resource.AlreadyAssociated') throw err;
		}
		this.state.vpc_id = vpcId;
	}

	private detach(id: string, vpcId: string): void {
		try {
			this.makeEC2Request('DetachInternetGateway', { InternetGatewayId: id, VpcId: vpcId });
		} catch (err) {
			const code = ec2ErrorCode(err);
			if (code !== 'Gateway.NotAttached' && code !== 'InvalidInternetGatewayID.NotFound') throw err;
		}
	}
}
