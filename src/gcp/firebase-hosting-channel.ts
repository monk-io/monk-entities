/**
 * GCP Firebase Hosting Channel Entity
 *
 * Creates and manages Firebase Hosting channels for preview and staging
 * deployments. Channels allow deploying multiple versions of a site
 * simultaneously with unique preview URLs.
 *
 * @see https://firebase.google.com/docs/hosting/manage-hosting-resources
 * @see https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.channels
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { FIREBASE_HOSTING_API_URL } from "./common.ts";

/**
 * Firebase Hosting Channel entity definition
 * @interface FirebaseHostingChannelDefinition
 */
export interface FirebaseHostingChannelDefinition extends GcpEntityDefinition {
    /**
     * @description Channel name/ID (e.g., "preview", "staging", "feature-xyz")
     * The channel URL will be {channel}--{site}.web.app
     */
    name: string;

    /**
     * @description Site ID this channel belongs to
     * Should match a Firebase Hosting site name
     */
    site: string;

    /**
     * @description Time-to-live duration for the channel
     * After this duration, the channel is automatically deleted.
     * Format: "{seconds}s" (e.g., "86400s" for 24 hours)
     * @default No expiration
     */
    ttl?: string;

    /**
     * @description Number of releases to retain for this channel
     * @default 10
     */
    retained_release_count?: number;

    /**
     * @description Key-value labels for organizing channels
     */
    labels?: Record<string, string>;
}

/**
 * Firebase Hosting Channel entity state
 * @interface FirebaseHostingChannelState
 */
export interface FirebaseHostingChannelState extends GcpEntityState {
    /**
     * @description Full resource name
     */
    name?: string;

    /**
     * @description Channel ID
     */
    channel_id?: string;

    /**
     * @description Channel preview URL
     */
    url?: string;

    /**
     * @description Channel creation time
     */
    create_time?: string;

    /**
     * @description Channel update time
     */
    update_time?: string;

    /**
     * @description Channel expiration time (if TTL set)
     */
    expire_time?: string;

    /**
     * @description Number of retained releases
     */
    retained_release_count?: number;

    /**
     * @description Current release information
     */
    release?: {
        name?: string;
        version?: string;
        type?: string;
        release_time?: string;
    };
}

/**
 * GCP Firebase Hosting Channel Entity
 *
 * Manages Firebase Hosting channels which provide preview URLs for testing
 * before deploying to production. Each channel has its own URL and can
 * retain multiple releases for rollback.
 *
 * ## Channel URLs
 * Channels have preview URLs in the format:
 * - `https://{channel}--{site}.web.app`
 * - The "live" channel is the production channel (default)
 *
 * ## Automatic Expiration
 * Channels can have a TTL (time-to-live) after which they are automatically
 * deleted. This is useful for feature branch previews.
 *
 * ## Secrets
 * This entity does NOT write any secrets.
 *
 * ## Dependencies
 * - Requires an existing Firebase Hosting site
 * - `firebasehosting.googleapis.com` API
 *
 * ## State Fields for Composition
 * - `state.url` - Preview URL for this channel
 * - `state.channel_id` - Channel ID
 * - `state.name` - Full resource name
 *
 * ## Composing with Other Entities
 * - `gcp/firebase-hosting-site` - The parent site for this channel
 *
 * @see https://firebase.google.com/docs/hosting/manage-hosting-resources
 *
 * @example Preview channel with expiration
 * ```yaml
 * preview-channel:
 *   defines: gcp/firebase-hosting-channel
 *   name: preview
 *   site: my-app-site
 *   ttl: "604800s"  # 7 days
 *   retained_release_count: 3
 * ```
 *
 * @example Feature branch channel
 * ```yaml
 * feature-channel:
 *   defines: gcp/firebase-hosting-channel
 *   name: feature-new-ui
 *   site: my-app-site
 *   ttl: "86400s"  # 24 hours
 *   labels:
 *     branch: feature/new-ui
 *     pr: "123"
 * ```
 *
 * @example Connected to parent site
 * ```yaml
 * # Parent site
 * my-site:
 *   defines: gcp/firebase-hosting-site
 *   name: my-app-site
 *
 * # Preview channel
 * staging:
 *   defines: gcp/firebase-hosting-channel
 *   name: staging
 *   site: <- connection-target("site") entity-state get-member("site_id")
 *   connections:
 *     site:
 *       runnable: gcp/firebase-hosting-site/my-site
 *       service: firebase-hosting-site
 * ```
 */
export class FirebaseHostingChannel extends GcpEntity<FirebaseHostingChannelDefinition, FirebaseHostingChannelState> {

    static readonly readiness = { period: 5, initialDelay: 2, attempts: 10 };

    protected getEntityName(): string {
        return `Firebase Hosting Channel ${this.definition.site}/${this.definition.name}`;
    }

