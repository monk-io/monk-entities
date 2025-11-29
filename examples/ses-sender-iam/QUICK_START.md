# Quick Start Guide

Get up and running with AWS SES in 5 minutes!

## Prerequisites

- Monk installed and running
- AWS credentials configured in Monk

## Steps

### 1. Build and Load

```bash
# Build entities
cd /home/ivan/Work/monk-entities
npm run build

# Load IAM entities
cd dist/aws-iam
sudo monk load MANIFEST

# Load SES entities
cd ../aws-ses
sudo monk load MANIFEST

# Load example
cd ../../examples/ses-sender-iam
sudo monk load ses-sender-direct-access.yaml
```

### 2. Run the Stack

```bash
sudo monk run ses-example-direct/direct-access-stack
```

This creates:
- ✅ IAM Group (`ses-senders`)
- ✅ IAM Policy (`ses-sender-policy`)
- ✅ IAM User (`ses-sender-user`) with access keys
- ✅ Policy-Group attachment
- ✅ Email identity (`sender@example.com`)
- ✅ Domain identity (`example.com`)
- ✅ Demo container that sends email via SMTP

### 3. Verify Email

Check your email inbox for a verification email from AWS and click the link.

```bash
# Check verification status
sudo monk do ses-example-direct/sender-email/get-verification-status
```

### 4. Add DNS Records for Domain

Get DKIM tokens:
```bash
sudo monk describe ses-example-direct/sender-domain | grep -A 5 "dkim_tokens"
```

Add three CNAME records to your DNS:
```
{token1}._domainkey.example.com -> {token1}.dkim.amazonses.com
{token2}._domainkey.example.com -> {token2}.dkim.amazonses.com
{token3}._domainkey.example.com -> {token3}.dkim.amazonses.com
```

Add SPF TXT record:
```
example.com -> "v=spf1 include:amazonses.com ~all"
```

### 5. Send Test Email

The demo container automatically sends a test email on startup:

```bash
# View sending logs
sudo monk logs -f ses-example-direct/ses-sender-demo
```

You should see output like:
```
Installing curl...
Sending email via SMTP...
...
Email sent successfully!
Check your inbox at recipient@example.com
```

### 6. Check Your Inbox

You should receive the test email at `recipient@example.com`!

## What's Next?

- Read the full [README.md](README.md) for detailed documentation
- See [SMTP_SETUP.md](SMTP_SETUP.md) for SMTP configuration details
- Customize the template for your own email addresses and domains

## Cleanup

```bash
sudo monk stop ses-example-direct/direct-access-stack
sudo monk purge ses-example-direct/direct-access-stack
```

## Troubleshooting

**Email not arriving?**
- Check verification status (step 3)
- Check AWS SES sandbox mode (verify all recipient addresses)
- Check spam folder

**Domain not verified?**
- DNS propagation takes 5-10 minutes
- Verify CNAME records are correct
- Use `dig` to check: `dig {token}._domainkey.example.com CNAME`

**SMTP fails?**
- Check IAM user has access keys
- Verify policy is attached to group
- Check logs: `sudo monk logs ses-example-direct/ses-sender-demo`

