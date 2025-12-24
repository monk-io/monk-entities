import { VercelEntity, VercelEntityDefinition, VercelEntityState } from "./vercel-base.ts";
import { action, Args } from "monkec/base";
import cli from "cli";
import { VERCEL_API_ENDPOINTS } from "./common.ts";

/**
 * Represents a Vercel project entity.
 * This entity allows interaction with Vercel projects via its API.
 * @interface ProjectDefinition
 */
export interface ProjectDefinition extends VercelEntityDefinition {
    /**
     * Project name
     * @minLength 1
     * @maxLength 100
     */
    name: string;

    /**
     * Framework preset (optional)
     * @description Framework preset for the project
     */
    framework?: string;

    /**
     * Git repository (optional)
     * @description Git repository URL for the project
     */
    git_repository?: {
        type: "github" | "gitlab" | "bitbucket";
        repo: string;
        production_branch?: string;
    };

    /**
     * Root directory (optional)
     * @description Root directory for the project
     */
    root_directory?: string;

    /**
     * Build command (optional)
     * @description Build command for the project
     */
    build_command?: string;

    /**
     * Output directory (optional)
     * @description Output directory for the project
     */
    output_directory?: string;

    /**
     * Install command (optional)
     * @description Install command for the project
     */
    install_command?: string;

    /**
     * Development command (optional)
     * @description Development command for the project
     */
    dev_command?: string;

    /**
     * Environment variables (optional)
     * @description Environment variables for the project
     */
    env?: Record<string, string>;

    /**
     * Project domains (optional)
     * @description List of custom domains to associate with the project
     */
    domains?: string[];
}

/**
 * Represents the mutable runtime state of a Vercel project entity.
 * This state can change during the entity's lifecycle.
 * @interface ProjectState
 */
export interface ProjectState extends VercelEntityState {
    /**
     * Project ID from Vercel
     * @description Unique identifier for the project
     */
    id?: string;

    /**
     * Project name
     * @description Current name of the project
     */
    name?: string;

    /**
     * Project URL
     * @description The public URL of the project
     */
    url?: string;

    /**
     * Project domains
     * @description Domains associated with the project
     */
    domains?: string[];

    /**
     * Project status
     * @description Current status of the project
     */
    status?: string;

    /**
     * Created timestamp
     * @description When the project was created
     * @format date-time
     */
    created_at?: string;

    /**
     * Updated timestamp
     * @description When the project was last updated
     * @format date-time
     */
    updated_at?: string;

    /**
     * Account ID
     * @description Account ID that owns the project
     */
    account_id?: string;

    /**
     * Latest deployment
     * @description Latest deployment information
     */
    latest_deployment?: {
        id: string;
        url: string;
        created_at: string;
        state: string;
    };

    /**
     * Framework preset
     * @description Current framework preset for the project
     */
    framework?: string;

    /**
     * Build command
     * @description Current build command for the project
     */
    build_command?: string;

    /**
     * Output directory
     * @description Current output directory for the project
     */
    output_directory?: string;

    /**
     * Install command
     * @description Current install command for the project
     */
    install_command?: string;

    /**
     * Development command
     * @description Current development command for the project
     */
    dev_command?: string;

    /**
     * Root directory
     * @description Current root directory for the project
     */
    root_directory?: string;
}

/**
 * @description Vercel Project entity.
 * Creates and manages Vercel projects for serverless application deployments.
 * Supports framework presets, Git repository connections, and environment variables.
 * 
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - Vercel API token (defaults to `vercel-api-token`)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.id` - Project ID
 * - `state.name` - Project name
 * - `state.url` - Production deployment URL
 * - `state.domains` - Associated domains
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `vercel/deployment` - Deploy code to the project
 */
export class Project extends VercelEntity<ProjectDefinition, ProjectState> {

    protected getEntityName(): string {
        return this.definition.name;
    }