    /**
     * Get the base API URL for channels
     */
    private getBaseUrl(): string {
        return `${FIREBASE_HOSTING_API_URL}/sites/${this.definition.site}/channels`;
    }

    /**
     * Get full channel resource URL
     */
    private getChannelUrl(): string {
        return `${this.getBaseUrl()}/${this.definition.name}`;
    }

    /**
     * Get channel details from API
     */
    private getChannel(): any | null {
        return this.checkResourceExists(this.getChannelUrl());
    }

    /**
     * Populate state from channel response
     */
    private populateState(channel: any): void {
        this.state.name = channel.name;
        this.state.channel_id = channel.name?.split("/").pop();
        this.state.url = channel.url;
        this.state.create_time = channel.createTime;
        this.state.update_time = channel.updateTime;
        this.state.expire_time = channel.expireTime;
        this.state.retained_release_count = channel.retainedReleaseCount;

        if (channel.release) {
            this.state.release = {
                name: channel.release.name,
                version: channel.release.version?.name,
                type: channel.release.type,
                release_time: channel.release.releaseTime,
            };
        }
    }

    override create(): void {
        // Check if channel already exists
        const existing = this.getChannel();

        if (existing) {
            cli.output(`Channel ${this.definition.name} already exists on site ${this.definition.site}, adopting...`);
            this.state.existing = true;
            this.populateState(existing);
            return;
        }

        // Build request body
        const body: any = {
            retainedReleaseCount: this.definition.retained_release_count || 10,
        };

        if (this.definition.ttl) {
            body.ttl = this.definition.ttl;
        }

        if (this.definition.labels) {
            body.labels = this.definition.labels;
        }

        // Create channel
        cli.output(`Creating Firebase Hosting channel: ${this.definition.name} on site ${this.definition.site}`);
        const url = `${this.getBaseUrl()}?channelId=${this.definition.name}`;
        const result = this.post(url, body);

        this.populateState(result);
        this.state.existing = false;

        cli.output(`Channel created: ${this.state.url}`);
    }

    override update(): void {
        const existing = this.getChannel();

        if (!existing) {
            cli.output("Channel not found, creating...");
            this.create();
            return;
        }

        // Build update body
        const body: any = {};
        let hasUpdates = false;

        if (this.definition.retained_release_count !== undefined) {
            body.retainedReleaseCount = this.definition.retained_release_count;
            hasUpdates = true;
        }

        if (this.definition.ttl) {
            body.ttl = this.definition.ttl;
            hasUpdates = true;
        }

        if (this.definition.labels) {
            body.labels = this.definition.labels;
            hasUpdates = true;
        }

        if (hasUpdates) {
            const result = this.patch(this.getChannelUrl(), body);
            this.populateState(result);
            cli.output(`Channel ${this.definition.name} updated`);
        } else {
            this.populateState(existing);
            cli.output(`Channel ${this.definition.name} unchanged`);
        }
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`Channel ${this.definition.name} was not created by this entity, skipping delete`);
            return;
        }

        // "live" channel cannot be deleted
        if (this.definition.name === "live") {
            cli.output(`Cannot delete the "live" channel`);
            return;
        }

        const existing = this.getChannel();
        if (!existing) {
            cli.output(`Channel ${this.definition.name} does not exist`);
            return;
        }

        cli.output(`Deleting Firebase Hosting channel: ${this.definition.name}`);
        this.httpDelete(this.getChannelUrl());
        cli.output(`Channel ${this.definition.name} deleted`);
    }

    override checkReadiness(): boolean {
        const channel = this.getChannel();
        if (!channel) {
            cli.output("Channel not found");
            return false;
        }

        this.populateState(channel);
        cli.output(`Channel ${this.definition.name} is ready at ${this.state.url}`);
        return true;
    }

    checkLiveness(): boolean {
        return this.getChannel() !== null;
    }

    @action("get")
    getInfo(_args?: Args): void {
        const channel = this.getChannel();
        if (!channel) {
            throw new Error("Channel not found");
        }
        cli.output(JSON.stringify(channel, null, 2));
    }

    @action("list-releases")
    listReleases(_args?: Args): void {
        const url = `${this.getChannelUrl()}/releases`;
        const result = this.get(url);
        cli.output(JSON.stringify(result, null, 2));
    }

    @action("clone-version")
    cloneVersion(args?: Args): void {
        if (!args?.source_version) {
            throw new Error("source_version argument is required (full version name)");
        }

        // Clone a version to this channel by creating a release
        const url = `${this.getChannelUrl()}/releases`;
        const body = {
            version: {
                name: args.source_version,
            },
        };

        const result = this.post(url, body);
        cli.output(`Created release from version ${args.source_version}`);
        cli.output(JSON.stringify(result, null, 2));
    }
}
