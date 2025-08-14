const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
    DynamoDBDocumentClient, 
    PutCommand, 
    GetCommand, 
    UpdateCommand, 
    DeleteCommand, 
    ScanCommand,
    QueryCommand 
} = require('@aws-sdk/lib-dynamodb');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// Import our database handlers
const { RDSManager } = require('./database/rds');
const { DynamoDBManager } = require('./database/dynamodb');
const { createResponse, logInfo, logError } = require('./utils/response');
const { validateUser, validateTodo, validateUserId } = require('./utils/validation');

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ 
    region: process.env.AWS_REGION || 'us-east-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const secretsClient = new SecretsManagerClient({
    region: process.env.AWS_REGION || 'us-east-1'
});

// Database managers
let rdsManager;
let dynamoManager;

// Cache for RDS password
let cachedRdsPassword = null;

/**
 * AWS Lambda handler function
 * Orchestrates requests between RDS (users) and DynamoDB (todos)
 */
exports.handler = async (event) => {
    logInfo('Lambda Event received', { 
        httpMethod: event.httpMethod || event.requestContext?.http?.method,
        path: event.path || event.rawPath,
        hasBody: !!event.body
    });
    
    try {
        // Initialize database connections if needed
        await initializeDatabases();
        
        // Extract HTTP details from event
        const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'GET';
        const path = event.path || event.rawPath || '/';
        const pathParameters = event.pathParameters || {};
        const queryParameters = event.queryStringParameters || {};
        const body = event.body ? JSON.parse(event.body) : {};

        logInfo(`Processing ${httpMethod} ${path}`, { pathParameters, queryParameters });

        // Route requests based on HTTP method and path
        return await routeRequest(httpMethod, path, pathParameters, queryParameters, body);

    } catch (error) {
        logError('Lambda handler error', error);
        return createResponse(500, { 
            error: 'Internal server error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
};

/**
 * Initialize database connections
 */
async function initializeDatabases() {
    if (!rdsManager || !dynamoManager) {
        logInfo('Initializing database connections...');
        
        // Get RDS password from Secrets Manager
        if (!cachedRdsPassword) {
            cachedRdsPassword = await getRdsPassword();
        }
        
        // Initialize RDS manager
        rdsManager = new RDSManager({
            host: process.env.RDS_HOST,
            port: parseInt(process.env.RDS_PORT || '5432'),
            database: process.env.RDS_DATABASE,
            user: process.env.RDS_USERNAME,
            password: cachedRdsPassword
        });
        
        // Initialize DynamoDB manager
        dynamoManager = new DynamoDBManager({
            docClient: docClient,
            tableName: process.env.DYNAMODB_TABLE_NAME,
            userIndex: process.env.DYNAMODB_USER_INDEX || 'UserTodosIndex'
        });
        
        // Test connections
        await rdsManager.testConnection();
        await dynamoManager.testConnection();
        
        logInfo('Database connections initialized successfully');
    }
}

/**
 * Get RDS password from AWS Secrets Manager
 */
async function getRdsPassword() {
    try {
        const secretName = process.env.RDS_PASSWORD_SECRET;
        if (!secretName) {
            throw new Error('RDS_PASSWORD_SECRET environment variable not set');
        }
        
        const command = new GetSecretValueCommand({ SecretId: secretName });
        const response = await secretsClient.send(command);
        
        return response.SecretString;
    } catch (error) {
        logError('Failed to get RDS password from Secrets Manager', error);
        throw error;
    }
}

/**
 * Route incoming requests to appropriate handlers
 */
async function routeRequest(method, path, pathParams, queryParams, body) {
    // Health check endpoint
    if (path.includes('/health')) {
        return await handleHealthCheck();
    }
    
    // User management endpoints
    if (path.includes('/users')) {
        if (method === 'POST' && !pathParams.id) {
            return await handleCreateUser(body);
        }
        if (method === 'GET' && pathParams.id) {
            return await handleGetUser(pathParams.id);
        }
        if (method === 'GET' && !pathParams.id) {
            return await handleListUsers(queryParams);
        }
        if (method === 'POST' && pathParams.id && path.includes('/todos')) {
            return await handleCreateTodo(pathParams.id, body);
        }
        if (method === 'GET' && pathParams.id && path.includes('/todos')) {
            return await handleGetUserTodos(pathParams.id, queryParams);
        }
    }
    
    // Todo management endpoints
    if (path.includes('/todos')) {
        if (method === 'PUT' && pathParams.id) {
            return await handleUpdateTodo(pathParams.id, body);
        }
        if (method === 'DELETE' && pathParams.id) {
            return await handleDeleteTodo(pathParams.id);
        }
        if (method === 'GET' && pathParams.id) {
            return await handleGetTodo(pathParams.id);
        }
    }
    
    // Dashboard endpoint - combines data from both databases
    if (path.includes('/dashboard') && pathParams.id) {
        return await handleGetDashboard(pathParams.id);
    }
    
    // Demo endpoint - demonstrates all functionality
    if (path.includes('/demo')) {
        return await handleDemo();
    }
    
    return createResponse(404, { 
        error: 'Endpoint not found',
        supportedEndpoints: [
            'GET /health',
            'POST /users',
            'GET /users',
            'GET /users/{id}',
            'POST /users/{id}/todos',
            'GET /users/{id}/todos',
            'GET /todos/{id}',
            'PUT /todos/{id}',
            'DELETE /todos/{id}',
            'GET /dashboard/{id}',
            'GET /demo'
        ]
    });
}

/**
 * Health check - verifies both database connections
 */
async function handleHealthCheck() {
    try {
        const checks = await Promise.allSettled([
            rdsManager.healthCheck(),
            dynamoManager.healthCheck()
        ]);
        
        const rdsResult = checks[0];
        const dynamoResult = checks[1];
        
        const isHealthy = rdsResult.status === 'fulfilled' && dynamoResult.status === 'fulfilled';
        
        return createResponse(isHealthy ? 200 : 503, {
            status: isHealthy ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            checks: {
                rds: {
                    status: rdsResult.status,
                    details: rdsResult.status === 'fulfilled' ? rdsResult.value : rdsResult.reason?.message
                },
                dynamodb: {
                    status: dynamoResult.status,
                    details: dynamoResult.status === 'fulfilled' ? dynamoResult.value : dynamoResult.reason?.message
                }
            }
        });
    } catch (error) {
        logError('Health check failed', error);
        return createResponse(503, {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

/**
 * Create a new user in RDS
 */
async function handleCreateUser(userData) {
    try {
        const validation = validateUser(userData);
        if (!validation.isValid) {
            return createResponse(400, { 
                error: 'Invalid user data',
                details: validation.errors 
            });
        }
        
        const user = {
            id: uuidv4(),
            name: userData.name,
            email: userData.email,
            department: userData.department || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        const createdUser = await rdsManager.createUser(user);
        
        logInfo('User created successfully', { userId: createdUser.id });
        
        return createResponse(201, {
            message: 'User created successfully',
            user: createdUser
        });
    } catch (error) {
        logError('Error creating user', error);
        
        if (error.code === '23505') { // PostgreSQL unique constraint violation
            return createResponse(409, { 
                error: 'User with this email already exists' 
            });
        }
        
        return createResponse(500, { 
            error: 'Failed to create user',
            message: error.message 
        });
    }
}

/**
 * Get user by ID from RDS
 */
async function handleGetUser(userId) {
    try {
        const validation = validateUserId(userId);
        if (!validation.isValid) {
            return createResponse(400, validation);
        }
        
        const user = await rdsManager.getUser(userId);
        
        if (!user) {
            return createResponse(404, { 
                error: 'User not found',
                userId: userId 
            });
        }
        
        return createResponse(200, { user });
    } catch (error) {
        logError('Error getting user', error);
        return createResponse(500, { 
            error: 'Failed to get user',
            message: error.message 
        });
    }
}

/**
 * List all users from RDS
 */
async function handleListUsers(queryParams) {
    try {
        const limit = parseInt(queryParams.limit) || 10;
        const offset = parseInt(queryParams.offset) || 0;
        
        const users = await rdsManager.listUsers(limit, offset);
        
        return createResponse(200, {
            users: users,
            pagination: {
                limit: limit,
                offset: offset,
                count: users.length
            }
        });
    } catch (error) {
        logError('Error listing users', error);
        return createResponse(500, { 
            error: 'Failed to list users',
            message: error.message 
        });
    }
}

/**
 * Create a todo for a user in DynamoDB
 */
async function handleCreateTodo(userId, todoData) {
    try {
        // Validate user exists in RDS
        const user = await rdsManager.getUser(userId);
        if (!user) {
            return createResponse(404, { 
                error: 'User not found',
                userId: userId 
            });
        }
        
        const validation = validateTodo(todoData);
        if (!validation.isValid) {
            return createResponse(400, { 
                error: 'Invalid todo data',
                details: validation.errors 
            });
        }
        
        const todo = {
            id: uuidv4(),
            user_id: userId,
            title: todoData.title,
            description: todoData.description || null,
            status: todoData.status || 'pending',
            priority: todoData.priority || 'medium',
            due_date: todoData.due_date || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        const createdTodo = await dynamoManager.createTodo(todo);
        
        logInfo('Todo created successfully', { todoId: createdTodo.id, userId });
        
        return createResponse(201, {
            message: 'Todo created successfully',
            todo: createdTodo
        });
    } catch (error) {
        logError('Error creating todo', error);
        return createResponse(500, { 
            error: 'Failed to create todo',
            message: error.message 
        });
    }
}

/**
 * Get all todos for a user from DynamoDB
 */
async function handleGetUserTodos(userId, queryParams) {
    try {
        // Validate user exists in RDS
        const user = await rdsManager.getUser(userId);
        if (!user) {
            return createResponse(404, { 
                error: 'User not found',
                userId: userId 
            });
        }
        
        const status = queryParams.status; // Optional filter by status
        const todos = await dynamoManager.getUserTodos(userId, status);
        
        return createResponse(200, {
            userId: userId,
            todos: todos,
            count: todos.length,
            filter: status ? { status } : null
        });
    } catch (error) {
        logError('Error getting user todos', error);
        return createResponse(500, { 
            error: 'Failed to get user todos',
            message: error.message 
        });
    }
}

/**
 * Get a specific todo by ID from DynamoDB
 */
async function handleGetTodo(todoId) {
    try {
        const todo = await dynamoManager.getTodo(todoId);
        
        if (!todo) {
            return createResponse(404, { 
                error: 'Todo not found',
                todoId: todoId 
            });
        }
        
        return createResponse(200, { todo });
    } catch (error) {
        logError('Error getting todo', error);
        return createResponse(500, { 
            error: 'Failed to get todo',
            message: error.message 
        });
    }
}

/**
 * Update a todo in DynamoDB
 */
async function handleUpdateTodo(todoId, updateData) {
    try {
        const updatedTodo = await dynamoManager.updateTodo(todoId, updateData);
        
        if (!updatedTodo) {
            return createResponse(404, { 
                error: 'Todo not found',
                todoId: todoId 
            });
        }
        
        logInfo('Todo updated successfully', { todoId });
        
        return createResponse(200, {
            message: 'Todo updated successfully',
            todo: updatedTodo
        });
    } catch (error) {
        logError('Error updating todo', error);
        return createResponse(500, { 
            error: 'Failed to update todo',
            message: error.message 
        });
    }
}

/**
 * Delete a todo from DynamoDB
 */
async function handleDeleteTodo(todoId) {
    try {
        const deletedTodo = await dynamoManager.deleteTodo(todoId);
        
        if (!deletedTodo) {
            return createResponse(404, { 
                error: 'Todo not found',
                todoId: todoId 
            });
        }
        
        logInfo('Todo deleted successfully', { todoId });
        
        return createResponse(200, {
            message: 'Todo deleted successfully',
            deletedTodo: deletedTodo
        });
    } catch (error) {
        logError('Error deleting todo', error);
        return createResponse(500, { 
            error: 'Failed to delete todo',
            message: error.message 
        });
    }
}

/**
 * Get dashboard data - combines user info from RDS with todo statistics from DynamoDB
 */
async function handleGetDashboard(userId) {
    try {
        // Get user from RDS and todos from DynamoDB in parallel
        const [user, todos] = await Promise.all([
            rdsManager.getUser(userId),
            dynamoManager.getUserTodos(userId)
        ]);
        
        if (!user) {
            return createResponse(404, { 
                error: 'User not found',
                userId: userId 
            });
        }
        
        // Calculate todo statistics
        const todoStats = {
            total: todos.length,
            pending: todos.filter(t => t.status === 'pending').length,
            in_progress: todos.filter(t => t.status === 'in_progress').length,
            completed: todos.filter(t => t.status === 'completed').length,
            overdue: todos.filter(t => t.due_date && new Date(t.due_date) < new Date()).length
        };
        
        const recentTodos = todos
            .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
            .slice(0, 5);
        
        return createResponse(200, {
            user: user,
            todoStats: todoStats,
            recentTodos: recentTodos,
            generatedAt: new Date().toISOString()
        });
    } catch (error) {
        logError('Error getting dashboard data', error);
        return createResponse(500, { 
            error: 'Failed to get dashboard data',
            message: error.message 
        });
    }
}

/**
 * Demo endpoint - creates sample data and demonstrates all operations
 */
async function handleDemo() {
    try {
        const demo = {
            timestamp: new Date().toISOString(),
            operations: []
        };
        
        // 1. Create a demo user
        const demoUser = {
            id: uuidv4(),
            name: 'Demo User',
            email: `demo.${Date.now()}@example.com`,
            department: 'Engineering',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        const createdUser = await rdsManager.createUser(demoUser);
        demo.operations.push({
            operation: 'CREATE_USER',
            status: 'success',
            data: createdUser
        });
        
        // 2. Create demo todos
        const demoTodos = [
            {
                id: uuidv4(),
                user_id: createdUser.id,
                title: 'Complete AWS Lambda integration',
                description: 'Integrate Lambda with RDS and DynamoDB',
                status: 'in_progress',
                priority: 'high',
                due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            },
            {
                id: uuidv4(),
                user_id: createdUser.id,
                title: 'Write documentation',
                description: 'Document the integrated demo project',
                status: 'pending',
                priority: 'medium',
                due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }
        ];
        
        const createdTodos = [];
        for (const todo of demoTodos) {
            const createdTodo = await dynamoManager.createTodo(todo);
            createdTodos.push(createdTodo);
        }
        
        demo.operations.push({
            operation: 'CREATE_TODOS',
            status: 'success',
            data: createdTodos
        });
        
        // 3. Get dashboard data
        const [user, todos] = await Promise.all([
            rdsManager.getUser(createdUser.id),
            dynamoManager.getUserTodos(createdUser.id)
        ]);
        
        demo.operations.push({
            operation: 'GET_DASHBOARD',
            status: 'success',
            data: {
                user: user,
                todoCount: todos.length
            }
        });
        
        // 4. Update a todo
        const updatedTodo = await dynamoManager.updateTodo(createdTodos[0].id, {
            status: 'completed'
        });
        
        demo.operations.push({
            operation: 'UPDATE_TODO',
            status: 'success',
            data: updatedTodo
        });
        
        return createResponse(200, {
            message: 'Demo completed successfully',
            demo: demo
        });
        
    } catch (error) {
        logError('Error in demo', error);
        return createResponse(500, { 
            error: 'Demo failed',
            message: error.message 
        });
    }
}
