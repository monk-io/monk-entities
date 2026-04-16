/**
 * GCP IAP OAuth Brand Entity
 *
 * Adopts the existing OAuth brand of a GCP project so other IAP entities
 * (OAuth clients) can reference it.
 *
 * @see https://cloud.google.com/iap/docs/reference/rest/v1/projects.brands
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { IAP_API_URL } from "./iap-common.ts";

/**
 * IAP Brand entity definition
 */
export interface IapBrandDefinition extends GcpEntityDefinition {
    // Brand is a project-level singleton — no configuration required.
    // Inherits only `project?` from GcpEntityDefinition.
}

/**
 * IAP Brand entity state
 */
export interface IapBrandState extends GcpEntityState {
    /**
     * @description Full brand resource name (projects/{projectNumber}/brands/{brandId})
     */
    brand_name?: string;

    /**
     * @description Brand identifier (trailing segment of the resource name)
     */
    brand_id?: string;

    /**
     * @description Application title shown on the OAuth consent screen
     */
    application_title?: string;

    /**
     * @description Support email shown on the OAuth consent screen
     */
    support_email?: string;

    /**
     * @description Whether this brand is restricted to users inside the G Suite organization only
     */
    org_internal_only?: boolean;
}

/**
 * @description GCP IAP OAuth Brand entity. Adopts the existing OAuth brand of the project so
 * other IAP entities (iap-oauth-client) can reference it. The brand itself is NOT created by this
 * entity — external-audience brands must be created via the Cloud Console (APIs & Services →
 * OAuth consent screen). Attempting to run this entity on a project without a brand produces a
 * clear error.
 *
 * ## Required Permissions
 * - `clientauthconfig.brands.list` — find existing brand
 * - `clientauthconfig.brands.get` — read brand metadata
 *
 * ## Secrets
 * - Reads: none (authenticated via GCP provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.brand_id` — consumed by `gcp/iap-oauth-client` to create OAuth clients under this brand
 * - `state.brand_name` — full resource name
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/iap-oauth-client` — brand_id is required input for OAuth client creation
 */
export class IapBrand extends GcpEntity<IapBrandDefinition, IapBrandState> {

    static readonly readiness = { period: 5, initialDelay: 1, attempts: 3 };

    protected getEntityName(): string {
        return `GCP IAP Brand (project ${this.projectId})`;
    }

    override create(): void {
        const listUrl = `${IAP_API_URL}/projects/${this.projectId}/brands`;
        const response = this.get(listUrl);
        const brands = (response.brands as Array<Record<string, unknown>> | undefined) || [];

        if (brands.length === 0) {
            throw new Error(
                `No OAuth brand found for project ${this.projectId}. Create one via the Cloud Console ` +
                `(APIs & Services → OAuth consent screen) before using IAP entities.`
            );
        }
        if (brands.length > 1) {
            cli.output(`Warning: project has ${brands.length} brands — adopting the first`);
        }

        this.adoptBrand(brands[0]);
    }

    override update(): void {
        if (this.state.brand_name) {
            try {
                const brand = this.get(`${IAP_API_URL}/${this.state.brand_name}`);
                this.adoptBrand(brand);
            } catch (err) {
                cli.output(`Warning: failed to refresh brand info: ${(err as Error).message}`);
            }
        } else {
            this.create();
        }
    }

    override delete(): void {
        cli.output("IAP brand was adopted, skipping delete");
    }

    override checkReadiness(): boolean {
        return Boolean(this.state.brand_id);
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    private adoptBrand(brand: Record<string, unknown>): void {
        this.state.existing = true;
        const name = String(brand.name || "");
        this.state.brand_name = name;
        const parts = name.split("/");
        this.state.brand_id = parts.length > 0 ? parts[parts.length - 1] : "";
        this.state.application_title = brand.applicationTitle as string | undefined;
        this.state.support_email = brand.supportEmail as string | undefined;
        this.state.org_internal_only = Boolean(brand.orgInternalOnly);

        cli.output(`Adopted IAP brand: ${this.state.brand_name}`);
        cli.output(`  Application title: ${this.state.application_title || "(unset)"}`);
        cli.output(`  Support email: ${this.state.support_email || "(unset)"}`);
        cli.output(`  Org-internal only: ${this.state.org_internal_only}`);
    }

    /**
     * Display current brand info
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        if (!this.state.brand_name) {
            throw new Error("Brand not adopted yet");
        }
        const brand = this.get(`${IAP_API_URL}/${this.state.brand_name}`);
        cli.output(`IAP Brand: ${brand.name}`);
        cli.output(`  Application title: ${brand.applicationTitle || "(unset)"}`);
        cli.output(`  Support email: ${brand.supportEmail || "(unset)"}`);
        cli.output(`  Org-internal only: ${brand.orgInternalOnly || false}`);
    }
}
