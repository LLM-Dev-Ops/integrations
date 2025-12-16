/**
 * Reference Service Types
 *
 * Re-exports and additional types for reference management operations.
 * @module @llmdevops/weaviate-integration/reference/types
 */

// Re-export common reference types
export type {
  Reference,
  AddReferenceOptions,
  DeleteReferenceOptions,
  UpdateReferencesOptions,
  GetReferencesOptions,
  ReferenceWithMetadata,
  GetReferencesResponse,
  ReferenceValidationResult,
  BatchReferenceOperation,
  BatchReferenceResult,
} from '../types/reference.js';

export {
  createBeacon,
  parseBeacon,
  createReference,
  isValidBeacon,
  isReference,
  isReferenceArray,
} from '../types/reference.js';

import type { UUID } from '../types/property.js';

/**
 * Options for reference operations (simplified)
 */
export interface ReferenceOptions {
  /**
   * Tenant name (for multi-tenant collections)
   */
  tenant?: string;

  /**
   * Consistency level for this operation
   */
  consistencyLevel?: 'ONE' | 'QUORUM' | 'ALL';
}

/**
 * Beacon components
 */
export interface BeaconComponents {
  /**
   * Host (usually "localhost")
   */
  host: string;

  /**
   * Class name
   */
  className: string;

  /**
   * Object ID
   */
  id: UUID;
}

/**
 * Validation error details
 */
export interface ValidationError {
  /**
   * Error code
   */
  code: string;

  /**
   * Error message
   */
  message: string;

  /**
   * Property path that failed validation
   */
  path?: string;
}

/**
 * Extended validation result
 */
export interface ExtendedValidationResult {
  /**
   * Whether validation passed
   */
  valid: boolean;

  /**
   * Validation errors
   */
  errors: ValidationError[];

  /**
   * Whether the source property exists
   */
  propertyExists?: boolean;

  /**
   * Whether the property is a reference type
   */
  isReferenceProperty?: boolean;

  /**
   * Expected target classes
   */
  expectedClasses?: string[];

  /**
   * Whether a circular reference was detected
   */
  circularReference?: boolean;

  /**
   * Current reference depth
   */
  depth?: number;
}
