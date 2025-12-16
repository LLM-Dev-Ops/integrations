/**
 * Operation-specific types and options
 *
 * This module defines types specific to object operations, extending
 * the base types from the main types module.
 */

import type { UUID, Properties, Vector } from '../types/index.js';
import type { ConsistencyLevel, WeaviateObject } from '../types/object.js';

/**
 * Options for creating an object (internal service interface)
 */
export interface CreateObjectOptions {
  /**
   * Custom UUID (auto-generated if not provided)
   */
  id?: UUID;

  /**
   * Vector embedding (optional if vectorizer is configured)
   */
  vector?: Vector;

  /**
   * Tenant name for multi-tenant collections
   */
  tenant?: string;

  /**
   * Consistency level for this operation
   */
  consistencyLevel?: ConsistencyLevel;

  /**
   * Whether to validate the object before creation
   */
  validate?: boolean;
}

/**
 * Options for getting an object (internal service interface)
 */
export interface GetObjectOptions {
  /**
   * Whether to include the vector in the response
   */
  includeVector?: boolean;

  /**
   * Whether to include classification metadata
   */
  includeClassification?: boolean;

  /**
   * Specific properties to return (returns all if not specified)
   */
  properties?: string[];

  /**
   * Tenant name for multi-tenant collections
   */
  tenant?: string;

  /**
   * Consistency level for this operation
   */
  consistencyLevel?: ConsistencyLevel;

  /**
   * Node name to read from (for directed reads)
   */
  nodeName?: string;
}

/**
 * Options for updating an object (internal service interface)
 */
export interface UpdateObjectOptions {
  /**
   * Vector to update
   */
  vector?: Vector;

  /**
   * Whether to merge with existing properties (true) or replace (false)
   * Default: true (merge)
   */
  merge?: boolean;

  /**
   * Tenant name for multi-tenant collections
   */
  tenant?: string;

  /**
   * Consistency level for this operation
   */
  consistencyLevel?: ConsistencyLevel;
}

/**
 * Options for deleting an object (internal service interface)
 */
export interface DeleteObjectOptions {
  /**
   * Tenant name for multi-tenant collections
   */
  tenant?: string;

  /**
   * Consistency level for this operation
   */
  consistencyLevel?: ConsistencyLevel;

  /**
   * Whether to ignore 404 errors
   */
  ignoreNotFound?: boolean;
}

/**
 * Options for validating an object (internal service interface)
 */
export interface ValidateObjectOptions {
  /**
   * ID to use for validation (optional)
   */
  id?: UUID;

  /**
   * Vector to validate (optional)
   */
  vector?: Vector;
}

/**
 * Validation error details
 */
export interface ValidationError {
  /**
   * Property path that failed validation
   */
  property?: string;

  /**
   * Error message
   */
  message: string;

  /**
   * Error code
   */
  code?: string;
}

/**
 * Result of object validation
 */
export interface ObjectValidationResult {
  /**
   * Whether the object is valid
   */
  valid: boolean;

  /**
   * Validation errors (if any)
   */
  errors: ValidationError[];
}

/**
 * Include parameters for GET requests
 */
export interface IncludeParams {
  /**
   * Include vector in response
   */
  vector?: boolean;

  /**
   * Include classification metadata
   */
  classification?: boolean;
}

/**
 * Query parameters for object operations
 */
export interface ObjectQueryParams {
  /**
   * Consistency level
   */
  consistency_level?: string;

  /**
   * Tenant name
   */
  tenant?: string;

  /**
   * Include parameters (comma-separated)
   */
  include?: string;

  /**
   * Node name (for directed reads)
   */
  node_name?: string;
}

/**
 * API request body for object creation
 */
export interface CreateObjectRequest {
  /**
   * Object ID
   */
  id?: string;

  /**
   * Class name
   */
  class: string;

  /**
   * Object properties
   */
  properties: Record<string, unknown>;

  /**
   * Vector embedding
   */
  vector?: number[];

  /**
   * Tenant name
   */
  tenant?: string;
}

/**
 * API request body for object update
 */
export interface UpdateObjectRequest {
  /**
   * Object ID
   */
  id: string;

  /**
   * Class name
   */
  class: string;

  /**
   * Object properties
   */
  properties?: Record<string, unknown>;

  /**
   * Vector embedding
   */
  vector?: number[];
}

/**
 * API response for object operations
 */
export interface ObjectApiResponse {
  /**
   * Object ID
   */
  id: string;

  /**
   * Class name
   */
  class: string;

  /**
   * Object properties
   */
  properties: Record<string, unknown>;

  /**
   * Vector embedding
   */
  vector?: number[];

  /**
   * Tenant name
   */
  tenant?: string;

  /**
   * Creation timestamp (ISO 8601)
   */
  creationTimeUnix?: number;

  /**
   * Last update timestamp (ISO 8601)
   */
  lastUpdateTimeUnix?: number;

  /**
   * Additional metadata
   */
  additional?: Record<string, unknown>;
}

/**
 * API request for object validation
 */
export interface ValidateObjectRequest {
  /**
   * Object ID (optional)
   */
  id?: string;

  /**
   * Class name
   */
  class: string;

  /**
   * Object properties
   */
  properties: Record<string, unknown>;

  /**
   * Vector embedding (optional)
   */
  vector?: number[];
}

/**
 * API response for object validation
 */
export interface ValidateObjectResponse {
  /**
   * Whether the object is valid
   */
  valid: boolean;

  /**
   * Validation error message (if invalid)
   */
  error?: {
    message: string;
  };
}
