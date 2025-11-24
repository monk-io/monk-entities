# SNS Application Integration Example

Containerized Python application that publishes messages to AWS SNS topics using the AssumeRole security pattern.

## What It Does

Creates:
- 3 SNS topics (standard, KMS-encrypted, FIFO)
- IAM resources for secure AssumeRole access
- Python publisher app that uses temporary credentials to send messages

The publisher uses AssumeRole instead of direct credentials for better security:
- IAM user has only `sts:AssumeRole` permission
- Temporary credentials expire after 1 hour
- External ID provides additional protection

## Usage

### 1. Load and run

```bash
# Load the stack
sudo /home/ivan/Work/monk/dist/monk load examples/sns-app-integration/complete-stack.yaml

# Run everything
sudo /home/ivan/Work/monk/dist/monk run sns-app-integration/app-stack
```

### 2. Check logs

```bash
sudo /home/ivan/Work/monk/dist/monk logs sns-app-integration/sns-publisher
```

Expected output:

```
📤 SNS Publisher Application Starting...
Publishing messages to SNS topics using AssumeRole...

🔐 Using AssumeRole authentication
   Role ARN: arn:aws:iam::123456789:role/SNSPublisherServiceRole
   Session expires: 2025-11-21 20:30:00+00:00

✅ Role assumed successfully!

1️⃣  Publishing to standard topic...
   ✅ MessageId: abc-123-def
2️⃣  Publishing to encrypted topic (KMS)...
   ✅ MessageId: xyz-456-uvw
3️⃣  Publishing to FIFO topic...
   ✅ Message 1 - MessageId: fifo-001
   ✅ Message 2 - MessageId: fifo-002
   ✅ Message 3 - MessageId: fifo-003

✅ All messages published successfully!
```

### 3. Cleanup

```bash
sudo /home/ivan/Work/monk/dist/monk stop sns-app-integration/app-stack
sudo /home/ivan/Work/monk/dist/monk purge sns-app-integration/app-stack
```

## How It Works

1. Monk creates SNS topics and IAM resources (policy, role, user)
2. Publisher app starts with minimal IAM user credentials
3. App calls `sts.assume_role()` to get temporary credentials
4. App uses temporary credentials to publish messages via boto3
5. Messages sent to all 3 topics, then container exits

## Files

- `complete-stack.yaml` - Complete stack with topics, IAM resources, and publisher app

## Prerequisites

- Monk orchestrator installed
- AWS credentials for Monk (to create IAM/SNS resources)
- IAM permissions: `SNS:*`, `IAM:CreateUser`, `IAM:CreateRole`, `IAM:CreatePolicy`

## Notes

- Publisher container exits after publishing (not a long-running service)
- Temporary credentials expire after 1 hour
- FIFO topic names must end with `.fifo`
- All IAM resources tagged with `Type: assume-role`
