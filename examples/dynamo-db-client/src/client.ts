import { DynamoDBClient as AWSDynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  DeleteCommand, 
  ScanCommand, 
  UpdateCommand,
  QueryCommand 
} from '@aws-sdk/lib-dynamodb';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface ClientConfig {
  tableName: string;
  region: string;
  operationIntervalMs: number;
  maxOperations?: number;
}

interface User {
  id: string;
  name: string;
  email: string;
  age: number;
  department?: string;
  createdAt: string;
  updatedAt: string;
}

class DynamoDBClient {
  private docClient: DynamoDBDocumentClient;
  private config: ClientConfig;
  private isRunning: boolean = false;
  private operationCount: number = 0;

  constructor(config: ClientConfig) {
    this.config = config;
    
    const dynamoClient = new AWSDynamoDBClient({ 
      region: config.region,
      // AWS credentials will be automatically picked up from environment or IAM role
    });
    
    this.docClient = DynamoDBDocumentClient.from(dynamoClient);
  }

  /**
   * Start the client to demonstrate various DynamoDB operations
   */
  async start(): Promise<void> {
    this.isRunning = true;
    console.log(`🚀 DynamoDB Client started`);
    console.log(`📍 Table Name: ${this.config.tableName}`);
    console.log(`🌍 Region: ${this.config.region}`);
    console.log(`⏱️  Operation interval: ${this.config.operationIntervalMs}ms`);
    if (this.config.maxOperations) {
      console.log(`🔄 Max operations: ${this.config.maxOperations}`);
    }
    console.log('----------------------------------------');

    // Demonstrate various operations
    await this.demonstrateOperations();
  }

  /**
   * Stop the client
   */
  stop(): void {
    console.log('🛑 Stopping DynamoDB Client...');
    this.isRunning = false;
  }

  /**
   * Demonstrate various DynamoDB operations
   */
  private async demonstrateOperations(): Promise<void> {
    const operations = [
      () => this.putItemDemo(),
      () => this.getItemDemo(),
      () => this.updateItemDemo(),
      () => this.queryItemsDemo(),
      () => this.scanTableDemo(),
      () => this.deleteItemDemo(),
      () => this.batchOperationsDemo(),
    ];

    while (this.isRunning) {
      if (this.config.maxOperations && this.operationCount >= this.config.maxOperations) {
        console.log(`✅ Completed ${this.operationCount} operations. Stopping...`);
        break;
      }

      try {
        // Pick a random operation to demonstrate
        const operation = operations[Math.floor(Math.random() * operations.length)];
        await operation();
        
        this.operationCount++;
        
        // Wait before next operation
        await this.sleep(this.config.operationIntervalMs);
      } catch (error) {
        console.error('❌ Error in operation cycle:', error);
        await this.sleep(this.config.operationIntervalMs);
      }
    }
  }

  /**
   * Demonstrate putting an item into the table
   */
  private async putItemDemo(): Promise<void> {
    const user: User = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: this.generateRandomName(),
      email: this.generateRandomEmail(),
      age: Math.floor(Math.random() * 50) + 20,
      department: this.generateRandomDepartment(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    console.log('📝 PUT ITEM Operation:');
    console.log(`   Creating user: ${user.name} (${user.email})`);

    try {
      const command = new PutCommand({
        TableName: this.config.tableName,
        Item: user,
        // Prevent overwriting existing items
        ConditionExpression: 'attribute_not_exists(id)'
      });

      const response = await this.docClient.send(command);
      console.log('   ✅ Item created successfully');
      console.log(`   📊 Consumed Capacity: ${response.ConsumedCapacity?.CapacityUnits || 'N/A'}`);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        console.log('   ⚠️  Item already exists (condition failed)');
      } else {
        console.error('   ❌ Error putting item:', error.message);
        throw error;
      }
    }
    
    console.log('----------------------------------------');
  }

  /**
   * Demonstrate getting an item from the table
   */
  private async getItemDemo(): Promise<void> {
    // First scan to get an existing item ID
    const scanCommand = new ScanCommand({
      TableName: this.config.tableName,
      Limit: 1
    });

    console.log('📖 GET ITEM Operation:');

    try {
      const scanResponse = await this.docClient.send(scanCommand);
      
      if (!scanResponse.Items || scanResponse.Items.length === 0) {
        console.log('   📭 No items found in table to retrieve');
        console.log('----------------------------------------');
        return;
      }

      const existingItem = scanResponse.Items[0];
      console.log(`   Retrieving user: ${existingItem.id}`);

      const getCommand = new GetCommand({
        TableName: this.config.tableName,
        Key: { id: existingItem.id },
        // Specify attributes to retrieve
        ProjectionExpression: 'id, #name, email, age, department, createdAt, updatedAt',
        ExpressionAttributeNames: {
          '#name': 'name'  // 'name' is a reserved word in DynamoDB
        }
      });

      const response = await this.docClient.send(getCommand);
      
      if (response.Item) {
        const user = response.Item as User;
        console.log('   ✅ Item retrieved successfully:');
        console.log(`      Name: ${user.name}`);
        console.log(`      Email: ${user.email}`);
        console.log(`      Age: ${user.age}`);
        console.log(`      Department: ${user.department || 'N/A'}`);
        console.log(`      Created: ${user.createdAt}`);
        console.log(`   📊 Consumed Capacity: ${response.ConsumedCapacity?.CapacityUnits || 'N/A'}`);
      } else {
        console.log('   📭 Item not found');
      }
    } catch (error: any) {
      console.error('   ❌ Error getting item:', error.message);
      throw error;
    }
    
    console.log('----------------------------------------');
  }

