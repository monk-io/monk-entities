import * as http from 'http';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const config = {
    dbHost: process.env.DB_HOST || 'localhost',
    dbPort: parseInt(process.env.DB_PORT || '5432', 10),
    dbName: process.env.DB_NAME || 'appdb',
    dbUser: process.env.DB_USER || 'appuser',
    dbPassword: process.env.DB_PASSWORD || '',
    dbSsl: process.env.DB_SSL !== 'false',
    port: parseInt(process.env.PORT || '8080', 10),
    tableName: process.env.SAMPLE_TABLE_NAME || 'tasks',
};

let pool: Pool;

function getPool(): Pool {
    if (!pool) {
        pool = new Pool({
            host: config.dbHost,
            port: config.dbPort,
            database: config.dbName,
            user: config.dbUser,
            password: config.dbPassword,
            ssl: config.dbSsl ? { rejectUnauthorized: false } : false,
            max: 5,
            connectionTimeoutMillis: 10000,
        });
    }
    return pool;
}

async function ensureTable(): Promise<void> {
    const db = getPool();
    await db.query(`
        CREATE TABLE IF NOT EXISTS ${config.tableName} (
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            completed BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);
}

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;
    const method = req.method || 'GET';

    res.setHeader('Content-Type', 'application/json');

    try {
        // Health check
        if (path === '/health') {
            const db = getPool();
            const result = await db.query('SELECT 1 as ok');
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'healthy', db: result.rows[0].ok === 1 }));
            return;
        }

        // List tasks
        if (path === '/tasks' && method === 'GET') {
            const db = getPool();
            const result = await db.query(
                `SELECT * FROM ${config.tableName} ORDER BY created_at DESC LIMIT 50`
            );
            res.writeHead(200);
            res.end(JSON.stringify(result.rows));
            return;
        }

        // Create task
        if (path === '/tasks' && method === 'POST') {
            const body = await readBody(req);
            const { title } = JSON.parse(body);
            if (!title) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'title is required' }));
                return;
            }
            const db = getPool();
            const result = await db.query(
                `INSERT INTO ${config.tableName} (title) VALUES ($1) RETURNING *`,
                [title]
            );
            res.writeHead(201);
            res.end(JSON.stringify(result.rows[0]));
            return;
        }

        // Toggle task completion
        if (path.startsWith('/tasks/') && method === 'PATCH') {
            const id = parseInt(path.split('/')[2], 10);
            const db = getPool();
            const result = await db.query(
                `UPDATE ${config.tableName} SET completed = NOT completed WHERE id = $1 RETURNING *`,
                [id]
            );
            if (result.rows.length === 0) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'task not found' }));
                return;
            }
            res.writeHead(200);
            res.end(JSON.stringify(result.rows[0]));
            return;
        }

        // Delete task
        if (path.startsWith('/tasks/') && method === 'DELETE') {
            const id = parseInt(path.split('/')[2], 10);
            const db = getPool();
            const result = await db.query(
                `DELETE FROM ${config.tableName} WHERE id = $1 RETURNING *`,
                [id]
            );
            if (result.rows.length === 0) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'task not found' }));
                return;
            }
            res.writeHead(200);
            res.end(JSON.stringify({ deleted: result.rows[0] }));
            return;
        }

        // Root — info
        if (path === '/') {
            res.writeHead(200);
            res.end(JSON.stringify({
                service: 'gcp-cloudrun-api',
                endpoints: ['GET /health', 'GET /tasks', 'POST /tasks', 'PATCH /tasks/:id', 'DELETE /tasks/:id'],
                db: { host: config.dbHost, port: config.dbPort, database: config.dbName },
            }));
            return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'not found' }));
    } catch (error) {
        console.error(`Error handling ${method} ${path}:`, error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'internal error' }));
    }
}

function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}

async function main(): Promise<void> {
    console.log('Starting Cloud Run API...');
    console.log(`  DB: ${config.dbUser}@${config.dbHost}:${config.dbPort}/${config.dbName}`);
    console.log(`  SSL: ${config.dbSsl}`);
    console.log(`  Port: ${config.port}`);

    await ensureTable();
    console.log(`Table "${config.tableName}" ready`);

    const server = http.createServer((req, res) => {
        handleRequest(req, res).catch((err) => {
            console.error('Unhandled request error:', err);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'internal error' }));
        });
    });

    const shutdown = () => {
        console.log('\nShutting down...');
        server.close(() => {
            pool?.end().then(() => process.exit(0));
        });
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    server.listen(config.port, () => {
        console.log(`Server listening on port ${config.port}`);
    });
}

main().catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
});
