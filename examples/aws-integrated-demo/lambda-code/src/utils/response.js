/**
 * Utility functions for HTTP responses and logging
 */

/**
 * Create standardized HTTP response for Lambda
 */
function createResponse(statusCode, body, additionalHeaders = {}) {
    const response = {
        statusCode: statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'X-Timestamp': new Date().toISOString(),
            ...additionalHeaders
        },
        body: JSON.stringify(body, null, 2)
    };
    
    // Log response for debugging (but not the full body for large responses)
    const logBody = typeof body === 'object' && body !== null 
        ? { ...body, responseSize: JSON.stringify(body).length }
        : body;
        
    logInfo('HTTP Response', { 
        statusCode, 
        bodyPreview: JSON.stringify(logBody).substring(0, 200) + '...'
    });
    
    return response;
}

/**
 * Create standardized success response
 */
function createSuccessResponse(data, message = 'Success') {
    return createResponse(200, {
        success: true,
        message: message,
        data: data,
        timestamp: new Date().toISOString()
    });
}

/**
 * Create standardized error response
 */
function createErrorResponse(statusCode, error, details = null) {
    const errorBody = {
        success: false,
        error: error,
        timestamp: new Date().toISOString()
    };
    
    if (details) {
        errorBody.details = details;
    }
    
    return createResponse(statusCode, errorBody);
}

/**
 * Create response for validation errors
 */
function createValidationErrorResponse(errors) {
    return createResponse(400, {
        success: false,
        error: 'Validation failed',
        validationErrors: errors,
        timestamp: new Date().toISOString()
    });
}

/**
 * Create response for not found errors
 */
function createNotFoundResponse(resource, id = null) {
    const errorBody = {
        success: false,
        error: `${resource} not found`,
        timestamp: new Date().toISOString()
    };
    
    if (id) {
        errorBody.resourceId = id;
    }
    
    return createResponse(404, errorBody);
}

/**
 * Create response for server errors
 */
function createServerErrorResponse(error) {
    // Don't expose internal error details in production
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    const errorBody = {
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
    };
    
    if (isDevelopment && error) {
        errorBody.details = {
            message: error.message,
            stack: error.stack
        };
    }
    
    return createResponse(500, errorBody);
}

/**
 * Enhanced logging function with structured output
 */
function logInfo(message, data = null, context = null) {
    const logEntry = {
        level: 'INFO',
        timestamp: new Date().toISOString(),
        message: message,
        requestId: context?.awsRequestId || process.env.AWS_REQUEST_ID || 'unknown',
        functionName: context?.functionName || process.env.AWS_LAMBDA_FUNCTION_NAME || 'unknown',
        functionVersion: context?.functionVersion || process.env.AWS_LAMBDA_FUNCTION_VERSION || 'unknown'
    };
    
    if (data) {
        logEntry.data = data;
    }
    
    console.log(JSON.stringify(logEntry));
}

/**
 * Enhanced error logging function
 */
function logError(message, error = null, context = null) {
    const logEntry = {
        level: 'ERROR',
        timestamp: new Date().toISOString(),
        message: message,
        requestId: context?.awsRequestId || process.env.AWS_REQUEST_ID || 'unknown',
        functionName: context?.functionName || process.env.AWS_LAMBDA_FUNCTION_NAME || 'unknown',
        functionVersion: context?.functionVersion || process.env.AWS_LAMBDA_FUNCTION_VERSION || 'unknown'
    };
    
    if (error) {
        logEntry.error = {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: error.code
        };
    }
    
    console.error(JSON.stringify(logEntry));
}

/**
 * Log warning messages
 */
function logWarning(message, data = null, context = null) {
    const logEntry = {
        level: 'WARNING',
        timestamp: new Date().toISOString(),
        message: message,
        requestId: context?.awsRequestId || process.env.AWS_REQUEST_ID || 'unknown',
        functionName: context?.functionName || process.env.AWS_LAMBDA_FUNCTION_NAME || 'unknown'
    };
    
    if (data) {
        logEntry.data = data;
    }
    
    console.warn(JSON.stringify(logEntry));
}

/**
 * Log debug messages (only in development)
 */
function logDebug(message, data = null, context = null) {
    if (process.env.NODE_ENV === 'production' && process.env.LOG_LEVEL !== 'debug') {
        return;
    }
    
    const logEntry = {
        level: 'DEBUG',
        timestamp: new Date().toISOString(),
        message: message,
        requestId: context?.awsRequestId || process.env.AWS_REQUEST_ID || 'unknown'
    };
    
    if (data) {
        logEntry.data = data;
    }
    
    console.debug(JSON.stringify(logEntry));
}

/**
 * Create CORS preflight response
 */
function createCorsResponse() {
    return createResponse(200, {}, {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Max-Age': '86400'
    });
}

/**
 * Parse and validate JSON body
 */
function parseJsonBody(event) {
    try {
        if (!event.body) {
            return null;
        }
        
        return JSON.parse(event.body);
    } catch (error) {
        throw new Error('Invalid JSON in request body');
    }
}

/**
 * Extract and validate path parameters
 */
function getPathParameter(event, paramName, required = true) {
    const value = event.pathParameters?.[paramName];
    
    if (required && !value) {
        throw new Error(`Missing required path parameter: ${paramName}`);
    }
    
    return value;
}

/**
 * Extract and validate query parameters
 */
function getQueryParameter(event, paramName, defaultValue = null) {
    return event.queryStringParameters?.[paramName] || defaultValue;
}

/**
 * Get HTTP method from event (handles both API Gateway formats)
 */
function getHttpMethod(event) {
    return event.httpMethod || event.requestContext?.http?.method || 'GET';
}

/**
 * Get request path from event (handles both API Gateway formats)
 */
function getRequestPath(event) {
    return event.path || event.rawPath || '/';
}

/**
 * Measure execution time of async functions
 */
async function measureExecutionTime(fn, context) {
    const startTime = Date.now();
    
    try {
        const result = await fn();
        const executionTime = Date.now() - startTime;
        
        logInfo('Function execution completed', {
            executionTimeMs: executionTime,
            functionName: fn.name || 'anonymous'
        }, context);
        
        return result;
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        logError('Function execution failed', {
            ...error,
            executionTimeMs: executionTime,
            functionName: fn.name || 'anonymous'
        }, context);
        
        throw error;
    }
}

/**
 * Rate limiting check (basic implementation)
 */
function checkRateLimit(requesterId, maxRequests = 100, windowMs = 60000) {
    // This is a basic in-memory implementation
    // In production, you'd use Redis or DynamoDB
    if (!global.rateLimitStore) {
        global.rateLimitStore = new Map();
    }
    
    const now = Date.now();
    const windowStart = now - windowMs;
    
    const requesterData = global.rateLimitStore.get(requesterId) || [];
    const validRequests = requesterData.filter(timestamp => timestamp > windowStart);
    
    if (validRequests.length >= maxRequests) {
        return {
            allowed: false,
            retryAfter: Math.ceil((validRequests[0] + windowMs - now) / 1000)
        };
    }
    
    validRequests.push(now);
    global.rateLimitStore.set(requesterId, validRequests);
    
    return { allowed: true };
}

module.exports = {
    createResponse,
    createSuccessResponse,
    createErrorResponse,
    createValidationErrorResponse,
    createNotFoundResponse,
    createServerErrorResponse,
    createCorsResponse,
    logInfo,
    logError,
    logWarning,
    logDebug,
    parseJsonBody,
    getPathParameter,
    getQueryParameter,
    getHttpMethod,
    getRequestPath,
    measureExecutionTime,
    checkRateLimit
};