    /** Create a new Vercel project */
    override create(): void {
        // Check if project already exists by name
        const existingProject = this.findExistingProject();

        if (existingProject) {
            // Project already exists, use it
            this.state = {
                id: existingProject.id,
                name: existingProject.name,
                url: existingProject.url,
                domains: existingProject.domains,
                status: existingProject.status,
                created_at: existingProject.created_at,
                updated_at: existingProject.updated_at,
                account_id: existingProject.account_id,
                latest_deployment: existingProject.latest_deployment,
                framework: existingProject.framework,
                build_command: existingProject.buildCommand,
                output_directory: existingProject.outputDirectory,
                install_command: existingProject.installCommand,
                dev_command: existingProject.devCommand,
                root_directory: existingProject.rootDirectory,
                existing: true
            };
            cli.output(`✅ Project ${this.definition.name} already exists, updating configuration`);
            this.update();
            return;
        }

        // Prepare request body for project creation
        const body: any = {
            name: this.definition.name,
            ...this.getTeamBody()
        };

        // Add optional fields if provided
        if (this.definition.framework) {
            body.framework = this.definition.framework;
        }

        if (this.definition.git_repository) {
            body.gitRepository = this.definition.git_repository;
        }

        if (this.definition.root_directory) {
            body.rootDirectory = this.definition.root_directory;
        }

        if (this.definition.build_command) {
            body.buildCommand = this.definition.build_command;
        }

        if (this.definition.output_directory) {
            body.outputDirectory = this.definition.output_directory;
        }

        if (this.definition.install_command) {
            body.installCommand = this.definition.install_command;
        }

        if (this.definition.dev_command) {
            body.devCommand = this.definition.dev_command;
        }

        // Create the project
        let createObj;
        try {
            createObj = this.makeRequest("POST", VERCEL_API_ENDPOINTS.PROJECTS_V11, body);
        } catch (error) {
            let errorMessage = "Unknown error";

            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === "string") {
                errorMessage = error;
            } else {
                errorMessage = "Project creation failed";
            }

            cli.output(`❌ Project creation failed: ${errorMessage}`);

            // Check if it's a 409 conflict error (project already exists)
            if (errorMessage.includes("409") || errorMessage.includes("already exists")) {
                cli.output(`🔄 Project creation failed with 409 (project already exists), trying to find existing project...`);
                const retryProject = this.findExistingProject();
                if (retryProject) {
                    this.state = {
                        id: retryProject.id,
                        name: retryProject.name,
                        url: retryProject.url,
                        domains: retryProject.domains,
                        status: retryProject.status,
                        created_at: retryProject.created_at,
                        updated_at: retryProject.updated_at,
                        account_id: retryProject.account_id,
                        latest_deployment: retryProject.latest_deployment,
                        framework: retryProject.framework,
                        build_command: retryProject.buildCommand,
                        output_directory: retryProject.outputDirectory,
                        install_command: retryProject.installCommand,
                        dev_command: retryProject.devCommand,
                        root_directory: retryProject.rootDirectory,
                        existing: true
                    };
                    cli.output(`✅ Project ${this.definition.name} already exists (after 409), updating configuration`);
                    this.update();
                    return;
                }
            }

            throw new Error(`Failed to create project: ${errorMessage}`);
        }

        // Set state from created project
        this.state = {
            id: createObj.id,
            name: createObj.name,
            url: createObj.url,
            domains: createObj.domains,
            status: createObj.status,
            created_at: createObj.created_at,
            updated_at: createObj.updated_at,
            account_id: createObj.account_id,
            latest_deployment: createObj.latest_deployment,
            framework: createObj.framework,
            build_command: createObj.buildCommand,
            output_directory: createObj.outputDirectory,
            install_command: createObj.installCommand,
            dev_command: createObj.devCommand,
            root_directory: createObj.rootDirectory,
            existing: false
        };

        cli.output(`✅ Created Vercel project: ${createObj.name}`);

