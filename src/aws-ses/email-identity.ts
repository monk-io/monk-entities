import { AWSSESEntity, AWSSESDefinition, AWSSESState } from "./base.ts";
import { action, Args } from "monkec/base";
import cli from "cli";
import { validateEmailAddress, type VerificationStatus, type SESEmailIdentityResponse } from "./common.ts";

export interface SESEmailIdentityDefinition extends AWSSESDefinition {
    /** @description Email address to verify and use for sending */
    email_address: string;
    /** @description Enable DKIM signing for this email identity */
    dkim_signing_enabled?: boolean;
    /** @description Configuration set name to associate with this identity */
    configuration_set_name?: string;
}

export interface SESEmailIdentityState extends AWSSESState {
    /** @description Email address identity */
    email_address?: string;
    /** @description Current verification status */
    verification_status?: VerificationStatus;
    /** @description Whether the identity is verified */
    verified?: boolean;
    /** @description DKIM signing status */
    dkim_status?: string;
    /** @description DKIM tokens for DNS configuration */
    dkim_tokens?: string[];
}

export class SESEmailIdentity extends AWSSESEntity<SESEmailIdentityDefinition, SESEmailIdentityState> {
    
    static readonly readiness = { period: 10, initialDelay: 5, attempts: 30 };

    override create(): void {
        const emailAddress = this.definition.email_address;

        // Validate email format
        if (!validateEmailAddress(emailAddress)) {
            throw new Error(`Invalid email address format: ${emailAddress}`);
        }

        // Check if identity already exists
        try {
            const existing = this.getEmailIdentity(emailAddress);
            if (existing) {
                cli.output(`Email identity ${emailAddress} already exists, adopting it`);
                this.state.existing = true;
                this.state.email_address = emailAddress;
                this.state.verification_status = existing.VerificationStatus;
                this.state.verified = existing.VerificationStatus === "SUCCESS";
                this.state.dkim_status = existing.DkimAttributes?.Status;
                this.state.dkim_tokens = existing.DkimAttributes?.Tokens;
                
                // Note: DKIM signing attributes API is only available for domains, not email addresses
                // Email addresses automatically get AWS-managed DKIM
                
                return;
            }
        } catch (_error) {
            // Identity doesn't exist, proceed with creation
        }

        // Create new email identity
        cli.output(`Creating email identity: ${emailAddress}`);
        this.createEmailIdentity(emailAddress);

        // Note: DKIM signing attributes API is only available for domains, not email addresses
        // Email addresses automatically get AWS-managed DKIM when created

        // Get identity details including DKIM tokens
        const identity = this.getEmailIdentity(emailAddress);

        this.state.existing = false;
        this.state.email_address = emailAddress;
        this.state.verification_status = identity.VerificationStatus || "PENDING";
        this.state.verified = false;
        this.state.dkim_status = identity.DkimAttributes?.Status;
        this.state.dkim_tokens = identity.DkimAttributes?.Tokens;

        cli.output(`Email identity created. Verification email sent to ${emailAddress}`);
    }

    override start(): void {
        // Ensure identity is ready
        this.checkReadiness();
    }

    override stop(): void {
        // No stop action needed for SES identities
    }

    override update(): void {
        if (!this.state.email_address) {
            throw new Error("Email identity not created yet");
        }

        // Note: DKIM signing attributes API is only available for domains, not email addresses
        // Email addresses automatically get AWS-managed DKIM

        // Refresh state
        const identity = this.getEmailIdentity(this.state.email_address);
        this.state.verification_status = identity.VerificationStatus;
        this.state.verified = identity.VerificationStatus === "SUCCESS";
        this.state.dkim_status = identity.DkimAttributes?.Status;
    }

    override delete(): void {
        if (!this.state.email_address) {
            return;
        }

        // Don't delete existing identities
        if (this.state.existing) {
            cli.output(`Email identity ${this.state.email_address} was existing, not deleting`);
            return;
        }

        cli.output(`Deleting email identity: ${this.state.email_address}`);
        this.deleteEmailIdentity(this.state.email_address);

        this.state.email_address = undefined;
        this.state.verification_status = undefined;
        this.state.verified = false;
        this.state.dkim_status = undefined;
        this.state.dkim_tokens = undefined;
    }

