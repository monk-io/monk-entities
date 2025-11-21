# AWS SES Entities

Monk entities for managing Amazon Simple Email Service (SES) resources.

## Overview

AWS SES is a cloud-based email sending service. This module provides entities to manage:

- **Email Identities**: Verify and manage individual email addresses
- **Domain Identities**: Verify and manage entire email domains
- **Configuration Sets**: Group rules for tracking and managing email sending

## Prerequisites

- AWS Account with SES access
- AWS credentials configured (Access Key ID and Secret Access Key)
- Domain DNS access (for domain verification)

## AWS Credentials

AWS credentials are automatically available through the built-in `aws` module. No explicit secret configuration is required in templates - credentials should be provided through environment variables:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (optional, can be specified in entity definition)

## Entities

### Email Identity (`email-identity`)

Verifies and manages individual email addresses for sending.

**Configuration:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `region` | string | Yes | AWS region (e.g., us-east-1) |
| `email_address` | string | Yes | Email address to verify |
| `dkim_signing_enabled` | boolean | No | Enable DKIM signing |
| `configuration_set_name` | string | No | Configuration set to use |

**State:**

| Property | Type | Description |
|----------|------|-------------|
| `email_address` | string | Email address identity |
| `verification_status` | string | Current verification status |
| `verified` | boolean | Whether verified |
| `dkim_status` | string | DKIM signing status |
| `dkim_tokens` | string[] | DKIM tokens for DNS |

**Actions:**

- `get-verification-status`: Check verification status
- `send-test-email`: Send a test email (args: to, subject, body)
- `get-dkim-tokens`: Display DKIM DNS records

**Example:**

```yaml
my-email:
  defines: aws-ses/email-identity
  region: us-east-1
  email_address: noreply@example.com
  dkim_signing_enabled: true
```

---

### Domain Identity (`domain-identity`)

Verifies and manages entire domains for email sending.

**Configuration:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `region` | string | Yes | AWS region |
| `domain_name` | string | Yes | Domain to verify |
| `dkim_signing_enabled` | boolean | No | Enable DKIM signing |
| `mail_from_domain` | string | No | Custom MAIL FROM domain |
| `mail_from_behavior_on_mx_failure` | string | No | UseDefaultValue or RejectMessage |

**State:**

| Property | Type | Description |
|----------|------|-------------|
| `domain_name` | string | Domain identity |
| `verification_status` | string | Verification status |
| `verified` | boolean | Whether verified |
| `dkim_status` | string | DKIM status |
| `dkim_tokens` | string[] | DKIM DNS records |

**Actions:**

- `get-verification-status`: Check verification status
- `get-dns-records`: Display all required DNS records
- `send-test-email`: Send test email (args: to, from, subject, body)

**Example:**

```yaml
my-domain:
  defines: aws-ses/domain-identity
  region: us-east-1
  domain_name: example.com
  dkim_signing_enabled: true
  mail_from_domain: mail.example.com
  mail_from_behavior_on_mx_failure: UseDefaultValue
```

---

### Configuration Set (`configuration-set`)

Manages configuration sets for email tracking and management.

**Configuration:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `region` | string | Yes | AWS region |
| `configuration_set_name` | string | Yes | Configuration set name |
| `reputation_metrics_enabled` | boolean | No | Enable reputation tracking |
| `sending_enabled` | boolean | No | Enable sending (default: true) |
| `custom_redirect_domain` | string | No | Custom tracking domain |
| `tls_policy` | string | No | REQUIRE or OPTIONAL |
| `suppression_list_reasons` | string[] | No | BOUNCE and/or COMPLAINT |

**State:**

| Property | Type | Description |
|----------|------|-------------|
| `configuration_set_name` | string | Configuration set name |
| `sending_enabled` | boolean | Whether sending is enabled |

**Actions:**

- `get-info`: Display configuration details
- `enable-sending`: Enable email sending
- `disable-sending`: Disable email sending

**Example:**

```yaml
my-config-set:
  defines: aws-ses/configuration-set
  region: us-east-1
  configuration_set_name: production-emails
  reputation_metrics_enabled: true
  tls_policy: REQUIRE
  suppression_list_reasons:
    - BOUNCE
    - COMPLAINT
```

---

## Complete Example

```yaml
namespace: email-service

# Domain identity
domain:
  defines: aws-ses/domain-identity
  region: us-east-1
  domain_name: example.com
  dkim_signing_enabled: true
  mail_from_domain: mail.example.com

# Configuration set
config:
  defines: aws-ses/configuration-set
  depends:
    wait-for:
      runnables:
        - email-service/domain
  region: us-east-1
  configuration_set_name: my-emails
  reputation_metrics_enabled: true
  tls_policy: REQUIRE
```

## Verification Process

### Email Identity

1. Create the email identity
2. AWS sends verification email to the address
3. Click the link in the email to verify
4. Wait for verification status to become "Success"

### Domain Identity

1. Create the domain identity
2. Get DNS records using `get-dns-records` action
3. Add the records to your domain's DNS:
   - TXT record for domain verification
   - CNAME records for DKIM (3 records)
   - MX and TXT records for MAIL FROM (if configured)
4. Wait for DNS propagation (can take 24-48 hours)
5. Wait for verification status to become "Success"

## Sandbox Mode

New AWS SES accounts start in sandbox mode with restrictions:

- Can only send to verified email addresses
- Limited to 200 emails per day
- 1 email per second sending rate

To move to production:
1. Open AWS SES Console
2. Request production access
3. Provide use case details
4. Wait for AWS approval

## Related Resources

- [AWS SES Documentation](https://docs.aws.amazon.com/ses/)
- [SES API v2 Reference](https://docs.aws.amazon.com/ses/latest/APIReference-V2/)
- [Email Sending Best Practices](https://docs.aws.amazon.com/ses/latest/dg/send-email-concepts-process.html)

## Testing

See `test/` directory for integration tests.

```bash
# Compile
INPUT_DIR=./src/aws-ses/ OUTPUT_DIR=./dist/aws-ses/ ./monkec.sh compile

# Test (requires AWS credentials)
sudo INPUT_DIR=./src/aws-ses/ ./monkec.sh test --verbose
```

