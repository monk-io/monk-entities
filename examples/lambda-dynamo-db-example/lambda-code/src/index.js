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

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({ 
    region: process.env.AWS_REGION || 'us-east-1'
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;

/**
 * AWS Lambda handler function
 * Demonstrates various DynamoDB operations based on HTTP method and path
 */
exports.handler = async (event) => {
    console.log('Lambda Event:', JSON.stringify(event, null, 2));
    
    if (!TABLE_NAME) {
        return createResponse(500, { 
            error: 'DYNAMODB_TABLE_NAME environment variable not set' 
        });
    }

    try {
        // Extract HTTP method and path from event
        const httpMethod = event.httpMethod || event.requestContext?.http?.method || 'GET';
        const path = event.path || event.rawPath || '/';
        const pathParameters = event.pathParameters || {};
        const queryParameters = event.queryStringParameters || {};
        const body = event.body ? JSON.parse(event.body) : {};

        console.log(`Processing ${httpMethod} ${path}`);

        // Route requests based on HTTP method and path
        switch (httpMethod) {
            case 'GET':
                if (path.includes('/users/') && pathParameters.id) {
                    return await getUser(pathParameters.id);
                } else if (path.includes('/users')) {
                    return await listUsers(queryParameters);
                } else if (path.includes('/health')) {
                    return await healthCheck();
                } else {
                    return await getAllOperationsDemo();
                }
                
            case 'POST':
                if (path.includes('/users')) {
                    return await createUser(body);
                }
                break;
                
            case 'PUT':
                if (path.includes('/users/') && pathParameters.id) {
                    return await updateUser(pathParameters.id, body);
                }
                break;
                
            case 'DELETE':
                if (path.includes('/users/') && pathParameters.id) {
                    return await deleteUser(pathParameters.id);
                }
                break;
                
            default:
                return createResponse(405, { 
                    error: 'Method not allowed',
                    supportedMethods: ['GET', 'POST', 'PUT', 'DELETE']
                });
        }

        return createResponse(404, { error: 'Endpoint not found' });

    } catch (error) {
        console.error('Lambda Error:', error);
        return createResponse(500, { 
            error: 'Internal server error',
            message: error.message 
        });
    }
};

/**
 * Health check endpoint
 */
async function healthCheck() {
    try {
        // Simple scan to verify table connectivity
        const command = new ScanCommand({
            TableName: TABLE_NAME,
            Select: 'COUNT',
            Limit: 1
        });
        
        const response = await docClient.send(command);
        
        return createResponse(200, {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            tableName: TABLE_NAME,
            region: process.env.AWS_REGION || 'us-east-1',
            tableItemCount: response.Count || 0
        });
    } catch (error) {
        console.error('Health check failed:', error);
        return createResponse(503, {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

/**
 * Create a new user
 */
async function createUser(userData) {
    const user = {
        id: userData.id || `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: userData.name || 'Unknown User',
        email: userData.email || `user-${Date.now()}@example.com`,
        age: userData.age || Math.floor(Math.random() * 50) + 20,
        department: userData.department || 'Engineering',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: user,
        ConditionExpression: 'attribute_not_exists(id)'
    });

    try {
        await docClient.send(command);
        console.log('User created:', user.id);
        
        return createResponse(201, {
            message: 'User created successfully',
            user: user
        });
    } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            return createResponse(409, { 
                error: 'User already exists',
                userId: user.id 
            });
        }
        throw error;
    }
}

/**
 * Get a specific user by ID
 */
async function getUser(userId) {
    const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: userId }
    });

    const response = await docClient.send(command);
    
    if (!response.Item) {
        return createResponse(404, { 
            error: 'User not found',
            userId: userId 
        });
    }

    return createResponse(200, {
        user: response.Item
    });
}

/**
 * Update an existing user
 */
async function updateUser(userId, updateData) {
    const updates = [];
    const expressionAttributeValues = {};
    const expressionAttributeNames = {};

    // Build dynamic update expression
    if (updateData.name) {
        updates.push('#name = :name');
        expressionAttributeNames['#name'] = 'name';
        expressionAttributeValues[':name'] = updateData.name;
    }
    
    if (updateData.email) {
        updates.push('email = :email');
        expressionAttributeValues[':email'] = updateData.email;
    }
    
    if (updateData.age) {
        updates.push('age = :age');
        expressionAttributeValues[':age'] = updateData.age;
    }
    
    if (updateData.department) {
        updates.push('department = :department');
        expressionAttributeValues[':department'] = updateData.department;
    }

    // Always update the timestamp
    updates.push('updatedAt = :updatedAt');
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();

    if (updates.length === 1) { // Only timestamp update
        return createResponse(400, { 
            error: 'No valid fields to update',
            validFields: ['name', 'email', 'age', 'department']
        });
    }

    const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: userId },
        UpdateExpression: `SET ${updates.join(', ')}`,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ReturnValues: 'ALL_NEW',
        ConditionExpression: 'attribute_exists(id)'
    });

    try {
        const response = await docClient.send(command);
        console.log('User updated:', userId);
        
        return createResponse(200, {
            message: 'User updated successfully',
            user: response.Attributes
        });
    } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            return createResponse(404, { 
                error: 'User not found',
                userId: userId 
            });
        }
        throw error;
    }
}

/**
 * Delete a user
 */
async function deleteUser(userId) {
    const command = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id: userId },
        ReturnValues: 'ALL_OLD',
        ConditionExpression: 'attribute_exists(id)'
    });

    try {
        const response = await docClient.send(command);
        console.log('User deleted:', userId);
        
        return createResponse(200, {
            message: 'User deleted successfully',
            deletedUser: response.Attributes
        });
    } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            return createResponse(404, { 
                error: 'User not found',
                userId: userId 
            });
        }
        throw error;
    }
}

/**
 * List users with optional filtering
 */
async function listUsers(queryParams) {
    const limit = parseInt(queryParams.limit) || 10;
    const department = queryParams.department;
    
    let command;
    
    if (department) {
        // Filter by department using scan with filter expression
        command = new ScanCommand({
            TableName: TABLE_NAME,
            FilterExpression: 'department = :dept',
            ExpressionAttributeValues: {
                ':dept': department
            },
            Limit: limit
        });
    } else {
        // Simple scan
        command = new ScanCommand({
            TableName: TABLE_NAME,
            Limit: limit
        });
    }

    const response = await docClient.send(command);
    
    return createResponse(200, {
        users: response.Items || [],
        count: response.Count || 0,
        scannedCount: response.ScannedCount || 0,
        hasMore: !!response.LastEvaluatedKey
    });
}

/**
 * Demonstrate all operations (for testing/demo purposes)
 */
async function getAllOperationsDemo() {
    const demo = {
        timestamp: new Date().toISOString(),
        tableName: TABLE_NAME,
        operations: []
    };

    try {
        // 1. Create a demo user
        const demoUser = {
            id: `demo-${Date.now()}`,
            name: 'Demo User',
            email: 'demo@example.com',
            age: 30,
            department: 'Engineering',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await docClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: demoUser
        }));
        
        demo.operations.push({
            operation: 'CREATE',
            status: 'success',
            user: demoUser
        });

        // 2. Read the user back
        const getResponse = await docClient.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { id: demoUser.id }
        }));
        
        demo.operations.push({
            operation: 'READ',
            status: 'success',
            user: getResponse.Item
        });

        // 3. Update the user
        const updateResponse = await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { id: demoUser.id },
            UpdateExpression: 'SET age = :newAge, updatedAt = :timestamp',
            ExpressionAttributeValues: {
                ':newAge': 31,
                ':timestamp': new Date().toISOString()
            },
            ReturnValues: 'ALL_NEW'
        }));
        
        demo.operations.push({
            operation: 'UPDATE',
            status: 'success',
            user: updateResponse.Attributes
        });

        // 4. List users (scan)
        const scanResponse = await docClient.send(new ScanCommand({
            TableName: TABLE_NAME,
            Limit: 5
        }));
        
        demo.operations.push({
            operation: 'LIST',
            status: 'success',
            count: scanResponse.Count,
            scannedCount: scanResponse.ScannedCount
        });

        // 5. Delete the demo user
        const deleteResponse = await docClient.send(new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { id: demoUser.id },
            ReturnValues: 'ALL_OLD'
        }));
        
        demo.operations.push({
            operation: 'DELETE',
            status: 'success',
            deletedUser: deleteResponse.Attributes
        });

        return createResponse(200, {
            message: 'Full CRUD operations demo completed successfully',
            demo: demo
        });

    } catch (error) {
        demo.operations.push({
            operation: 'DEMO',
            status: 'error',
            error: error.message
        });
        
        return createResponse(500, {
            message: 'Demo failed',
            demo: demo
        });
    }
}

/**
 * Create standardized HTTP response
 */
function createResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
        },
        body: JSON.stringify(body)
    };
} 