    override checkReadiness(): boolean {
        if (!this.state.email_address) {
            return false;
        }

        try {
            const identity = this.getEmailIdentity(this.state.email_address);
            const status = identity.VerificationStatus;
            
            this.state.verification_status = status;
            this.state.verified = status === "SUCCESS";
            
            // Identity is ready when it exists (even if not verified yet)
            // Users may need to manually verify via email
            return status === "SUCCESS" || status === "PENDING";
        } catch (_error) {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    // API Methods

    private createEmailIdentity(emailAddress: string): void {
        const body = JSON.stringify({
            EmailIdentity: emailAddress
        });

        this.sesRequest(
            "CreateEmailIdentity",
            "/v2/email/identities",
            "POST",
            body
        );
    }

    private deleteEmailIdentity(emailAddress: string): void {
        this.sesRequest(
            "DeleteEmailIdentity",
            `/v2/email/identities/${encodeURIComponent(emailAddress)}`,
            "DELETE"
        );
    }

    private getEmailIdentity(emailAddress: string): SESEmailIdentityResponse {
        return this.sesRequest(
            "GetEmailIdentity",
            `/v2/email/identities/${encodeURIComponent(emailAddress)}`,
            "GET"
        );
    }

    // Custom Actions

    @action("get-verification-status")
    getVerificationStatus(_args?: Args): void {
        if (!this.state.email_address) {
            throw new Error("Email identity not created yet");
        }

        const identity = this.getEmailIdentity(this.state.email_address);
        
        cli.output(`Email Identity: ${this.state.email_address}`);
        cli.output(`Verification Status: ${identity.VerificationStatus}`);
        cli.output(`Verified: ${identity.VerificationStatus === "SUCCESS" ? "Yes" : "No"}`);
        cli.output(`Sending Enabled: ${identity.SendingEnabled ? "Yes" : "No"}`);
        
        if (identity.DkimAttributes) {
            cli.output(`DKIM Signing: ${identity.DkimAttributes.SigningEnabled ? "Enabled" : "Disabled"}`);
            cli.output(`DKIM Status: ${identity.DkimAttributes.Status || "N/A"}`);
        }
    }

    @action("send-test-email")
    sendTestEmail(args?: Args): void {
        if (!this.state.email_address) {
            throw new Error("Email identity not created yet");
        }

        if (this.state.verification_status !== "SUCCESS") {
            throw new Error(`Cannot send email: identity not verified (status: ${this.state.verification_status})`);
        }

        const toAddress = args?.to || this.state.email_address;
        const subject = args?.subject || "Test email from AWS SES";
        const body = args?.body || "This is a test email sent via AWS SES.";

        const requestBody = JSON.stringify({
            FromEmailAddress: this.state.email_address,
            Destination: {
                ToAddresses: [toAddress]
            },
            Content: {
                Simple: {
                    Subject: {
                        Data: subject,
                        Charset: "UTF-8"
                    },
                    Body: {
                        Text: {
                            Data: body,
                            Charset: "UTF-8"
                        }
                    }
                }
            }
        });

        const response = this.sesRequest(
            "SendEmail",
            "/v2/email/outbound-emails",
            "POST",
            requestBody
        );

        cli.output(`Test email sent successfully`);
        cli.output(`Message ID: ${response.MessageId || "N/A"}`);
    }

    @action("get-dkim-tokens")
    getDkimTokens(_args?: Args): void {
        if (!this.state.email_address) {
            throw new Error("Email identity not created yet");
        }

        const identity = this.getEmailIdentity(this.state.email_address);
        
        if (identity.DkimAttributes?.Tokens && identity.DkimAttributes.Tokens.length > 0) {
            cli.output(`DKIM Tokens for ${this.state.email_address}:`);
            cli.output(`Status: ${identity.DkimAttributes.Status}`);
            cli.output(`\nAdd these CNAME records to your DNS:`);
            
            identity.DkimAttributes.Tokens.forEach((token: string, index: number) => {
                cli.output(`\nRecord ${index + 1}:`);
                cli.output(`  Name: ${token}._domainkey.${this.extractDomain(this.state.email_address!)}`);
                cli.output(`  Type: CNAME`);
                cli.output(`  Value: ${token}.dkim.amazonses.com`);
            });
        } else {
            cli.output("No DKIM tokens available. Enable DKIM signing first.");
        }
    }

    private extractDomain(email: string): string {
        const parts = email.split("@");
        return parts.length > 1 ? parts[1] : email;
    }
}

