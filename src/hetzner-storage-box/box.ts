import { HetznerStorageBoxEntity, HetznerStorageBoxBase } from "./common.ts";
import { action } from "monkec/base";
import type { Args } from "monkec/base";
import cli from "cli";

export interface StorageBoxDefinition extends HetznerStorageBoxBase {
    /** @description Name of the storage box */
    name: string;
    /** @description Storage box type (e.g., bx11, bx21, bx31, bx41, bx61) */
    storage_box_type: string;
    /** @description Location name (e.g., fsn1, nbg1, hel1) */
    location: string;
    /** @description Initial password for the storage box */
    password: string;
    /** @description Enable Samba/CIFS access (default: false) */
    samba?: boolean;
    /** @description Enable SSH access (default: true) */
    ssh?: boolean;
    /** @description Enable WebDAV access (default: false) */
    webdav?: boolean;
    /** @description Enable external reachability (default: false) */
    external_reachability?: boolean;
    /** @description Key-value labels */
    labels?: Record<string, string>;
}

export interface StorageBoxState extends HetznerStorageBoxBase {
    /** @description Storage box numeric ID */
    id?: number;
    /** @description Storage box username for login */
    username?: string;
    /** @description Hostname of the storage box server */
    server?: string;
    /** @description Current status of the storage box */
    status?: string;
    /** @description Storage box name */
    name?: string;
    /** @description Total disk size in GB */
    disk_size_gb?: number;
    /** @description Whether this box was pre-existing before entity creation */
    existing?: boolean;
}

/**
 * @description Hetzner Storage Box entity.
 * Creates and manages Hetzner Storage Boxes via the Hetzner Cloud API.
 * Provides SFTP, SCP, Samba, WebDAV, and rsync access to persistent storage.
 *
 * ## Storage Box Types
 * - bx11: 1 TB
 * - bx21: 2 TB
 * - bx31: 5 TB
 * - bx41: 10 TB
 * - bx61: 20 TB
 *
 * ## State Fields for Composition
 * - `state.id` - Storage box ID
 * - `state.username` - Login username (e.g., u123456)
 * - `state.server` - Hostname (e.g., u123456.your-storagebox.de)
 */
export class StorageBox extends HetznerStorageBoxEntity<StorageBoxDefinition, StorageBoxState> {
    static readonly readiness = { period: 10, initialDelay: 5, attempts: 20 };

    protected getEntityName(): string { return "box"; }

    override create(): void {
        cli.output(`Processing storage box: ${this.definition.name}`);

        // Check if a box with this name already exists
        try {
            const result = this.get(`/storage_boxes?name=${encodeURIComponent(this.definition.name)}`);
            const boxes = result.storage_boxes || [];
            if (boxes.length > 0) {
                const box = boxes[0];
                cli.output(`Storage box '${this.definition.name}' already exists (ID: ${box.id}), adopting it`);
                this.populateState(box);
                this.state.existing = true;
                return;
            }
        } catch (e: any) {
            cli.output(`Could not check existing boxes: ${e.message}`);
        }

        cli.output(`Creating storage box: ${this.definition.name} (${this.definition.storage_box_type} in ${this.definition.location})`);

        const body: any = {
            name: this.definition.name,
            storage_box_type: this.definition.storage_box_type,
            location: this.definition.location,
            password: this.definition.password,
        };

        if (this.definition.labels) body.labels = this.definition.labels;

        const accessSettings: any = {};
        if (this.definition.samba !== undefined) accessSettings.samba_enabled = this.definition.samba;
        if (this.definition.ssh !== undefined) accessSettings.ssh_enabled = this.definition.ssh;
        if (this.definition.webdav !== undefined) accessSettings.webdav_enabled = this.definition.webdav;
        if (this.definition.external_reachability !== undefined) accessSettings.external_reachability_enabled = this.definition.external_reachability;
        if (Object.keys(accessSettings).length > 0) body.access_settings = accessSettings;

        const response = this.post("/storage_boxes", body);

        if (!response.storage_box) {
            throw new Error(`Unexpected response: ${JSON.stringify(response)}`);
        }

        this.populateState(response.storage_box);
        this.state.existing = false;
        cli.output(`Storage box created: ${this.state.name} (ID: ${this.state.id}, server: ${this.state.server})`);
    }

    override update(): void {
        if (!this.state.id) {
            throw new Error("Cannot update: no storage box ID in state");
        }

        const accessSettings: any = {};
        if (this.definition.samba !== undefined) accessSettings.samba_enabled = this.definition.samba;
        if (this.definition.ssh !== undefined) accessSettings.ssh_enabled = this.definition.ssh;
        if (this.definition.webdav !== undefined) accessSettings.webdav_enabled = this.definition.webdav;
        if (this.definition.external_reachability !== undefined) accessSettings.external_reachability_enabled = this.definition.external_reachability;

        const body: any = { name: this.definition.name };
        if (this.definition.labels) body.labels = this.definition.labels;
        if (Object.keys(accessSettings).length > 0) body.access_settings = accessSettings;

        const response = this.put(`/storage_boxes/${this.state.id}`, body);
        if (response.storage_box) {
            this.populateState(response.storage_box);
            cli.output(`Updated storage box: ${this.state.name}`);
        }
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("No storage box ID in state; nothing to delete.");
            return;
        }

        if (this.state.existing) {
            cli.output(`Storage box '${this.state.name}' was pre-existing — skipping deletion`);
            return;
        }

