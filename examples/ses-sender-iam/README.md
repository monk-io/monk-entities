# AWS SES Sender with IAM Integration Example

This example demonstrates how to set up AWS Simple Email Service (SES) with proper IAM permissions using Monk entities. It creates a complete email sending infrastructure with IAM users, groups, and policies.

## Architecture

This example creates the following AWS resources:

### IAM Resources
1. **IAM Group** (`ses-senders`) - A group for users who can send emails via SES
2. **IAM Policy** (`ses-sender-policy`) - Permissions policy allowing SES operations
3. **IAM User** (`ses-sender-user`) - A dedicated user with programmatic access
4. **Policy Attachment** - Links the policy to the group

### SES Resources
1. **Email Identity** (`sender@example.com`) - Verified email address for sending
2. **Domain Identity** (`example.com`) - Verified domain with DKIM enabled

### Demo Application
- **SMTP Email Sender** - An Alpine Linux container that sends test emails via SMTP on startup

## Prerequisites

- Monk cluster running
- AWS credentials configured in Monk (`cloud/aws` module)
- Access to DNS management for domain verification (for domain identity)

## Setup

### 1. Clone and Build

```bash
cd /home/ivan/Work/monk-entities
npm run build
```

### 2. Load the Entities

```bash
cd dist/aws-iam
sudo monk load MANIFEST

cd ../aws-ses
sudo monk load MANIFEST
```

### 3. Load the Example Template

```bash
cd ../../examples/ses-sender-iam
sudo monk load ses-sender-direct-access.yaml
```

### 4. Run the Stack

```bash
# Run the complete stack
sudo monk run ses-example-direct/direct-access-stack

# Or run components individually
sudo monk run ses-example-direct/ses-sender-group
sudo monk run ses-example-direct/ses-sender-policy
sudo monk run ses-example-direct/ses-sender-user
sudo monk run ses-example-direct/policy-group-attachment
sudo monk run ses-example-direct/sender-email
sudo monk run ses-example-direct/sender-domain
sudo monk run ses-example-direct/ses-sender-demo
```

## Email Verification

### Email Identity Verification

After creating the email identity (`sender-email`), you'll receive a verification email at `sender@example.com`. Click the verification link to complete the process.

Check verification status:
```bash
sudo monk do ses-example-direct/sender-email/get-verification-status
```

### Domain Identity Verification

After creating the domain identity (`sender-domain`), you need to add DNS records to verify ownership and enable DKIM.

Get DNS records:
```bash
sudo monk describe ses-example-direct/sender-domain | grep -A 5 "dkim_tokens"
```

Add the following DNS records:

#### DKIM CNAME Records (Required - all 3 tokens)
```
Name:  {token1}._domainkey.example.com
Type:  CNAME
Value: {token1}.dkim.amazonses.com

Name:  {token2}._domainkey.example.com
Type:  CNAME
Value: {token2}.dkim.amazonses.com

Name:  {token3}._domainkey.example.com
Type:  CNAME
Value: {token3}.dkim.amazonses.com
```

#### Custom MAIL FROM MX Record (Optional but recommended)
```
Name:  mail.example.com
Type:  MX
Value: 10 feedback-smtp.us-east-1.amazonses.com
```

#### Custom MAIL FROM SPF Record (Required if using custom MAIL FROM)
```
Name:  mail.example.com
Type:  TXT
Value: "v=spf1 include:amazonses.com ~all"
```

#### Domain SPF Record (Recommended)
```
Name:  example.com
Type:  TXT
Value: "v=spf1 include:amazonses.com ~all"
```

#### DMARC Record (Recommended)
```
Name:  _dmarc.example.com
Type:  TXT
Value: "v=DMARC1; p=quarantine; rua=mailto:postmaster@example.com"
```

Check domain verification status:
```bash
sudo monk do ses-example-direct/sender-domain/get-verification-status
```

## Sending Emails

### Via SMTP (Recommended)

The `ses-sender-demo` container automatically sends a test email via SMTP on startup. The SMTP password is automatically generated from the IAM user's secret access key.

View logs:
```bash
sudo monk logs -f ses-example-direct/ses-sender-demo
```

### Manual SMTP Testing

You can also test SMTP manually using the generated credentials:

```bash
# Get SMTP credentials
ACCESS_KEY=$(sudo monk secret-get ses-sender-access-key)
SMTP_PASSWORD=$(sudo monk secret-get ses-sender-smtp-password)

# Test with swaks (if installed)
swaks --to recipient@example.com \
  --from sender@example.com \
  --server email-smtp.us-east-1.amazonaws.com:587 \
  --auth LOGIN \
  --auth-user "$ACCESS_KEY" \
  --auth-password "$SMTP_PASSWORD" \
  --tls \
  --header "Subject: Test from SWAKS" \
  --body "This is a test email"
```

## IAM Policy Details

The `ses-sender-policy` grants the following permissions:

- `ses:SendEmail` - Send formatted emails
- `ses:SendRawEmail` - Send raw MIME emails
- `ses:GetEmailIdentity` - Get email identity details
- `ses:GetAccount` - Get account sending limits
- `ses:ListEmailIdentities` - List configured identities

The policy includes a condition that restricts sending to verified addresses:
- `sender@example.com`
- `*@example.com` (any address on the verified domain)

## Monitoring

### Check Entity Status

```bash
# List all entities
sudo monk ls -a

# Describe specific entity
sudo monk describe ses-example-direct/ses-sender-user
sudo monk describe ses-example-direct/sender-email
sudo monk describe ses-example-direct/sender-domain
```

### View Logs

```bash
# View demo container logs
sudo monk logs ses-example-direct/ses-sender-demo

# Follow logs in real-time
sudo monk logs -f ses-example-direct/ses-sender-demo
```

## Cleanup

To remove all resources:

```bash
# Stop the stack
sudo monk stop ses-example-direct/direct-access-stack

# Or stop components individually
sudo monk stop ses-example-direct/ses-sender-demo
sudo monk stop ses-example-direct/sender-domain
sudo monk stop ses-example-direct/sender-email
sudo monk stop ses-example-direct/policy-group-attachment
sudo monk stop ses-example-direct/ses-sender-user
sudo monk stop ses-example-direct/ses-sender-policy
sudo monk stop ses-example-direct/ses-sender-group

# Purge to delete from AWS
sudo monk purge ses-example-direct/ses-sender-demo
sudo monk purge ses-example-direct/sender-domain
sudo monk purge ses-example-direct/sender-email
sudo monk purge ses-example-direct/policy-group-attachment
sudo monk purge ses-example-direct/ses-sender-user
sudo monk purge ses-example-direct/ses-sender-policy
sudo monk purge ses-example-direct/ses-sender-group
```

## Troubleshooting

### Email Not Verified

If the email identity shows as `PENDING`:
1. Check your email inbox for the verification email from AWS
2. Click the verification link
3. Check status: `sudo monk do ses-example-direct/sender-email/get-verification-status`

### Domain Not Verified

If the domain identity shows as `PENDING`:
1. Ensure all DKIM CNAME records are added correctly
2. DNS propagation can take up to 72 hours (usually 5-10 minutes)
3. Check status: `sudo monk do ses-example-direct/sender-domain/get-verification-status`

### SMTP Authentication Fails

If SMTP authentication fails:
1. Verify the SMTP password was generated correctly
2. Check that the IAM user has access keys created
3. Verify the IAM policy is attached to the group
4. Ensure the user is a member of the group

### 403 Forbidden Errors

If you see 403 errors:
1. Check that AWS credentials in Monk have SES permissions
2. Verify the region is correct (`us-east-1`)
3. Check that the IAM policy allows the required actions

## Related Documentation

- [AWS SES Developer Guide](https://docs.aws.amazon.com/ses/)
- [AWS IAM User Guide](https://docs.aws.amazon.com/iam/)
- [Monk Entity Documentation](https://docs.monk.io/)

## Notes

- **SES Sandbox**: New AWS accounts start in SES sandbox mode, which restricts sending to verified addresses only. Request production access in the AWS Console to remove this limitation.
- **SMTP vs API**: This example uses SMTP for simplicity. For production, consider using the AWS SES API directly for better error handling and features.
- **Rate Limits**: Check your SES sending limits with `aws ses get-account --region us-east-1`.
- **Costs**: SES charges $0.10 per 1,000 emails sent. IAM resources are free.

