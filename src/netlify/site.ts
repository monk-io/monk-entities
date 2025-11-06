import { NetlifyEntity, NetlifyEntityDefinition, NetlifyEntityState } from "./netlify-base.ts";
import { action, Args } from "monkec/base";
import cli from "cli";

/**
 * Represents a Netlify site entity.
 * This entity allows interaction with Netlify sites via its API.
 * @interface SiteDefinition
 */
export interface SiteDefinition extends NetlifyEntityDefinition {
    /**
     * Site name
     * @minLength 1
     * @maxLength 100
     */
    name: string;

    /**
     * Team slug (optional)
     * @description Team slug for team-specific sites
     */
    team_slug?: string;

    /**
     * Custom domain (optional)
     * @description Custom domain for the site
     */
    custom_domain?: string;

    /**
     * Domain aliases (optional)
     * @description Additional custom domains that should resolve to this site
     */
    domain_aliases?: string[];

    /**
     * Password protection (optional)
     * @description Password to protect the site
     */
    password?: string;

    /**
     * Force SSL (optional)
     * @description Whether to force SSL for the site
     */
    force_ssl?: boolean;
}

/**
 * Represents the mutable runtime state of a Netlify site entity.
 * This state can change during the entity's lifecycle.
 * @interface SiteState
 */
export interface SiteState extends NetlifyEntityState {
    /**
     * Site ID from Netlify
     * @description Unique identifier for the site
     */
    id?: string;

    /**
     * Site name
     * @description Current name of the site
     */
    name?: string;

    /**
     * Site URL
     * @description The public URL of the site
     */
    url?: string;

    /**
     * Admin URL
     * @description The admin URL for managing the site
     */
    admin_url?: string;

    /**
     * Default Netlify domain
     * @description The default Netlify-hosted domain (e.g., example-site.netlify.app)
     */
    default_domain?: string;

    /**
     * Custom domain
     * @description Custom domain configured for the site
     */
    custom_domain?: string;

    /**
     * Domain aliases
     * @description Additional custom domains configured for the site
     */
    domain_aliases?: string[];

    /**
     * Site state
     * @description Current state of the site
     */
    state?: string;

    /**
     * Created timestamp
     * @description When the site was created
     * @format date-time
     */
    created_at?: string;

    /**
     * Updated timestamp
     * @description When the site was last updated
     * @format date-time
     */
    updated_at?: string;
}

export class Site extends NetlifyEntity<SiteDefinition, SiteState> {
    
    protected getEntityName(): string {
        return this.definition.name;
    }

