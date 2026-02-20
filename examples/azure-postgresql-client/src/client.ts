import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  connectionLimit: number;
  timeout: number;
  sslMode: 'require' | 'verify-full' | 'disable';
}

interface UserRecord {
  id?: number;
  name: string;
  email: string;
  created_at?: Date;
}

/**
 * PostgreSQL Client for Azure Database for PostgreSQL Flexible Server
 * Demonstrates connection pooling, CRUD operations, and best practices
 */
class AzurePostgreSQLClient {
  private pool?: Pool;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * Connect to the Azure PostgreSQL database
   * Azure PostgreSQL requires SSL connections by default
   */
  async connect(): Promise<void> {
    console.log('🔌 Connecting to Azure PostgreSQL database...');
    console.log(`   Host: ${this.config.host}:${this.config.port}`);
    console.log(`   Database: ${this.config.database}`);
    console.log(`   User: ${this.config.user}`);
    console.log(`   SSL Mode: ${this.config.sslMode}`);

    const targetDatabase = this.config.database;

    // Configure SSL based on mode
    const sslConfig = this.config.sslMode === 'disable' 
      ? false 
      : { rejectUnauthorized: this.config.sslMode === 'verify-full' };

    // First, try to connect to the target database
    try {
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: targetDatabase,
        max: this.config.connectionLimit,
        connectionTimeoutMillis: this.config.timeout,
        idleTimeoutMillis: 30000,
        ssl: sslConfig
      });

      // Test connection to target database
      const client = await this.pool.connect();
      console.log(`✅ PostgreSQL connection established successfully to database: ${targetDatabase}`);
      client.release();

    } catch (error: any) {
      // If database doesn't exist (error code 3D000), try to create it
      if (error.code === '3D000' && targetDatabase !== 'postgres') {
        console.log(`⚠️  Database '${targetDatabase}' doesn't exist. Attempting to create it...`);

        // Connect to default postgres database to create the target database
        this.pool = new Pool({
          host: this.config.host,
          port: this.config.port,
          user: this.config.user,
          password: this.config.password,
          database: 'postgres',
          max: this.config.connectionLimit,
          connectionTimeoutMillis: this.config.timeout,
          idleTimeoutMillis: 30000,
          ssl: sslConfig
        });

        try {
          const client = await this.pool.connect();
          console.log('✅ Connected to default postgres database');

          // Create the target database
          await client.query(`CREATE DATABASE "${targetDatabase}"`);
          console.log(`✅ Database '${targetDatabase}' created successfully`);
          client.release();

          // Close connection to postgres database
          await this.pool.end();

          // Now connect to the newly created database
          this.pool = new Pool({
            host: this.config.host,
            port: this.config.port,
            user: this.config.user,
            password: this.config.password,
            database: targetDatabase,
            max: this.config.connectionLimit,
            connectionTimeoutMillis: this.config.timeout,
            idleTimeoutMillis: 30000,
            ssl: sslConfig
          });

          const newClient = await this.pool.connect();
          console.log(`✅ Connected to newly created database: ${targetDatabase}`);
          newClient.release();

        } catch (createError) {
          console.error('❌ Failed to create database:', createError);
          throw createError;
        }
      } else {
        console.error('❌ Failed to connect to PostgreSQL:', error);
        throw error;
      }
    }
  }

  /**
   * Disconnect from the database
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      console.log('🔌 PostgreSQL connection closed');
    }
  }

  /**
   * Create the demo users table
   */
  async createTable(tableName: string): Promise<void> {
    if (!this.pool) throw new Error('Not connected to database');

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    try {
      const client = await this.pool.connect();
      await client.query(createTableSQL);
      client.release();
      console.log(`✅ Table '${tableName}' created/verified successfully`);
    } catch (error) {
      console.error('❌ Error creating table:', error);
      throw error;
    }
  }

  /**
   * Insert a new user record
   */
  async insertUser(tableName: string, user: Omit<UserRecord, 'id' | 'created_at'>): Promise<number> {
    if (!this.pool) throw new Error('Not connected to database');

    const insertSQL = `INSERT INTO ${tableName} (name, email) VALUES ($1, $2) RETURNING id`;

    try {
      const client = await this.pool.connect();
      const result = await client.query(insertSQL, [user.name, user.email]);
      client.release();
      const userId = result.rows[0].id;
      console.log(`✅ User inserted with ID: ${userId}`);
      return userId;
    } catch (error) {
      console.error('❌ Error inserting user:', error);
      throw error;
    }
  }

  /**
   * Get all users from the table
   */
  async getUsers(tableName: string): Promise<UserRecord[]> {
    if (!this.pool) throw new Error('Not connected to database');

    const selectSQL = `SELECT * FROM ${tableName} ORDER BY created_at DESC`;

    try {
      const client = await this.pool.connect();
      const result = await client.query(selectSQL);
      client.release();
      return result.rows;
    } catch (error) {
      console.error('❌ Error fetching users:', error);
      throw error;
    }
  }

  /**
   * Get a user by ID
   */
  async getUserById(tableName: string, id: number): Promise<UserRecord | null> {
    if (!this.pool) throw new Error('Not connected to database');

    const selectSQL = `SELECT * FROM ${tableName} WHERE id = $1`;

    try {
      const client = await this.pool.connect();
      const result = await client.query(selectSQL, [id]);
      client.release();
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error('❌ Error fetching user by ID:', error);
      throw error;
    }
  }

  /**
   * Update a user record
   */
  async updateUser(tableName: string, id: number, updates: Partial<Omit<UserRecord, 'id' | 'created_at'>>): Promise<boolean> {
    if (!this.pool) throw new Error('Not connected to database');

    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');

    const updateSQL = `UPDATE ${tableName} SET ${setClause} WHERE id = $${fields.length + 1}`;

    try {
      const client = await this.pool.connect();
      const result = await client.query(updateSQL, [...values, id]);
      client.release();
      return result.rowCount! > 0;
    } catch (error) {
      console.error('❌ Error updating user:', error);
      throw error;
    }
  }

  /**
   * Delete a user record
   */
  async deleteUser(tableName: string, id: number): Promise<boolean> {
    if (!this.pool) throw new Error('Not connected to database');

    const deleteSQL = `DELETE FROM ${tableName} WHERE id = $1`;

    try {
      const client = await this.pool.connect();
      const result = await client.query(deleteSQL, [id]);
      client.release();
      return result.rowCount! > 0;
    } catch (error) {
      console.error('❌ Error deleting user:', error);
      throw error;
    }
  }

  /**
   * Get table structure information
   */
  async getTableInfo(tableName: string): Promise<any> {
    if (!this.pool) throw new Error('Not connected to database');

    const infoSQL = `
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = $1 
      ORDER BY ordinal_position
    `;

    try {
      const client = await this.pool.connect();
      const result = await client.query(infoSQL, [tableName]);
      client.release();
      return result.rows;
    } catch (error) {
      console.error('❌ Error getting table info:', error);
      throw error;
    }
  }

  /**
   * Get database server version
   */
  async getServerVersion(): Promise<string> {
    if (!this.pool) throw new Error('Not connected to database');

    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT version()');
      client.release();
      return result.rows[0].version;
    } catch (error) {
      console.error('❌ Error getting server version:', error);
      throw error;
    }
  }
}

