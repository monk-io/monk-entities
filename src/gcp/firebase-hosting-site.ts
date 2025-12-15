/**
 * GCP Firebase Hosting Site Entity
 *
 * Creates and manages Firebase Hosting sites for web application hosting.
 * Firebase Hosting provides fast and secure hosting for web apps, static
 * and dynamic content.
 *
 * @see https://firebase.google.com/docs/hosting
 * @see https://firebase.google.com/docs/reference/hosting/rest
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { FIREBASE_HOSTING_API_URL } from "./common.ts";

/**
 * Firebase Hosting site type
 */
export type FirebaseSiteType = "DEFAULT_SITE" | "USER_SITE";

/**
 * Firebase Hosting Site entity definition
 * @interface FirebaseHostingSiteDefinition
 */
export interface FirebaseHostingSiteDefinition extends GcpEntityDefinition {
    /**
     * @description Site name/ID (must be unique within Firebase project)
     * The site will be accessible at {name}.web.app and {name}.firebaseapp.com
     */
    name: string;

    /**
     * @description Firebase project ID (if different from GCP project)
     * Usually the same as the GCP project.
     */
    firebase_project?: string;

    /**
     * @description Site type
     * - DEFAULT_SITE: The default hosting site for the project
     * - USER_SITE: A custom additional hosting site
     * @default USER_SITE
     */
    site_type?: FirebaseSiteType;

    /**
     * @description App ID this site is associated with (optional)
     * Format: projects/{project}/webApps/{appId}
     */
    app_id?: string;

    /**
     * @description Whether to keep the site on delete (don't destroy)
     * @default false
     */
    keep_on_delete?: boolean;

    /**
     * @description Key-value labels for organizing sites
     */
    labels?: Record<string, string>;
}

/**
 * Firebase Hosting Site entity state
 * @interface FirebaseHostingSiteState
 */
export interface FirebaseHostingSiteState extends GcpEntityState {
    /**
     * @description Full resource name
     */
    name?: string;

    /**
     * @description Site ID
     */
    site_id?: string;

    /**
     * @description Default URL for the site ({site}.web.app)
     */
    default_url?: string;

    /**
     * @description Site type
     */
    site_type?: string;

    /**
     * @description Associated app ID
     */
    app_id?: string;

    /**
     * @description Legacy Firebase app domain ({site}.firebaseapp.com)
     */
    firebase_app_url?: string;
}

/**
 * GCP Firebase Hosting Site Entity
 *
 * Manages Firebase Hosting sites which serve web applications. Each site
 * has a default domain ({site}.web.app) and can have custom domains configured.
 *
 * ## Site Deployment
 * This entity creates and manages the site resource. To deploy content:
 * - Use Firebase CLI in a container: `firebase deploy --only hosting`
 * - Use the Firebase Hosting Channel entity for preview deployments
 * - Or use the deploy action with blob content
 *
 * ## Builder Pattern
 * For deploying content, combine this entity with a runnable that uses
 * Firebase CLI:
 * ```yaml
 * hosting-deploy:
 *   defines: runnable
 *   containers:
 *     deploy:
 *       image: node:20
 *       bash: firebase deploy --only hosting --project=$PROJECT
 *       paths:
 *         - <- `blobs://my-site-content:/app`
 * ```
 *
 * ## Secrets
 * This entity does NOT write any secrets directly.
 *
 * ## Dependencies
 * Required APIs:
 * - `firebasehosting.googleapis.com`
 *
 * ## State Fields for Composition
 * - `state.default_url` - Default URL ({site}.web.app)
 * - `state.firebase_app_url` - Legacy URL ({site}.firebaseapp.com)
 * - `state.site_id` - Site ID for use in other API calls
 * - `state.name` - Full resource name
 *
 * ## Composing with Other Entities
 * - `gcp/firebase-hosting-channel` - Create preview channels
 * - `gcp/service-usage` - Enable firebasehosting.googleapis.com
 *
 * @see https://firebase.google.com/docs/hosting
 *
 * @example Basic hosting site
 * ```yaml
 * my-site:
 *   defines: gcp/firebase-hosting-site
 *   name: my-app-site
 * ```
 *
 * @example Site with labels
 * ```yaml
 * prod-site:
 *   defines: gcp/firebase-hosting-site
 *   name: my-prod-site
 *   keep_on_delete: true
 *   labels:
 *     environment: production
 *     team: frontend
 * ```
 */
export class FirebaseHostingSite extends GcpEntity<FirebaseHostingSiteDefinition, FirebaseHostingSiteState> {

    static readonly readiness = { period: 5, initialDelay: 2, attempts: 10 };

    protected getEntityName(): string {
        return `Firebase Hosting Site ${this.definition.name}`;
    }

    /**
     * Get the Firebase project ID (can differ from GCP project)
     */
    private getFirebaseProject(): string {
        return this.definition.firebase_project || this.projectId;
    }

