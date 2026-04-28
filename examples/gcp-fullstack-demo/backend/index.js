// Backend API for gcp-fullstack-demo.
//
// Exposes a small REST surface that demonstrates wiring across four GCP
// services from a single Cloud Run container:
//   - Postgres (Cloud SQL)
//   - Object storage (Cloud Storage)
//   - Serverless function (Cloud Functions Gen 2)
//
// All configuration comes from env vars wired by the Monk stack — see
// stack.yaml for the source of each value.

const express = require('express');
const cors = require('cors');
const pg = require('pg');
const { Storage } = require('@google-cloud/storage');

const app = express();
app.use(cors());
app.use(express.json());

// --- Postgres (Cloud SQL) -------------------------------------------------
// Connects via the instance's public IP. The stack opens 0.0.0.0/0 on the
// instance for demo simplicity (`allow_all: true`); production stacks should
// use Cloud SQL Auth Proxy or VPC private IP.
const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

// --- Cloud Storage --------------------------------------------------------
// Authenticates via the Cloud Run service's runtime service account.
// No explicit credentials needed — the GCP client library picks up
// Application Default Credentials from the workload identity.
const storage = new Storage();
const bucket = storage.bucket(process.env.BUCKET_NAME);

// --- Cloud Function -------------------------------------------------------
const FUNCTION_URL = process.env.FUNCTION_URL || '';

async function bootstrap() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  console.log('postgres: items table ready');
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      ok: true,
      db: 'connected',
      bucket: process.env.BUCKET_NAME,
      function_url_configured: Boolean(FUNCTION_URL),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/items', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, created_at FROM items ORDER BY id DESC LIMIT 50'
  );
  res.json(rows);
});

app.post('/api/items', async (req, res) => {
  const name = (req.body && req.body.name ? req.body.name : '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const { rows } = await pool.query(
    'INSERT INTO items (name) VALUES ($1) RETURNING id, name, created_at',
    [name]
  );
  res.status(201).json(rows[0]);
});

app.get('/api/files', async (_req, res) => {
  const [files] = await bucket.getFiles({ maxResults: 50 });
  res.json(
    files.map((f) => ({
      name: f.name,
      size: parseInt(f.metadata.size || '0', 10),
      updated: f.metadata.updated,
    }))
  );
});

app.post('/api/files/:name', async (req, res) => {
  const filename = req.params.name;
  const content =
    (req.body && req.body.content) ||
    `created at ${new Date().toISOString()}`;
  await bucket.file(filename).save(content, { contentType: 'text/plain' });
  res.status(201).json({
    name: filename,
    gs_uri: `gs://${bucket.name}/${filename}`,
  });
});

app.get('/api/echo', async (req, res) => {
  if (!FUNCTION_URL) {
    return res.status(503).json({ error: 'FUNCTION_URL not configured' });
  }
  const text = (req.query.text || 'hello from backend').toString();
  const r = await fetch(`${FUNCTION_URL}?text=${encodeURIComponent(text)}`);
  const body = await r.text();
  res.json({ function_url: FUNCTION_URL, request_text: text, function_response: body });
});

const port = parseInt(process.env.PORT || '8080', 10);
bootstrap()
  .then(() => app.listen(port, () => console.log(`backend listening on ${port}`)))
  .catch((err) => {
    console.error('bootstrap failed:', err);
    process.exit(1);
  });
