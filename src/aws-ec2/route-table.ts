import { AWSEC2Entity, AWSEC2Definition, AWSEC2State, ec2ErrorCode, xmlValue, xmlItems } from "./ec2-base.ts";

/**
 * A route: traffic for a CIDR block goes to a gateway.
 * @interface Route
 */
export interface Route {
	/** @description Destination CIDR block, e.g. 0.0.0.0/0 */
	destination_cidr_block: string;
	/** @description Internet gateway (or virtual private gateway) to send it to */
	gateway_id?: string;
	/** @description NAT gateway to send it to */
	nat_gateway_id?: string;
}

/**
 * Definition interface for AWS EC2 Route Table entity.
 * @interface RouteTableDefinition
 */
export interface RouteTableDefinition extends AWSEC2Definition {
	/** @description VPC the route table belongs to */
	vpc_id: string;
	/** @description Routes besides the VPC's local one */
	routes?: Route[];
	/** @description Subnets that use this route table */
	subnet_ids?: string[];
	/** @description Resource tags */
	tags?: Record<string, string>;
}

/**
 * A subnet's use of the route table.
 * @interface RouteTableAssociation
 */
export interface RouteTableAssociation {
	/** @description Subnet ID */
	subnet_id: string;
	/** @description Association ID */
	association_id: string;
}

/**
 * State interface for AWS EC2 Route Table entity.
 * @interface RouteTableState
 */
export interface RouteTableState extends AWSEC2State {
	/** @description Route table ID */
	route_table_id?: string;
	/** @description Subnets that use the route table */
	associations?: RouteTableAssociation[];
}

interface LiveRoute {
	destination: string;
	gateway?: string;
	nat?: string;
	origin?: string;
}

/**
 * @description AWS EC2 Route Table entity.
 * Creates a route table in a VPC with the given routes, and makes the given
 * subnets use it. Typically routes 0.0.0.0/0 to an internet gateway to make
 * subnets public. Updates add, replace and remove routes and subnets to
 * match the definition.
 *
 * The route table is tagged monk.io/owner with the entity's path; a create
 * whose response was lost finds it by that tag rather than making another.
 *
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.route_table_id` - Route table ID
 *
 * ## Composing with Other Entities
 * Works with:
 * - `aws-ec2/vpc`, `aws-ec2/subnet`, `aws-ec2/internet-gateway`
 */
export class RouteTable extends AWSEC2Entity<RouteTableDefinition, RouteTableState> {

	override create(): void {
		const id = this.findOwnId('DescribeRouteTables', 'routeTableId') || this.make();
		this.state.route_table_id = id;
		this.state.existing = false;
		this.sync(id);
	}

	override update(): void {
		const id = this.state.route_table_id;
		if (!id) {
			this.create();
			return;
		}
		this.sync(id);
		this.setTags(id, this.definition.tags);
	}

	override delete(): void {
		const id = this.state.route_table_id;
		if (!id || this.state.existing) return;
		const live = this.describe(id);
		if (live) {
			for (const a of live.associations) this.disassociate(a.association_id);
			try {
				this.makeEC2Request('DeleteRouteTable', { RouteTableId: id });
			} catch (err) {
				if (ec2ErrorCode(err) !== 'InvalidRouteTableID.NotFound') throw err;
			}
		}
		this.state.route_table_id = undefined;
		this.state.associations = [];
	}

	override checkReadiness(): boolean {
		const id = this.state.route_table_id;
		if (!id) return false;
		const live = this.describe(id);
		if (!live) return false;
		this.state.associations = live.associations;
		const want = this.definition.subnet_ids || [];
		return want.every(s => live.associations.some(a => a.subnet_id === s));
	}

