/**
 * Cloud Run Multi-Service Demo — API Service
 *
 * REST API for task management. Deployed to Cloud Run via source deploy
 * (blob_name: api) — no Docker registry required.
 *
 * Routes:
 *   GET  /api/health        — DB + GCS connectivity check
 *   GET  /api/tasks         — List all tasks
 *   POST /api/tasks         — Create a task { title }
 *   PATCH  /api/tasks/:id   — Toggle completion
 *   DELETE /api/tasks/:id   — Delete a task
 *   GET  /api/exports       — List export files in GCS
 *   POST /api/exports       — Write tasks CSV to GCS bucket
 *
 * Env vars (wired from entity state in YAML):
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 *   BUCKET_NAME
 *   PORT (default 8080, Cloud Run sets this automatically)
 */

'use strict';

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

// ── Database ──────────────────────────────────────────────────────────────────

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },  // Cloud SQL uses self-signed cert in demo
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id        SERIAL PRIMARY KEY,
        title     TEXT NOT NULL,
        done      BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('DB: tasks table ready');
  } finally {
    client.release();
  }
}

// ── GCS helpers (uses metadata-server ADC — no extra SDK dep) ─────────────────

const BUCKET_NAME = process.env.BUCKET_NAME || '';

async function getGCSToken() {
  const res = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } }
  );
  if (!res.ok) throw new Error(`Metadata server error: ${res.status}`);
  const { access_token } = await res.json();
  return access_token;
}

async function listGCSObjects(bucket) {
  const token = await getGCSToken();
  const res = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`GCS list error: ${res.status}`);
  const data = await res.json();
  return (data.items || []).map(o => ({ name: o.name, size: o.size, updated: o.updated }));
}

async function uploadGCSObject(bucket, name, content, contentType = 'text/csv') {
  const token = await getGCSToken();
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body: content,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GCS upload error ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'connected', bucket: BUCKET_NAME || '(not set)' });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

app.get('/api/tasks', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tasks', async (req, res) => {
  const { title } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO tasks (title) VALUES ($1) RETURNING *',
      [title.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      'UPDATE tasks SET done = NOT done WHERE id = $1 RETURNING *',
      [parseInt(id, 10)]
    );
    if (!rows.length) return res.status(404).json({ error: 'task not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1', [parseInt(id, 10)]);
    if (!rowCount) return res.status(404).json({ error: 'task not found' });
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/exports', async (_req, res) => {
  if (!BUCKET_NAME) return res.status(503).json({ error: 'BUCKET_NAME not configured' });
  try {
    const files = await listGCSObjects(BUCKET_NAME);
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/exports', async (_req, res) => {
  if (!BUCKET_NAME) return res.status(503).json({ error: 'BUCKET_NAME not configured' });
  try {
    const { rows } = await pool.query('SELECT * FROM tasks ORDER BY created_at');
    const csv = ['id,title,done,created_at']
      .concat(rows.map(r => `${r.id},"${r.title.replace(/"/g, '""')}",${r.done},${r.created_at}`))
      .join('\n');
    const name = `exports/tasks-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    const obj = await uploadGCSObject(BUCKET_NAME, name, csv);
    res.status(201).json({ file: obj.name, rows: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Root — list all endpoints
app.get('/', (_req, res) => {
  res.json({
    service: 'cloudrun-multi-service-api',
    endpoints: [
      'GET  /api/health',
      'GET  /api/tasks',
      'POST /api/tasks { title }',
      'PATCH /api/tasks/:id',
      'DELETE /api/tasks/:id',
      'GET  /api/exports',
      'POST /api/exports',
    ],
  });
});

// ── Startup ───────────────────────────────────────────────────────────────────

async function main() {
  await initDB();
  app.listen(PORT, () => console.log(`API listening on :${PORT}`));
}

process.on('SIGTERM', () => { pool.end(); process.exit(0); });
process.on('SIGINT',  () => { pool.end(); process.exit(0); });

main().catch(err => { console.error('Startup error:', err); process.exit(1); });
