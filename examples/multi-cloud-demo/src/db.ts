import { Pool, PoolClient } from 'pg';
import { config } from './config';
import { Task, TaskStatus } from './types';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.name,
      user: config.db.user,
      password: config.db.password,
      ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    pool.on('error', (err) => console.error('DB pool error:', err.message));
  }
  return pool;
}

export async function initSchema(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        result TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('DB schema ready');
  } finally {
    client.release();
  }
}

export async function createTask(title: string, payload: string): Promise<Task> {
  const { rows } = await getPool().query<Task>(
    `INSERT INTO tasks (title, payload) VALUES ($1, $2) RETURNING *`,
    [title, payload]
  );
  return rows[0];
}

export async function getTask(id: string): Promise<Task | null> {
  const { rows } = await getPool().query<Task>(
    `SELECT * FROM tasks WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function listTasks(): Promise<Task[]> {
  const { rows } = await getPool().query<Task>(
    `SELECT * FROM tasks ORDER BY created_at DESC LIMIT 50`
  );
  return rows;
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
  result?: string
): Promise<void> {
  await getPool().query(
    `UPDATE tasks SET status = $1, result = $2, updated_at = NOW() WHERE id = $3`,
    [status, result ?? null, id]
  );
}

// Claim one pending task using advisory lock (used when QUEUE_TYPE=db)
export async function claimPendingTask(
  client: PoolClient
): Promise<Task | null> {
  const { rows } = await client.query<Task>(`
    SELECT * FROM tasks
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `);
  if (rows.length === 0) return null;
  await client.query(
    `UPDATE tasks SET status = 'processing', updated_at = NOW() WHERE id = $1`,
    [rows[0].id]
  );
  return rows[0];
}

export async function checkConnection(): Promise<boolean> {
  try {
    await getPool().query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
