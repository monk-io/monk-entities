import { AWSSESEntity, AWSSESDefinition, AWSSESState } from "./base.ts";
import * as MonkecBase from "monkec/base";
const action = MonkecBase.action;
import cli from "cli";
import { validateDomainName, type VerificationStatus, type SESEmailIdentityResponse } from "./common.ts";

export interface SESDomainIdentityDefinition extends AWSSESDefinition {
    /** @description Domain name to verify and use for sending */
    domain_name: string;
    /** @description Enable DKIM signing for this domain */
    dkim_signing_enabled?: boolean;
    /** @description Custom MAIL FROM domain (subdomain of main domain) */
    mail_from_domain?: string;
    /** @description Behavior when MX record not found (UseDefaultValue or RejectMessage) */
    mail_from_behavior_on_mx_failure?: "UseDefaultValue" | "RejectMessage";
}

export interface SESDomainIdentityState extends AWSSESState {
    /** @description Domain name identity */
    domain_name?: string;
    /** @description Current verification status */
    verification_status?: VerificationStatus;
    /** @description Whether the domain is verified */
    verified?: boolean;
    /** @description DKIM signing status */
    dkim_status?: string;
    /** @description DKIM tokens for DNS configuration */
    dkim_tokens?: string[];
    /** @description Domain verification token for DNS TXT record */
    verification_token?: string;
}

export class SESDomainIdentity extends AWSSESEntity<SESDomainIdentityDefinition, SESDomainIdentityState> {
    
    static readonly readiness = { period: 15, initialDelay: 10, attempts: 40 };

    override create(): void {
        const domainName = this.definition.domain_name;

        // Validate domain format
        if (!validateDomainName(domainName)) {
            throw new Error(`Invalid domain name format: ${domainName}`);
        }

        // Check if identity already exists
        try {
            const existing = this.getEmailIdentity(domainName);
            if (existing) {
                cli.output(`Domain identity ${domainName} already exists, adopting it`);
                this.state.existing = true;
                this.state.domain_name = domainName;
                this.state.verification_status = existing.VerificationStatus;
                this.state.verified = existing.VerificationStatus === "SUCCESS";
                this.state.dkim_status = existing.DkimAttributes?.Status;
                this.state.dkim_tokens = existing.DkimAttributes?.Tokens;
                
                // Note: Don't update DKIM or MAIL FROM for existing identities
                // as they may already be configured and updates can fail
                
                return;
            }
        } catch (_error) {
            // Identity doesn't exist, proceed with creation
        }

        // Create new domain identity
        cli.output(`Creating domain identity: ${domainName}`);
        this.createEmailIdentity(domainName);

        // Configure DKIM if specified
        if (this.definition.dkim_signing_enabled) {
            this.updateDkimSigningAttributes(domainName);
        }

        // Configure MAIL FROM domain if specified
        if (this.definition.mail_from_domain) {
            this.updateMailFromAttributes(domainName);
        }

        // Get identity details including DKIM tokens
        const identity = this.getEmailIdentity(domainName);

        this.state.existing = false;
        this.state.domain_name = domainName;
        this.state.verification_status = identity.VerificationStatus || "PENDING";
        this.state.verified = false;
        this.state.dkim_status = identity.DkimAttributes?.Status;
        this.state.dkim_tokens = identity.DkimAttributes?.Tokens;

        // Note: Verification token is not directly returned by v2 API
        // Users need to check DNS records or use GetEmailIdentityPolicies
        cli.output(`Domain identity created. Add DNS records to verify.`);
    }

    override start(): void {
        // Ensure identity is ready
        this.checkReadiness();
    }

    override stop(): void {
        // No stop action needed for SES identities
    }

    override update(): void {
        if (!this.state.domain_name) {
            throw new Error("Domain identity not created yet");
        }

        // Update DKIM signing if specified
        if (this.definition.dkim_signing_enabled !== undefined) {
            this.updateDkimSigningAttributes(this.state.domain_name);
        }

        // Update MAIL FROM domain if specified
        if (this.definition.mail_from_domain) {
            this.updateMailFromAttributes(this.state.domain_name);
        }

        // Refresh state
        const identity = this.getEmailIdentity(this.state.domain_name);
        this.state.verification_status = identity.VerificationStatus;
        this.state.verified = identity.VerificationStatus === "SUCCESS";
        this.state.dkim_status = identity.DkimAttributes?.Status;
    }

