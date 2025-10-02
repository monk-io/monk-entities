Stripe Integration Test

Setup:

- Copy `env.example` to `.env` and set `STRIPE_SECRET_KEY`.
- Compile: `INPUT_DIR=./src/stripe/ OUTPUT_DIR=./dist/stripe/ ./monkec.sh compile`
- Run tests: `sudo INPUT_DIR=./src/stripe/ ./monkec.sh test`



