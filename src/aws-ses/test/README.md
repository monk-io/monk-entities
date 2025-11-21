# AWS SES Tests

Integration tests for AWS SES entities.

## Prerequisites

1. AWS account with SES access
2. AWS credentials (Access Key ID and Secret Access Key)
3. Email address for testing (must be verified in sandbox mode)

## Setup

1. Copy `env.example` to `.env`:
   ```bash
   cp env.example .env
   ```

2. Edit `.env` with your AWS credentials and test email:
   ```bash
   AWS_ACCESS_KEY_ID=your_access_key_here
   AWS_SECRET_ACCESS_KEY=your_secret_key_here
   AWS_REGION=us-east-1
   TEST_EMAIL_ADDRESS=your-email@example.com
   ```

3. Ensure your AWS SES account has:
   - SES access enabled in the specified region
   - Test email address verified (if in sandbox mode)

## Running Tests

From the repository root:

```bash
# Compile the module
INPUT_DIR=./src/aws-ses/ OUTPUT_DIR=./dist/aws-ses/ ./monkec.sh compile

# Run tests
sudo INPUT_DIR=./src/aws-ses/ ./monkec.sh test --verbose
```

## Test Coverage

The integration tests cover:

1. **Email Identity**
   - Create email identity
   - Check verification status
   - Get DKIM tokens
   - Update identity

2. **Domain Identity**
   - Create domain identity
   - Get DNS records
   - Check verification status
   - Update identity

3. **Configuration Set**
   - Create configuration set
   - Get configuration info
   - Enable/disable sending
   - Update configuration

4. **Cleanup**
   - Delete all created resources

## Notes

- Domain verification requires DNS changes and can take up to 72 hours
- Email verification requires clicking a link in the verification email
- Tests will pass even if identities are not fully verified
- In sandbox mode, you can only send to verified addresses
- Clean up removes only resources created by the test (not pre-existing)

## Troubleshooting

### "Email address not verified"

If you see this error, verify your test email address:
1. Go to AWS SES Console
2. Navigate to "Verified identities"
3. Verify your test email address
4. Click the verification link sent to your email

### "Access Denied"

Ensure your AWS credentials have the following permissions:
- `ses:CreateEmailIdentity`
- `ses:DeleteEmailIdentity`
- `ses:GetEmailIdentity`
- `ses:PutEmailIdentityDkimSigningAttributes`
- `ses:CreateConfigurationSet`
- `ses:DeleteConfigurationSet`
- `ses:GetConfigurationSet`
- `ses:PutConfigurationSetSendingOptions`

### Domain verification fails

This is expected in tests - domain verification requires:
1. Adding DNS records
2. Waiting for DNS propagation (24-72 hours)
3. AWS SES checking the records

Tests check that the domain identity is created but don't require full verification.