  /**
   * Demonstrate updating an item in the table
   */
  private async updateItemDemo(): Promise<void> {
    // First scan to get an existing item ID
    const scanCommand = new ScanCommand({
      TableName: this.config.tableName,
      Limit: 1
    });

    console.log('📝 UPDATE ITEM Operation:');

    try {
      const scanResponse = await this.docClient.send(scanCommand);
      
      if (!scanResponse.Items || scanResponse.Items.length === 0) {
        console.log('   📭 No items found in table to update');
        console.log('----------------------------------------');
        return;
      }

      const existingItem = scanResponse.Items[0];
      console.log(`   Updating user: ${existingItem.id}`);

      const updateCommand = new UpdateCommand({
        TableName: this.config.tableName,
        Key: { id: existingItem.id },
        UpdateExpression: 'SET age = :newAge, updatedAt = :timestamp, department = :dept',
        ExpressionAttributeValues: {
          ':newAge': existingItem.age + 1,
          ':timestamp': new Date().toISOString(),
          ':dept': this.generateRandomDepartment()
        },
        ReturnValues: 'ALL_NEW'
      });

      const response = await this.docClient.send(updateCommand);
      
      if (response.Attributes) {
        const updatedUser = response.Attributes as User;
        console.log('   ✅ Item updated successfully:');
        console.log(`      New Age: ${updatedUser.age}`);
        console.log(`      New Department: ${updatedUser.department}`);
        console.log(`      Updated At: ${updatedUser.updatedAt}`);
        console.log(`   📊 Consumed Capacity: ${response.ConsumedCapacity?.CapacityUnits || 'N/A'}`);
      }
    } catch (error: any) {
      console.error('   ❌ Error updating item:', error.message);
      throw error;
    }
    
    console.log('----------------------------------------');
  }

  /**
   * Demonstrate querying items (if using GSI or different key structure)
   */
  private async queryItemsDemo(): Promise<void> {
    console.log('🔍 QUERY ITEMS Operation (by department):');

    try {
      const departments = ['Engineering', 'Marketing', 'Sales', 'HR'];
      const randomDept = departments[Math.floor(Math.random() * departments.length)];
      
      // Note: This would require a GSI on department. For demo purposes, we'll scan with filter
      const command = new ScanCommand({
        TableName: this.config.tableName,
        FilterExpression: 'department = :dept',
        ExpressionAttributeValues: {
          ':dept': randomDept
        },
        Limit: 5
      });

      const response = await this.docClient.send(command);
      
      console.log(`   Searching for users in ${randomDept} department`);
      
      if (response.Items && response.Items.length > 0) {
        console.log(`   ✅ Found ${response.Items.length} user(s):`);
        response.Items.forEach((item, index) => {
          const user = item as User;
          console.log(`      ${index + 1}. ${user.name} (${user.email})`);
        });
      } else {
        console.log(`   📭 No users found in ${randomDept} department`);
      }
      
      console.log(`   📊 Scanned Items: ${response.ScannedCount || 0}`);
      console.log(`   📊 Consumed Capacity: ${response.ConsumedCapacity?.CapacityUnits || 'N/A'}`);
    } catch (error: any) {
      console.error('   ❌ Error querying items:', error.message);
      throw error;
    }
    
    console.log('----------------------------------------');
  }

  /**
   * Demonstrate scanning the table
   */
  private async scanTableDemo(): Promise<void> {
    console.log('🔍 SCAN TABLE Operation:');

    try {
      const command = new ScanCommand({
        TableName: this.config.tableName,
        Limit: 5,
        Select: 'COUNT'  // Just count items
      });

      const response = await this.docClient.send(command);
      
      console.log(`   ✅ Scan completed`);
      console.log(`   📊 Items Count: ${response.Count || 0}`);
      console.log(`   📊 Scanned Count: ${response.ScannedCount || 0}`);
      console.log(`   📊 Consumed Capacity: ${response.ConsumedCapacity?.CapacityUnits || 'N/A'}`);
      
      if (response.LastEvaluatedKey) {
        console.log('   📄 More items available (has LastEvaluatedKey)');
      }
    } catch (error: any) {
      console.error('   ❌ Error scanning table:', error.message);
      throw error;
    }
    
    console.log('----------------------------------------');
  }

