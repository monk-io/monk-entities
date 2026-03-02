/**
 * Common types and utilities for AWS Glue Schema Registry entities
 */

/**
 * Schema data format supported by Glue Schema Registry
 */
export type DataFormat = 'AVRO' | 'JSON' | 'PROTOBUF';

/**
 * Schema compatibility mode
 */
export type Compatibility = 
    | 'NONE'
    | 'DISABLED'
    | 'BACKWARD'
    | 'BACKWARD_ALL'
    | 'FORWARD'
    | 'FORWARD_ALL'
    | 'FULL'
    | 'FULL_ALL';

/**
 * Registry status values
 */
export type RegistryStatus = 'AVAILABLE' | 'DELETING';

/**
 * Schema status values
 */
export type SchemaStatus = 'AVAILABLE' | 'PENDING' | 'DELETING';

/**
 * Schema version status values
 */
export type SchemaVersionStatus = 'AVAILABLE' | 'PENDING' | 'FAILURE' | 'DELETING';

/**
 * Registry identifier - can be by ARN or name
 */
export interface RegistryId {
    /** @description Registry ARN */
    RegistryArn?: string;
    /** @description Registry name */
    RegistryName?: string;
}

/**
 * Schema identifier - can be by ARN or name
 */
export interface SchemaId {
    /** @description Schema ARN */
    SchemaArn?: string;
    /** @description Schema name */
    SchemaName?: string;
    /** @description Registry name containing the schema */
    RegistryName?: string;
}

/**
 * Schema version number identifier
 */
export interface SchemaVersionNumber {
    /** @description Latest version flag */
    LatestVersion?: boolean;
    /** @description Specific version number */
    VersionNumber?: number;
}

/**
 * Metadata key-value pair
 */
export interface MetadataKeyValue {
    /** @description Metadata key */
    MetadataKey: string;
    /** @description Metadata value */
    MetadataValue: string;
}

/**
 * Tag structure for AWS resources
 */
export interface Tag {
    Key: string;
    Value: string;
}

/**
 * Validate registry name format
 * Must be 1-255 characters, alphanumeric with hyphens and underscores
 */
export function validateRegistryName(name: string): boolean {
    if (!name || name.length < 1 || name.length > 255) {
        return false;
    }
    return /^[a-zA-Z0-9_-]+$/.test(name);
}

/**
 * Validate schema name format
 * Must be 1-255 characters, alphanumeric with hyphens, underscores, and dots
 */
export function validateSchemaName(name: string): boolean {
    if (!name || name.length < 1 || name.length > 255) {
        return false;
    }
    return /^[a-zA-Z0-9._-]+$/.test(name);
}