    /**
     * Get the base API URL for this project's sites
     */
    private getBaseUrl(): string {
        return `${FIREBASE_HOSTING_API_URL}/projects/${this.getFirebaseProject()}/sites`;
    }

    /**
     * Get full site resource URL
     */
    private getSiteUrl(): string {
        return `${this.getBaseUrl()}/${this.definition.name}`;
    }

    /**
     * Get site details from API
     */
    private getSite(): any | null {
        return this.checkResourceExists(this.getSiteUrl());
    }

    /**
     * Populate state from site response
     */
    private populateState(site: any): void {
        this.state.name = site.name;
        this.state.site_id = site.name?.split("/").pop();
        this.state.default_url = site.defaultUrl;
        this.state.site_type = site.type;
        this.state.app_id = site.appId;
        // Firebase sites have both .web.app and .firebaseapp.com domains
        if (this.state.site_id) {
            this.state.firebase_app_url = `https://${this.state.site_id}.firebaseapp.com`;
        }
    }

    override create(): void {
        // Check if site already exists
        const existing = this.getSite();

        if (existing) {
            cli.output(`Site ${this.definition.name} already exists, adopting...`);
            this.state.existing = true;
            this.populateState(existing);
            return;
        }

        // Build request body
        const body: any = {
            type: this.definition.site_type || "USER_SITE",
        };

        if (this.definition.app_id) {
            body.appId = this.definition.app_id;
        }

        if (this.definition.labels) {
            body.labels = this.definition.labels;
        }

        // Create site
        cli.output(`Creating Firebase Hosting site: ${this.definition.name}`);
        const url = `${this.getBaseUrl()}?siteId=${this.definition.name}`;
        const result = this.post(url, body);

        this.populateState(result);
        this.state.existing = false;

        cli.output(`Site created: ${this.state.default_url}`);
    }

    override update(): void {
        const existing = this.getSite();

        if (!existing) {
            cli.output("Site not found, creating...");
            this.create();
            return;
        }

        // Firebase Hosting sites have limited update options
        // Most properties are immutable after creation
        // We can update labels via PATCH

        const body: any = {};
        let hasUpdates = false;

        if (this.definition.labels) {
            body.labels = this.definition.labels;
            hasUpdates = true;
        }

        if (hasUpdates) {
            const result = this.patch(this.getSiteUrl(), body);
            this.populateState(result);
            cli.output(`Site ${this.definition.name} updated`);
        } else {
            this.populateState(existing);
            cli.output(`Site ${this.definition.name} unchanged`);
        }
    }

    override delete(): void {
        if (this.definition.keep_on_delete) {
            cli.output(`Site ${this.definition.name} has keep_on_delete=true, skipping delete`);
            return;
        }

        if (this.state.existing) {
            cli.output(`Site ${this.definition.name} was not created by this entity, skipping delete`);
            return;
        }

        const existing = this.getSite();
        if (!existing) {
            cli.output(`Site ${this.definition.name} does not exist`);
            return;
        }

        cli.output(`Deleting Firebase Hosting site: ${this.definition.name}`);
        this.httpDelete(this.getSiteUrl());
        cli.output(`Site ${this.definition.name} deleted`);
    }

    override checkReadiness(): boolean {
        const site = this.getSite();
        if (!site) {
            cli.output("Site not found");
            return false;
        }

        this.populateState(site);
        cli.output(`Site ${this.definition.name} is ready at ${this.state.default_url}`);
        return true;
    }

    checkLiveness(): boolean {
        return this.getSite() !== null;
    }

    @action("get")
    getInfo(_args?: Args): void {
        const site = this.getSite();
        if (!site) {
            throw new Error("Site not found");
        }
        cli.output(JSON.stringify(site, null, 2));
    }

    @action("list-channels")
    listChannels(_args?: Args): void {
        const url = `${FIREBASE_HOSTING_API_URL}/sites/${this.definition.name}/channels`;
        const result = this.get(url);
        cli.output(JSON.stringify(result, null, 2));
    }

    @action("list-releases")
    listReleases(args?: Args): void {
        const channelId = args?.channel || "live";
        const url = `${FIREBASE_HOSTING_API_URL}/sites/${this.definition.name}/channels/${channelId}/releases`;
        const result = this.get(url);
        cli.output(JSON.stringify(result, null, 2));
    }

    @action("list-versions")
    listVersions(_args?: Args): void {
        const url = `${FIREBASE_HOSTING_API_URL}/sites/${this.definition.name}/versions`;
        const result = this.get(url);
        cli.output(JSON.stringify(result, null, 2));
    }

    @action("list-domains")
    listDomains(_args?: Args): void {
        const url = `${FIREBASE_HOSTING_API_URL}/sites/${this.definition.name}/domains`;
        const result = this.get(url);
        cli.output(JSON.stringify(result, null, 2));
    }
}