/**
 * Demo application that demonstrates Azure PostgreSQL operations
 */
class AzurePostgreSQLDemo {
  private dbClient: AzurePostgreSQLClient;
  private config: DatabaseConfig;
  private tableName: string;
  private isRunning: boolean = false;

  constructor(config: DatabaseConfig, tableName: string) {
    this.config = config;
    this.tableName = tableName;
    this.dbClient = new AzurePostgreSQLClient(config);
  }

  async start(): Promise<void> {
    this.isRunning = true;
    console.log('🚀 Azure PostgreSQL Client Demo started');
    console.log('🗄️  Engine: PostgreSQL (Azure Flexible Server)');
    console.log('========================================');

    try {
      // Connect to database
      await this.dbClient.connect();

      // Show server version
      const version = await this.dbClient.getServerVersion();
      console.log(`📊 Server Version: ${version}`);

      // Create table
      await this.dbClient.createTable(this.tableName);

      // Show table structure
      await this.showTableInfo();

      // Run demo operations
      await this.runDemoOperations();

      // Keep running and perform periodic operations
      while (this.isRunning) {
        await this.sleep(parseInt(process.env.OPERATION_INTERVAL_MS || '10000'));
        await this.showCurrentData();
      }

    } catch (error) {
      console.error('❌ Fatal error in Azure PostgreSQL client:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping Azure PostgreSQL Client Demo...');
    this.isRunning = false;
    await this.dbClient.disconnect();
  }

  private async showTableInfo(): Promise<void> {
    console.log('\n📋 Table Structure:');
    try {
      const tableInfo = await this.dbClient.getTableInfo(this.tableName);
      console.table(tableInfo);
    } catch (error) {
      console.error('❌ Error showing table info:', error);
    }
  }

  private async runDemoOperations(): Promise<void> {
    console.log('\n🔄 Running demo operations...');

    try {
      // Insert sample users
      const sampleUsers = [
        { name: 'Alice Johnson', email: 'alice.johnson@example.com' },
        { name: 'Bob Smith', email: 'bob.smith@example.com' },
        { name: 'Carol Williams', email: 'carol.williams@example.com' },
        { name: 'David Brown', email: 'david.brown@example.com' },
        { name: 'Eve Davis', email: 'eve.davis@example.com' }
      ];

      console.log('\n➕ Inserting sample users...');
      const userIds: number[] = [];
      for (const user of sampleUsers) {
        try {
          const userId = await this.dbClient.insertUser(this.tableName, user);
          userIds.push(userId);
        } catch (error) {
          // Skip if user already exists (unique constraint)
          if (error instanceof Error && error.message.includes('duplicate')) {
            console.log(`⚠️  User ${user.email} already exists, skipping...`);
          } else {
            throw error;
          }
        }
      }

      // Show all users
      await this.showCurrentData();

      if (userIds.length > 0) {
        // Update a user
        console.log('\n📝 Updating user...');
        const updateSuccess = await this.dbClient.updateUser(this.tableName, userIds[0], {
          name: 'Alice Johnson Updated',
          email: 'alice.johnson.updated@example.com'
        });
        console.log(`Update result: ${updateSuccess ? 'Success' : 'Failed'}`);

        // Get specific user
        console.log('\n🔍 Getting user by ID...');
        const user = await this.dbClient.getUserById(this.tableName, userIds[0]);
        if (user) {
          console.log('Found user:', user);
        } else {
          console.log('User not found');
        }

        // Delete a user
        console.log('\n🗑️  Deleting user...');
        const deleteSuccess = await this.dbClient.deleteUser(this.tableName, userIds[userIds.length - 1]);
        console.log(`Delete result: ${deleteSuccess ? 'Success' : 'Failed'}`);
      }

      // Final state
      await this.showCurrentData();

    } catch (error) {
      console.error('❌ Error in demo operations:', error);
    }
  }

  private async showCurrentData(): Promise<void> {
    console.log('\n📊 Current Users:');
    try {
      const users = await this.dbClient.getUsers(this.tableName);
      if (users.length > 0) {
        console.table(users);
        console.log(`Total users: ${users.length}`);
      } else {
        console.log('No users found');
      }
    } catch (error) {
      console.error('❌ Error fetching users:', error);
    }
    console.log('----------------------------------------');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Main function to start the Azure PostgreSQL client demo
 */
async function main() {
  // Configuration from environment variables
  const config: DatabaseConfig = {
    host: process.env.DB_HOST || '',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10'),
    timeout: parseInt(process.env.DB_TIMEOUT || '10000'),
    sslMode: (process.env.DB_SSL_MODE as 'require' | 'verify-full' | 'disable') || 'require'
  };

  const tableName = process.env.SAMPLE_TABLE_NAME || 'demo_users';

  // Validate required configuration
  const requiredFields: (keyof DatabaseConfig)[] = ['host', 'user', 'password'];
  for (const field of requiredFields) {
    if (!config[field]) {
      console.error(`❌ DB_${field.toUpperCase()} environment variable is required`);
      process.exit(1);
    }
  }

  console.log('📋 Configuration:');
  console.log(`   Host: ${config.host}`);
  console.log(`   Port: ${config.port}`);
  console.log(`   Database: ${config.database}`);
  console.log(`   User: ${config.user}`);
  console.log(`   SSL Mode: ${config.sslMode}`);
  console.log(`   Table Name: ${tableName}`);
  console.log('');

  const demo = new AzurePostgreSQLDemo(config, tableName);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🔄 Received SIGINT, shutting down gracefully...');
    await demo.stop();
    setTimeout(() => {
      console.log('👋 Azure PostgreSQL Client stopped');
      process.exit(0);
    }, 1000);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🔄 Received SIGTERM, shutting down gracefully...');
    await demo.stop();
    setTimeout(() => {
      console.log('👋 Azure PostgreSQL Client stopped');
      process.exit(0);
    }, 1000);
  });

  // Start the demo
  try {
    await demo.start();
  } catch (error) {
    console.error('❌ Fatal error starting Azure PostgreSQL client:', error);
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}
