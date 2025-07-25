/**
 * Common utilities and constants for AWS IAM entities
 */

// IAM API actions
export const IAM_ACTIONS = {
    // Policy actions
    CREATE_POLICY: "CreatePolicy",
    GET_POLICY: "GetPolicy",
    UPDATE_POLICY: "UpdatePolicy",
    DELETE_POLICY: "DeletePolicy",
    LIST_POLICIES: "ListPolicies",
    CREATE_POLICY_VERSION: "CreatePolicyVersion",
    GET_POLICY_VERSION: "GetPolicyVersion",
    DELETE_POLICY_VERSION: "DeletePolicyVersion",
    LIST_POLICY_VERSIONS: "ListPolicyVersions",
    SET_DEFAULT_POLICY_VERSION: "SetDefaultPolicyVersion",
    LIST_ENTITIES_FOR_POLICY: "ListEntitiesForPolicy",
    
    // User actions
    CREATE_USER: "CreateUser",
    GET_USER: "GetUser",
    UPDATE_USER: "UpdateUser", 
    DELETE_USER: "DeleteUser",
    LIST_USERS: "ListUsers",
    
    // Group actions
    CREATE_GROUP: "CreateGroup",
    GET_GROUP: "GetGroup",
    UPDATE_GROUP: "UpdateGroup",
    DELETE_GROUP: "DeleteGroup",
    LIST_GROUPS: "ListGroups",
    
    // Role actions
    CREATE_ROLE: "CreateRole",
    GET_ROLE: "GetRole",
    UPDATE_ROLE: "UpdateRole",
    DELETE_ROLE: "DeleteRole",
    LIST_ROLES: "ListRoles",
    
    // Attachment actions
    ATTACH_USER_POLICY: "AttachUserPolicy",
    DETACH_USER_POLICY: "DetachUserPolicy",
    ATTACH_GROUP_POLICY: "AttachGroupPolicy",
    DETACH_GROUP_POLICY: "DetachGroupPolicy",
    ATTACH_ROLE_POLICY: "AttachRolePolicy",
    DETACH_ROLE_POLICY: "DetachRolePolicy",
    
    // Access key actions
    CREATE_ACCESS_KEY: "CreateAccessKey",
    DELETE_ACCESS_KEY: "DeleteAccessKey",
    LIST_ACCESS_KEYS: "ListAccessKeys",
    UPDATE_ACCESS_KEY: "UpdateAccessKey",
    
    // Policy simulation
    SIMULATE_PRINCIPAL_POLICY: "SimulatePrincipalPolicy",
    SIMULATE_CUSTOM_POLICY: "SimulateCustomPolicy",
} as const;

// IAM Policy effects
export const POLICY_EFFECTS = {
    ALLOW: "Allow",
    DENY: "Deny",
} as const;

// Common IAM policy conditions
export const POLICY_CONDITIONS = {
    // String conditions
    STRING_EQUALS: "StringEquals",
    STRING_NOT_EQUALS: "StringNotEquals",
    STRING_EQUALS_IGNORE_CASE: "StringEqualsIgnoreCase",
    STRING_NOT_EQUALS_IGNORE_CASE: "StringNotEqualsIgnoreCase",
    STRING_LIKE: "StringLike",
    STRING_NOT_LIKE: "StringNotLike",
    
    // Numeric conditions
    NUMERIC_EQUALS: "NumericEquals",
    NUMERIC_NOT_EQUALS: "NumericNotEquals",
    NUMERIC_LESS_THAN: "NumericLessThan",
    NUMERIC_LESS_THAN_EQUALS: "NumericLessThanEquals",
    NUMERIC_GREATER_THAN: "NumericGreaterThan",
    NUMERIC_GREATER_THAN_EQUALS: "NumericGreaterThanEquals",
    
    // Date conditions
    DATE_EQUALS: "DateEquals",
    DATE_NOT_EQUALS: "DateNotEquals",
    DATE_LESS_THAN: "DateLessThan",
    DATE_LESS_THAN_EQUALS: "DateLessThanEquals",
    DATE_GREATER_THAN: "DateGreaterThan",
    DATE_GREATER_THAN_EQUALS: "DateGreaterThanEquals",
    
    // Boolean condition
    BOOL: "Bool",
    
    // Binary conditions
    BINARY_EQUALS: "BinaryEquals",
    
    // IP address conditions
    IP_ADDRESS: "IpAddress",
    NOT_IP_ADDRESS: "NotIpAddress",
    
    // ARN conditions
    ARN_EQUALS: "ArnEquals",
    ARN_NOT_EQUALS: "ArnNotEquals",
    ARN_LIKE: "ArnLike",
    ARN_NOT_LIKE: "ArnNotLike",
} as const;