        // Sync custom domains after project creation
        this.syncDomains();
    }

    override update(): void {
        if (!this.state.id) {
            this.create();
            return;
        }

        const body: any = {
            ...this.getTeamBody()
        };

        let hasChanges = false;
        const shouldSyncDomains = Array.isArray(this.definition.domains) && this.definition.domains.length > 0;

        // Only include name if it's different from current state
        if (this.definition.name !== this.state.name) {
            body.name = this.definition.name;
            hasChanges = true;
        }

        // Add optional fields if provided and different from current state
        if (this.definition.framework && this.definition.framework !== this.state.framework) {
            body.framework = this.definition.framework;
            hasChanges = true;
        }

        if (this.definition.build_command && this.definition.build_command !== this.state.build_command) {
            body.buildCommand = this.definition.build_command;
            hasChanges = true;
        }

        if (this.definition.output_directory && this.definition.output_directory !== this.state.output_directory) {
            body.outputDirectory = this.definition.output_directory;
            hasChanges = true;
        }

        if (this.definition.install_command && this.definition.install_command !== this.state.install_command) {
            body.installCommand = this.definition.install_command;
            hasChanges = true;
        }

        if (this.definition.dev_command && this.definition.dev_command !== this.state.dev_command) {
            body.devCommand = this.definition.dev_command;
            hasChanges = true;
        }

        if (this.definition.root_directory && this.definition.root_directory !== this.state.root_directory) {
            body.rootDirectory = this.definition.root_directory;
            hasChanges = true;
        }

        // Skip update if nothing has changed
        if (!hasChanges) {
            // Even if no project field changes, we may still need to sync domains
            if (shouldSyncDomains) {
                this.syncDomains();
            } else {
                cli.output(`ℹ️  No changes detected for project: ${this.definition.name}`);
            }
            return;
        }

        const updatedProject = this.makeRequest("PATCH", `${VERCEL_API_ENDPOINTS.PROJECTS}/${this.state.id}`, body);

        // Update state with new info
        this.state = {
            ...this.state,
            name: updatedProject.name,
            url: updatedProject.url,
            domains: updatedProject.domains,
            status: updatedProject.status,
            updated_at: updatedProject.updated_at,
            latest_deployment: updatedProject.latest_deployment,
            framework: updatedProject.framework,
            build_command: updatedProject.buildCommand,
            output_directory: updatedProject.outputDirectory,
            install_command: updatedProject.installCommand,
            dev_command: updatedProject.devCommand,
            root_directory: updatedProject.rootDirectory
        };

        cli.output(`✅ Updated Vercel project: ${updatedProject.name}`);

        // Sync custom domains after project update
        if (shouldSyncDomains) {
            this.syncDomains();
        }
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("Project does not exist, nothing to delete");
            return;
        }

        this.deleteResource(`${VERCEL_API_ENDPOINTS.PROJECTS}/${this.state.id}`, "Project");
    }

    override checkReadiness(): boolean {
        if (!this.state.id) {
            return false;
        }

        try {
            // Vercel projects are ready immediately after creation
            // Just verify the project exists and is accessible
            const project = this.makeRequest("GET", `${VERCEL_API_ENDPOINTS.PROJECTS}/${this.state.id}`);
            return !!project && !!project.id;
        } catch (error) {
            return false;
        }
    }

    checkLiveness(): boolean { return this.checkReadiness(); }

    /**
     * Find existing project by name
     */
    private findExistingProject(): any | null {
        try {
            const teamPath = this.getTeamPath();
            const allProjects = this.makeRequest("GET", `${VERCEL_API_ENDPOINTS.PROJECTS}${teamPath}`);

            if (allProjects && Array.isArray(allProjects.projects)) {
                return allProjects.projects.find((p: any) => p.name === this.definition.name);
            }
        } catch (error) {
            cli.output(`⚠️  Could not check for existing projects: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        return null;
    }

    /**
     * Ensure desired domains from definition are associated with the project
     * Adds missing domains; does not remove existing ones
     */
    private syncDomains(): void {
        if (!this.state.id) return;
        const desired = Array.isArray(this.definition.domains)
            ? Array.from(new Set(this.definition.domains.filter((d) => typeof d === "string" && d.trim().length > 0)))
            : [];
        if (desired.length === 0) return;

        try {
            const teamPath = this.getTeamPath();
            const existing = this.makeRequest("GET", `${VERCEL_API_ENDPOINTS.PROJECTS}/${this.state.id}/domains${teamPath}`);
            const existingNames: string[] = Array.isArray(existing)
                ? existing.map((d: any) => (typeof d === "string" ? d : d?.name)).filter((n: any) => typeof n === "string")
                : [];

            const toAdd = desired.filter((d) => !existingNames.includes(d));
            for (const domain of toAdd) {
                const body = { name: domain, ...this.getTeamBody() };
                this.makeRequest("POST", `${VERCEL_API_ENDPOINTS.PROJECTS}/${this.state.id}/domains`, body);
                cli.output(`🌐 Added domain: ${domain}`);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            cli.output(`⚠️  Failed to sync domains: ${msg}`);
        }
    }

    // Custom actions using @action decorator
    @action("get-project")
    getProject(): void {
        if (!this.state.id) {
            throw new Error("Project ID not available");
        }

        cli.output(`📋 Getting details for project: ${this.definition.name}`);

        const project = this.makeRequest("GET", `${VERCEL_API_ENDPOINTS.PROJECTS}/${this.state.id}`);

        cli.output(`✅ Project Details:`);
        cli.output(`   ID: ${project.id}`);
        cli.output(`   Name: ${project.name}`);
        cli.output(`   Framework: ${project.framework || 'None'}`);
        cli.output(`   Created: ${project.createdAt || 'Unknown'}`);

        if (project.domains && project.domains.length > 0) {
            cli.output(`   Domains: ${project.domains.join(", ")}`);
        }
    }

    @action("list-deployments")
    listDeployments(args?: Args): void {
        if (!this.state.id) {
            throw new Error("Project ID not available");
        }

        const limit = args?.limit || 10;
        cli.output(`📋 Listing deployments for project: ${this.definition.name} (limit: ${limit})`);

        const teamPath = this.getTeamPath();
        const queryParams = `projectId=${this.state.id}&limit=${limit}`;
        const path = teamPath ? `${VERCEL_API_ENDPOINTS.DEPLOYMENTS}${teamPath}&${queryParams}` : `${VERCEL_API_ENDPOINTS.DEPLOYMENTS}?${queryParams}`;
        const deployments = this.makeRequest("GET", path);

        if (deployments && Array.isArray(deployments.deployments)) {
            cli.output(`✅ Found ${deployments.deployments.length} deployments:`);
            deployments.deployments.forEach((deployment: any, index: number) => {
                cli.output(`   ${index + 1}. ${deployment.url} (${deployment.state}) - ${deployment.created_at}`);
            });
        } else {
            cli.output(`ℹ️  No deployments found`);
        }
    }

    @action("create-deployment")
    createDeployment(args?: Args): void {
        if (!this.state.id) {
            throw new Error("Project ID not available");
        }

        const name = args?.name || `deployment-${Date.now()}`;
        cli.output(`🚀 Creating deployment for project: ${this.definition.name}`);

        const body = {
            name: name,
            projectId: this.state.id,
            ...this.getTeamBody()
        };

        const deployment = this.makeRequest("POST", VERCEL_API_ENDPOINTS.DEPLOYMENTS_V13, body);

        cli.output(`✅ Deployment created successfully!`);
        cli.output(`   Deployment ID: ${deployment.id}`);
        cli.output(`   URL: ${deployment.url}`);
        cli.output(`   State: ${deployment.state}`);
    }

    @action("get-deployment")
    getDeployment(args?: Args): void {
        if (!this.state.id) {
            throw new Error("Project ID not available");
        }

        const deploymentId = args?.deployment_id;
        if (!deploymentId) {
            throw new Error("deployment_id argument is required");
        }

        cli.output(`📋 Getting deployment details: ${deploymentId}`);

        const deployment = this.makeRequest("GET", `${VERCEL_API_ENDPOINTS.DEPLOYMENTS_V13}/${deploymentId}`);

        cli.output(`✅ Deployment Details:`);
        cli.output(`   ID: ${deployment.id}`);
        cli.output(`   URL: ${deployment.url}`);
        cli.output(`   State: ${deployment.state}`);
        cli.output(`   Created: ${deployment.created_at}`);
        cli.output(`   Project: ${deployment.project_id}`);
    }

    @action("list-domains")
    listDomains(): void {
        if (!this.state.id) {
            throw new Error("Project ID not available");
        }

        cli.output(`📋 Listing domains for project: ${this.definition.name}`);

        const teamPath = this.getTeamPath();
        const domains = this.makeRequest("GET", `${VERCEL_API_ENDPOINTS.PROJECTS}/${this.state.id}/domains${teamPath}`);

        if (domains && Array.isArray(domains)) {
            cli.output(`✅ Found ${domains.length} domains:`);
            domains.forEach((domain: any, index: number) => {
                cli.output(`   ${index + 1}. ${domain.name} (${domain.verification?.status || 'unknown'})`);
            });
        } else {
            cli.output(`ℹ️  No domains found`);
        }
    }

    @action("add-domain")
    addDomain(args?: Args): void {
        if (!this.state.id) {
            throw new Error("Project ID not available");
        }

        const domain = args?.domain;
        if (!domain) {
            throw new Error("domain argument is required");
        }

        cli.output(`🌐 Adding domain ${domain} to project: ${this.definition.name}`);

        const body = {
            name: domain,
            ...this.getTeamBody()
        };

        const result = this.makeRequest("POST", `${VERCEL_API_ENDPOINTS.PROJECTS}/${this.state.id}/domains`, body);

        cli.output(`✅ Domain added successfully!`);
        cli.output(`   Domain: ${result.name}`);
        cli.output(`   Status: ${result.verification?.status || 'unknown'}`);
    }

    @action("remove-domain")
    removeDomain(args?: Args): void {
        if (!this.state.id) {
            throw new Error("Project ID not available");
        }

        const domain = args?.domain;
        if (!domain) {
            throw new Error("domain argument is required");
        }

        cli.output(`🗑️  Removing domain ${domain} from project: ${this.definition.name}`);

        this.makeRequest("DELETE", `${VERCEL_API_ENDPOINTS.PROJECTS}/${this.state.id}/domains/${domain}`);

        cli.output(`✅ Domain removed successfully!`);
    }

    @action("get-production-urls")
    getProductionUrls(): void {
        if (!this.state.id) {
            throw new Error("Project ID not available");
        }

        cli.output(`🔗 Getting production URLs for project: ${this.definition.name}`);

        const project = this.makeRequest("GET", `${VERCEL_API_ENDPOINTS.PROJECTS}/${this.state.id}`);
        const urls: string[] = [];
        if (project.targets && project.targets.production && project.targets.production.alias) {
            cli.output(`✅ Production URLs:`);
            project.targets.production.alias.forEach((url: string, index: number) => {
                cli.output(`   ${index + 1}. https://${url}`);
                urls.push(`https://${url}`);
            });
        } else {
            cli.output(`ℹ️  No production URLs available yet. Deploy the project first.`);
        }
        if (urls.length > 0) {
            this.state.url = urls[0]; // Set the first URL as the main project URL
        } else {
            throw new Error("No production URLs available");
        }
    }
} 