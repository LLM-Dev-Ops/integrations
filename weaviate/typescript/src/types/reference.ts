/**
 * Weaviate reference types
 *
 * This module defines types for managing cross-references between objects.
 */

import type { UUID } from './property.js';

/**
 * Reference to another Weaviate object
 *
 * References create links between objects, similar to foreign keys
 * in relational databases.
 *
 * @example
 * ```typescript
 * const ref: Reference = {
 *   beacon: "weaviate://localhost/Author/550e8400-e29b-41d4-a716-446655440000",
 *   className: "Author",
 *   id: "550e8400-e29b-41d4-a716-446655440000" as UUID
 * };
 * ```
 */
export interface Reference {
  /**
   * Beacon string uniquely identifying the referenced object
   * Format: weaviate://localhost/ClassName/uuid
   */
  beacon: string;

  /**
   * Class name of the referenced object
   */
  className: string;

  /**
   * UUID of the referenced object
   */
  id: UUID;

  /**
   * Optional href for the reference
   */
  href?: string;
}

/**
 * Options for adding a reference
 *
 * @example
 * ```typescript
 * const options: AddReferenceOptions = {
 *   fromClassName: "Article",
 *   fromId: "article-uuid" as UUID,
 *   fromProperty: "authors",
 *   toClassName: "Author",
 *   toId: "author-uuid" as UUID
 * };
 * ```
 */
export interface AddReferenceOptions {
  /**
   * Source object's class name
   */
  fromClassName: string;

  /**
   * Source object's UUID
   */
  fromId: UUID;

  /**
   * Property name that holds the reference
   */
  fromProperty: string;

  /**
   * Target object's class name
   */
  toClassName: string;

  /**
   * Target object's UUID
   */
  toId: UUID;

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
 * Options for deleting a reference
 */
export interface DeleteReferenceOptions {
  /**
   * Source object's class name
   */
  fromClassName: string;

  /**
   * Source object's UUID
   */
  fromId: UUID;

  /**
   * Property name that holds the reference
   */
  fromProperty: string;

  /**
   * Target object's class name
   */
  toClassName: string;

  /**
   * Target object's UUID
   */
  toId: UUID;

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
 * Options for updating (replacing) all references
 */
export interface UpdateReferencesOptions {
  /**
   * Source object's class name
   */
  fromClassName: string;

  /**
   * Source object's UUID
   */
  fromId: UUID;

  /**
   * Property name that holds the references
   */
  fromProperty: string;

  /**
   * New references to set (replaces all existing)
   */
  references: Reference[];

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
 * Options for getting references
 */
export interface GetReferencesOptions {
  /**
   * Source object's class name
   */
  fromClassName: string;

  /**
   * Source object's UUID
   */
  fromId: UUID;

  /**
   * Property name that holds the references
   */
  fromProperty: string;

  /**
   * Tenant name (for multi-tenant collections)
   */
  tenant?: string;
}

/**
 * Reference with additional metadata
 */
export interface ReferenceWithMetadata extends Reference {
  /**
   * Creation timestamp
   */
  createdAt?: Date;

  /**
   * Last update timestamp
   */
  updatedAt?: Date;

  /**
   * Additional properties from the referenced object
   */
  properties?: Record<string, unknown>;
}

/**
 * Get references response
 */
export interface GetReferencesResponse {
  /**
   * Array of references
   */
  references: ReferenceWithMetadata[];

  /**
   * Total count
   */
  totalCount?: number;
}

/**
 * Reference validation result
 */
export interface ReferenceValidationResult {
  /**
   * Whether the reference is valid
   */
  valid: boolean;

  /**
   * Error message (if invalid)
   */
  error?: string;

  /**
   * Whether the target object exists
   */
  targetExists?: boolean;

  /**
   * Whether the property accepts this reference type
   */
  propertyCompatible?: boolean;
}

/**
 * Batch reference operation
 */
export interface BatchReferenceOperation {
  /**
   * Operation type
   */
  operation: 'add' | 'delete';

  /**
   * Source object's class name
   */
  fromClassName: string;

  /**
   * Source object's UUID
   */
  fromId: UUID;

  /**
   * Property name that holds the reference
   */
  fromProperty: string;

  /**
   * Target object's class name
   */
  toClassName: string;

  /**
   * Target object's UUID
   */
  toId: UUID;

  /**
   * Tenant name
   */
  tenant?: string;
}

/**
 * Batch reference result
 */
export interface BatchReferenceResult {
  /**
   * Number of successful operations
   */
  successful: number;

  /**
   * Number of failed operations
   */
  failed: number;

  /**
   * Errors for failed operations
   */
  errors?: Array<{
    /**
     * Index in the batch
     */
    index: number;

    /**
     * Error message
     */
    message: string;

    /**
     * Reference that failed
     */
    reference?: BatchReferenceOperation;
  }>;
}

/**
 * Creates a beacon string from class name and ID
 *
 * @param className - The class name
 * @param id - The object UUID
 * @param host - Optional host (defaults to "localhost")
 * @returns Beacon string
 *
 * @example
 * ```typescript
 * const beacon = createBeacon("Author", "550e8400-..." as UUID);
 * // Returns: "weaviate://localhost/Author/550e8400-..."
 * ```
 */
export function createBeacon(
  className: string,
  id: UUID,
  host = 'localhost'
): string {
  return `weaviate://${host}/${className}/${id}`;
}

/**
 * Parses a beacon string into its components
 *
 * @param beacon - The beacon string to parse
 * @returns Parsed components or null if invalid
 *
 * @example
 * ```typescript
 * const parsed = parseBeacon("weaviate://localhost/Author/550e8400-...");
 * // Returns: { host: "localhost", className: "Author", id: "550e8400-..." }
 * ```
 */
export function parseBeacon(
  beacon: string
): { host: string; className: string; id: UUID } | null {
  const match = beacon.match(/^weaviate:\/\/([^/]+)\/([^/]+)\/(.+)$/);
  if (!match) {
    return null;
  }
  return {
    host: match[1],
    className: match[2],
    id: match[3] as UUID,
  };
}

/**
 * Creates a Reference object from components
 *
 * @param className - The class name
 * @param id - The object UUID
 * @param host - Optional host
 * @returns Reference object
 */
export function createReference(
  className: string,
  id: UUID,
  host?: string
): Reference {
  const beacon = createBeacon(className, id, host);
  return {
    beacon,
    className,
    id,
  };
}

/**
 * Validates a beacon string format
 *
 * @param beacon - The beacon string to validate
 * @returns True if the beacon is valid
 */
export function isValidBeacon(beacon: string): boolean {
  return /^weaviate:\/\/[^/]+\/[^/]+\/.+$/.test(beacon);
}

/**
 * Type guard to check if a value is a Reference
 *
 * @param value - The value to check
 * @returns True if the value is a Reference
 */
export function isReference(value: unknown): value is Reference {
  return (
    typeof value === 'object' &&
    value !== null &&
    'beacon' in value &&
    'className' in value &&
    'id' in value &&
    typeof (value as Reference).beacon === 'string' &&
    typeof (value as Reference).className === 'string' &&
    typeof (value as Reference).id === 'string'
  );
}

/**
 * Type guard to check if a value is an array of References
 *
 * @param value - The value to check
 * @returns True if the value is Reference[]
 */
export function isReferenceArray(value: unknown): value is Reference[] {
  return Array.isArray(value) && value.every((item) => isReference(item));
}
