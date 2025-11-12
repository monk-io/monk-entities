import { CosmosClient, Container, Database, PatchOperation } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  inStock: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

class CosmosDBClient {
  private cosmosClient: CosmosClient;
  private database: Database;
  private container: Container;
  private operationCount = 0;
  private maxOperations: number;
  private operationInterval: number;
  private isShuttingDown = false;

  constructor() {
    const connectionString = process.env.COSMOS_DB_CONNECTION_STRING;
    const endpoint = process.env.COSMOS_DB_ENDPOINT;
    const primaryKey = process.env.COSMOS_DB_PRIMARY_KEY;
    const databaseId = process.env.COSMOS_DB_DATABASE_ID;
    const containerId = process.env.COSMOS_DB_CONTAINER_ID || 'products';
    
    this.maxOperations = parseInt(process.env.MAX_OPERATIONS || '0', 10);
    this.operationInterval = parseInt(process.env.OPERATION_INTERVAL_MS || '3000', 10);

    if (!connectionString && !endpoint) {
      throw new Error('Either COSMOS_DB_CONNECTION_STRING or COSMOS_DB_ENDPOINT environment variable is required');
    }

    if (!databaseId) {
      throw new Error('COSMOS_DB_DATABASE_ID environment variable is required');
    }

    console.log('🚀 Azure Cosmos DB Client starting...');
    console.log(`🗄️  Database: ${databaseId}`);
    console.log(`📦 Container: ${containerId}`);
    console.log(`⏱️  Operation interval: ${this.operationInterval}ms`);
    console.log(`🔄 Max operations: ${this.maxOperations > 0 ? this.maxOperations : 'unlimited'}`);

    // Initialize Cosmos DB client with appropriate authentication (priority order)
    if (connectionString) {
      // Option 1: Use pre-built connection string
      console.log('🔑 Using pre-built connection string authentication');
      console.log('📍 Endpoint: [from connection string]');
      
      this.cosmosClient = new CosmosClient(connectionString);
    } else if (endpoint && primaryKey) {
      // Option 2: Construct connection string from endpoint + primary key
      const constructedConnectionString = `AccountEndpoint=${endpoint};AccountKey=${primaryKey};`;
      console.log('🔧 Using constructed connection string from endpoint + primary key');
      console.log(`📍 Endpoint: ${endpoint}`);
      console.log('🔑 Primary Key: [provided]');
      
      this.cosmosClient = new CosmosClient(constructedConnectionString);
    } else if (endpoint) {
      // Option 3: Use Azure AD authentication
      console.log('🔐 Using Azure AD authentication (DefaultAzureCredential)');
      console.log(`📍 Endpoint: ${endpoint}`);
      console.log('⚠️  Note: Requires proper RBAC permissions for data plane operations');
      
      const credential = new DefaultAzureCredential();
      this.cosmosClient = new CosmosClient({
        endpoint: endpoint!,
        aadCredentials: credential
      });
    } else {
      throw new Error('Invalid configuration: Either provide COSMOS_DB_CONNECTION_STRING, or COSMOS_DB_ENDPOINT with COSMOS_DB_PRIMARY_KEY, or COSMOS_DB_ENDPOINT for Azure AD auth');
    }

    console.log('----------------------------------------');

    this.database = this.cosmosClient.database(databaseId);
    this.container = this.database.container(containerId);

    // Setup graceful shutdown
    this.setupGracefulShutdown();
  }

