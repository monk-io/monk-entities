/**
 * Input validation utilities for API requests
 */

/**
 * Validate user data
 */
function validateUser(userData) {
    const errors = [];
    
    // Name validation
    if (!userData.name || typeof userData.name !== 'string') {
        errors.push('Name is required and must be a string');
    } else if (userData.name.trim().length < 2) {
        errors.push('Name must be at least 2 characters long');
    } else if (userData.name.length > 255) {
        errors.push('Name must be no more than 255 characters long');
    }
    
    // Email validation
    if (!userData.email || typeof userData.email !== 'string') {
        errors.push('Email is required and must be a string');
    } else if (!isValidEmail(userData.email)) {
        errors.push('Email must be a valid email address');
    } else if (userData.email.length > 255) {
        errors.push('Email must be no more than 255 characters long');
    }
    
    // Department validation (optional)
    if (userData.department !== undefined && userData.department !== null) {
        if (typeof userData.department !== 'string') {
            errors.push('Department must be a string');
        } else if (userData.department.length > 100) {
            errors.push('Department must be no more than 100 characters long');
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Validate todo data
 */
function validateTodo(todoData) {
    const errors = [];
    
    // Title validation
    if (!todoData.title || typeof todoData.title !== 'string') {
        errors.push('Title is required and must be a string');
    } else if (todoData.title.trim().length < 1) {
        errors.push('Title cannot be empty');
    } else if (todoData.title.length > 255) {
        errors.push('Title must be no more than 255 characters long');
    }
    
    // Description validation (optional)
    if (todoData.description !== undefined && todoData.description !== null) {
        if (typeof todoData.description !== 'string') {
            errors.push('Description must be a string');
        } else if (todoData.description.length > 1000) {
            errors.push('Description must be no more than 1000 characters long');
        }
    }
    
    // Status validation (optional)
    if (todoData.status !== undefined && todoData.status !== null) {
        const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
        if (!validStatuses.includes(todoData.status)) {
            errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
        }
    }
    
    // Priority validation (optional)
    if (todoData.priority !== undefined && todoData.priority !== null) {
        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        if (!validPriorities.includes(todoData.priority)) {
            errors.push(`Priority must be one of: ${validPriorities.join(', ')}`);
        }
    }
    
    // Due date validation (optional)
    if (todoData.due_date !== undefined && todoData.due_date !== null) {
        if (!isValidDate(todoData.due_date)) {
            errors.push('Due date must be a valid ISO 8601 date string');
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Validate todo update data
 */
function validateTodoUpdate(updateData) {
    const errors = [];
    
    // Check if at least one field is provided
    const allowedFields = ['title', 'description', 'status', 'priority', 'due_date'];
    const providedFields = Object.keys(updateData).filter(key => allowedFields.includes(key));
    
    if (providedFields.length === 0) {
        errors.push(`At least one field must be provided: ${allowedFields.join(', ')}`);
        return {
            isValid: false,
            errors: errors
        };
    }
    
    // Validate individual fields if provided
    if ('title' in updateData) {
        if (!updateData.title || typeof updateData.title !== 'string') {
            errors.push('Title must be a non-empty string');
        } else if (updateData.title.length > 255) {
            errors.push('Title must be no more than 255 characters long');
        }
    }
    
    if ('description' in updateData) {
        if (updateData.description !== null && typeof updateData.description !== 'string') {
            errors.push('Description must be a string or null');
        } else if (updateData.description && updateData.description.length > 1000) {
            errors.push('Description must be no more than 1000 characters long');
        }
    }
    
    if ('status' in updateData) {
        const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
        if (!validStatuses.includes(updateData.status)) {
            errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
        }
    }
    
    if ('priority' in updateData) {
        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        if (!validPriorities.includes(updateData.priority)) {
            errors.push(`Priority must be one of: ${validPriorities.join(', ')}`);
        }
    }
    
    if ('due_date' in updateData) {
        if (updateData.due_date !== null && !isValidDate(updateData.due_date)) {
            errors.push('Due date must be a valid ISO 8601 date string or null');
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Validate user ID (UUID format)
 */
function validateUserId(userId) {
    const errors = [];
    
    if (!userId || typeof userId !== 'string') {
        errors.push('User ID is required and must be a string');
    } else if (!isValidUuid(userId)) {
        errors.push('User ID must be a valid UUID');
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Validate todo ID (UUID format)
 */
function validateTodoId(todoId) {
    const errors = [];
    
    if (!todoId || typeof todoId !== 'string') {
        errors.push('Todo ID is required and must be a string');
    } else if (!isValidUuid(todoId)) {
        errors.push('Todo ID must be a valid UUID');
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Validate pagination parameters
 */
function validatePagination(queryParams) {
    const errors = [];
    const result = {
        limit: 10,
        offset: 0
    };
    
    // Validate limit
    if (queryParams.limit !== undefined) {
        const limit = parseInt(queryParams.limit);
        if (isNaN(limit) || limit < 1) {
            errors.push('Limit must be a positive integer');
        } else if (limit > 100) {
            errors.push('Limit must not exceed 100');
        } else {
            result.limit = limit;
        }
    }
    
    // Validate offset
    if (queryParams.offset !== undefined) {
        const offset = parseInt(queryParams.offset);
        if (isNaN(offset) || offset < 0) {
            errors.push('Offset must be a non-negative integer');
        } else {
            result.offset = offset;
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors,
        pagination: result
    };
}

/**
 * Validate filter parameters for todos
 */
function validateTodoFilters(queryParams) {
    const errors = [];
    const result = {};
    
    // Validate status filter
    if (queryParams.status !== undefined) {
        const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
        if (!validStatuses.includes(queryParams.status)) {
            errors.push(`Status filter must be one of: ${validStatuses.join(', ')}`);
        } else {
            result.status = queryParams.status;
        }
    }
    
    // Validate priority filter
    if (queryParams.priority !== undefined) {
        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        if (!validPriorities.includes(queryParams.priority)) {
            errors.push(`Priority filter must be one of: ${validPriorities.join(', ')}`);
        } else {
            result.priority = queryParams.priority;
        }
    }
    
    // Validate due date filters
    if (queryParams.due_before !== undefined) {
        if (!isValidDate(queryParams.due_before)) {
            errors.push('due_before must be a valid ISO 8601 date string');
        } else {
            result.due_before = queryParams.due_before;
        }
    }
    
    if (queryParams.due_after !== undefined) {
        if (!isValidDate(queryParams.due_after)) {
            errors.push('due_after must be a valid ISO 8601 date string');
        } else {
            result.due_after = queryParams.due_after;
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors,
        filters: result
    };
}

/**
 * Check if email format is valid
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Check if UUID format is valid
 */
function isValidUuid(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}

/**
 * Check if date string is valid ISO 8601 format
 */
function isValidDate(dateString) {
    try {
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date.getTime()) && dateString === date.toISOString();
    } catch {
        return false;
    }
}

/**
 * Sanitize string input (remove potentially harmful characters)
 */
function sanitizeString(input, maxLength = null) {
    if (typeof input !== 'string') {
        return input;
    }
    
    // Remove or escape potentially harmful characters
    let sanitized = input
        .replace(/[<>]/g, '') // Remove angle brackets
        .replace(/['"]/g, '') // Remove quotes
        .trim();
    
    // Truncate if max length specified
    if (maxLength && sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
    }
    
    return sanitized;
}

/**
 * Validate and sanitize user input
 */
function sanitizeUserInput(userData) {
    const sanitized = { ...userData };
    
    if (sanitized.name) {
        sanitized.name = sanitizeString(sanitized.name, 255);
    }
    
    if (sanitized.email) {
        sanitized.email = sanitizeString(sanitized.email, 255).toLowerCase();
    }
    
    if (sanitized.department) {
        sanitized.department = sanitizeString(sanitized.department, 100);
    }
    
    return sanitized;
}

/**
 * Validate and sanitize todo input
 */
function sanitizeTodoInput(todoData) {
    const sanitized = { ...todoData };
    
    if (sanitized.title) {
        sanitized.title = sanitizeString(sanitized.title, 255);
    }
    
    if (sanitized.description) {
        sanitized.description = sanitizeString(sanitized.description, 1000);
    }
    
    return sanitized;
}

/**
 * Comprehensive request validation
 */
function validateRequest(event) {
    const errors = [];
    
    // Check for required headers
    const contentType = event.headers?.['Content-Type'] || event.headers?.['content-type'];
    if (event.body && !contentType?.includes('application/json')) {
        errors.push('Content-Type must be application/json for requests with body');
    }
    
    // Check request size (Lambda has a 6MB limit)
    if (event.body && event.body.length > 5 * 1024 * 1024) { // 5MB limit
        errors.push('Request body is too large');
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

module.exports = {
    validateUser,
    validateTodo,
    validateTodoUpdate,
    validateUserId,
    validateTodoId,
    validatePagination,
    validateTodoFilters,
    validateRequest,
    sanitizeUserInput,
    sanitizeTodoInput,
    sanitizeString,
    isValidEmail,
    isValidUuid,
    isValidDate
};