  /**
   * Demonstrate deleting an item from the table
   */
  private async deleteItemDemo(): Promise<void> {
    // First scan to get an existing item ID
    const scanCommand = new ScanCommand({
      TableName: this.config.tableName,
      Limit: 1
    });

    console.log('🗑️  DELETE ITEM Operation:');

    try {
      const scanResponse = await this.docClient.send(scanCommand);
      
      if (!scanResponse.Items || scanResponse.Items.length === 0) {
        console.log('   📭 No items found in table to delete');
        console.log('----------------------------------------');
        return;
      }

      const itemToDelete = scanResponse.Items[0];
      console.log(`   Deleting user: ${itemToDelete.id} (${itemToDelete.name})`);

      const deleteCommand = new DeleteCommand({
        TableName: this.config.tableName,
        Key: { id: itemToDelete.id },
        ReturnValues: 'ALL_OLD'
      });

      const response = await this.docClient.send(deleteCommand);
      
      if (response.Attributes) {
        const deletedUser = response.Attributes as User;
        console.log('   ✅ Item deleted successfully:');
        console.log(`      Deleted: ${deletedUser.name} (${deletedUser.email})`);
        console.log(`   📊 Consumed Capacity: ${response.ConsumedCapacity?.CapacityUnits || 'N/A'}`);
      } else {
        console.log('   📭 Item was already deleted or did not exist');
      }
    } catch (error: any) {
      console.error('   ❌ Error deleting item:', error.message);
      throw error;
    }
    
    console.log('----------------------------------------');
  }

  /**
   * Demonstrate batch operations
   */
  private async batchOperationsDemo(): Promise<void> {
    console.log('📦 BATCH OPERATIONS Demo:');
    
    try {
      // Create multiple items at once
      const users: User[] = [];
      for (let i = 0; i < 3; i++) {
        users.push({
          id: `batch-user-${Date.now()}-${i}`,
          name: this.generateRandomName(),
          email: this.generateRandomEmail(),
          age: Math.floor(Math.random() * 50) + 20,
          department: this.generateRandomDepartment(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      console.log(`   Creating ${users.length} users in batch:`);
      
      // Note: For true batch operations, you'd use BatchWriteCommand
      // For simplicity, we'll create them sequentially but quickly
      for (const user of users) {
        const command = new PutCommand({
          TableName: this.config.tableName,
          Item: user
        });
        
        await this.docClient.send(command);
        console.log(`      ✅ Created: ${user.name}`);
      }
      
      console.log('   ✅ Batch operation completed');
    } catch (error: any) {
      console.error('   ❌ Error in batch operations:', error.message);
      throw error;
    }
    
    console.log('----------------------------------------');
  }

  /**
   * Generate random name for demo data
   */
  private generateRandomName(): string {
    const firstNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Edward', 'Fiona', 'George', 'Helen'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];
    
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    
    return `${firstName} ${lastName}`;
  }

  /**
   * Generate random email for demo data
   */
  private generateRandomEmail(): string {
    const domains = ['example.com', 'test.org', 'demo.net', 'sample.io'];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    const username = Math.random().toString(36).substr(2, 8);
    
    return `${username}@${domain}`;
  }

  /**
   * Generate random department for demo data
   */
  private generateRandomDepartment(): string {
    const departments = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations'];
    return departments[Math.floor(Math.random() * departments.length)];
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Main function to start the client
 */
async function main() {
  // Configuration - can be overridden by environment variables
  const config: ClientConfig = {
    tableName: process.env.DYNAMODB_TABLE_NAME || '',
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
    operationIntervalMs: parseInt(process.env.OPERATION_INTERVAL_MS || '3000'),
    maxOperations: process.env.MAX_OPERATIONS ? parseInt(process.env.MAX_OPERATIONS) : undefined
  };

  // Validate required configuration
  if (!config.tableName) {
    console.error('❌ DYNAMODB_TABLE_NAME environment variable is required');
    process.exit(1);
  }

  const client = new DynamoDBClient(config);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🔄 Received SIGINT, shutting down gracefully...');
    client.stop();
    setTimeout(() => {
      console.log('👋 DynamoDB Client stopped');
      process.exit(0);
    }, 1000);
  });

  process.on('SIGTERM', () => {
    console.log('\n🔄 Received SIGTERM, shutting down gracefully...');
    client.stop();
    setTimeout(() => {
      console.log('👋 DynamoDB Client stopped');
      process.exit(0);
    }, 1000);
  });

  // Start the client
  try {
    await client.start();
  } catch (error) {
    console.error('❌ Fatal error starting client:', error);
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