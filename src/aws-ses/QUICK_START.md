# AWS SES Quick Start Guide

## Current Status

✅ **Entities Loaded Successfully:**
- `ses-demo/demo-email` - Email identity configuration
- `ses-demo/demo-domain` - Domain identity configuration  
- `ses-demo/demo-config` - Configuration set

## Configuration Overview

### Email Identity (demo-email)
```yaml
region: us-east-1
email_address: demo@example.com
dkim_signing_enabled: true
```

### Domain Identity (demo-domain)
```yaml
region: us-east-1
domain_name: demo.example.com
dkim_signing_enabled: true
mail_from_domain: mail.demo.example.com
mail_from_behavior_on_mx_failure: UseDefaultValue
```

### Configuration Set (demo-config)
```yaml
region: us-east-1
configuration_set_name: demo-emails
reputation_metrics_enabled: true
sending_enabled: true
tls_policy: REQUIRE
suppression_list_reasons:
  - BOUNCE
  - COMPLAINT
```

## Step 1: Configure AWS Credentials

You need to set up AWS credentials to actually create SES resources.

### Option A: Environment Variables (Temporary)

```bash
export AWS_ACCESS_KEY_ID=your_access_key_here
export AWS_SECRET_ACCESS_KEY=your_secret_key_here
export AWS_REGION=us-east-1
```

### Option B: AWS Credentials File (Persistent)

Create `~/.aws/credentials`:
```ini
[default]
aws_access_key_id = your_access_key_here
aws_secret_access_key = your_secret_key_here
```

Create `~/.aws/config`:
```ini
[default]
region = us-east-1
```

### Option C: Monk Secrets (Recommended)

```bash
# Add AWS credentials as global secrets
sudo /home/ivan/Work/monk/dist/monk secrets add -g \
  AWS_ACCESS_KEY_ID='your_access_key' \
  AWS_SECRET_ACCESS_KEY='your_secret_key' \
  AWS_REGION='us-east-1'
```

## Step 2: Modify Template for Your Use Case

Edit `demo-template.yaml` or create your own:

```yaml
namespace: my-app-ses

# Verify your email address
my-email:
  defines: entity
  entity-type: aws-ses/ses-email-identity
  region: us-east-1
  email_address: your-email@yourdomain.com  # ← Change this
  dkim_signing_enabled: true

# Verify your domain
my-domain:
  defines: entity
  entity-type: aws-ses/ses-domain-identity
  region: us-east-1
  domain_name: yourdomain.com  # ← Change this
  dkim_signing_enabled: true
  mail_from_domain: mail.yourdomain.com  # ← Change this
  mail_from_behavior_on_mx_failure: UseDefaultValue

# Configuration set for tracking
my-config:
  defines: entity
  entity-type: aws-ses/ses-configuration-set
  depends:
    wait-for:
      runnables:
        - my-app-ses/my-domain
  region: us-east-1
  configuration_set_name: my-app-emails
  reputation_metrics_enabled: true
  sending_enabled: true
  tls_policy: REQUIRE
  suppression_list_reasons:
    - BOUNCE
    - COMPLAINT
```

## Step 3: Load and Create Entities

```bash
# Navigate to monk-entities directory
cd /home/ivan/Work/monk-entities/src/aws-ses

# Load your template
sudo /home/ivan/Work/monk/dist/monk load your-template.yaml

# Create/Update the email identity
sudo /home/ivan/Work/monk/dist/monk update my-app-ses/my-email

# Wait for it to be ready
sudo /home/ivan/Work/monk/dist/monk wait my-app-ses/my-email

# Check verification status
sudo /home/ivan/Work/monk/dist/monk do my-app-ses/my-email get-verification-status
```

## Step 4: Email Verification

After creating an email identity, AWS sends a verification email:

1. **Check your inbox** for the verification email from AWS
2. **Click the verification link** in the email
3. **Wait a few minutes** for verification to complete
4. **Check status again**:
   ```bash
   sudo /home/ivan/Work/monk/dist/monk do my-app-ses/my-email get-verification-status
   ```

## Step 5: Domain Verification

After creating a domain identity:

1. **Get DNS records**:
   ```bash
   sudo /home/ivan/Work/monk/dist/monk do my-app-ses/my-domain get-dns-records
   ```

2. **Add DNS records** to your domain provider:
   - 1 TXT record for domain verification
   - 3 CNAME records for DKIM
   - 1 MX record for MAIL FROM domain
   - 1 TXT record for SPF

