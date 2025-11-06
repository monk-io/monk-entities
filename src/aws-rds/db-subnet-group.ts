import { AWSRDSLiteEntity, RDSLiteDefinition, RDSLiteState } from "./lite-base.ts";

export interface DBSubnetGroupDefinition extends RDSLiteDefinition {
	/** Name for the DB subnet group */
	db_subnet_group_name: string;
	/** Description */
	db_subnet_group_description?: string;
	/** Subnet IDs in the VPC */
	subnet_ids: string[];
	/** Tags */
	tags?: Record<string, string>;
}

export interface DBSubnetGroupState extends RDSLiteState {
	db_subnet_group_name?: string;
	vpc_id?: string;
}

export class DBSubnetGroup extends AWSRDSLiteEntity<DBSubnetGroupDefinition, DBSubnetGroupState> {

	override create(): void {
		// Create DB subnet group
		const params: Record<string, any> = {
			DBSubnetGroupName: this.definition.db_subnet_group_name,
			DBSubnetGroupDescription: this.definition.db_subnet_group_description || this.definition.db_subnet_group_name,
		};
		// Add subnet IDs as list
		this.definition.subnet_ids.forEach((id, idx) => {
			params[`SubnetIds.member.${idx + 1}`] = id;
		});
		// Tags
		if (this.definition.tags) {
			let i = 1;
			for (const [k, v] of Object.entries(this.definition.tags)) {
				params[`Tags.member.${i}.Key`] = k;
				params[`Tags.member.${i}.Value`] = v;
				i++;
			}
		}

		this.makeRDSRequest('CreateDBSubnetGroup', params);
		// Minimal state update
		this.state.db_subnet_group_name = this.definition.db_subnet_group_name;
		this.state.existing = false;
	}

	override delete(): void {
		if (!this.state.db_subnet_group_name) return;
		if (this.state.existing) return;
		this.makeRDSRequest('DeleteDBSubnetGroup', {
			DBSubnetGroupName: this.state.db_subnet_group_name
		});
		this.state.db_subnet_group_name = undefined;
	}

	override checkReadiness(): boolean {
		if (!this.state.db_subnet_group_name) return false;
		try {
			this.makeRDSRequest('DescribeDBSubnetGroups', {
				DBSubnetGroupName: this.state.db_subnet_group_name
			});
			// If no error, assume ready
			return true;
		} catch (_e) {
			return false;
		}
	}

	checkLiveness(): boolean { return this.checkReadiness(); }

}