  private setupGracefulShutdown(): void {
    const shutdown = () => {
      console.log('\n🛑 Graceful shutdown initiated...');
      this.isShuttingDown = true;
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  private generateRandomProduct(): Product {
    const categories = ['Electronics', 'Clothing', 'Books', 'Home & Garden', 'Sports', 'Toys'];
    const adjectives = ['Premium', 'Deluxe', 'Classic', 'Modern', 'Vintage', 'Professional'];
    const nouns = ['Widget', 'Device', 'Tool', 'Gadget', 'Item', 'Product'];
    
    const category = categories[Math.floor(Math.random() * categories.length)];
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    
    const id = `product-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const timestamp = new Date().toISOString();

    return {
      id,
      name: `${adjective} ${noun}`,
      category,
      price: Math.round((Math.random() * 1000 + 10) * 100) / 100,
      description: `A high-quality ${adjective.toLowerCase()} ${noun.toLowerCase()} in the ${category.toLowerCase()} category`,
      inStock: Math.random() > 0.2, // 80% chance of being in stock
      tags: [
        adjective.toLowerCase(),
        noun.toLowerCase(),
        category.toLowerCase(),
        ...(Math.random() > 0.5 ? ['featured'] : []),
        ...(Math.random() > 0.7 ? ['bestseller'] : [])
      ],
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  private async createProduct(): Promise<void> {
    try {
      console.log('\n📝 CREATE Operation:');
      const product = this.generateRandomProduct();
      
      console.log(`   Creating product: ${product.name} ($${product.price})`);
      console.log(`   Category: ${product.category} | Stock: ${product.inStock ? '✅' : '❌'}`);
      
      const { resource, requestCharge } = await this.container.items.create(product);
      
      console.log('   ✅ Product created successfully');
      console.log(`   📊 Request Charge: ${requestCharge} RUs`);
      console.log(`   🆔 Product ID: ${resource?.id}`);
      
    } catch (error) {
      console.error('   ❌ CREATE failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async readProduct(productId: string): Promise<Product | null> {
    try {
      console.log('\n📖 READ Operation:');
      console.log(`   Reading product: ${productId}`);
      
      const { resource, requestCharge } = await this.container.item(productId, productId).read<Product>();
      
      if (resource) {
        console.log('   ✅ Product retrieved successfully:');
        console.log(`      Name: ${resource.name}`);
        console.log(`      Category: ${resource.category}`);
        console.log(`      Price: $${resource.price}`);
        console.log(`      In Stock: ${resource.inStock ? '✅' : '❌'}`);
        console.log(`      Tags: ${resource.tags.join(', ')}`);
        console.log(`      Created: ${resource.createdAt}`);
        console.log(`   📊 Request Charge: ${requestCharge} RUs`);
        return resource;
      } else {
        console.log('   ⚠️  Product not found');
        return null;
      }
      
    } catch (error) {
      console.error('   ❌ READ failed:', error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  private async updateProduct(productId: string): Promise<void> {
    try {
      console.log('\n📝 UPDATE Operation:');
      console.log(`   Updating product: ${productId}`);
      
      const operations: PatchOperation[] = [
        {
          op: 'replace' as const,
          path: '/price',
          value: Math.round((Math.random() * 1000 + 10) * 100) / 100
        },
        {
          op: 'replace' as const,
          path: '/inStock',
          value: Math.random() > 0.3
        },
        {
          op: 'replace' as const,
          path: '/updatedAt',
          value: new Date().toISOString()
        }
      ];
      
      const { resource, requestCharge } = await this.container.item(productId, productId).patch(operations);
      
      console.log('   ✅ Product updated successfully:');
      console.log(`      New Price: $${resource?.price}`);
      console.log(`      New Stock Status: ${resource?.inStock ? '✅' : '❌'}`);
      console.log(`      Updated At: ${resource?.updatedAt}`);
      console.log(`   📊 Request Charge: ${requestCharge} RUs`);
      
    } catch (error) {
      console.error('   ❌ UPDATE failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async queryProducts(): Promise<void> {
    try {
      console.log('\n🔍 QUERY Operation:');
      console.log('   Searching for products in Electronics category...');
      
      const querySpec = {
        query: 'SELECT * FROM c WHERE c.category = @category AND c.inStock = @inStock',
        parameters: [
          { name: '@category', value: 'Electronics' },
          { name: '@inStock', value: true }
        ]
      };
      
      const { resources, requestCharge } = await this.container.items
        .query<Product>(querySpec)
        .fetchAll();
      
      console.log(`   ✅ Query completed successfully:`);
      console.log(`      Found ${resources.length} products in stock`);
      
      resources.slice(0, 3).forEach((product, index) => {
        console.log(`      ${index + 1}. ${product.name} - $${product.price}`);
      });
      
      if (resources.length > 3) {
        console.log(`      ... and ${resources.length - 3} more products`);
      }
      
      console.log(`   📊 Request Charge: ${requestCharge} RUs`);
      
    } catch (error) {
      console.error('   ❌ QUERY failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async deleteProduct(productId: string): Promise<void> {
    try {
      console.log('\n🗑️  DELETE Operation:');
      console.log(`   Deleting product: ${productId}`);
      
      const { requestCharge } = await this.container.item(productId, productId).delete();
      
      console.log('   ✅ Product deleted successfully');
      console.log(`   📊 Request Charge: ${requestCharge} RUs`);
      
    } catch (error) {
      console.error('   ❌ DELETE failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async batchOperations(): Promise<void> {
    try {
      console.log('\n🔄 BATCH Operations:');
      console.log('   Creating multiple products...');
      
      const products = Array.from({ length: 3 }, () => this.generateRandomProduct());
      let totalRUs = 0;
      
      for (const product of products) {
        const { requestCharge } = await this.container.items.create(product);
        totalRUs += requestCharge || 0;
        console.log(`      ✅ Created: ${product.name}`);
      }
      
      console.log(`   ✅ Batch operation completed`);
      console.log(`   📊 Total Request Charge: ${totalRUs} RUs`);
      
    } catch (error) {
      console.error('   ❌ BATCH failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async getContainerInfo(): Promise<void> {
    try {
      console.log('\n📊 CONTAINER Information:');
      
      const { resource } = await this.container.read();
      
      console.log(`   Container ID: ${resource?.id}`);
      console.log(`   Partition Key: ${JSON.stringify(resource?.partitionKey)}`);
      console.log(`   Indexing Policy: ${resource?.indexingPolicy?.indexingMode || 'Default'}`);
      
    } catch (error) {
      console.error('   ❌ Container info failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async demonstrateOperations(): Promise<void> {
    try {
      // Get container information
      await this.getContainerInfo();

      // Create a new product
      await this.createProduct();
      
      // Query existing products to get IDs for subsequent operations
      const querySpec = {
        query: 'SELECT TOP 5 * FROM c ORDER BY c._ts DESC'
      };
      
      const { resources: recentProducts } = await this.container.items
        .query<Product>(querySpec)
        .fetchAll();

      if (recentProducts.length > 0) {
        const productId = recentProducts[0].id;
        
        // Read the product
        const product = await this.readProduct(productId);
        
        if (product) {
          // Update the product
          await this.updateProduct(productId);
          
          // Query products
          await this.queryProducts();
          
          // Delete the product (only if we have multiple products)
          if (recentProducts.length > 2) {
            await this.deleteProduct(productId);
          }
        }
      }

      // Demonstrate batch operations
      await this.batchOperations();

    } catch (error) {
      console.error('❌ Operation demonstration failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  public async start(): Promise<void> {
    console.log('🎯 Starting Azure Cosmos DB operations demonstration...\n');

    const runOperation = async () => {
      if (this.isShuttingDown) {
        return;
      }

      this.operationCount++;
      console.log(`\n🔄 Operation #${this.operationCount}`);
      console.log('========================================');

      await this.demonstrateOperations();

      console.log('----------------------------------------');
      console.log(`✅ Operation #${this.operationCount} completed\n`);

      // Check if we should continue
      if (this.maxOperations > 0 && this.operationCount >= this.maxOperations) {
        console.log(`🏁 Reached maximum operations (${this.maxOperations}). Shutting down...`);
        process.exit(0);
      }

      // Schedule next operation
      if (!this.isShuttingDown) {
        setTimeout(runOperation, this.operationInterval);
      }
    };

    // Start the first operation
    await runOperation();
  }
}

// Application entry point
async function main() {
  try {
    const client = new CosmosDBClient();
    await client.start();
  } catch (error) {
    console.error('💥 Failed to start Cosmos DB client:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
if (require.main === module) {
  main().catch(console.error);
}
