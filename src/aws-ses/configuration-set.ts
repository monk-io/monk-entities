import { AWSSESEntity, AWSSESDefinition, AWSSESState } from "./base.ts";
import { action, Args } from "monkec/base";
import cli from "cli";
import type { SESConfigurationSet as SESConfigurationSetResponse } from "./common.ts";

export interface SESConfigurationSetDefinition extends AWSSESDefinition {
    /** @description Name of the configuration set */
    configuration_set_name: string;
    /** @description Enable reputation metrics tracking */
    reputation_metrics_enabled?: boolean;
    /** @description Enable sending through this configuration set */
    sending_enabled?: boolean;
    /** @description Custom redirect domain for tracking opens and clicks */
    custom_redirect_domain?: string;
    /** @description TLS policy (REQUIRE or OPTIONAL) */
    tls_policy?: "REQUIRE" | "OPTIONAL";
    /** @description Suppression list reasons to apply (BOUNCE, COMPLAINT) */
    suppression_list_reasons?: ("BOUNCE" | "COMPLAINT")[];
}

export interface SESConfigurationSetState extends AWSSESState {
    /** @description Configuration set name */
    configuration_set_name?: string;
    /** @description Whether sending is currently enabled */
    sending_enabled?: boolean;
}

/**
 * @description AWS SES Configuration Set entity.
 * Creates and manages SES configuration sets for email tracking and reputation.
 * Configuration sets group email sending settings and metrics.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.configuration_set_name` - Configuration set name
 * - `state.sending_enabled` - Whether sending is enabled
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-ses/email-identity` - Associate identities with this configuration set
 * - `aws-ses/domain-identity` - Associate domain identities with this configuration set
 */
export class SESConfigurationSet extends AWSSESEntity<SESConfigurationSetDefinition, SESConfigurationSetState> {
    
    static readonly readiness = { period: 5, initialDelay: 2, attempts: 10 };

    override create(): void {
        const configSetName = this.definition.configuration_set_name;

        // Validate configuration set name
        if (!this.isValidConfigurationSetName(configSetName)) {
            throw new Error(`Invalid configuration set name: ${configSetName}. Must be 1-64 characters, letters, numbers, underscore, or dash.`);
        }

        // Check if configuration set already exists
        try {
            const existing = this.getConfigurationSet(configSetName);
            if (existing) {
                cli.output(`Configuration set ${configSetName} already exists, adopting it`);
                this.state.existing = true;
                this.state.configuration_set_name = configSetName;
                this.state.sending_enabled = existing.SendingOptions?.SendingEnabled;
                
                // Update configuration if specified
                this.updateConfigurationSet(configSetName);
                
                return;
            }
        } catch (_error) {
            // Configuration set doesn't exist, proceed with creation
        }

        // Create new configuration set
        cli.output(`Creating configuration set: ${configSetName}`);
        this.createConfigurationSet(configSetName);

        // Update with optional configurations
        this.updateConfigurationSet(configSetName);

        this.state.existing = false;
        this.state.configuration_set_name = configSetName;
        this.state.sending_enabled = this.definition.sending_enabled !== false;

        cli.output(`Configuration set created successfully`);
    }

    override start(): void {
        // Ensure configuration set is ready
        this.checkReadiness();
    }

    override stop(): void {
        // No stop action needed
    }

    override update(): void {
        if (!this.state.configuration_set_name) {
            throw new Error("Configuration set not created yet");
        }

        // Update configuration
        this.updateConfigurationSet(this.state.configuration_set_name);

        // Refresh state
        const configSet = this.getConfigurationSet(this.state.configuration_set_name);
        this.state.sending_enabled = configSet.SendingOptions?.SendingEnabled;
    }

    override delete(): void {
        if (!this.state.configuration_set_name) {
            return;
        }

        // Don't delete existing configuration sets
        if (this.state.existing) {
            cli.output(`Configuration set ${this.state.configuration_set_name} was existing, not deleting`);
            return;
        }

        cli.output(`Deleting configuration set: ${this.state.configuration_set_name}`);
        this.deleteConfigurationSet(this.state.configuration_set_name);

        this.state.configuration_set_name = undefined;
        this.state.sending_enabled = undefined;
    }

