import { DODomainsEntity, DODomainsDefinitionBase, DODomainsStateBase } from "./common.ts";
import { action } from "monkec/base";
import type { Args } from "monkec/base";
import cli from "cli";

export interface DomainDefinition extends DODomainsDefinitionBase {
    /** @description Domain name (e.g., example.com) */
    name: string;
    /** @description IP address for the domain's A record (optional) */
    ip_address?: string;
    /** @description TTL for DNS records in seconds (default: 1800) */
    ttl?: number;
}

export interface DomainState extends DODomainsStateBase {
    /** @description Domain name */
    name?: string;
    /** @description Domain TTL */
    ttl?: number;
    /** @description Zone file content */
    zone_file?: string;
}

/**
 * @description DigitalOcean Domain entity.
 * Creates and manages domains in DigitalOcean DNS.
 * Domains are top-level DNS zones for managing DNS records.
 * 
 * ## Secrets
 * - Reads: none (authenticated via DigitalOcean provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.name` - Domain name (e.g., example.com)
 * - `state.ttl` - Default TTL for DNS records
 * - `state.zone_file` - Zone file content
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `digitalocean/dns-record` - Create DNS records in this domain
 */
export class Domain extends DODomainsEntity<DomainDefinition, DomainState> {
    static readonly readiness = { period: 5, initialDelay: 1, attempts: 10 };

    protected getEntityName(): string { 
        return "domain"; 
    }

    override create(): void {
        const domainName = this.definition.name;
        cli.output(`Processing domain: ${domainName}`);
        
        // First, try to get existing domain
        try {
            cli.output(`Checking if domain ${domainName} already exists...`);
            const existingDomain = this.get(`/v2/domains/${domainName}`);
            
            if (existingDomain.domain) {
                cli.output(`Domain ${domainName} already exists, using existing domain`);
                this.state.existing = true;
                this.state.name = existingDomain.domain.name;
                this.state.ttl = existingDomain.domain.ttl;
                this.state.zone_file = existingDomain.domain.zone_file;
                
                cli.output(`Connected to existing domain: ${domainName} (TTL: ${existingDomain.domain.ttl})`);
                return;
            }
        } catch (getError: any) {
            // Domain doesn't exist, continue with creation
            cli.output(`Domain ${domainName} doesn't exist, will create new one`);
        }

        // Try to create new domain
        cli.output(`Creating new domain: ${domainName}`);
        const createPayload: any = {
            name: domainName,
            type: "domain"
        };

        if (this.definition.ip_address) {
            createPayload.ip_address = this.definition.ip_address;
        }

        try {
            const response = this.post("/v2/domains", createPayload);
            
            // Check for successful creation
            if (!response.domain) {
                throw new Error(`Unexpected response when creating domain: ${JSON.stringify(response)}`);
            }

            // Domain was successfully created
            this.state.existing = true;
            this.state.name = response.domain.name;
            this.state.ttl = response.domain.ttl;
            this.state.zone_file = response.domain.zone_file;

            cli.output(`Successfully created domain: ${domainName} (TTL: ${response.domain.ttl})`);
        } catch (createError: any) {
            // If creation failed because domain exists, try to get it again
            if (createError.message.includes("already exists")) {
                cli.output(`Domain creation failed because it already exists, retrieving existing domain...`);
                try {
                    const existingDomain = this.get(`/v2/domains/${domainName}`);
                    
                    this.state.existing = true;
                    this.state.name = existingDomain.domain.name;
                    this.state.ttl = existingDomain.domain.ttl;
                    this.state.zone_file = existingDomain.domain.zone_file;
                    
                    cli.output(`Connected to existing domain: ${domainName} (TTL: ${existingDomain.domain.ttl})`);
                } catch (getError2: any) {
                    // Last resort - mark as existing with basic info
                    cli.output(`Could not retrieve domain details, but domain exists: ${getError2.message}`);
                    this.state.existing = true;
                    this.state.name = domainName;
                    this.state.ttl = this.definition.ttl || 1800;
                }
            } else {
                throw createError;
            }
        }
    }

    override update(): void {
        if (!this.state.name) {
            throw new Error("Cannot update domain: no domain name in state");
        }

        // DigitalOcean doesn't support direct domain updates
        // Only DNS records can be updated
        cli.output(`Domain ${this.state.name} exists. Use DNS record entities to manage records.`);
    }

