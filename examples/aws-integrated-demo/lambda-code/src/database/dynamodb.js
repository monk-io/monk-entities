const { 
    PutCommand, 
    GetCommand, 
    UpdateCommand, 
    DeleteCommand, 
    ScanCommand,
    QueryCommand 
} = require('@aws-sdk/lib-dynamodb');
const { logInfo, logError } = require('../utils/response');

/**
 * DynamoDB Manager for todo item operations
 * Handles high-performance todo data with flexible schema
 */
class DynamoDBManager {
    constructor(config) {
        this.docClient = config.docClient;
        this.tableName = config.tableName;
        this.userIndex = config.userIndex;
        
        if (!this.tableName) {
            throw new Error('DynamoDB table name is required');
        }
        
        logInfo('DynamoDB Manager initialized', { 
            tableName: this.tableName,
            userIndex: this.userIndex 
        });
    }

    /**
     * Test DynamoDB connection
     */
    async testConnection() {
        try {
            const command = new ScanCommand({
                TableName: this.tableName,
                Select: 'COUNT',
                Limit: 1
            });
            
            const response = await this.docClient.send(command);
            
            return {
                status: 'connected',
                tableName: this.tableName,
                itemCount: response.Count || 0,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logError('DynamoDB connection test failed', error);
            throw error;
        }
    }

    /**
     * Health check for DynamoDB
     */
    async healthCheck() {
        try {
            const connectionInfo = await this.testConnection();
            const stats = await this.getTableStats();
            
            return {
                ...connectionInfo,
                statistics: stats
            };
        } catch (error) {
            throw new Error(`DynamoDB health check failed: ${error.message}`);
        }
    }

    /**
     * Get table statistics
     */
    async getTableStats() {
        try {
            const command = new ScanCommand({
                TableName: this.tableName,
                Select: 'COUNT'
            });
            
            const response = await this.docClient.send(command);
            
            return {
                totalItems: response.Count || 0,
                scannedCount: response.ScannedCount || 0,
                lastUpdated: new Date().toISOString()
            };
        } catch (error) {
            logError('Error getting DynamoDB table stats', error);
            throw error;
        }
    }

    /**
     * Create a new todo item
     */
    async createTodo(todo) {
        const command = new PutCommand({
            TableName: this.tableName,
            Item: todo,
            ConditionExpression: 'attribute_not_exists(id)'
        });

        try {
            await this.docClient.send(command);
            logInfo('Todo created in DynamoDB', { todoId: todo.id, userId: todo.user_id });
            
            return todo;
        } catch (error) {
            if (error.name === 'ConditionalCheckFailedException') {
                throw new Error('Todo with this ID already exists');
            }
            logError('Error creating todo in DynamoDB', error);
            throw error;
        }
    }

    /**
     * Get todo by ID
     */
    async getTodo(todoId) {
        const command = new GetCommand({
            TableName: this.tableName,
            Key: { id: todoId }
        });

        try {
            const response = await this.docClient.send(command);
            
            if (!response.Item) {
                return null;
            }

            logInfo('Todo retrieved from DynamoDB', { todoId: response.Item.id });
            return response.Item;
        } catch (error) {
            logError('Error getting todo from DynamoDB', error);
            throw error;
        }
    }

    /**
     * Get all todos for a user, optionally filtered by status
     */
    async getUserTodos(userId, status = null) {
        try {
            let command;
            
            if (status) {
                // Query using GSI with status filter
                command = new QueryCommand({
                    TableName: this.tableName,
                    IndexName: this.userIndex,
                    KeyConditionExpression: 'user_id = :userId AND #status = :status',
                    ExpressionAttributeNames: {
                        '#status': 'status'
                    },
                    ExpressionAttributeValues: {
                        ':userId': userId,
                        ':status': status
                    },
                    ScanIndexForward: false // Sort by sort key descending
                });
            } else {
                // Query all todos for user using GSI
                command = new QueryCommand({
                    TableName: this.tableName,
                    IndexName: this.userIndex,
                    KeyConditionExpression: 'user_id = :userId',
                    ExpressionAttributeValues: {
                        ':userId': userId
                    },
                    ScanIndexForward: false // Sort by sort key descending
                });
            }

            const response = await this.docClient.send(command);
            const todos = response.Items || [];
            
            logInfo('User todos retrieved from DynamoDB', { 
                userId, 
                status, 
                count: todos.length 
            });
            
            return todos;
        } catch (error) {
            logError('Error getting user todos from DynamoDB', error);
            throw error;
        }
    }

    /**
     * Update todo item
     */
    async updateTodo(todoId, updates) {
        const allowedFields = ['title', 'description', 'status', 'priority', 'due_date'];
        const fieldsToUpdate = Object.keys(updates).filter(field => allowedFields.includes(field));
        
        if (fieldsToUpdate.length === 0) {
            throw new Error('No valid fields to update');
        }

        // Build update expression
        const updateExpressions = [];
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};

        fieldsToUpdate.forEach(field => {
            updateExpressions.push(`#${field} = :${field}`);
            expressionAttributeNames[`#${field}`] = field;
            expressionAttributeValues[`:${field}`] = updates[field];
        });

        // Always update the timestamp
        updateExpressions.push('#updated_at = :updated_at');
        expressionAttributeNames['#updated_at'] = 'updated_at';
        expressionAttributeValues[':updated_at'] = new Date().toISOString();

        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: { id: todoId },
            UpdateExpression: `SET ${updateExpressions.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW',
            ConditionExpression: 'attribute_exists(id)'
        });

        try {
            const response = await this.docClient.send(command);
            const updatedTodo = response.Attributes;
            
            logInfo('Todo updated in DynamoDB', { todoId, fields: fieldsToUpdate });
            
            return updatedTodo;
        } catch (error) {
            if (error.name === 'ConditionalCheckFailedException') {
                return null; // Todo not found
            }
            logError('Error updating todo in DynamoDB', error);
            throw error;
        }
    }

    /**
     * Delete todo item
     */
    async deleteTodo(todoId) {
        const command = new DeleteCommand({
            TableName: this.tableName,
            Key: { id: todoId },
            ReturnValues: 'ALL_OLD',
            ConditionExpression: 'attribute_exists(id)'
        });

        try {
            const response = await this.docClient.send(command);
            
            if (!response.Attributes) {
                return null; // Todo not found
            }

            const deletedTodo = response.Attributes;
            logInfo('Todo deleted from DynamoDB', { todoId });
            
            return deletedTodo;
        } catch (error) {
            if (error.name === 'ConditionalCheckFailedException') {
                return null; // Todo not found
            }
            logError('Error deleting todo from DynamoDB', error);
            throw error;
        }
    }

    /**
     * Get todos by status across all users (for admin/reporting)
     */
    async getTodosByStatus(status, limit = 50) {
        const command = new ScanCommand({
            TableName: this.tableName,
            FilterExpression: '#status = :status',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':status': status
            },
            Limit: limit
        });

        try {
            const response = await this.docClient.send(command);
            const todos = response.Items || [];
            
            logInfo('Todos by status retrieved from DynamoDB', { 
                status, 
                count: todos.length,
                scannedCount: response.ScannedCount 
            });
            
            return {
                todos: todos,
                count: response.Count || 0,
                scannedCount: response.ScannedCount || 0,
                hasMore: !!response.LastEvaluatedKey
            };
        } catch (error) {
            logError('Error getting todos by status from DynamoDB', error);
            throw error;
        }
    }

    /**
     * Get overdue todos across all users
     */
    async getOverdueTodos() {
        const now = new Date().toISOString();
        
        const command = new ScanCommand({
            TableName: this.tableName,
            FilterExpression: 'due_date < :now AND #status <> :completed',
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':now': now,
                ':completed': 'completed'
            }
        });

        try {
            const response = await this.docClient.send(command);
            const overdueTodos = response.Items || [];
            
            logInfo('Overdue todos retrieved from DynamoDB', { 
                count: overdueTodos.length 
            });
            
            return overdueTodos;
        } catch (error) {
            logError('Error getting overdue todos from DynamoDB', error);
            throw error;
        }
    }

    /**
     * Batch create multiple todos
     */
    async batchCreateTodos(todos) {
        const results = [];
        const errors = [];

        // Process todos sequentially to avoid throttling
        for (const todo of todos) {
            try {
                const result = await this.createTodo(todo);
                results.push(result);
            } catch (error) {
                errors.push({
                    todo: todo,
                    error: error.message
                });
            }
        }

        logInfo('Batch todo creation completed', { 
            successful: results.length,
            failed: errors.length 
        });

        return {
            successful: results,
            failed: errors
        };
    }

    /**
     * Get todo statistics for analytics
     */
    async getTodoAnalytics(userId = null) {
        try {
            let command;
            
            if (userId) {
                // Get analytics for specific user
                command = new QueryCommand({
                    TableName: this.tableName,
                    IndexName: this.userIndex,
                    KeyConditionExpression: 'user_id = :userId',
                    ExpressionAttributeValues: {
                        ':userId': userId
                    }
                });
            } else {
                // Get analytics for all todos
                command = new ScanCommand({
                    TableName: this.tableName
                });
            }

            const response = await this.docClient.send(command);
            const todos = response.Items || [];

            // Calculate statistics
            const analytics = {
                total: todos.length,
                byStatus: {},
                byPriority: {},
                overdue: 0,
                averageAgeInDays: 0
            };

            const now = new Date();
            let totalAgeInMs = 0;

            todos.forEach(todo => {
                // Count by status
                analytics.byStatus[todo.status] = (analytics.byStatus[todo.status] || 0) + 1;
                
                // Count by priority
                analytics.byPriority[todo.priority] = (analytics.byPriority[todo.priority] || 0) + 1;
                
                // Check if overdue
                if (todo.due_date && new Date(todo.due_date) < now && todo.status !== 'completed') {
                    analytics.overdue++;
                }
                
                // Calculate age
                const createdAt = new Date(todo.created_at);
                totalAgeInMs += (now - createdAt);
            });

            if (todos.length > 0) {
                analytics.averageAgeInDays = Math.round((totalAgeInMs / todos.length) / (1000 * 60 * 60 * 24));
            }

            logInfo('Todo analytics calculated', { userId, totalTodos: todos.length });
            
            return analytics;
        } catch (error) {
            logError('Error getting todo analytics from DynamoDB', error);
            throw error;
        }
    }
}

module.exports = { DynamoDBManager };
