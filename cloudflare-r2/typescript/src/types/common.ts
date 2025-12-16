/**
 * Common type definitions for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/types/common
 */

/**
 * Key-value metadata tags for R2 objects
 */
export type Tags = Record<string, string>;

/**
 * Storage class for R2 objects
 */
export type StorageClass = 'STANDARD' | 'INFREQUENT_ACCESS';

/**
 * Metadata directive for copy operations
 */
export type MetadataDirective = 'COPY' | 'REPLACE';

/**
 * Represents an R2 object in listing results
 */
export interface R2Object {
  /**
   * The object key (path)
   */
  readonly key: string;

  /**
   * Last modified timestamp
   */
  readonly lastModified: Date;

  /**
   * Entity tag for the object
   */
  readonly eTag: string;

  /**
   * Size of the object in bytes
   */
  readonly size: number;

  /**
   * Storage class of the object
   */
  readonly storageClass: StorageClass;

  /**
   * Owner information (if available)
   */
  readonly owner?: {
    readonly id: string;
    readonly displayName?: string;
  };
}

/**
 * Identifier for an object to be deleted
 */
export interface ObjectIdentifier {
  /**
   * The object key to delete
   */
  readonly key: string;

  /**
   * Optional version ID for versioned buckets
   */
  readonly versionId?: string;
}

/**
 * Information about a deleted object
 */
export interface DeletedObject {
  /**
   * The key of the deleted object
   */
  readonly key: string;

  /**
   * Version ID of the deleted object (if versioned)
   */
  readonly versionId?: string;

  /**
   * Whether this was a delete marker
   */
  readonly deleteMarker?: boolean;

  /**
   * Version ID of the delete marker (if applicable)
   */
  readonly deleteMarkerVersionId?: string;
}

/**
 * Error information for failed delete operations
 */
export interface DeleteError {
  /**
   * The key that failed to delete
   */
  readonly key: string;

  /**
   * Version ID (if applicable)
   */
  readonly versionId?: string;

  /**
   * Error code
   */
  readonly code: string;

  /**
   * Error message
   */
  readonly message: string;
}

/**
 * Represents a completed part in a multipart upload
 */
export interface CompletedPart {
  /**
   * Part number (1-10000)
   */
  readonly partNumber: number;

  /**
   * Entity tag returned from the part upload
   */
  readonly eTag: string;
}

/**
 * Information about an uploaded part
 */
export interface Part {
  /**
   * Part number
   */
  readonly partNumber: number;

  /**
   * Entity tag of the part
   */
  readonly eTag: string;

  /**
   * Size of the part in bytes
   */
  readonly size: number;

  /**
   * Last modified timestamp
   */
  readonly lastModified: Date;
}

/**
 * Common prefix in listing results (for delimiter-based grouping)
 */
export interface CommonPrefix {
  /**
   * The common prefix shared by objects
   */
  readonly prefix: string;
}

/**
 * HTTP methods for presigned URLs
 */
export type HttpMethod = 'GET' | 'PUT' | 'DELETE' | 'HEAD';

/**
 * Content encoding types
 */
export type ContentEncoding = 'gzip' | 'compress' | 'deflate' | 'br' | 'identity';

/**
 * Cache control directives
 */
export type CacheControlDirective =
  | 'no-cache'
  | 'no-store'
  | 'must-revalidate'
  | 'public'
  | 'private'
  | `max-age=${number}`
  | `s-maxage=${number}`;

/**
 * Content disposition types
 */
export type ContentDisposition = `inline` | `attachment; filename="${string}"`;
