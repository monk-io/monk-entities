/**
 * Cloud Run Multi-Service Demo — Batch Export Job
 *
 * Cloud Run Job: reads all tasks from Cloud SQL Postgres, writes a CSV
 * to the Cloud Storage bucket, then exits cleanly.
 *
 * Run with: monk do gcp-cloudrun-multi-service/batch-export-job/execute
 * Or override at runtime:
 *   monk do gcp-cloudrun-multi-service/batch-export-job/execute \
 *     env='{"EXPORT_PREFIX":"custom"}'
 *
 * Env vars (wired from entity state in YAML):
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 *   BUCKET_NAME
 *   EXPORT_PREFIX  — optional filename prefix (default: "exports/tasks")
 */

'use strict';

const { Pool } = require('pg');
const { Storage } = require('@google-cloud/storage');

async function main() {
  const prefix = process.env.EXPORT_PREFIX || 'exports/tasks';

  // ── Database ──────────────────────────────────────────────────────────────
  console.log('[job] Connecting to Cloud SQL…');
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  const { rows } = await pool.query('SELECT * FROM tasks ORDER BY created_at');
  console.log(`[job] Fetched ${rows.length} tasks`);
  await pool.end();

  // ── Build CSV ─────────────────────────────────────────────────────────────
  const csv = [
    'id,title,done,created_at',
    ...rows.map(r =>
      `${r.id},"${String(r.title).replace(/"/g, '""')}",${r.done},${r.created_at.toISOString()}`
    ),
  ].join('\n') + '\n';

  // ── Upload to GCS ─────────────────────────────────────────────────────────
  const bucketName = process.env.BUCKET_NAME;
  if (!bucketName) throw new Error('BUCKET_NAME env var is not set');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const objectName = `${prefix}-${timestamp}.csv`;

  console.log(`[job] Uploading to gs://${bucketName}/${objectName} …`);
  const storage = new Storage();  // uses ADC from service account
  const bucket = storage.bucket(bucketName);
  await bucket.file(objectName).save(csv, { contentType: 'text/csv' });

  console.log(`[job] ✅ Export complete — ${rows.length} rows → gs://${bucketName}/${objectName}`);
}

main().catch(err => {
  console.error('[job] ❌ Export failed:', err.message);
  process.exit(1);
});
