/**
 * GCP IAP Tunnel Destination Group Entity
 *
 * Manages groups of IP/FQDN destinations for IAP TCP forwarding — used to scope
 * SSH/RDP tunnel access to specific backends.
 *
 * @see https://cloud.google.com/iap/docs/reference/rest/v1/projects.iap_tunnel.locations.destGroups
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { IAP_API_URL } from "./iap-common.ts";

/**
 * IAP Tunnel Dest Group entity definition
 */
export interface IapTunnelDestGroupDefinition extends GcpEntityDefinition {
    /**
     * @description Group identifier — lowercase letters, digits, and dashes only; unique per project+location
     */
    name: string;

    /**
     * @description GCP region (e.g., "us-central1")
     */
    location: string;

    /**
     * @description List of CIDR blocks belonging to this destination group
     */
    cidrs?: string[];

    /**
     * @description List of fully-qualified domain names belonging to this destination group
     */
    fqdns?: string[];
}

/**
 * IAP Tunnel Dest Group entity state
 */
export interface IapTunnelDestGroupState extends GcpEntityState {
    /**
     * @description Full resource name (projects/{project}/iap_tunnel/locations/{location}/destGroups/{name})
     */
    group_name?: string;
}

/**
 * @description GCP IAP Tunnel Destination Group entity. Manages named groups of IP blocks and
 * FQDNs that can be used as scope for IAP TCP forwarding IAM bindings. A single group is scoped
 * to a project+location.
 *
 * ## Required Permissions
 * - `iap.tunnelDestGroups.create`
 * - `iap.tunnelDestGroups.get`
 * - `iap.tunnelDestGroups.list`
 * - `iap.tunnelDestGroups.update`
 * - `iap.tunnelDestGroups.delete`
 *
 * ## Secrets
 * - Reads: none (authenticated via GCP provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.group_name` — full resource name
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/iap-access-policy` — grant `roles/iap.tunnelResourceAccessor` on a tunnel resource
 */
export class IapTunnelDestGroup extends GcpEntity<IapTunnelDestGroupDefinition, IapTunnelDestGroupState> {

    static readonly readiness = { period: 5, initialDelay: 1, attempts: 6 };

    protected getEntityName(): string {
        return `GCP IAP Tunnel Dest Group "${this.definition.name}" (${this.definition.location})`;
    }

    private getParentUrl(): string {
        return `${IAP_API_URL}/projects/${this.projectId}/iap_tunnel/locations/${this.definition.location}/destGroups`;
    }

    private getSelfUrl(): string {
        return `${this.getParentUrl()}/${this.definition.name}`;
    }

    override create(): void {
        const existing = this.checkResourceExists(this.getSelfUrl());
        if (existing) {
            this.state.existing = true;
            this.state.group_name = String(existing.name || "");
            cli.output(`Adopted existing tunnel dest group: ${this.state.group_name}`);
            return;
        }

        const body: Record<string, unknown> = {};
        if (this.definition.cidrs) body.cidrs = this.definition.cidrs;
        if (this.definition.fqdns) body.fqdns = this.definition.fqdns;

        const created = this.post(
            `${this.getParentUrl()}?tunnelDestGroupId=${encodeURIComponent(this.definition.name)}`,
            body,
        );
        this.state.group_name = String(
            created.name ||
            `projects/${this.projectId}/iap_tunnel/locations/${this.definition.location}/destGroups/${this.definition.name}`
        );
        this.state.existing = false;
        cli.output(`Created tunnel dest group: ${this.state.group_name}`);
    }

    override update(): void {
        if (!this.state.group_name) {
            this.create();
            return;
        }

        const body: Record<string, unknown> = {};
        const paths: string[] = [];
        if (this.definition.cidrs !== undefined) {
            body.cidrs = this.definition.cidrs;
            paths.push("cidrs");
        }
        if (this.definition.fqdns !== undefined) {
            body.fqdns = this.definition.fqdns;
            paths.push("fqdns");
        }
        if (paths.length === 0) {
            cli.output("No updatable fields");
            return;
        }

        this.patch(`${this.getSelfUrl()}?updateMask=${paths.join(",")}`, body);
        cli.output(`Updated tunnel dest group: ${this.state.group_name}`);
    }

    override delete(): void {
        if (!this.state.group_name) return;
        this.deleteResource(this.getSelfUrl(), `tunnel dest group ${this.definition.name}`);
    }

    override checkReadiness(): boolean {
        if (!this.state.group_name) return false;
        try {
            const result = this.get(this.getSelfUrl());
            return Boolean(result && result.name);
        } catch {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    /**
     * Display group details
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        if (!this.state.group_name) {
            throw new Error("Group not created yet");
        }
        const info = this.get(this.getSelfUrl());
        cli.output(`Tunnel Dest Group: ${info.name}`);
        cli.output(`  CIDRs: ${((info.cidrs as string[]) || []).join(", ") || "(none)"}`);
        cli.output(`  FQDNs: ${((info.fqdns as string[]) || []).join(", ") || "(none)"}`);
    }

    /**
     * List CIDR blocks in this group
     */
    @action("list-cidrs")
    listCidrs(_args?: Args): void {
        if (!this.state.group_name) {
            throw new Error("Group not created yet");
        }
        const info = this.get(this.getSelfUrl());
        const cidrs = (info.cidrs as string[]) || [];
        cli.output(`CIDRs for group ${this.definition.name}:`);
        for (const c of cidrs) cli.output(`  ${c}`);
        if (cidrs.length === 0) cli.output("  (none)");
    }
}
