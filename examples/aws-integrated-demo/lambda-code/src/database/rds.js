const { Pool } = require('pg');
const { logInfo, logError } = require('../utils/response');

/**
 * RDS Manager for PostgreSQL database operations
 * Handles user profile data with proper connection pooling
 */
class RDSManager {
    constructor(config) {
        this.config = config;
        this.pool = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the connection pool
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            this.pool = new Pool({
                host: this.config.host,
                port: this.config.port,
                database: this.config.database,
                user: this.config.user,
                password: this.config.password,
                max: 5,  // Maximum connections in pool
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 10000,
                ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
            });

            // Test the connection
            const client = await this.pool.connect();
            await client.query('SELECT NOW()');
            client.release();

            // Create users table if it doesn't exist
            await this.createUsersTable();

            this.isInitialized = true;
            logInfo('RDS connection pool initialized successfully');
        } catch (error) {
            logError('Failed to initialize RDS connection pool', error);
            throw error;
        }
    }

    /**
     * Test database connection
     */
    async testConnection() {
        await this.initialize();
        
        try {
            const client = await this.pool.connect();
            const result = await client.query('SELECT NOW() as current_time, version() as version');
            client.release();
            
            return {
                status: 'connected',
                timestamp: result.rows[0].current_time,
                version: result.rows[0].version.split(' ')[0],
                host: this.config.host,
                database: this.config.database
            };
        } catch (error) {
            logError('RDS connection test failed', error);
            throw error;
        }
    }

    /**
     * Health check for RDS
     */
    async healthCheck() {
        try {
            const connectionInfo = await this.testConnection();
            const stats = await this.getConnectionStats();
            
            return {
                ...connectionInfo,
                connectionPool: stats
            };
        } catch (error) {
            throw new Error(`RDS health check failed: ${error.message}`);
        }
    }

    /**
     * Get connection pool statistics
     */
    async getConnectionStats() {
        if (!this.pool) return null;
        
        return {
            totalConnections: this.pool.totalCount,
            idleConnections: this.pool.idleCount,
            waitingClients: this.pool.waitingCount
        };
    }

    /**
     * Create users table if it doesn't exist
     */
    async createUsersTable() {
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                department VARCHAR(100),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);
            CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
        `;

        try {
            const client = await this.pool.connect();
            await client.query(createTableSQL);
            client.release();
            logInfo('Users table created/verified successfully');
        } catch (error) {
            logError('Error creating users table', error);
            throw error;
        }
    }

    /**
     * Create a new user
     */
    async createUser(user) {
        await this.initialize();

        const insertSQL = `
            INSERT INTO users (id, name, email, department, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;

        try {
            const client = await this.pool.connect();
            const result = await client.query(insertSQL, [
                user.id,
                user.name,
                user.email,
                user.department,
                user.created_at,
                user.updated_at
            ]);
            client.release();

            const createdUser = result.rows[0];
            logInfo('User created in RDS', { userId: createdUser.id, email: createdUser.email });
            
            return createdUser;
        } catch (error) {
            logError('Error creating user in RDS', error);
            throw error;
        }
    }

    /**
     * Get user by ID
     */
    async getUser(userId) {
        await this.initialize();

        const selectSQL = `
            SELECT id, name, email, department, created_at, updated_at
            FROM users 
            WHERE id = $1
        `;

        try {
            const client = await this.pool.connect();
            const result = await client.query(selectSQL, [userId]);
            client.release();

            if (result.rows.length === 0) {
                return null;
            }

            const user = result.rows[0];
            logInfo('User retrieved from RDS', { userId: user.id });
            
            return user;
        } catch (error) {
            logError('Error getting user from RDS', error);
            throw error;
        }
    }

    /**
     * Get user by email
     */
    async getUserByEmail(email) {
        await this.initialize();

        const selectSQL = `
            SELECT id, name, email, department, created_at, updated_at
            FROM users 
            WHERE email = $1
        `;

        try {
            const client = await this.pool.connect();
            const result = await client.query(selectSQL, [email]);
            client.release();

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0];
        } catch (error) {
            logError('Error getting user by email from RDS', error);
            throw error;
        }
    }

    /**
     * List users with pagination
     */
    async listUsers(limit = 10, offset = 0) {
        await this.initialize();

        const selectSQL = `
            SELECT id, name, email, department, created_at, updated_at
            FROM users 
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
        `;

        try {
            const client = await this.pool.connect();
            const result = await client.query(selectSQL, [limit, offset]);
            client.release();

            logInfo('Users listed from RDS', { count: result.rows.length, limit, offset });
            
            return result.rows;
        } catch (error) {
            logError('Error listing users from RDS', error);
            throw error;
        }
    }

    /**
     * Update user
     */
    async updateUser(userId, updates) {
        await this.initialize();

        const allowedFields = ['name', 'email', 'department'];
        const fields = Object.keys(updates).filter(field => allowedFields.includes(field));
        
        if (fields.length === 0) {
            throw new Error('No valid fields to update');
        }

        const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
        const values = fields.map(field => updates[field]);

        const updateSQL = `
            UPDATE users 
            SET ${setClause}, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `;

        try {
            const client = await this.pool.connect();
            const result = await client.query(updateSQL, [userId, ...values]);
            client.release();

            if (result.rows.length === 0) {
                return null;
            }

            const updatedUser = result.rows[0];
            logInfo('User updated in RDS', { userId: updatedUser.id });
            
            return updatedUser;
        } catch (error) {
            logError('Error updating user in RDS', error);
            throw error;
        }
    }

    /**
     * Delete user
     */
    async deleteUser(userId) {
        await this.initialize();

        const deleteSQL = `
            DELETE FROM users 
            WHERE id = $1
            RETURNING *
        `;

        try {
            const client = await this.pool.connect();
            const result = await client.query(deleteSQL, [userId]);
            client.release();

            if (result.rows.length === 0) {
                return null;
            }

            const deletedUser = result.rows[0];
            logInfo('User deleted from RDS', { userId: deletedUser.id });
            
            return deletedUser;
        } catch (error) {
            logError('Error deleting user from RDS', error);
            throw error;
        }
    }

    /**
     * Get user statistics
     */
    async getUserStats() {
        await this.initialize();

        const statsSQL = `
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN created_at >= NOW() - INTERVAL '1 day' THEN 1 END) as users_last_24h,
                COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as users_last_week,
                COUNT(DISTINCT department) as unique_departments
            FROM users
        `;

        try {
            const client = await this.pool.connect();
            const result = await client.query(statsSQL);
            client.release();

            return result.rows[0];
        } catch (error) {
            logError('Error getting user stats from RDS', error);
            throw error;
        }
    }

    /**
     * Clean up connections
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            logInfo('RDS connection pool closed');
        }
    }
}

module.exports = { RDSManager };