    override delete(): void {
        if (!this.state.name) {
            cli.output("No domain name in state; nothing to delete.");
            return;
        }

        try {
            this.deleteRequest(`/v2/domains/${this.state.name}`);
            cli.output(`Deleted domain: ${this.state.name}`);
        } catch (error: any) {
            if (error.message.includes("404")) {
                cli.output(`Domain ${this.state.name} not found (already deleted)`);
            } else {
                throw error;
            }
        }

        this.state.existing = false;
        this.state.name = undefined;
        this.state.ttl = undefined;
        this.state.zone_file = undefined;
    }

    override checkReadiness(): boolean {
        return !!this.state.name && !!this.state.existing;
    }

    /**
     * Get domain information
     */
    getDomainInfo(): any {
        if (!this.state.name) {
            throw new Error("No domain name in state");
        }

        return this.get(`/v2/domains/${this.state.name}`);
    }

    /**
     * List all domains in the account
     */
    listDomains(): any {
        return this.get("/v2/domains");
    }

    // Actions for monk do command
    
    /**
     * Show domain information
     */
    @action()
    info(_args?: Args) {
        if (!this.state.name) {
            cli.output("No domain configured");
            return;
        }

        try {
            const domain = this.get(`/v2/domains/${this.state.name}`);
            cli.output(`Domain: ${domain.domain.name}`);
            cli.output(`TTL: ${domain.domain.ttl}`);
            cli.output(`Zone file: ${domain.domain.zone_file}`);
        } catch (error: any) {
            cli.output(`Error getting domain info: ${error.message}`);
        }
    }

    /**
     * List all DNS records for this domain
     */
    @action()
    records(_args?: Args) {
        if (!this.state.name) {
            cli.output("No domain configured");
            return;
        }

        try {
            const records = this.get(`/v2/domains/${this.state.name}/records`);
            cli.output(`DNS Records for ${this.state.name}:`);
            
            if (records.domain_records && records.domain_records.length > 0) {
                records.domain_records.forEach((record: any) => {
                    cli.output(`  ${record.type} ${record.name || '@'} -> ${record.data} (TTL: ${record.ttl})`);
                });
            } else {
                cli.output("  No DNS records found");
            }
        } catch (error: any) {
            cli.output(`Error getting DNS records: ${error.message}`);
        }
    }

    /**
     * Add an A record to the domain
     */
    @action("add-a-record")
    addARecord(args?: Args) {
        if (!this.state.name) {
            cli.output("No domain configured");
            return;
        }

        const name = args?.name as string;
        const ip = args?.ip as string;
        const ttl = args?.ttl ? parseInt(args.ttl) : undefined;

        if (!name || !ip) {
            cli.output("Usage: monk do <domain>/add-a-record --name=<record_name> --ip=<ip_address> [--ttl=<ttl>]");
            return;
        }

        const recordData = {
            type: "A",
            name: name,
            data: ip,
            ttl: ttl || 1800
        };

        try {
            const result = this.post(`/v2/domains/${this.state.name}/records`, recordData);
            cli.output(`Added A record: ${name}.${this.state.name} -> ${ip}`);
            return result;
        } catch (error: any) {
            cli.output(`Error adding A record: ${error.message}`);
        }
    }

    /**
     * Add a CNAME record to the domain
     */
    @action("add-cname-record")
    addCNAME(args?: Args) {
        if (!this.state.name) {
            cli.output("No domain configured");
            return;
        }

        const name = args?.name as string;
        const target = args?.target as string;
        const ttl = args?.ttl ? parseInt(args.ttl) : undefined;

        if (!name || !target) {
            cli.output("Usage: monk do <domain>/add-cname-record --name=<record_name> --target=<target_domain> [--ttl=<ttl>]");
            return;
        }

        const recordData = {
            type: "CNAME",
            name: name,
            data: target,
            ttl: ttl || 1800
        };

        try {
            const result = this.post(`/v2/domains/${this.state.name}/records`, recordData);
            cli.output(`Added CNAME record: ${name}.${this.state.name} -> ${target}`);
            return result;
        } catch (error: any) {
            cli.output(`Error adding CNAME record: ${error.message}`);
        }
    }

    /**
     * List all domains in the account
     */
    @action("list-all-domains")
    listAllDomains(_args?: Args) {
        try {
            const domains = this.get("/v2/domains");
            cli.output("All domains in account:");
            
            if (domains.domains && domains.domains.length > 0) {
                domains.domains.forEach((domain: any) => {
                    cli.output(`  ${domain.name} (TTL: ${domain.ttl})`);
                });
            } else {
                cli.output("  No domains found");
            }
        } catch (error: any) {
            cli.output(`Error listing domains: ${error.message}`);
        }
    }
}