// Common AWS condition keys
export const AWS_CONDITION_KEYS = {
    // Global condition keys
    CURRENT_TIME: "aws:CurrentTime",
    EPOCH_TIME: "aws:EpochTime",
    MULTI_FACTOR_AUTH: "aws:MultiFactorAuth",
    MULTI_FACTOR_AUTH_AGE: "aws:MultiFactorAuthAge",
    PRINCIPAL_ARN: "aws:PrincipalArn",
    PRINCIPAL_TYPE: "aws:PrincipalType",
    REFERER: "aws:Referer",
    REQUESTED_REGION: "aws:RequestedRegion",
    SECURE_TRANSPORT: "aws:SecureTransport",
    SOURCE_IP: "aws:SourceIp",
    USER_AGENT: "aws:UserAgent",
    USERID: "aws:userid",
    USERNAME: "aws:username",
    
    // Service-specific condition keys
    S3_BUCKET: "s3:Bucket",
    S3_OBJECT_KEY: "s3:Object",
    EC2_INSTANCE_TYPE: "ec2:InstanceType",
    EC2_REGION: "ec2:Region",
    IAM_POLICY_ARN: "iam:PolicyArn",
} as const;

// IAM resource types
export const IAM_RESOURCE_TYPES = {
    POLICY: "policy",
    USER: "user", 
    GROUP: "group",
    ROLE: "role",
    ACCESS_KEY: "access-key",
    MFA_DEVICE: "mfa",
    SAML_PROVIDER: "saml-provider",
    OIDC_PROVIDER: "oidc-provider",
    SERVER_CERTIFICATE: "server-certificate",
} as const;

// IAM path constants
export const IAM_PATHS = {
    ROOT: "/",
    SERVICE_ROLE: "/service-role/",
    APPLICATION: "/application/",
} as const;

// Maximum limits for IAM resources
export const IAM_LIMITS = {
    POLICY_SIZE_MAX: 6144, // 6KB
    POLICY_VERSIONS_MAX: 5,
    POLICIES_PER_USER_MAX: 10,
    POLICIES_PER_GROUP_MAX: 10,
    POLICIES_PER_ROLE_MAX: 10,
    USERS_PER_ACCOUNT_MAX: 5000,
    GROUPS_PER_ACCOUNT_MAX: 300,
    ROLES_PER_ACCOUNT_MAX: 1000,
    POLICIES_PER_ACCOUNT_MAX: 1500,
    ACCESS_KEYS_PER_USER_MAX: 2,
} as const;

// Common IAM error codes
export const IAM_ERROR_CODES = {
    ACCESS_DENIED: "AccessDenied",
    ALREADY_EXISTS: "EntityAlreadyExists",
    CONFLICT: "Conflict",
    INVALID_INPUT: "InvalidInput",
    LIMIT_EXCEEDED: "LimitExceeded",
    MALFORMED_POLICY_DOCUMENT: "MalformedPolicyDocument",
    NO_SUCH_ENTITY: "NoSuchEntity",
    POLICY_EVALUATION_EXCEPTION: "PolicyEvaluationException",
    SERVICE_FAILURE: "ServiceFailure",
    THROTTLING: "Throttling",
    VALIDATION_ERROR: "ValidationError",
} as const;

