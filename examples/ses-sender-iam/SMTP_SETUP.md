# AWS SES SMTP Setup Guide

This guide explains how to use AWS SES SMTP interface with the IAM user created by this example.

## Overview

AWS SES provides an SMTP interface that allows you to send emails using standard SMTP protocols. This is useful for:
- Existing applications that use SMTP
- Email clients and servers
- Simple testing and debugging

## SMTP Endpoints

AWS SES SMTP endpoints by region:

- **us-east-1** (N. Virginia): `email-smtp.us-east-1.amazonaws.com`
- **us-east-2** (Ohio): `email-smtp.us-east-2.amazonaws.com`
- **us-west-2** (Oregon): `email-smtp.us-west-2.amazonaws.com`
- **eu-west-1** (Ireland): `email-smtp.eu-west-1.amazonaws.com`
- **eu-central-1** (Frankfurt): `email-smtp.eu-central-1.amazonaws.com`
- **ap-southeast-1** (Singapore): `email-smtp.ap-southeast-1.amazonaws.com`
- **ap-northeast-1** (Tokyo): `email-smtp.ap-northeast-1.amazonaws.com`

Full list: https://docs.aws.amazon.com/ses/latest/DeveloperGuide/smtp-connect.html

## SMTP Ports

- **587** (recommended): TLS (STARTTLS)
- **465**: TLS (SSL)
- **25**: Plain text or TLS (STARTTLS)
  - Note: Many ISPs block port 25. Use 587 instead.

## Credentials

### Getting Credentials from Monk

The example automatically creates SMTP credentials when the IAM user is created. The SMTP password is automatically generated from the IAM secret access key using the AWS SigV4 algorithm and stored in Monk secrets.

```bash
# Get access key ID (SMTP username)
ACCESS_KEY=$(sudo monk secret-get ses-sender-access-key)
echo "SMTP Username: $ACCESS_KEY"

# Get SMTP password (automatically generated and stored)
SMTP_PASSWORD=$(sudo monk secret-get ses-sender-smtp-password)
echo "SMTP Password: $SMTP_PASSWORD"
```

**Note**: The SMTP password is NOT the same as the IAM secret access key. It's automatically derived using the AWS SigV4 algorithm.

## Testing SMTP

### Using curl (Built into Demo Container)

The `ses-sender-demo` container automatically sends email using curl:

```bash
curl -v --ssl-reqd \
  --url "smtp://email-smtp.us-east-1.amazonaws.com:587" \
  --user "${ACCESS_KEY}:${SMTP_PASSWORD}" \
  --mail-from "sender@example.com" \
  --mail-rcpt "recipient@example.com" \
  --upload-file email.txt
```

### Using swaks

Install swaks (Swiss Army Knife for SMTP):

```bash
# Ubuntu/Debian
sudo apt-get install swaks

# macOS
brew install swaks
```

Send test email:

```bash
swaks --to recipient@example.com \
  --from sender@example.com \
  --server email-smtp.us-east-1.amazonaws.com:587 \
  --auth LOGIN \
  --auth-user "$ACCESS_KEY" \
  --auth-password "$SMTP_PASSWORD" \
  --tls \
  --header "Subject: Test from SWAKS" \
  --body "This is a test email from SWAKS"
```

### Using Python

```python
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# SMTP settings
SMTP_HOST = "email-smtp.us-east-1.amazonaws.com"
SMTP_PORT = 587
SMTP_USERNAME = "YOUR_ACCESS_KEY"
SMTP_PASSWORD = "YOUR_SMTP_PASSWORD"

# Email details
FROM_EMAIL = "sender@example.com"
TO_EMAIL = "recipient@example.com"
SUBJECT = "Test Email from Python"
BODY = "This is a test email sent via AWS SES SMTP"

# Create message
msg = MIMEMultipart()
msg['From'] = FROM_EMAIL
msg['To'] = TO_EMAIL
msg['Subject'] = SUBJECT
msg.attach(MIMEText(BODY, 'plain'))

# Send email
try:
    server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
    server.starttls()
    server.login(SMTP_USERNAME, SMTP_PASSWORD)
    server.send_message(msg)
    server.quit()
    print("Email sent successfully!")
except Exception as e:
    print(f"Error: {e}")
```

### Using Node.js (Nodemailer)

```javascript
const nodemailer = require('nodemailer');

// SMTP settings
const transporter = nodemailer.createTransport({
  host: 'email-smtp.us-east-1.amazonaws.com',
  port: 587,
  secure: false, // use STARTTLS
  auth: {
    user: 'YOUR_ACCESS_KEY',
    pass: 'YOUR_SMTP_PASSWORD'
  }
});

// Email details
const mailOptions = {
  from: 'sender@example.com',
  to: 'recipient@example.com',
  subject: 'Test Email from Node.js',
  text: 'This is a test email sent via AWS SES SMTP'
};

// Send email
transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    console.log('Error:', error);
  } else {
    console.log('Email sent:', info.response);
  }
});
```

## Common Issues

### 535 Authentication Credentials Invalid

**Cause**: Incorrect SMTP password or username.

**Solution**:
1. Verify you're using the SMTP password (not the secret access key)
2. Regenerate credentials:
   ```bash
   sudo monk purge ses-example-direct/ses-sender-user
   sudo monk run ses-example-direct/ses-sender-user
   ```

### 554 Message rejected: Email address is not verified

**Cause**: SES is in sandbox mode and the recipient email is not verified.

**Solution**:
1. Verify the recipient email in SES console
2. Or request production access to send to any email

### Connection timeout on port 25

**Cause**: ISP blocks port 25.

**Solution**: Use port 587 instead.

### TLS handshake failed

**Cause**: Incorrect TLS configuration.

**Solution**: 
- For port 587: Use STARTTLS
- For port 465: Use SSL/TLS
- Ensure your client supports TLS 1.2 or higher

## SMTP vs API

### Use SMTP when:
- Integrating with existing applications that use SMTP
- Simple email sending requirements
- Quick testing and prototyping
- Using email clients or servers

### Use SES API when:
- Need advanced features (templates, configuration sets)
- Better error handling and monitoring
- Higher throughput requirements
- Building cloud-native applications

## Rate Limits

- **Sandbox**: 200 emails per day, 1 email per second
- **Production**: Depends on your sending limits (request increase in AWS Console)

Check your limits:
```bash
aws ses get-account --region us-east-1
```

## Security Best Practices

1. **Rotate credentials regularly**: Delete old access keys and create new ones
2. **Use IAM policies**: Restrict permissions to minimum required (this example does this)
3. **Use TLS**: Always use encrypted connections (port 587 or 465)
4. **Don't hardcode credentials**: Use environment variables or secrets management
5. **Monitor usage**: Set up CloudWatch alarms for unusual sending patterns

## References

- [AWS SES SMTP Interface](https://docs.aws.amazon.com/ses/latest/DeveloperGuide/send-email-smtp.html)
- [AWS SES SMTP Credentials](https://docs.aws.amazon.com/ses/latest/DeveloperGuide/smtp-credentials.html)
- [AWS SES Troubleshooting](https://docs.aws.amazon.com/ses/latest/DeveloperGuide/troubleshoot-smtp.html)