3. **Wait for DNS propagation** (can take 24-72 hours)

4. **Check verification status**:
   ```bash
   sudo /home/ivan/Work/monk/dist/monk do my-app-ses/my-domain get-verification-status
   ```

## Step 6: Test Sending Email

Once your email or domain is verified:

```bash
# Send a test email from verified email identity
sudo /home/ivan/Work/monk/dist/monk do my-app-ses/my-email send-test-email \
  to=recipient@example.com \
  subject="Test from AWS SES" \
  body="This is a test email"

# Send a test email from verified domain
sudo /home/ivan/Work/monk/dist/monk do my-app-ses/my-domain send-test-email \
  to=recipient@example.com \
  from=noreply@yourdomain.com \
  subject="Test from domain" \
  body="This is a test email from the domain"
```

## Step 7: Monitor and Manage

```bash
# List all entities
sudo /home/ivan/Work/monk/dist/monk ps

# Check entity status
sudo /home/ivan/Work/monk/dist/monk describe my-app-ses/my-email

# Get configuration set info
sudo /home/ivan/Work/monk/dist/monk do my-app-ses/my-config get-info

# Enable/disable sending
sudo /home/ivan/Work/monk/dist/monk do my-app-ses/my-config disable-sending
sudo /home/ivan/Work/monk/dist/monk do my-app-ses/my-config enable-sending
```

## Troubleshooting

### Issue: "Permission denied" errors

**Solution:** Ensure you're using `sudo` with monk commands:
```bash
sudo /home/ivan/Work/monk/dist/monk <command>
```

### Issue: "No AWS credentials"

**Solution:** Set environment variables or configure AWS credentials file (see Step 1)

### Issue: "Email not verified"

**Solution:** 
1. Check spam folder for verification email
2. Resend verification through AWS Console
3. Ensure email address is correct

### Issue: "Domain not verifying"

**Solution:**
1. Verify DNS records are added correctly
2. Wait for DNS propagation (24-72 hours)
3. Check DNS with: `dig TXT _amazonses.yourdomain.com`
4. Ensure CNAME records point to correct values

### Issue: "Cannot send emails" (Sandbox mode)

**Solution:**
1. AWS SES starts in sandbox mode
2. Request production access in AWS Console
3. In sandbox, you can only send to verified addresses
4. Provide use case details to AWS
5. Wait for approval (usually 24-48 hours)

## AWS Permissions Required

Your AWS credentials need these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ses:CreateEmailIdentity",
        "ses:DeleteEmailIdentity",
        "ses:GetEmailIdentity",
        "ses:PutEmailIdentityDkimSigningAttributes",
        "ses:PutEmailIdentityMailFromAttributes",
        "ses:CreateConfigurationSet",
        "ses:DeleteConfigurationSet",
        "ses:GetConfigurationSet",
        "ses:PutConfigurationSet*",
        "ses:SendEmail"
      ],
      "Resource": "*"
    }
  ]
}
```

## Example DNS Records

For domain `example.com` with MAIL FROM `mail.example.com`:

```
# Domain Verification
Type: TXT
Name: _amazonses.example.com
Value: <verification-token-from-aws>

# DKIM Record 1
Type: CNAME
Name: <token1>._domainkey.example.com
Value: <token1>.dkim.amazonses.com

# DKIM Record 2
Type: CNAME
Name: <token2>._domainkey.example.com
Value: <token2>.dkim.amazonses.com

# DKIM Record 3
Type: CNAME
Name: <token3>._domainkey.example.com
Value: <token3>.dkim.amazonses.com

# MAIL FROM MX Record
Type: MX
Name: mail.example.com
Priority: 10
Value: feedback-smtp.us-east-1.amazonses.com

# MAIL FROM SPF Record
Type: TXT
Name: mail.example.com
Value: "v=spf1 include:amazonses.com ~all"
```

## Next Steps

1. ✅ Set up AWS credentials
2. ✅ Modify template with your email/domain
3. ✅ Create entities with `monk update`
4. ✅ Verify email/domain
5. ✅ Add DNS records (for domains)
6. ✅ Test sending emails
7. ✅ Request production access (if needed)
8. ✅ Monitor and manage your SES resources

## Resources

- [AWS SES Documentation](https://docs.aws.amazon.com/ses/)
- [SES API v2 Reference](https://docs.aws.amazon.com/ses/latest/APIReference-V2/)
- [Request Production Access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)
- [Entity README](./README.md)
- [Integration Guide](./INTEGRATION.mdx)