    override delete(): void {
        if (!this.state.domain_name) {
            return;
        }

        // Don't delete existing identities
        if (this.state.existing) {
            cli.output(`Domain identity ${this.state.domain_name} was existing, not deleting`);
            return;
        }

        cli.output(`Deleting domain identity: ${this.state.domain_name}`);
        this.deleteEmailIdentity(this.state.domain_name);

        this.state.domain_name = undefined;
        this.state.verification_status = undefined;
        this.state.verified = false;
        this.state.dkim_status = undefined;
        this.state.dkim_tokens = undefined;
        this.state.verification_token = undefined;
    }

    override checkReadiness(): boolean {
        if (!this.state.domain_name) {
            return false;
        }

        try {
            const identity = this.getEmailIdentity(this.state.domain_name);
            const status = identity.VerificationStatus;
            
            this.state.verification_status = status;
            this.state.verified = status === "SUCCESS";
            
            // Domain is ready when verified
            return status === "SUCCESS";
        } catch (_error) {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    // API Methods

    private createEmailIdentity(domainName: string): void {
        const body = JSON.stringify({
            EmailIdentity: domainName
        });

        this.sesRequest(
            "CreateEmailIdentity",
            "/v2/email/identities",
            "POST",
            body
        );
    }

    private deleteEmailIdentity(domainName: string): void {
        this.sesRequest(
            "DeleteEmailIdentity",
            `/v2/email/identities/${encodeURIComponent(domainName)}`,
            "DELETE"
        );
    }

    private getEmailIdentity(domainName: string): SESEmailIdentityResponse {
        return this.sesRequest(
            "GetEmailIdentity",
            `/v2/email/identities/${encodeURIComponent(domainName)}`,
            "GET"
        );
    }

    private updateDkimSigningAttributes(domainName: string): void {
        const body = JSON.stringify({
            SigningEnabled: this.definition.dkim_signing_enabled || false,
            SigningAttributesOrigin: "AWS_SES",  // Use AWS-managed DKIM
            NextSigningKeyLength: "RSA_2048_BIT"  // Required for AWS SES v2 API
        } as Record<string, unknown>);

        this.sesRequest(
            "PutEmailIdentityDkimSigningAttributes",
            `/v2/email/identities/${encodeURIComponent(domainName)}/dkim/signing`,
            "PUT",
            body
        );
    }

    private updateMailFromAttributes(domainName: string): void {
        if (!this.definition.mail_from_domain) {
            return;
        }

        const body = JSON.stringify({
            MailFromDomain: this.definition.mail_from_domain,
            BehaviorOnMxFailure: this.definition.mail_from_behavior_on_mx_failure || "UseDefaultValue"
        });

        this.sesRequest(
            "PutEmailIdentityMailFromAttributes",
            `/v2/email/identities/${encodeURIComponent(domainName)}/mail-from`,
            "PUT",
            body
        );
    }

    // Custom Actions

    @action("get-verification-status")
    getVerificationStatus(_args?: MonkecBase.Args): void {
        if (!this.state.domain_name) {
            throw new Error("Domain identity not created yet");
        }

        const identity = this.getEmailIdentity(this.state.domain_name);
        
        cli.output(`Domain Identity: ${this.state.domain_name}`);
        cli.output(`Verification Status: ${identity.VerificationStatus}`);
        cli.output(`Verified: ${identity.VerificationStatus === "SUCCESS" ? "Yes" : "No"}`);
        cli.output(`Sending Enabled: ${identity.SendingEnabled ? "Yes" : "No"}`);
        
        if (identity.DkimAttributes) {
            cli.output(`\nDKIM Configuration:`);
            cli.output(`  Signing: ${identity.DkimAttributes.SigningEnabled ? "Enabled" : "Disabled"}`);
            cli.output(`  Status: ${identity.DkimAttributes.Status || "N/A"}`);
        }

        if (identity.MailFromAttributes) {
            cli.output(`\nMAIL FROM Configuration:`);
            cli.output(`  Domain: ${identity.MailFromAttributes.MailFromDomain || "N/A"}`);
            cli.output(`  Status: ${identity.MailFromAttributes.MailFromDomainStatus || "N/A"}`);
        }
    }

    @action("get-dns-records")
    getDnsRecords(_args?: MonkecBase.Args): void {
        if (!this.state.domain_name) {
            throw new Error("Domain identity not created yet");
        }

        const identity = this.getEmailIdentity(this.state.domain_name);
        
        cli.output(`\n${"=".repeat(60)}`);
        cli.output(`DNS Records for ${this.state.domain_name}`);
        cli.output(`${"=".repeat(60)}\n`);
        
        cli.output(`Verification Status: ${identity.VerificationStatus}`);
        cli.output(`DKIM Status: ${identity.DkimAttributes?.Status || "N/A"}\n`);
        
        // DKIM CNAME records
        if (identity.DkimAttributes?.Tokens && identity.DkimAttributes.Tokens.length > 0) {
            cli.output(`DKIM CNAME Records (add all ${identity.DkimAttributes.Tokens.length}):`);
            cli.output(`${"-".repeat(60)}`);
            identity.DkimAttributes.Tokens.forEach((token: string, i: number) => {
                cli.output(`\nRecord ${i + 1}:`);
                cli.output(`  Name:  ${token}._domainkey.${this.state.domain_name}`);
                cli.output(`  Type:  CNAME`);
                cli.output(`  Value: ${token}.dkim.amazonses.com`);
            });
        }
        
        // SPF record
        cli.output(`\n${"-".repeat(60)}`);
        cli.output(`SPF TXT Record (recommended):`);
        cli.output(`${"-".repeat(60)}`);
        cli.output(`  Name:  ${this.state.domain_name}`);
        cli.output(`  Type:  TXT`);
        cli.output(`  Value: "v=spf1 include:amazonses.com ~all"`);
        
        // DMARC record
        cli.output(`\n${"-".repeat(60)}`);
        cli.output(`DMARC TXT Record (recommended):`);
        cli.output(`${"-".repeat(60)}`);
        cli.output(`  Name:  _dmarc.${this.state.domain_name}`);
        cli.output(`  Type:  TXT`);
        cli.output(`  Value: "v=DMARC1; p=quarantine; rua=mailto:postmaster@${this.state.domain_name}"`);
        
        // MAIL FROM domain records (if configured)
        if (this.definition.mail_from_domain) {
            cli.output(`\n${"-".repeat(60)}`);
            cli.output(`MAIL FROM Domain Records:`);
            cli.output(`${"-".repeat(60)}`);
            cli.output(`  Name:  ${this.definition.mail_from_domain}`);
            cli.output(`  Type:  MX`);
            cli.output(`  Value: 10 feedback-smtp.${this.region}.amazonses.com\n`);
            cli.output(`  Name:  ${this.definition.mail_from_domain}`);
            cli.output(`  Type:  TXT`);
            cli.output(`  Value: "v=spf1 include:amazonses.com ~all"`);
        }
        
        cli.output(`\n${"=".repeat(60)}`);
    }

    @action("send-test-email")
    sendTestEmail(args?: MonkecBase.Args): void {
        if (!this.state.domain_name) {
            throw new Error("Domain identity not created yet");
        }

        if (this.state.verification_status !== "SUCCESS") {
            throw new Error(`Cannot send email: domain not verified (status: ${this.state.verification_status})`);
        }

        const toAddress = args?.to;
        if (!toAddress) {
            throw new Error("Recipient email address required (use: to=user@example.com)");
        }

        const fromAddress = args?.from || `noreply@${this.state.domain_name}`;
        const subject = args?.subject || `Test email from ${this.state.domain_name}`;
        const body = args?.body || `This is a test email sent from ${this.state.domain_name} via AWS SES.`;

        const requestBody = JSON.stringify({
            FromEmailAddress: fromAddress,
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
        cli.output(`From: ${fromAddress}`);
        cli.output(`To: ${toAddress}`);
        cli.output(`Message ID: ${response.MessageId || "N/A"}`);
    }
}

