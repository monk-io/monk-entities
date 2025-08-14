import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import chalk from 'chalk';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface DemoConfig {
  lambdaFunctionArn: string;
  lambdaFunctionName: string;
  rdsEndpoint: string;
  rdsPort: number;
  rdsDatabase: string;
  rdsUsername: string;
  rdsPassword: string;
  dynamoTableName: string;
  dynamoTableArn: string;
  awsRegion: string;
  demoUsersCount: number;
  demoTodosPerUser: number;
  operationIntervalMs: number;
}

interface User {
  id: string;
  name: string;
  email: string;
  department?: string;
  created_at: string;
  updated_at: string;
}

interface Todo {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  created_at: string;
  updated_at: string;
}

interface LambdaResponse {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}

class AWSIntegratedDemoClient {
  private config: DemoConfig;
  private lambdaClient: LambdaClient;
  private dynamoClient: DynamoDBDocumentClient;
  private rdsPool: Pool;
  private isRunning: boolean = false;
  private createdUsers: User[] = [];
  private createdTodos: Todo[] = [];

  constructor(config: DemoConfig) {
    this.config = config;
    
    // Initialize AWS clients
    this.lambdaClient = new LambdaClient({ 
      region: config.awsRegion 
    });
    
    const dynamoClient = new DynamoDBClient({ 
      region: config.awsRegion 
    });
    this.dynamoClient = DynamoDBDocumentClient.from(dynamoClient);
    
    // Initialize RDS connection pool
    this.rdsPool = new Pool({
      host: config.rdsEndpoint,
      port: config.rdsPort,
      database: config.rdsDatabase,
      user: config.rdsUsername,
      password: config.rdsPassword,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }

  /**
   * Start the demo client
   */
  async start(): Promise<void> {
    this.isRunning = true;
    
    console.log(chalk.blue.bold('🚀 AWS Integrated Demo Client Starting...'));
    console.log(chalk.gray('================================================'));
    console.log(chalk.cyan('📊 Configuration:'));
    console.log(chalk.gray(`   Lambda Function: ${this.config.lambdaFunctionName}`));
    console.log(chalk.gray(`   RDS Endpoint: ${this.config.rdsEndpoint}:${this.config.rdsPort}`));
    console.log(chalk.gray(`   RDS Database: ${this.config.rdsDatabase}`));
    console.log(chalk.gray(`   DynamoDB Table: ${this.config.dynamoTableName}`));
    console.log(chalk.gray(`   AWS Region: ${this.config.awsRegion}`));
    console.log(chalk.gray(`   Demo Users: ${this.config.demoUsersCount}`));
    console.log(chalk.gray(`   Todos per User: ${this.config.demoTodosPerUser}`));
    console.log(chalk.gray('================================================'));

    try {
      // Run comprehensive demo
      await this.runComprehensiveDemo();
      
      // Start continuous monitoring
      await this.startContinuousMonitoring();
      
    } catch (error) {
      console.error(chalk.red('❌ Fatal error in demo client:'), error);
      throw error;
    }
  }

  /**
   * Stop the demo client
   */
  async stop(): Promise<void> {
    console.log(chalk.yellow('🛑 Stopping AWS Integrated Demo Client...'));
    this.isRunning = false;
    
    // Close database connections
    await this.rdsPool.end();
    
    console.log(chalk.green('✅ Demo client stopped successfully'));
  }

  /**
   * Run comprehensive demo of all functionality
   */
  private async runComprehensiveDemo(): Promise<void> {
    console.log(chalk.blue.bold('\n🎯 Running Comprehensive Demo'));
    console.log(chalk.gray('================================================'));

    try {
      // 1. Health Check
      await this.performHealthCheck();
      
      // 2. Database Connectivity Tests
      await this.testDatabaseConnectivity();
      
      // 3. User Management Demo
      await this.demoUserManagement();
      
      // 4. Todo Management Demo
      await this.demoTodoManagement();
      
      // 5. Integrated Dashboard Demo
      await this.demoDashboardIntegration();
      
      // 6. Performance and Analytics Demo
      await this.demoPerformanceAnalytics();
      
      console.log(chalk.green.bold('\n✅ Comprehensive Demo Completed Successfully!'));
      
    } catch (error) {
      console.error(chalk.red('❌ Demo failed:'), error);
      throw error;
    }
  }

  /**
   * Perform health check via Lambda
   */
  private async performHealthCheck(): Promise<void> {
    console.log(chalk.cyan('\n🏥 Health Check'));
    console.log(chalk.gray('----------------'));

    try {
      const response = await this.invokeLambda('GET', '/health', null);
      
      if (response.statusCode === 200) {
        const data = JSON.parse(response.body);
        console.log(chalk.green('✅ Health check passed'));
        console.log(chalk.gray(`   Status: ${data.status}`));
        console.log(chalk.gray(`   RDS: ${data.checks.rds.status}`));
        console.log(chalk.gray(`   DynamoDB: ${data.checks.dynamodb.status}`));
      } else {
        throw new Error(`Health check failed: ${response.statusCode}`);
      }
    } catch (error) {
      console.error(chalk.red('❌ Health check failed:'), error);
      throw error;
    }
  }

  /**
   * Test direct database connectivity
   */
  private async testDatabaseConnectivity(): Promise<void> {
    console.log(chalk.cyan('\n🔌 Database Connectivity Tests'));
    console.log(chalk.gray('-------------------------------'));

    try {
      // Test RDS connection
      console.log(chalk.gray('Testing RDS connection...'));
      const rdsClient = await this.rdsPool.connect();
      const rdsResult = await rdsClient.query('SELECT NOW() as current_time, version() as version');
      rdsClient.release();
      
      console.log(chalk.green('✅ RDS connection successful'));
      console.log(chalk.gray(`   Current time: ${rdsResult.rows[0].current_time}`));
      console.log(chalk.gray(`   Version: ${rdsResult.rows[0].version.split(' ')[0]}`));

      // Test DynamoDB connection
      console.log(chalk.gray('Testing DynamoDB connection...'));
      const dynamoResult = await this.dynamoClient.send(new ScanCommand({
        TableName: this.config.dynamoTableName,
        Select: 'COUNT',
        Limit: 1
      }));
      
      console.log(chalk.green('✅ DynamoDB connection successful'));
      console.log(chalk.gray(`   Table: ${this.config.dynamoTableName}`));
      console.log(chalk.gray(`   Item count: ${dynamoResult.Count || 0}`));

    } catch (error) {
      console.error(chalk.red('❌ Database connectivity test failed:'), error);
      throw error;
    }
  }

  /**
   * Demo user management functionality
   */
  private async demoUserManagement(): Promise<void> {
    console.log(chalk.cyan('\n👥 User Management Demo'));
    console.log(chalk.gray('------------------------'));

    try {
      // Create demo users
      console.log(chalk.gray(`Creating ${this.config.demoUsersCount} demo users...`));
      
      const departments = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance'];
      
      for (let i = 0; i < this.config.demoUsersCount; i++) {
        const userData = {
          name: `Demo User ${i + 1}`,
          email: `demo.user.${i + 1}.${Date.now()}@example.com`,
          department: departments[i % departments.length]
        };

        const response = await this.invokeLambda('POST', '/users', userData);
        
        if (response.statusCode === 201) {
          const result = JSON.parse(response.body);
          this.createdUsers.push(result.user);
          console.log(chalk.green(`✅ Created user: ${result.user.name} (${result.user.email})`));
        } else {
          console.error(chalk.red(`❌ Failed to create user: ${response.statusCode}`));
        }
        
        // Small delay to avoid overwhelming the system
        await this.sleep(200);
      }

      // List users
      console.log(chalk.gray('\nListing all users...'));
      const listResponse = await this.invokeLambda('GET', '/users?limit=10', null);
      
      if (listResponse.statusCode === 200) {
        const result = JSON.parse(listResponse.body);
        console.log(chalk.green(`✅ Retrieved ${result.users.length} users`));
        
        result.users.slice(0, 3).forEach((user: User, index: number) => {
          console.log(chalk.gray(`   ${index + 1}. ${user.name} (${user.department})`));
        });
      }

      // Get specific user
      if (this.createdUsers.length > 0) {
        const userId = this.createdUsers[0].id;
        console.log(chalk.gray(`\nGetting specific user: ${userId}`));
        
        const getUserResponse = await this.invokeLambda('GET', `/users/${userId}`, null);
        
        if (getUserResponse.statusCode === 200) {
          const result = JSON.parse(getUserResponse.body);
          console.log(chalk.green(`✅ Retrieved user: ${result.user.name}`));
        }
      }

    } catch (error) {
      console.error(chalk.red('❌ User management demo failed:'), error);
      throw error;
    }
  }

  /**
   * Demo todo management functionality
   */
  private async demoTodoManagement(): Promise<void> {
    console.log(chalk.cyan('\n📝 Todo Management Demo'));
    console.log(chalk.gray('------------------------'));

    try {
      // Create todos for each user
      console.log(chalk.gray('Creating todos for users...'));
      
      const todoTemplates = [
        { title: 'Complete AWS integration', priority: 'high', status: 'in_progress' },
        { title: 'Write documentation', priority: 'medium', status: 'pending' },
        { title: 'Review code changes', priority: 'low', status: 'pending' },
        { title: 'Setup monitoring', priority: 'high', status: 'completed' },
        { title: 'Deploy to production', priority: 'urgent', status: 'pending' }
      ];

      for (const user of this.createdUsers) {
        for (let i = 0; i < this.config.demoTodosPerUser; i++) {
          const template = todoTemplates[i % todoTemplates.length];
          
          const todoData = {
            title: `${template.title} - ${user.name}`,
            description: `Todo item ${i + 1} for ${user.name} in ${user.department}`,
            status: template.status,
            priority: template.priority,
            due_date: new Date(Date.now() + (7 + i) * 24 * 60 * 60 * 1000).toISOString()
          };

          const response = await this.invokeLambda('POST', `/users/${user.id}/todos`, todoData);
          
          if (response.statusCode === 201) {
            const result = JSON.parse(response.body);
            this.createdTodos.push(result.todo);
            console.log(chalk.green(`✅ Created todo: ${result.todo.title}`));
          } else {
            console.error(chalk.red(`❌ Failed to create todo: ${response.statusCode}`));
          }
          
          await this.sleep(100);
        }
      }

      // Get todos for a user
      if (this.createdUsers.length > 0) {
        const userId = this.createdUsers[0].id;
        console.log(chalk.gray(`\nGetting todos for user: ${this.createdUsers[0].name}`));
        
        const todosResponse = await this.invokeLambda('GET', `/users/${userId}/todos`, null);
        
        if (todosResponse.statusCode === 200) {
          const result = JSON.parse(todosResponse.body);
          console.log(chalk.green(`✅ Retrieved ${result.todos.length} todos`));
          
          result.todos.slice(0, 3).forEach((todo: Todo, index: number) => {
            console.log(chalk.gray(`   ${index + 1}. ${todo.title} (${todo.status})`));
          });
        }
      }

      // Update a todo
      if (this.createdTodos.length > 0) {
        const todo = this.createdTodos[0];
        console.log(chalk.gray(`\nUpdating todo: ${todo.title}`));
        
        const updateData = {
          status: 'completed',
          priority: 'high'
        };

        const updateResponse = await this.invokeLambda('PUT', `/todos/${todo.id}`, updateData);
        
        if (updateResponse.statusCode === 200) {
          const result = JSON.parse(updateResponse.body);
          console.log(chalk.green(`✅ Updated todo status to: ${result.todo.status}`));
        }
      }

    } catch (error) {
      console.error(chalk.red('❌ Todo management demo failed:'), error);
      throw error;
    }
  }

  /**
   * Demo dashboard integration (RDS + DynamoDB)
   */
  private async demoDashboardIntegration(): Promise<void> {
    console.log(chalk.cyan('\n📊 Dashboard Integration Demo'));
    console.log(chalk.gray('------------------------------'));

    try {
      // Get dashboard for each user
      for (const user of this.createdUsers.slice(0, 2)) { // Limit to first 2 users
        console.log(chalk.gray(`Getting dashboard for: ${user.name}`));
        
        const dashboardResponse = await this.invokeLambda('GET', `/dashboard/${user.id}`, null);
        
        if (dashboardResponse.statusCode === 200) {
          const result = JSON.parse(dashboardResponse.body);
          
          console.log(chalk.green(`✅ Dashboard for ${result.user.name}:`));
          console.log(chalk.gray(`   Department: ${result.user.department}`));
          console.log(chalk.gray(`   Total todos: ${result.todoStats.total}`));
          console.log(chalk.gray(`   Pending: ${result.todoStats.pending}`));
          console.log(chalk.gray(`   In Progress: ${result.todoStats.in_progress}`));
          console.log(chalk.gray(`   Completed: ${result.todoStats.completed}`));
          console.log(chalk.gray(`   Overdue: ${result.todoStats.overdue}`));
          
          if (result.recentTodos.length > 0) {
            console.log(chalk.gray(`   Recent todos:`));
            result.recentTodos.slice(0, 2).forEach((todo: Todo, index: number) => {
              console.log(chalk.gray(`     ${index + 1}. ${todo.title} (${todo.status})`));
            });
          }
          
          console.log(chalk.gray(''));
        } else {
          console.error(chalk.red(`❌ Failed to get dashboard: ${dashboardResponse.statusCode}`));
        }
        
        await this.sleep(500);
      }

    } catch (error) {
      console.error(chalk.red('❌ Dashboard integration demo failed:'), error);
      throw error;
    }
  }

  /**
   * Demo performance and analytics
   */
  private async demoPerformanceAnalytics(): Promise<void> {
    console.log(chalk.cyan('\n📈 Performance & Analytics Demo'));
    console.log(chalk.gray('--------------------------------'));

    try {
      // Run the comprehensive demo endpoint
      console.log(chalk.gray('Running Lambda demo endpoint...'));
      
      const demoResponse = await this.invokeLambda('GET', '/demo', null);
      
      if (demoResponse.statusCode === 200) {
        const result = JSON.parse(demoResponse.body);
        
        console.log(chalk.green('✅ Lambda demo completed successfully'));
        console.log(chalk.gray(`   Operations performed: ${result.demo.operations.length}`));
        
        result.demo.operations.forEach((op: any, index: number) => {
          const status = op.status === 'success' ? chalk.green('✅') : chalk.red('❌');
          console.log(chalk.gray(`   ${index + 1}. ${op.operation}: ${status}`));
        });
      } else {
        console.error(chalk.red(`❌ Demo endpoint failed: ${demoResponse.statusCode}`));
      }

      // Show some statistics
      console.log(chalk.gray('\nDemo Statistics:'));
      console.log(chalk.gray(`   Users created: ${this.createdUsers.length}`));
      console.log(chalk.gray(`   Todos created: ${this.createdTodos.length}`));
      console.log(chalk.gray(`   Total Lambda invocations: ~${(this.createdUsers.length * 2) + (this.createdTodos.length) + 10}`));

    } catch (error) {
      console.error(chalk.red('❌ Performance analytics demo failed:'), error);
      throw error;
    }
  }

  /**
   * Start continuous monitoring
   */
  private async startContinuousMonitoring(): Promise<void> {
    console.log(chalk.cyan('\n🔄 Starting Continuous Monitoring'));
    console.log(chalk.gray('-----------------------------------'));

    let cycleCount = 0;
    
    while (this.isRunning) {
      cycleCount++;
      console.log(chalk.blue(`\n📊 Monitoring Cycle ${cycleCount}`));
      
      try {
        // Health check
        await this.performHealthCheck();
        
        // Show some live statistics
        await this.showLiveStatistics();
        
        // Random operations to simulate activity
        if (cycleCount % 3 === 0 && this.createdUsers.length > 0) {
          await this.performRandomOperations();
        }
        
      } catch (error) {
        console.error(chalk.red('❌ Monitoring cycle failed:'), error);
      }
      
      // Wait before next cycle
      await this.sleep(this.config.operationIntervalMs);
    }
  }

  /**
   * Show live statistics
   */
  private async showLiveStatistics(): Promise<void> {
    try {
      // Get user count from RDS
      const userCountQuery = 'SELECT COUNT(*) as count FROM users';
      const rdsClient = await this.rdsPool.connect();
      const userResult = await rdsClient.query(userCountQuery);
      rdsClient.release();
      
      // Get todo count from DynamoDB
      const todoResult = await this.dynamoClient.send(new ScanCommand({
        TableName: this.config.dynamoTableName,
        Select: 'COUNT'
      }));
      
      console.log(chalk.gray(`   👥 Total users (RDS): ${userResult.rows[0].count}`));
      console.log(chalk.gray(`   📝 Total todos (DynamoDB): ${todoResult.Count || 0}`));
      
    } catch (error) {
      console.error(chalk.red('❌ Failed to get live statistics:'), error);
    }
  }

  /**
   * Perform random operations to simulate activity
   */
  private async performRandomOperations(): Promise<void> {
    console.log(chalk.gray('   🎲 Performing random operations...'));
    
    try {
      if (this.createdUsers.length > 0) {
        const randomUser = this.createdUsers[Math.floor(Math.random() * this.createdUsers.length)];
        
        // Get user dashboard
        const dashboardResponse = await this.invokeLambda('GET', `/dashboard/${randomUser.id}`, null);
        
        if (dashboardResponse.statusCode === 200) {
          const result = JSON.parse(dashboardResponse.body);
          console.log(chalk.gray(`   📊 Dashboard check for ${randomUser.name}: ${result.todoStats.total} todos`));
        }
      }
      
      if (this.createdTodos.length > 0) {
        const randomTodo = this.createdTodos[Math.floor(Math.random() * this.createdTodos.length)];
        
        // Get todo details
        const todoResponse = await this.invokeLambda('GET', `/todos/${randomTodo.id}`, null);
        
        if (todoResponse.statusCode === 200) {
          const result = JSON.parse(todoResponse.body);
          console.log(chalk.gray(`   📝 Todo check: ${result.todo.title} (${result.todo.status})`));
        }
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Random operations failed:'), error);
    }
  }

  /**
   * Invoke Lambda function
   */
  private async invokeLambda(method: string, path: string, body: any): Promise<LambdaResponse> {
    const event = {
      httpMethod: method,
      path: path,
      body: body ? JSON.stringify(body) : null,
      headers: {
        'Content-Type': 'application/json'
      },
      pathParameters: this.extractPathParameters(path),
      queryStringParameters: this.extractQueryParameters(path)
    };

    const command = new InvokeCommand({
      FunctionName: this.config.lambdaFunctionName,
      Payload: JSON.stringify(event),
      InvocationType: 'RequestResponse'
    });

    try {
      const response = await this.lambdaClient.send(command);
      
      if (response.Payload) {
        const payloadString = Buffer.from(response.Payload).toString();
        return JSON.parse(payloadString);
      } else {
        throw new Error('No payload in Lambda response');
      }
    } catch (error) {
      console.error(chalk.red('❌ Lambda invocation failed:'), error);
      throw error;
    }
  }

  /**
   * Extract path parameters from URL
   */
  private extractPathParameters(path: string): Record<string, string> | null {
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
    const matches = path.match(uuidRegex);
    
    if (!matches) return null;
    
    const params: Record<string, string> = {};
    
    // Simple parameter extraction based on path structure
    if (path.includes('/users/') && path.includes('/todos')) {
      params.id = matches[0]; // user id
    } else if (path.includes('/users/')) {
      params.id = matches[0]; // user id
    } else if (path.includes('/todos/')) {
      params.id = matches[0]; // todo id
    } else if (path.includes('/dashboard/')) {
      params.id = matches[0]; // user id
    }
    
    return Object.keys(params).length > 0 ? params : null;
  }

  /**
   * Extract query parameters from URL
   */
  private extractQueryParameters(path: string): Record<string, string> | null {
    const queryIndex = path.indexOf('?');
    if (queryIndex === -1) return null;
    
    const queryString = path.substring(queryIndex + 1);
    const params: Record<string, string> = {};
    
    queryString.split('&').forEach(param => {
      const [key, value] = param.split('=');
      if (key && value) {
        params[decodeURIComponent(key)] = decodeURIComponent(value);
      }
    });
    
    return Object.keys(params).length > 0 ? params : null;
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Main function to start the demo client
 */
async function main() {
  // Configuration from environment variables
  const config: DemoConfig = {
    lambdaFunctionArn: process.env.LAMBDA_FUNCTION_ARN || '',
    lambdaFunctionName: process.env.LAMBDA_FUNCTION_NAME || '',
    rdsEndpoint: process.env.RDS_ENDPOINT || '',
    rdsPort: parseInt(process.env.RDS_PORT || '5432'),
    rdsDatabase: process.env.RDS_DATABASE || '',
    rdsUsername: process.env.RDS_USERNAME || '',
    rdsPassword: process.env.RDS_PASSWORD || '',
    dynamoTableName: process.env.DYNAMODB_TABLE_NAME || '',
    dynamoTableArn: process.env.DYNAMODB_TABLE_ARN || '',
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    demoUsersCount: parseInt(process.env.DEMO_USERS_COUNT || '5'),
    demoTodosPerUser: parseInt(process.env.DEMO_TODOS_PER_USER || '3'),
    operationIntervalMs: parseInt(process.env.OPERATION_INTERVAL_MS || '5000')
  };

  // Validate required configuration
  const requiredFields = [
    'lambdaFunctionName', 'rdsEndpoint', 'rdsDatabase', 
    'rdsUsername', 'rdsPassword', 'dynamoTableName'
  ];
  
  for (const field of requiredFields) {
    if (!config[field as keyof DemoConfig]) {
      console.error(chalk.red(`❌ ${field.toUpperCase()} environment variable is required`));
      process.exit(1);
    }
  }

  const client = new AWSIntegratedDemoClient(config);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n🔄 Received SIGINT, shutting down gracefully...'));
    await client.stop();
    setTimeout(() => {
      console.log(chalk.green('👋 Demo client stopped'));
      process.exit(0);
    }, 1000);
  });

  process.on('SIGTERM', async () => {
    console.log(chalk.yellow('\n🔄 Received SIGTERM, shutting down gracefully...'));
    await client.stop();
    setTimeout(() => {
      console.log(chalk.green('👋 Demo client stopped'));
      process.exit(0);
    }, 1000);
  });

  // Start the client
  try {
    await client.start();
  } catch (error) {
    console.error(chalk.red('❌ Fatal error starting demo client:'), error);
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('❌ Unhandled error:'), error);
    process.exit(1);
  });
}