    override checkReadiness(): boolean {
        if (!this.state.configuration_set_name) {
            return false;
        }

        try {
            const configSet = this.getConfigurationSet(this.state.configuration_set_name);
            return Boolean(configSet.ConfigurationSetName);
        } catch (_error) {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    // API Methods

    private createConfigurationSet(name: string): void {
        const body = JSON.stringify({
            ConfigurationSetName: name
        });

        this.sesRequest(
            "CreateConfigurationSet",
            "/v2/email/configuration-sets",
            "POST",
            body
        );
    }

    private deleteConfigurationSet(name: string): void {
        this.sesRequest(
            "DeleteConfigurationSet",
            `/v2/email/configuration-sets/${encodeURIComponent(name)}`,
            "DELETE"
        );
    }

    private getConfigurationSet(name: string): SESConfigurationSetResponse {
        return this.sesRequest(
            "GetConfigurationSet",
            `/v2/email/configuration-sets/${encodeURIComponent(name)}`,
            "GET"
        );
    }

    private updateConfigurationSet(name: string): void {
        // Update reputation options
        if (this.definition.reputation_metrics_enabled !== undefined) {
            this.updateReputationOptions(name);
        }

        // Update sending options
        if (this.definition.sending_enabled !== undefined) {
            this.updateSendingOptions(name);
        }

        // Update tracking options
        if (this.definition.custom_redirect_domain) {
            this.updateTrackingOptions(name);
        }

        // Update delivery options
        if (this.definition.tls_policy) {
            this.updateDeliveryOptions(name);
        }

        // Update suppression options
        if (this.definition.suppression_list_reasons) {
            this.updateSuppressionOptions(name);
        }
    }

    private updateReputationOptions(name: string): void {
        const body = JSON.stringify({
            ReputationMetricsEnabled: this.definition.reputation_metrics_enabled
        });

        this.sesRequest(
            "PutConfigurationSetReputationOptions",
            `/v2/email/configuration-sets/${encodeURIComponent(name)}/reputation-options`,
            "PUT",
            body
        );
    }

    private updateSendingOptions(name: string): void {
        const body = JSON.stringify({
            SendingEnabled: this.definition.sending_enabled !== false
        });

        this.sesRequest(
            "PutConfigurationSetSendingOptions",
            `/v2/email/configuration-sets/${encodeURIComponent(name)}/sending`,
            "PUT",
            body
        );
    }

    private updateTrackingOptions(name: string): void {
        const body = JSON.stringify({
            CustomRedirectDomain: this.definition.custom_redirect_domain
        });

        this.sesRequest(
            "PutConfigurationSetTrackingOptions",
            `/v2/email/configuration-sets/${encodeURIComponent(name)}/tracking-options`,
            "PUT",
            body
        );
    }

    private updateDeliveryOptions(name: string): void {
        const body = JSON.stringify({
            TlsPolicy: this.definition.tls_policy || "OPTIONAL"
        });

        this.sesRequest(
            "PutConfigurationSetDeliveryOptions",
            `/v2/email/configuration-sets/${encodeURIComponent(name)}/delivery-options`,
            "PUT",
            body
        );
    }

    private updateSuppressionOptions(name: string): void {
        const body = JSON.stringify({
            SuppressedReasons: this.definition.suppression_list_reasons || []
        });

        this.sesRequest(
            "PutConfigurationSetSuppressionOptions",
            `/v2/email/configuration-sets/${encodeURIComponent(name)}/suppression-options`,
            "PUT",
            body
        );
    }

    private isValidConfigurationSetName(name: string): boolean {
        // Must be 1-64 characters, letters, numbers, underscore, or dash
        return /^[a-zA-Z0-9_-]{1,64}$/.test(name);
    }

    // Custom Actions

    @action("get-info")
    getInfo(_args?: Args): void {
        if (!this.state.configuration_set_name) {
            throw new Error("Configuration set not created yet");
        }

        const configSet = this.getConfigurationSet(this.state.configuration_set_name);
        
        cli.output(`Configuration Set: ${configSet.ConfigurationSetName}`);
        
        if (configSet.SendingOptions) {
            cli.output(`\nSending Options:`);
            cli.output(`  Sending Enabled: ${configSet.SendingOptions.SendingEnabled ? "Yes" : "No"}`);
        }

        if (configSet.ReputationOptions) {
            cli.output(`\nReputation Options:`);
            cli.output(`  Metrics Enabled: ${configSet.ReputationOptions.ReputationMetricsEnabled ? "Yes" : "No"}`);
            if (configSet.ReputationOptions.LastFreshStart) {
                cli.output(`  Last Fresh Start: ${configSet.ReputationOptions.LastFreshStart}`);
            }
        }

        if (configSet.TrackingOptions) {
            cli.output(`\nTracking Options:`);
            cli.output(`  Custom Redirect Domain: ${configSet.TrackingOptions.CustomRedirectDomain || "Not set"}`);
        }

        if (configSet.DeliveryOptions) {
            cli.output(`\nDelivery Options:`);
            cli.output(`  TLS Policy: ${configSet.DeliveryOptions.TlsPolicy || "OPTIONAL"}`);
            if (configSet.DeliveryOptions.SendingPoolName) {
                cli.output(`  Sending Pool: ${configSet.DeliveryOptions.SendingPoolName}`);
            }
        }

        if (configSet.SuppressionOptions) {
            cli.output(`\nSuppression Options:`);
            const reasons = configSet.SuppressionOptions.SuppressedReasons || [];
            cli.output(`  Suppressed Reasons: ${reasons.length > 0 ? reasons.join(", ") : "None"}`);
        }
    }

    @action("enable-sending")
    enableSending(_args?: Args): void {
        if (!this.state.configuration_set_name) {
            throw new Error("Configuration set not created yet");
        }

        const body = JSON.stringify({
            SendingEnabled: true
        });

        this.sesRequest(
            "PutConfigurationSetSendingOptions",
            `/v2/email/configuration-sets/${encodeURIComponent(this.state.configuration_set_name)}/sending`,
            "PUT",
            body
        );

        this.state.sending_enabled = true;
        cli.output(`Sending enabled for configuration set: ${this.state.configuration_set_name}`);
    }

    @action("disable-sending")
    disableSending(_args?: Args): void {
        if (!this.state.configuration_set_name) {
            throw new Error("Configuration set not created yet");
        }

        const body = JSON.stringify({
            SendingEnabled: false
        });

        this.sesRequest(
            "PutConfigurationSetSendingOptions",
            `/v2/email/configuration-sets/${encodeURIComponent(this.state.configuration_set_name)}/sending`,
            "PUT",
            body
        );

        this.state.sending_enabled = false;
        cli.output(`Sending disabled for configuration set: ${this.state.configuration_set_name}`);
    }
}

