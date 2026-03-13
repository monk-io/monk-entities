import { HetznerDNSEntity, HetznerDNSDefinitionBase, HetznerDNSStateBase } from "./common.ts";
import { action } from "monkec/base";
import type { Args } from "monkec/base";
import cli from "cli";

export interface ZoneDefinition extends HetznerDNSDefinitionBase {
    /** @description Domain name (e.g., example.com) */
    name: string;
    /** @description TTL for DNS records in seconds (default: 86400) */
    ttl?: number;
}

export interface ZoneState extends HetznerDNSStateBase {
    /** @description Zone ID */
    id?: string;
    /** @description Domain name */
    name?: string;
    /** @description Zone TTL */
    ttl?: number;
    /** @description Zone status */
    status?: string;
}

/**
 * @description Hetzner DNS Zone entity.
 * Creates and manages DNS zones in Hetzner DNS.
 * Zones are top-level DNS containers for managing DNS records.
 *
 * ## Secrets
 * - Reads: none (authenticated via Hetzner provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.id` - Zone ID (used for record management)
 * - `state.name` - Domain name (e.g., example.com)
 * - `state.ttl` - Default TTL for DNS records
 */
export class Zone extends HetznerDNSEntity<ZoneDefinition, ZoneState> {
    static readonly readiness = { period: 5, initialDelay: 1, attempts: 10 };

    protected getEntityName(): string {
        return "zone";
    }

    override create(): void {
        const zoneName = this.definition.name;
        cli.output(`Processing zone: ${zoneName}`);

        // Check if zone already exists
        try {
            cli.output(`Checking if zone ${zoneName} already exists...`);
            const zones = this.get(`/zones?name=${zoneName}`);

            if (zones.zones && zones.zones.length > 0) {
                const zone = zones.zones[0];
                cli.output(`Zone ${zoneName} already exists, using existing zone`);
                this.state.existing = true;
                this.state.id = zone.id;
                this.state.name = zone.name;
                this.state.ttl = zone.ttl;
                this.state.status = zone.status;
                return;
            }
        } catch (getError: any) {
            cli.output(`Zone ${zoneName} doesn't exist, will create new one`);
        }

        // Create new zone
        cli.output(`Creating new zone: ${zoneName}`);
        try {
            const response = this.post("/zones", {
                name: zoneName,
                ttl: this.definition.ttl || 86400
            });

            if (!response.zone) {
                throw new Error(`Unexpected response when creating zone: ${JSON.stringify(response)}`);
            }

            this.state.existing = true;
            this.state.id = response.zone.id;
            this.state.name = response.zone.name;
            this.state.ttl = response.zone.ttl;
            this.state.status = response.zone.status;

            cli.output(`Successfully created zone: ${zoneName} (ID: ${response.zone.id})`);
        } catch (createError: any) {
            if (createError.message.includes("already exists") || createError.message.includes("409")) {
                cli.output(`Zone creation conflict, retrieving existing zone...`);
                const zones = this.get(`/zones?name=${zoneName}`);
                if (zones.zones && zones.zones.length > 0) {
                    const zone = zones.zones[0];
                    this.state.existing = true;
                    this.state.id = zone.id;
                    this.state.name = zone.name;
                    this.state.ttl = zone.ttl;
                    this.state.status = zone.status;
                    cli.output(`Connected to existing zone: ${zoneName}`);
                } else {
                    throw createError;
                }
            } else {
                throw createError;
            }
        }
    }

    override update(): void {
        if (!this.state.id) {
            throw new Error("Cannot update zone: no zone ID in state");
        }

        const response = this.put(`/zones/${this.state.id}`, {
            name: this.definition.name,
            ttl: this.definition.ttl || this.state.ttl || 86400
        });

        if (response.zone) {
            this.state.ttl = response.zone.ttl;
            this.state.status = response.zone.status;
            cli.output(`Updated zone: ${this.state.name}`);
        }
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("No zone ID in state; nothing to delete.");
            return;
        }

        try {
            this.deleteRequest(`/zones/${this.state.id}`);
            cli.output(`Deleted zone: ${this.state.name}`);
        } catch (error: any) {
            if (error.message.includes("404")) {
                cli.output(`Zone ${this.state.name} not found (already deleted)`);
            } else {
                throw error;
            }
        }

