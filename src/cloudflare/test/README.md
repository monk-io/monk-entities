# Cloudflare Tests

## Setup

1. Create `.env` in this directory or export environment variables:

```bash
# .env
CLOUDFLARE_API_TOKEN=your-token
MONKEC_VERBOSE=true
```

2. Compile and test:

```bash
INPUT_DIR=./src/cloudflare/ OUTPUT_DIR=./dist/cloudflare/ ./monkec.sh compile
sudo INPUT_DIR=./src/cloudflare/ ./monkec.sh test
```

The test maps `cloudflare-api-token` to `$CLOUDFLARE_API_TOKEN` via the `secrets` section.