// Helper function to create ARN for IAM resources
export function createIAMArn(
    accountId: string, 
    resourceType: string, 
    resourceName: string, 
    path: string = "/"
): string {
    return `arn:aws:iam::${accountId}:${resourceType}${path}${resourceName}`;
}

// Helper function to validate policy document
export function validatePolicyDocument(policyDoc: any): boolean {
    try {
        if (typeof policyDoc === 'string') {
            policyDoc = JSON.parse(policyDoc);
        }
        
        // Basic validation
        if (!policyDoc.Version) {
            return false;
        }
        
        if (!policyDoc.Statement || !Array.isArray(policyDoc.Statement)) {
            return false;
        }
        
        for (const statement of policyDoc.Statement) {
            if (!statement.Effect || !statement.Action) {
                return false;
            }
            
            if (statement.Effect !== POLICY_EFFECTS.ALLOW && statement.Effect !== POLICY_EFFECTS.DENY) {
                return false;
            }
        }
        
        return true;
    } catch (error) {
        return false;
    }
}

// Helper function to create a basic policy document
export function createBasicPolicyDocument(
    effect: string,
    actions: string | string[],
    resources: string | string[],
    conditions?: Record<string, any>
): any {
    const statement: any = {
        Effect: effect,
        Action: Array.isArray(actions) ? actions : [actions],
        Resource: Array.isArray(resources) ? resources : [resources],
    };
    
    if (conditions) {
        statement.Condition = conditions;
    }
    
    return {
        Version: "2012-10-17",
        Statement: [statement]
    };
}

// Helper function to merge policy statements
export function mergePolicyStatements(statements: any[]): any {
    return {
        Version: "2012-10-17", 
        Statement: statements
    };
}

// Helper function to format IAM resource name (removes invalid characters)
export function formatIAMResourceName(name: string): string {
    // IAM resource names can contain alphanumeric characters, plus signs (+), equal signs (=), 
    // commas (,), periods (.), at signs (@), and hyphens (-). 
    return name.replace(/[^a-zA-Z0-9+=,.@-]/g, '');
}

// Helper function to get policy statement by SID
export function getPolicyStatementBySid(policyDoc: any, sid: string): any | null {
    try {
        if (typeof policyDoc === 'string') {
            policyDoc = JSON.parse(policyDoc);
        }
        
        if (!policyDoc.Statement || !Array.isArray(policyDoc.Statement)) {
            return null;
        }
        
        return policyDoc.Statement.find((stmt: any) => stmt.Sid === sid) || null;
    } catch (error) {
        return null;
    }
}

// Helper function to extract policy actions
export function extractPolicyActions(policyDoc: any): string[] {
    try {
        if (typeof policyDoc === 'string') {
            policyDoc = JSON.parse(policyDoc);
        }
        
        if (!policyDoc.Statement || !Array.isArray(policyDoc.Statement)) {
            return [];
        }
        
        const actions: string[] = [];
        for (const statement of policyDoc.Statement) {
            if (statement.Action) {
                if (Array.isArray(statement.Action)) {
                    actions.push(...statement.Action);
                } else {
                    actions.push(statement.Action);
                }
            }
        }
        
        return [...new Set(actions)]; // Remove duplicates
    } catch (error) {
        return [];
    }
}

// Helper function to check if policy allows specific action
export function policyAllowsAction(policyDoc: any, action: string): boolean {
    try {
        if (typeof policyDoc === 'string') {
            policyDoc = JSON.parse(policyDoc);
        }
        
        if (!policyDoc.Statement || !Array.isArray(policyDoc.Statement)) {
            return false;
        }
        
        for (const statement of policyDoc.Statement) {
            if (statement.Effect === POLICY_EFFECTS.ALLOW && statement.Action) {
                const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
                for (const policyAction of actions) {
                    // Support wildcards
                    if (policyAction === "*" || policyAction === action) {
                        return true;
                    }
                    // Support service wildcards like "s3:*"
                    if (policyAction.endsWith("*") && action.startsWith(policyAction.slice(0, -1))) {
                        return true;
                    }
                }
            }
        }
        
        return false;
    } catch (error) {
        return false;
    }
} 