	/** Makes the routes and subnets what the definition says. */
	private sync(id: string): void {
		const live = this.describe(id);
		if (!live) throw new Error(`Route table ${id} not found`);

		const want = this.definition.routes || [];
		for (const r of want) {
			if (!r.gateway_id && !r.nat_gateway_id) throw new Error(`route to ${r.destination_cidr_block} needs gateway_id or nat_gateway_id`);
			const params: Record<string, string> = { RouteTableId: id, DestinationCidrBlock: r.destination_cidr_block };
			if (r.gateway_id) params.GatewayId = r.gateway_id;
			if (r.nat_gateway_id) params.NatGatewayId = r.nat_gateway_id;
			const have = live.routes.find(x => x.destination === r.destination_cidr_block);
			if (!have) {
				try {
					this.makeEC2Request('CreateRoute', params);
				} catch (err) {
					// Made by an earlier attempt whose response was lost.
					if (ec2ErrorCode(err) !== 'RouteAlreadyExists') throw err;
					this.makeEC2Request('ReplaceRoute', params);
				}
			} else if (have.gateway !== r.gateway_id || have.nat !== r.nat_gateway_id) {
				this.makeEC2Request('ReplaceRoute', params);
			}
		}
		for (const r of live.routes) {
			if (r.gateway === 'local' || r.origin !== 'CreateRoute') continue;
			if (want.some(w => w.destination_cidr_block === r.destination)) continue;
			this.makeEC2Request('DeleteRoute', { RouteTableId: id, DestinationCidrBlock: r.destination });
		}

		const subnets = this.definition.subnet_ids || [];
		const associations: RouteTableAssociation[] = [];
		for (const a of live.associations) {
			if (subnets.indexOf(a.subnet_id) >= 0) associations.push(a);
			else this.disassociate(a.association_id);
		}
		for (const s of subnets) {
			if (associations.some(a => a.subnet_id === s)) continue;
			const resp = this.makeEC2Request('AssociateRouteTable', { RouteTableId: id, SubnetId: s });
			const assoc = xmlValue(resp.body || '', 'associationId');
			if (!assoc) throw new Error("Failed to parse AssociationId from AssociateRouteTable response");
			associations.push({ subnet_id: s, association_id: assoc });
		}
		this.state.associations = associations;
	}

	/** The route table's routes and subnet associations; null if it is gone. */
	private describe(id: string): { routes: LiveRoute[]; associations: RouteTableAssociation[] } | null {
		let body = '';
		try {
			body = this.makeEC2Request('DescribeRouteTables', { 'RouteTableId.1': id }).body || '';
		} catch (err) {
			if (ec2ErrorCode(err) === 'InvalidRouteTableID.NotFound') return null;
			throw err;
		}
		if (!xmlValue(body, 'routeTableId')) return null;
		const routes = xmlItems(body, 'routeSet').map(item => ({
			destination: xmlValue(item, 'destinationCidrBlock') || '',
			gateway: xmlValue(item, 'gatewayId'),
			nat: xmlValue(item, 'natGatewayId'),
			origin: xmlValue(item, 'origin'),
		})).filter(r => r.destination !== '');
		const associations: RouteTableAssociation[] = [];
		for (const item of xmlItems(body, 'associationSet')) {
			const subnet = xmlValue(item, 'subnetId');
			const assoc = xmlValue(item, 'routeTableAssociationId');
			if (subnet && assoc && xmlValue(item, 'main') !== 'true') associations.push({ subnet_id: subnet, association_id: assoc });
		}
		return { routes, associations };
	}

	private disassociate(associationId: string): void {
		try {
			this.makeEC2Request('DisassociateRouteTable', { AssociationId: associationId });
		} catch (err) {
			if (ec2ErrorCode(err) !== 'InvalidAssociationID.NotFound') throw err;
		}
	}

	private make(): string {
		const resp = this.makeEC2Request('CreateRouteTable', {
			VpcId: this.definition.vpc_id,
			...this.tagSpecification('route-table', this.ownTags(this.definition.tags)),
		});
		const id = xmlValue(resp.body || '', 'routeTableId');
		if (!id) throw new Error("Failed to parse RouteTableId from CreateRouteTable response");
		return id;
	}

}