        this.state.existing = false;
        this.state.id = undefined;
        this.state.name = undefined;
        this.state.ttl = undefined;
        this.state.status = undefined;
    }

    override checkReadiness(): boolean {
        return !!this.state.id && !!this.state.existing;
    }

    // --- Actions ---

    @action()
    info(_args?: Args) {
        if (!this.state.id) {
            cli.output("No zone configured");
            return;
        }

        try {
            const zone = this.get(`/zones/${this.state.id}`);
            cli.output(`Zone: ${zone.zone.name}`);
            cli.output(`ID: ${zone.zone.id}`);
            cli.output(`TTL: ${zone.zone.ttl}`);
            cli.output(`Status: ${zone.zone.status}`);
            cli.output(`NS: ${(zone.zone.ns || []).join(", ")}`);
        } catch (error: any) {
            cli.output(`Error getting zone info: ${error.message}`);
        }
    }

    @action()
    records(_args?: Args) {
        if (!this.state.id) {
            cli.output("No zone configured");
            return;
        }

        try {
            const result = this.get(`/records?zone_id=${this.state.id}`);
            cli.output(`DNS Records for ${this.state.name}:`);

            if (result.records && result.records.length > 0) {
                result.records.forEach((record: any) => {
                    cli.output(`  ${record.type} ${record.name || '@'} -> ${record.value} (TTL: ${record.ttl})`);
                });
            } else {
                cli.output("  No DNS records found");
            }
        } catch (error: any) {
            cli.output(`Error getting DNS records: ${error.message}`);
        }
    }

    @action("add-a-record")
    addARecord(args?: Args) {
        if (!this.state.id) {
            cli.output("No zone configured");
            return;
        }

        const name = args?.name as string;
        const ip = args?.ip as string;
        const ttl = args?.ttl ? parseInt(args.ttl) : undefined;

        if (!name || !ip) {
            cli.output("Usage: monk do <zone>/add-a-record --name=<record_name> --ip=<ip_address> [--ttl=<ttl>]");
            return;
        }

        try {
            const result = this.post("/records", {
                zone_id: this.state.id,
                type: "A",
                name: name,
                value: ip,
                ttl: ttl || 86400
            });
            cli.output(`Added A record: ${name}.${this.state.name} -> ${ip}`);
            return result;
        } catch (error: any) {
            cli.output(`Error adding A record: ${error.message}`);
        }
    }

    @action("add-cname-record")
    addCNAME(args?: Args) {
        if (!this.state.id) {
            cli.output("No zone configured");
            return;
        }

        const name = args?.name as string;
        const target = args?.target as string;
        const ttl = args?.ttl ? parseInt(args.ttl) : undefined;

        if (!name || !target) {
            cli.output("Usage: monk do <zone>/add-cname-record --name=<record_name> --target=<target_domain> [--ttl=<ttl>]");
            return;
        }

        try {
            const result = this.post("/records", {
                zone_id: this.state.id,
                type: "CNAME",
                name: name,
                value: target,
                ttl: ttl || 86400
            });
            cli.output(`Added CNAME record: ${name}.${this.state.name} -> ${target}`);
            return result;
        } catch (error: any) {
            cli.output(`Error adding CNAME record: ${error.message}`);
        }
    }

    @action("add-record")
    addRecord(args?: Args) {
        if (!this.state.id) {
            cli.output("No zone configured");
            return;
        }

        const type = args?.type as string;
        const name = args?.name as string;
        const value = args?.value as string;
        const ttl = args?.ttl ? parseInt(args.ttl) : undefined;

        if (!type || !name || !value) {
            cli.output("Usage: monk do <zone>/add-record --type=<A|AAAA|CNAME|MX|TXT|SRV|NS|CAA> --name=<name> --value=<value> [--ttl=<ttl>]");
            return;
        }

        try {
            const result = this.post("/records", {
                zone_id: this.state.id,
                type: type.toUpperCase(),
                name: name,
                value: value,
                ttl: ttl || 86400
            });
            cli.output(`Added ${type.toUpperCase()} record: ${name}.${this.state.name} -> ${value}`);
            return result;
        } catch (error: any) {
            cli.output(`Error adding ${type} record: ${error.message}`);
        }
    }

    @action("list-all-zones")
    listAllZones(_args?: Args) {
        try {
            const zones = this.get("/zones");
            cli.output("All zones in account:");

            if (zones.zones && zones.zones.length > 0) {
                zones.zones.forEach((zone: any) => {
                    cli.output(`  ${zone.name} (TTL: ${zone.ttl}, Status: ${zone.status})`);
                });
            } else {
                cli.output("  No zones found");
            }
        } catch (error: any) {
            cli.output(`Error listing zones: ${error.message}`);
        }
    }
}