    /** Create a new Netlify site */
    override create(): void {
        // Build URL prefix for team slug if specified
        let urlPrefix = "";
        if (this.definition.team_slug) {
            urlPrefix = `/${this.definition.team_slug}`;
        }

        // Check if site already exists - fetch all sites and filter by name
        let existingSite = null;
        try {
            const allSites = this.makeRequest("GET", `${urlPrefix}/sites`);
            if (allSites && Array.isArray(allSites)) {
                existingSite = allSites.find((s: any) => s.name === this.definition.name);
            }
        } catch (error) {
            cli.output(`⚠️  Could not check for existing sites: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        if (existingSite) {
            // Site already exists, use it
            this.state = {
                id: existingSite.id,
                name: existingSite.name,
                url: existingSite.ssl_url || existingSite.url,
                admin_url: existingSite.admin_url,
                custom_domain: existingSite.custom_domain,
                default_domain: existingSite.default_domain || existingSite.name + ".netlify.app",
                state: existingSite.state,
                created_at: existingSite.created_at,
                updated_at: existingSite.updated_at,
                existing: true
            };
            cli.output(`✅ Site ${this.definition.name} already exists, updating configuration`);
            this.update();
            return;
        }

        // Prepare request body
        const body: any = {
            name: this.definition.name,
            created_via: "monk.io"
        };

        if (this.definition.custom_domain) {
            body.custom_domain = this.definition.custom_domain;
        }
        if (this.definition.password) {
            body.password = this.definition.password;
        }
        if (this.definition.force_ssl !== undefined) {
            body.force_ssl = this.definition.force_ssl;
        }
        if (Array.isArray(this.definition.domain_aliases) && this.definition.domain_aliases.length > 0) {
            body.domain_aliases = this.definition.domain_aliases;
        }

        // Create the site
        let createObj;
        try {
            createObj = this.makeRequest("POST", `${urlPrefix}/sites`, body);
        } catch (error) {
            // Simple error handling - just get the message
            let errorMessage = "Unknown error";
            
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === "string") {
                errorMessage = error;
            } else {
                errorMessage = "Site creation failed";
            }
            
            cli.output(`❌ Site creation failed: ${errorMessage}`);
            
            // Check if it's a 422 subdomain error and try to accept existing site
            if (errorMessage.includes("422") && errorMessage.includes("subdomain")) {
                cli.output(`🔄 Site creation failed with 422 (subdomain must be unique), trying to accept existing site...`);
                try {
                    const retryAllSites = this.makeRequest("GET", `${urlPrefix}/sites`);
                    if (retryAllSites && Array.isArray(retryAllSites)) {
                        const site = retryAllSites.find((s: any) => s.name === this.definition.name);
                        if (site) {
                            this.state = {
                                id: site.id,
                                name: site.name,
                                url: site.ssl_url || site.url,
                                admin_url: site.admin_url,
                                custom_domain: site.custom_domain,
                                default_domain: site.default_domain || site.name + ".netlify.app",
                                state: site.state,
                                created_at: site.created_at,
                                updated_at: site.updated_at,
                                existing: true
                            };
                            cli.output(`✅ Site ${this.definition.name} already exists (after 422), updating configuration`);
                            this.update();
                            return;
                        }
                    }
                } catch (retryError) {
                    cli.output(`⚠️  Could not retry finding existing site: ${retryError instanceof Error ? retryError.message : 'Unknown error'}`);
                }
            }
            
            throw new Error(`Failed to create site: ${errorMessage}`);
        }

        // Set state from created site
        this.state = {
            id: createObj.id,
            name: createObj.name,
            url: createObj.ssl_url || createObj.url,
            admin_url: createObj.admin_url,
            custom_domain: createObj.custom_domain,
            default_domain: createObj.default_domain || createObj.name + ".netlify.app",
            domain_aliases: createObj.domain_aliases,
            state: createObj.state,
            created_at: createObj.created_at,
            updated_at: createObj.updated_at,
            existing: false
        };
        
        cli.output(`✅ Created Netlify site: ${createObj.name} (${createObj.ssl_url})`);

        // Per Netlify guidance, most settings (including custom_domain) cannot be reliably set on create.
        // Follow-up with an update call to apply custom domain and aliases if provided.
        try {
            const needsFollowUpUpdate = Boolean(
                this.definition.custom_domain ||
                (Array.isArray(this.definition.domain_aliases) && this.definition.domain_aliases.length > 0) ||
                this.definition.force_ssl !== undefined ||
                this.definition.password
            );
            if (needsFollowUpUpdate) {
                const urlPrefix2 = this.definition.team_slug ? `/${this.definition.team_slug}` : "";
                const updateBody: any = { name: this.definition.name };
                if (this.definition.custom_domain) updateBody.custom_domain = this.definition.custom_domain;
                if (Array.isArray(this.definition.domain_aliases) && this.definition.domain_aliases.length > 0) {
                    updateBody.domain_aliases = this.definition.domain_aliases;
                }
                if (this.definition.force_ssl !== undefined) updateBody.force_ssl = this.definition.force_ssl;
                if (this.definition.password) updateBody.password = this.definition.password;

                const updatedSite = this.makeRequest("PUT", `${urlPrefix2}/sites/${this.state.id}`, updateBody);
                this.state = {
                    ...this.state,
                    name: updatedSite.name,
                    url: updatedSite.ssl_url || updatedSite.url,
                    custom_domain: updatedSite.custom_domain,
                    default_domain: updatedSite.default_domain || updatedSite.name + ".netlify.app",
                    domain_aliases: updatedSite.domain_aliases,
                    updated_at: updatedSite.updated_at
                };
                cli.output(`🔄 Applied post-create site settings (custom domain/aliases)`);
            }
        } catch (error) {
            cli.output(`⚠️  Post-create update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override update(): void {
        if (!this.state.id) {
            this.create();
            return;
        }

        // Build URL prefix for team slug if specified
        let urlPrefix = "";
        if (this.definition.team_slug) {
            urlPrefix = `/${this.definition.team_slug}`;
        }

        const body: any = {
            name: this.definition.name
        };
        
        if (this.definition.custom_domain) {
            body.custom_domain = this.definition.custom_domain;
        }
        if (Array.isArray(this.definition.domain_aliases) && this.definition.domain_aliases.length > 0) {
            body.domain_aliases = this.definition.domain_aliases;
        }
        
        if (this.definition.password) {
            body.password = this.definition.password;
        }
        
        if (this.definition.force_ssl !== undefined) {
            body.force_ssl = this.definition.force_ssl;
        }
        
        const updatedSite = this.makeRequest("PUT", `${urlPrefix}/sites/${this.state.id}`, body);
        
        // Update state with new info
        this.state = {
            ...this.state,
            name: updatedSite.name,
            url: updatedSite.ssl_url || updatedSite.url,
            custom_domain: updatedSite.custom_domain,
            default_domain: updatedSite.default_domain || updatedSite.name + ".netlify.app",
            domain_aliases: updatedSite.domain_aliases,
            updated_at: updatedSite.updated_at
        };

        cli.output(`✅ Updated Netlify site: ${updatedSite.name}`);
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("Site does not exist, nothing to delete");
            return;
        }

        // Build URL prefix for team slug if specified
        let urlPrefix = "";
        if (this.definition.team_slug) {
            urlPrefix = `/${this.definition.team_slug}`;
        }
        
        this.deleteResource(`${urlPrefix}/sites/${this.state.id}`, "Site");
    }

    override checkReadiness(): boolean {
        if (!this.state.id) {
            cli.output("🔍 Readiness check: No site ID available");
            return false;
        }

        // Build URL prefix for team slug if specified
        let urlPrefix = "";
        if (this.definition.team_slug) {
            urlPrefix = `/${this.definition.team_slug}`;
        }

        try {
            const site = this.makeRequest("GET", `${urlPrefix}/sites/${this.state.id}`);
            cli.output(`🔍 Readiness check: Site state is "${site.state}"`);
            const isReady = site.state === "current" || site.state === "ready";
            cli.output(`🔍 Readiness check: Site ready = ${isReady}`);
            return isReady;
        } catch (error) {
            cli.output(`🔍 Readiness check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }

    checkLiveness(): boolean { return this.checkReadiness(); }

    @action("get-site")
    getSite(): void {
        if (!this.state.id) {
            throw new Error("Site does not exist");
        }

        // Build URL prefix for team slug if specified
        let urlPrefix = "";
        if (this.definition.team_slug) {
            urlPrefix = `/${this.definition.team_slug}`;
        }

        const site = this.makeRequest("GET", `${urlPrefix}/sites/${this.state.id}`);
        cli.output(`Site: ${site.name}`);
        cli.output(`URL: ${site.ssl_url || site.url}`);
        cli.output(`State: ${site.state}`);
        cli.output(`Created: ${site.created_at}`);
    }

    @action("list-deploys")
    listDeploys(args?: Args): void {
        if (!this.state.id) {
            throw new Error("Site does not exist");
        }

        const page = args?.page || "1";
        const perPage = args?.per_page || "10";
        
        const deploys = this.makeRequest("GET", `/sites/${this.state.id}/deploys?page=${page}&per_page=${perPage}`);
        
        cli.output(`Deploys for site ${this.state.name}:`);
        deploys.forEach((deploy: any, index: number) => {
            cli.output(`${index + 1}. ${deploy.id} - ${deploy.state} - ${deploy.created_at}`);
        });
    }

    @action("create-deploy")
    createDeploy(args?: Args): void {
        if (!this.state.id) {
            throw new Error("Site does not exist");
        }

        const body: any = {};
        
        if (args?.dir) {
            body.dir = args.dir;
        }
        
        if (args?.functions_dir) {
            body.functions_dir = args.functions_dir;
        }
        
        if (args?.prod) {
            body.prod = args.prod === "true";
        }

        const deploy = this.makeRequest("POST", `/sites/${this.state.id}/deploys`, body);
        
        cli.output(`✅ Created deploy: ${deploy.id}`);
        cli.output(`Deploy URL: ${deploy.deploy_url}`);
        cli.output(`State: ${deploy.state}`);
    }

    @action("get-deploy")
    getDeploy(args?: Args): void {
        if (!this.state.id) {
            throw new Error("Site does not exist");
        }

        const deployId = args?.deploy_id;
        if (!deployId) {
            throw new Error("deploy_id argument is required");
        }

        const deploy = this.makeRequest("GET", `/sites/${this.state.id}/deploys/${deployId}`);
        
        cli.output(`Deploy: ${deploy.id}`);
        cli.output(`State: ${deploy.state}`);
        cli.output(`URL: ${deploy.deploy_url}`);
        cli.output(`Created: ${deploy.created_at}`);
        
        if (deploy.error_message) {
            cli.output(`Error: ${deploy.error_message}`);
        }
    }

    @action("restore-deploy")
    restoreDeploy(args?: Args): void {
        if (!this.state.id) {
            throw new Error("Site does not exist");
        }

        const deployId = args?.deploy_id;
        if (!deployId) {
            throw new Error("deploy_id argument is required");
        }

        const restoredDeploy = this.makeRequest("POST", `/sites/${this.state.id}/deploys/${deployId}/restore`);
        
        cli.output(`✅ Restored deploy: ${restoredDeploy.id}`);
        cli.output(`Site is now live at: ${restoredDeploy.ssl_url || restoredDeploy.url}`);
    }
} 