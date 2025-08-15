import mysql from 'mysql2/promise';
import { Pool as PostgreSQLPool } from 'pg';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  engine: 'mysql' | 'postgresql';
  connectionLimit: number;
  timeout: number;
}

interface UserRecord {
  id?: number;
  name: string;
  email: string;
  created_at?: Date;
}

abstract class DatabaseClient {
  protected config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract createTable(): Promise<void>;
  abstract insertUser(user: Omit<UserRecord, 'id' | 'created_at'>): Promise<number>;
  abstract getUsers(): Promise<UserRecord[]>;
  abstract getUserById(id: number): Promise<UserRecord | null>;
  abstract updateUser(id: number, updates: Partial<Omit<UserRecord, 'id' | 'created_at'>>): Promise<boolean>;
  abstract deleteUser(id: number): Promise<boolean>;
  abstract getTableInfo(): Promise<any>;
}

class MySQLClient extends DatabaseClient {
  private pool?: mysql.Pool;

  async connect(): Promise<void> {
    console.log('🔌 Connecting to MySQL database...');
    console.log(`   Host: ${this.config.host}:${this.config.port}`);
    console.log(`   Database: ${this.config.database}`);
    console.log(`   User: ${this.config.user}`);

    // First, connect without specifying database to create it if needed
    const tempPool = mysql.createPool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      connectionLimit: 1
    });

    try {
      console.log('🔧 Ensuring database exists...');
      const connection = await tempPool.getConnection();
      
      // Create database if it doesn't exist
      await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${this.config.database}\``);
      console.log(`✅ Database '${this.config.database}' is ready`);
      
      connection.release();
      await tempPool.end();
    } catch (error) {
      await tempPool.end();
      console.error('❌ Failed to ensure database exists:', error);
      throw error;
    }

    // Now connect to the specific database
    this.pool = mysql.createPool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      connectionLimit: this.config.connectionLimit
    });

    // Test connection to the specific database
    try {
      const connection = await this.pool.getConnection();
      console.log('✅ MySQL connection established successfully');
      connection.release();
    } catch (error) {
      console.error('❌ Failed to connect to MySQL:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      console.log('🔌 MySQL connection closed');
    }
  }

  async createTable(): Promise<void> {
    if (!this.pool) throw new Error('Not connected to database');

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${process.env.SAMPLE_TABLE_NAME || 'users'} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `;

    try {
      await this.pool.execute(createTableSQL);
      console.log(`✅ Table '${process.env.SAMPLE_TABLE_NAME || 'users'}' created/verified successfully`);
    } catch (error) {
      console.error('❌ Error creating table:', error);
      throw error;
    }
  }

  async insertUser(user: Omit<UserRecord, 'id' | 'created_at'>): Promise<number> {
    if (!this.pool) throw new Error('Not connected to database');

    const insertSQL = `INSERT INTO ${process.env.SAMPLE_TABLE_NAME || 'users'} (name, email) VALUES (?, ?)`;
    
    try {
      const [result] = await this.pool.execute(insertSQL, [user.name, user.email]) as mysql.ResultSetHeader[];
      console.log(`✅ User inserted with ID: ${result.insertId}`);
      return result.insertId;
    } catch (error) {
      console.error('❌ Error inserting user:', error);
      throw error;
    }
  }

  async getUsers(): Promise<UserRecord[]> {
    if (!this.pool) throw new Error('Not connected to database');

    const selectSQL = `SELECT * FROM ${process.env.SAMPLE_TABLE_NAME || 'users'} ORDER BY created_at DESC`;
    
    try {
      const [rows] = await this.pool.execute(selectSQL) as mysql.RowDataPacket[][];
      return rows as UserRecord[];
    } catch (error) {
      console.error('❌ Error fetching users:', error);
      throw error;
    }
  }

  async getUserById(id: number): Promise<UserRecord | null> {
    if (!this.pool) throw new Error('Not connected to database');

    const selectSQL = `SELECT * FROM ${process.env.SAMPLE_TABLE_NAME || 'users'} WHERE id = ?`;
    
    try {
      const [rows] = await this.pool.execute(selectSQL, [id]) as mysql.RowDataPacket[][];
      return rows.length > 0 ? rows[0] as UserRecord : null;
    } catch (error) {
      console.error('❌ Error fetching user by ID:', error);
      throw error;
    }
  }

  async updateUser(id: number, updates: Partial<Omit<UserRecord, 'id' | 'created_at'>>): Promise<boolean> {
    if (!this.pool) throw new Error('Not connected to database');

    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    
    const updateSQL = `UPDATE ${process.env.SAMPLE_TABLE_NAME || 'users'} SET ${setClause} WHERE id = ?`;
    
    try {
      const [result] = await this.pool.execute(updateSQL, [...values, id]) as mysql.ResultSetHeader[];
      return result.affectedRows > 0;
    } catch (error) {
      console.error('❌ Error updating user:', error);
      throw error;
    }
  }

  async deleteUser(id: number): Promise<boolean> {
    if (!this.pool) throw new Error('Not connected to database');

    const deleteSQL = `DELETE FROM ${process.env.SAMPLE_TABLE_NAME || 'users'} WHERE id = ?`;
    
    try {
      const [result] = await this.pool.execute(deleteSQL, [id]) as mysql.ResultSetHeader[];
      return result.affectedRows > 0;
    } catch (error) {
      console.error('❌ Error deleting user:', error);
      throw error;
    }
  }

  async getTableInfo(): Promise<any> {
    if (!this.pool) throw new Error('Not connected to database');

    const infoSQL = `DESCRIBE ${process.env.SAMPLE_TABLE_NAME || 'users'}`;
    
    try {
      const [rows] = await this.pool.execute(infoSQL) as mysql.RowDataPacket[][];
      return rows;
    } catch (error) {
      console.error('❌ Error getting table info:', error);
      throw error;
    }
  }
}

class PostgreSQLClient extends DatabaseClient {
  private pool?: PostgreSQLPool;

  async connect(): Promise<void> {
    console.log('🔌 Connecting to PostgreSQL database...');
    console.log(`   Host: ${this.config.host}:${this.config.port}`);
    console.log(`   Database: ${this.config.database}`);
    console.log(`   User: ${this.config.user}`);
    console.log('   SSL: Required (AWS RDS default)');
    
    // For PostgreSQL, if the target database doesn't exist, we'll try to create it
    // by first connecting to the default 'postgres' database
    let targetDatabase = this.config.database;
    let shouldCreateDatabase = false;

    // First, try to connect to the target database
    try {
      this.pool = new PostgreSQLPool({
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: targetDatabase,
        max: this.config.connectionLimit,
        connectionTimeoutMillis: this.config.timeout,
        idleTimeoutMillis: 30000,
        // AWS RDS requires SSL connections
        ssl: {
          rejectUnauthorized: false // For RDS, we accept the certificate
        }
      });

      // Test connection to target database
      const client = await this.pool.connect();
      console.log(`✅ PostgreSQL connection established successfully to database: ${targetDatabase}`);
      client.release();
      
    } catch (error: any) {
      // If database doesn't exist (error code 3D000), try to create it
      if (error.code === '3D000' && targetDatabase !== 'postgres') {
        console.log(`⚠️  Database '${targetDatabase}' doesn't exist. Attempting to create it...`);
        shouldCreateDatabase = true;
        
        // Connect to default postgres database to create the target database
        this.pool = new PostgreSQLPool({
          host: this.config.host,
          port: this.config.port,
          user: this.config.user,
          password: this.config.password,
          database: 'postgres', // Connect to default database
          max: this.config.connectionLimit,
          connectionTimeoutMillis: this.config.timeout,
          idleTimeoutMillis: 30000,
          ssl: {
            rejectUnauthorized: false
          }
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
          this.pool = new PostgreSQLPool({
            host: this.config.host,
            port: this.config.port,
            user: this.config.user,
            password: this.config.password,
            database: targetDatabase,
            max: this.config.connectionLimit,
            connectionTimeoutMillis: this.config.timeout,
            idleTimeoutMillis: 30000,
            ssl: {
              rejectUnauthorized: false
            }
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

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      console.log('🔌 PostgreSQL connection closed');
    }
  }

  async createTable(): Promise<void> {
    if (!this.pool) throw new Error('Not connected to database');

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${process.env.SAMPLE_TABLE_NAME || 'users'} (
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
      console.log(`✅ Table '${process.env.SAMPLE_TABLE_NAME || 'users'}' created/verified successfully`);
    } catch (error) {
      console.error('❌ Error creating table:', error);
      throw error;
    }
  }

  async insertUser(user: Omit<UserRecord, 'id' | 'created_at'>): Promise<number> {
    if (!this.pool) throw new Error('Not connected to database');

    const insertSQL = `INSERT INTO ${process.env.SAMPLE_TABLE_NAME || 'users'} (name, email) VALUES ($1, $2) RETURNING id`;
    
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

  async getUsers(): Promise<UserRecord[]> {
    if (!this.pool) throw new Error('Not connected to database');

    const selectSQL = `SELECT * FROM ${process.env.SAMPLE_TABLE_NAME || 'users'} ORDER BY created_at DESC`;
    
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

  async getUserById(id: number): Promise<UserRecord | null> {
    if (!this.pool) throw new Error('Not connected to database');

    const selectSQL = `SELECT * FROM ${process.env.SAMPLE_TABLE_NAME || 'users'} WHERE id = $1`;
    
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

  async updateUser(id: number, updates: Partial<Omit<UserRecord, 'id' | 'created_at'>>): Promise<boolean> {
    if (!this.pool) throw new Error('Not connected to database');

    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    
    const updateSQL = `UPDATE ${process.env.SAMPLE_TABLE_NAME || 'users'} SET ${setClause} WHERE id = $${fields.length + 1}`;
    
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

  async deleteUser(id: number): Promise<boolean> {
    if (!this.pool) throw new Error('Not connected to database');

    const deleteSQL = `DELETE FROM ${process.env.SAMPLE_TABLE_NAME || 'users'} WHERE id = $1`;
    
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

  async getTableInfo(): Promise<any> {
    if (!this.pool) throw new Error('Not connected to database');

    const infoSQL = `
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = $1 
      ORDER BY ordinal_position
    `;
    
    try {
      const client = await this.pool.connect();
      const result = await client.query(infoSQL, [process.env.SAMPLE_TABLE_NAME || 'users']);
      client.release();
      return result.rows;
    } catch (error) {
      console.error('❌ Error getting table info:', error);
      throw error;
    }
  }
}

class RDSClientDemo {
  private dbClient: DatabaseClient;
  private config: DatabaseConfig;
  private isRunning: boolean = false;

  constructor(config: DatabaseConfig) {
    this.config = config;
    if (config.engine === 'mysql') {
      this.dbClient = new MySQLClient(config);
    } else if (config.engine === 'postgresql') {
      this.dbClient = new PostgreSQLClient(config);
    } else {
      throw new Error(`Unsupported database engine: ${config.engine}`);
    }
  }

  async start(): Promise<void> {
    this.isRunning = true;
    console.log('🚀 RDS Client Demo started');
    console.log(`🗄️  Engine: ${this.config.engine}`);
    console.log('========================================');

    try {
      // Connect to database
      await this.dbClient.connect();

      // Create table
      await this.dbClient.createTable();

      // Show table structure
      await this.showTableInfo();

      // Run demo operations
      await this.runDemoOperations();

      // Keep running and perform periodic operations
      while (this.isRunning) {
        await this.sleep(parseInt(process.env.OPERATION_INTERVAL_MS || '5000'));
        await this.showCurrentData();
      }

    } catch (error) {
      console.error('❌ Fatal error in RDS client:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    console.log('🛑 Stopping RDS Client Demo...');
    this.isRunning = false;
    await this.dbClient.disconnect();
  }

  private async showTableInfo(): Promise<void> {
    console.log('\n📋 Table Structure:');
    try {
      const tableInfo = await this.dbClient.getTableInfo();
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
        { name: 'John Doe', email: 'john.doe@example.com' },
        { name: 'Jane Smith', email: 'jane.smith@example.com' },
        { name: 'Bob Johnson', email: 'bob.johnson@example.com' },
        { name: 'Alice Williams', email: 'alice.williams@example.com' },
        { name: 'Charlie Brown', email: 'charlie.brown@example.com' }
      ];

      console.log('\n➕ Inserting sample users...');
      const userIds: number[] = [];
      for (const user of sampleUsers) {
        try {
          const userId = await this.dbClient.insertUser(user);
          userIds.push(userId);
        } catch (error) {
          // Skip if user already exists (unique constraint)
          if (error instanceof Error && error.message.includes('Duplicate') || 
              error instanceof Error && error.message.includes('duplicate')) {
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
        const updateSuccess = await this.dbClient.updateUser(userIds[0], {
          name: 'John Doe Updated',
          email: 'john.doe.updated@example.com'
        });
        console.log(`Update result: ${updateSuccess ? 'Success' : 'Failed'}`);

        // Get specific user
        console.log('\n🔍 Getting user by ID...');
        const user = await this.dbClient.getUserById(userIds[0]);
        if (user) {
          console.log('Found user:', user);
        } else {
          console.log('User not found');
        }

        // Delete a user
        console.log('\n🗑️  Deleting user...');
        const deleteSuccess = await this.dbClient.deleteUser(userIds[userIds.length - 1]);
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
      const users = await this.dbClient.getUsers();
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
 * Main function to start the RDS client demo
 */
async function main() {
  // Configuration from environment variables
  const config: DatabaseConfig = {
    host: process.env.DB_HOST || '',
    port: parseInt(process.env.DB_PORT || '3306'),
    database: process.env.DB_NAME || '',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    engine: (process.env.DB_ENGINE as 'mysql' | 'postgresql') || 'mysql',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10'),
    timeout: parseInt(process.env.DB_TIMEOUT || '10000')
  };

  // Validate required configuration
  const requiredFields = ['host', 'database', 'user', 'password'];
  for (const field of requiredFields) {
    if (!config[field as keyof DatabaseConfig]) {
      console.error(`❌ DB_${field.toUpperCase()} environment variable is required`);
      process.exit(1);
    }
  }

  // Validate engine
  if (!['mysql', 'postgresql'].includes(config.engine)) {
    console.error('❌ DB_ENGINE must be either "mysql" or "postgresql"');
    process.exit(1);
  }

  const client = new RDSClientDemo(config);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🔄 Received SIGINT, shutting down gracefully...');
    await client.stop();
    setTimeout(() => {
      console.log('👋 RDS Client stopped');
      process.exit(0);
    }, 1000);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🔄 Received SIGTERM, shutting down gracefully...');
    await client.stop();
    setTimeout(() => {
      console.log('👋 RDS Client stopped');
      process.exit(0);
    }, 1000);
  });

  // Start the client
  try {
    await client.start();
  } catch (error) {
    console.error('❌ Fatal error starting RDS client:', error);
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