        try {
            this.deleteRequest(`/storage_boxes/${this.state.id}`);
            cli.output(`Deleted storage box: ${this.state.name} (ID: ${this.state.id})`);
        } catch (e: any) {
            if (e.message.includes("404")) {
                cli.output(`Storage box not found (already deleted)`);
            } else {
                throw e;
            }
        }

        this.state.id = undefined;
        this.state.username = undefined;
        this.state.server = undefined;
        this.state.status = undefined;
        this.state.name = undefined;
        this.state.disk_size_gb = undefined;
        this.state.existing = false;
    }

    override checkReadiness(): boolean {
        if (!this.state.id) return false;
        try {
            const result = this.get(`/storage_boxes/${this.state.id}`);
            const box = result.storage_box;
            if (!box) return false;
            this.state.status = box.status;
            return box.status === "active" || box.status === "ready";
        } catch {
            return false;
        }
    }

    private populateState(box: any): void {
        this.state.id = box.id;
        this.state.name = box.name;
        this.state.username = box.username;
        this.state.server = box.server;
        this.state.status = box.status;
        this.state.disk_size_gb = box.disk_size_gb;
    }

    // --- Actions ---

    @action()
    info(_args?: Args): void {
        if (!this.state.id) {
            cli.output("No storage box configured");
            return;
        }
        try {
            const result = this.get(`/storage_boxes/${this.state.id}`);
            const box = result.storage_box;
            cli.output(`Name:     ${box.name}`);
            cli.output(`ID:       ${box.id}`);
            cli.output(`Status:   ${box.status}`);
            cli.output(`Server:   ${box.server}`);
            cli.output(`Username: ${box.username}`);
            cli.output(`Disk:     ${box.stats?.size_data || 0} used`);
            cli.output(`Type:     ${box.storage_box_type?.name || ''}`);
            cli.output(`Location: ${box.location?.name || ''}`);
            cli.output(`SSH:      ${box.access_settings?.ssh_enabled}`);
            cli.output(`Samba:    ${box.access_settings?.samba_enabled}`);
            cli.output(`WebDAV:   ${box.access_settings?.webdav_enabled}`);
            cli.output(`External: ${box.access_settings?.reachable_externally}`);
        } catch (e: any) {
            cli.output(`Error getting info: ${e.message}`);
        }
    }

    @action("list-snapshots")
    listSnapshots(_args?: Args): void {
        if (!this.state.id) {
            cli.output("No storage box configured");
            return;
        }
        try {
            const result = this.get(`/storage_boxes/${this.state.id}/snapshots`);
            const snapshots = result.snapshots || [];
            if (snapshots.length === 0) {
                cli.output("No snapshots found");
                return;
            }
            cli.output(`Snapshots for ${this.state.name}:`);
            snapshots.forEach((s: any) => {
                cli.output(`  ${s.name} — ${s.disk_size_gb} GB, created: ${s.created}`);
            });
        } catch (e: any) {
            cli.output(`Error listing snapshots: ${e.message}`);
        }
    }

    @action("create-snapshot")
    createSnapshot(args?: Args): void {
        if (!this.state.id) {
            cli.output("No storage box configured");
            return;
        }
        const label = args?.label as string || `snapshot-${Date.now()}`;
        try {
            const result = this.post(`/storage_boxes/${this.state.id}/snapshots`, { label });
            cli.output(`Created snapshot: ${result.snapshot?.name || label}`);
        } catch (e: any) {
            cli.output(`Error creating snapshot: ${e.message}`);
        }
    }

    @action("reset-password")
    resetPassword(args?: Args): void {
        if (!this.state.id) {
            cli.output("No storage box configured");
            return;
        }
        const newPassword = args?.password as string;
        if (!newPassword) {
            cli.output("Usage: monk do <box>/reset-password --password=<new_password>");
            return;
        }
        try {
            this.post(`/storage_boxes/${this.state.id}/actions/reset_password`, { password: newPassword });
            cli.output(`Password reset for storage box: ${this.state.name}`);
        } catch (e: any) {
            cli.output(`Error resetting password: ${e.message}`);
        }
    }

    @action("list-subaccounts")
    listSubaccounts(_args?: Args): void {
        if (!this.state.id) {
            cli.output("No storage box configured");
            return;
        }
        try {
            const result = this.get(`/storage_boxes/${this.state.id}/subaccounts`);
            const accounts = result.subaccounts || [];
            if (accounts.length === 0) {
                cli.output("No sub-accounts found");
                return;
            }
            cli.output(`Sub-accounts for ${this.state.name}:`);
            accounts.forEach((a: any) => {
                cli.output(`  ${a.username} — home: ${a.homedirectory}, ssh: ${a.ssh}, webdav: ${a.webdav}, samba: ${a.samba}`);
            });
        } catch (e: any) {
            cli.output(`Error listing sub-accounts: ${e.message}`);
        }
    }

    @action("create-subaccount")
    createSubaccount(args?: Args): void {
        if (!this.state.id) {
            cli.output("No storage box configured");
            return;
        }
        const password = args?.password as string;
        const homedirectory = args?.homedirectory as string || "/";
        if (!password) {
            cli.output("Usage: monk do <box>/create-subaccount --password=<password> [--homedirectory=<path>]");
            return;
        }
        try {
            const result = this.post(`/storage_boxes/${this.state.id}/subaccounts`, {
                password,
                homedirectory,
                ssh: true,
                webdav: false,
                samba: false,
            });
            cli.output(`Created sub-account: ${result.subaccount?.username}`);
        } catch (e: any) {
            cli.output(`Error creating sub-account: ${e.message}`);
        }
    }
}
