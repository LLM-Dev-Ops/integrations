/**
 * Response type definitions for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/types/responses
 */

import type { R2Object, CommonPrefix, Part, DeletedObject, DeleteError } from './common.js';

/**
 * Response from uploading an object
 */
export interface PutObjectOutput {
  /**
   * Entity tag of the uploaded object
   */
  readonly eTag?: string;

  /**
   * Version ID (for versioned buckets)
   */
  readonly versionId?: string;

  /**
   * Server-side encryption algorithm used
   */
  readonly serverSideEncryption?: string;

  /**
   * Expiration rule information
   */
  readonly expiration?: string;

  /**
   * Request ID for troubleshooting
   */
  readonly requestId?: string;
}

/**
 * Response from retrieving an object (with full body)
 */
export interface GetObjectOutput {
  /**
   * Object content as Buffer
   */
  readonly body: Buffer;

  /**
   * Size of the object in bytes
   */
  readonly contentLength: number;

  /**
   * MIME type of the object
   */
  readonly contentType?: string;

  /**
   * Entity tag
   */
  readonly eTag?: string;

  /**
   * Last modified timestamp
   */
  readonly lastModified?: Date;

  /**
   * Custom metadata
   */
  readonly metadata?: Record<string, string>;

  /**
   * Content range (for partial requests)
   */
  readonly contentRange?: string;

  /**
   * Cache control header
   */
  readonly cacheControl?: string;

  /**
   * Content disposition header
   */
  readonly contentDisposition?: string;

  /**
   * Content encoding header
   */
  readonly contentEncoding?: string;

  /**
   * Content language header
   */
  readonly contentLanguage?: string;

  /**
   * Version ID (for versioned buckets)
   */
  readonly versionId?: string;

  /**
   * Server-side encryption algorithm
   */
  readonly serverSideEncryption?: string;

  /**
   * Expiration information
   */
  readonly expiration?: string;

  /**
   * Expires header
   */
  readonly expires?: Date;

  /**
   * Accept ranges header
   */
  readonly acceptRanges?: string;

  /**
   * Request ID for troubleshooting
   */
  readonly requestId?: string;
}

/**
 * Response from retrieving an object (with streaming body)
 */
export interface GetObjectStreamOutput {
  /**
   * Object content as readable stream
   */
  readonly body: ReadableStream<Uint8Array>;

  /**
   * Size of the object in bytes
   */
  readonly contentLength: number;

  /**
   * MIME type of the object
   */
  readonly contentType?: string;

  /**
   * Entity tag
   */
  readonly eTag?: string;

  /**
   * Last modified timestamp
   */
  readonly lastModified?: Date;

  /**
   * Custom metadata
   */
  readonly metadata?: Record<string, string>;

  /**
   * Content range (for partial requests)
   */
  readonly contentRange?: string;

  /**
   * Cache control header
   */
  readonly cacheControl?: string;

  /**
   * Content disposition header
   */
  readonly contentDisposition?: string;

  /**
   * Content encoding header
   */
  readonly contentEncoding?: string;

  /**
   * Content language header
   */
  readonly contentLanguage?: string;

  /**
   * Version ID (for versioned buckets)
   */
  readonly versionId?: string;

  /**
   * Server-side encryption algorithm
   */
  readonly serverSideEncryption?: string;

  /**
   * Expiration information
   */
  readonly expiration?: string;

  /**
   * Expires header
   */
  readonly expires?: Date;

  /**
   * Accept ranges header
   */
  readonly acceptRanges?: string;

  /**
   * Request ID for troubleshooting
   */
  readonly requestId?: string;
}

/**
 * Response from deleting a single object
 */
export interface DeleteObjectOutput {
  /**
   * Whether a delete marker was created
   */
  readonly deleteMarker?: boolean;

  /**
   * Version ID of the deleted object
   */
  readonly versionId?: string;

  /**
   * Request ID for troubleshooting
   */
  readonly requestId?: string;
}

/**
 * Response from deleting multiple objects
 */
export interface DeleteObjectsOutput {
  /**
   * Successfully deleted objects
   */
  readonly deleted: readonly DeletedObject[];

  /**
   * Objects that failed to delete
   */
  readonly errors: readonly DeleteError[];

  /**
   * Request ID for troubleshooting
   */
  readonly requestId?: string;
}

/**
 * Response from retrieving object metadata
 */
export interface HeadObjectOutput {
  /**
   * Size of the object in bytes
   */
  readonly contentLength: number;

  /**
   * MIME type of the object
   */
  readonly contentType?: string;

  /**
   * Entity tag
   */
  readonly eTag?: string;

  /**
   * Last modified timestamp
   */
  readonly lastModified?: Date;

  /**
   * Custom metadata
   */
  readonly metadata?: Record<string, string>;

  /**
   * Cache control header
   */
  readonly cacheControl?: string;

  /**
   * Content disposition header
   */
  readonly contentDisposition?: string;

  /**
   * Content encoding header
   */
  readonly contentEncoding?: string;

  /**
   * Content language header
   */
  readonly contentLanguage?: string;

  /**
   * Version ID (for versioned buckets)
   */
  readonly versionId?: string;

  /**
   * Server-side encryption algorithm
   */
  readonly serverSideEncryption?: string;

  /**
   * Expiration information
   */
  readonly expiration?: string;

  /**
   * Expires header
   */
  readonly expires?: Date;

  /**
   * Accept ranges header
   */
  readonly acceptRanges?: string;

  /**
   * Whether object is archived
   */
  readonly archiveStatus?: string;

  /**
   * Object lock mode
   */
  readonly objectLockMode?: string;

  /**
   * Object lock retain until date
   */
  readonly objectLockRetainUntilDate?: Date;

  /**
   * Object lock legal hold status
   */
  readonly objectLockLegalHoldStatus?: string;

  /**
   * Request ID for troubleshooting
   */
  readonly requestId?: string;
}

/**
 * Response from copying an object
 */
export interface CopyObjectOutput {
  /**
   * Entity tag of the copied object
   */
  readonly eTag?: string;

  /**
   * Last modified timestamp of the copy
   */
  readonly lastModified?: Date;

  /**
   * Version ID of the copied object (destination)
   */
  readonly versionId?: string;

  /**
   * Version ID of the source object
   */
  readonly copySourceVersionId?: string;

  /**
   * Server-side encryption algorithm
   */
  readonly serverSideEncryption?: string;

  /**
   * Expiration information
   */
  readonly expiration?: string;

  /**
   * Request ID for troubleshooting
   */
  readonly requestId?: string;
}

/**
 * Response from listing objects in a bucket
 */
export interface ListObjectsOutput {
  /**
   * Whether there are more results available
   */
  readonly isTruncated: boolean;

  /**
   * Array of objects in the bucket
   */
  readonly contents: readonly R2Object[];

  /**
   * Common prefixes (for delimiter-based grouping)
   */
  readonly commonPrefixes: readonly CommonPrefix[];

  /**
   * Name of the bucket
   */
  readonly name: string;

  /**
   * Prefix used in the request
   */
  readonly prefix?: string;

  /**
   * Delimiter used in the request
   */
  readonly delimiter?: string;

  /**
   * Maximum keys requested
   */
  readonly maxKeys: number;

  /**
   * Number of keys returned
   */
  readonly keyCount: number;

  /**
   * Continuation token from request
   */
  readonly continuationToken?: string;

  /**
   * Token to use for next request
   */
  readonly nextContinuationToken?: string;

  /**
   * Start after key from request
   */
  readonly startAfter?: string;

  /**
   * Encoding type used
   */
  readonly encodingType?: string;

  /**
   * Request ID for troubleshooting
   */
  readonly requestId?: string;
}

/**
 * Response from initiating a multipart upload
 */
export interface CreateMultipartOutput {
  /**
   * Upload ID to use for subsequent operations
   */
  readonly uploadId: string;

  /**
   * Name of the bucket
   */
  readonly bucket: string;

  /**
   * Object key
   */
  readonly key: string;

  /**
   * Server-side encryption algorithm
   */
  readonly serverSideEncryption?: string;

  /**
   * Request ID for troubleshooting
   */
  readonly requestId?: string;
}

/**
 * Response from uploading a part
 */
export interface UploadPartOutput {
  /**
   * Entity tag of the uploaded part
   */
  readonly eTag: string;

  /**
   * Server-side encryption algorithm
   */
  readonly serverSideEncryption?: string;

  /**
   * Request ID for troubleshooting
   */
  readonly requestId?: string;
}

/**
 * Response from completing a multipart upload
 */
export interface CompleteMultipartOutput {
  /**
   * Location URL of the completed object
   */
  readonly location: string;

  /**
   * Name of the bucket
   */
  readonly bucket: string;

  /**
   * Object key
   */
  readonly key: string;

  /**
   * Entity tag of the completed object
   */
  readonly eTag: string;

  /**
   * Version ID (for versioned buckets)
   */
  readonly versionId?: string;

  /**
   * Server-side encryption algorithm
   */
  readonly serverSideEncryption?: string;

  /**
   * Expiration information
   */
  readonly expiration?: string;

  /**
   * Request ID for troubleshooting
   */
  readonly requestId?: string;
}

/**
 * Response from aborting a multipart upload
 */
export interface AbortMultipartOutput {
  /**
   * Request ID for troubleshooting
   */
  readonly requestId?: string;
}

/**
 * Response from listing parts of a multipart upload
 */
export interface ListPartsOutput {
  /**
   * Name of the bucket
   */
  readonly bucket: string;

  /**
   * Object key
   */
  readonly key: string;

  /**
   * Upload ID
   */
  readonly uploadId: string;

  /**
   * Array of uploaded parts
   */
  readonly parts: readonly Part[];

  /**
   * Whether there are more parts available
   */
  readonly isTruncated: boolean;

  /**
   * Maximum parts requested
   */
  readonly maxParts: number;

  /**
   * Part number marker from request
   */
  readonly partNumberMarker?: number;

  /**
   * Next part number marker for pagination
   */
  readonly nextPartNumberMarker?: number;

  /**
   * Storage class
   */
  readonly storageClass?: string;

  /**
   * Initiator information
   */
  readonly initiator?: {
    readonly id: string;
    readonly displayName?: string;
  };

  /**
   * Owner information
   */
  readonly owner?: {
    readonly id: string;
    readonly displayName?: string;
  };

  /**
   * Request ID for troubleshooting
   */
  readonly requestId?: string;
}

/**
 * Information about a multipart upload in progress
 */
export interface MultipartUpload {
  /**
   * Upload ID
   */
  readonly uploadId: string;

  /**
   * Object key
   */
  readonly key: string;

  /**
   * Upload initiated timestamp
   */
  readonly initiated: Date;

  /**
   * Storage class
   */
  readonly storageClass?: string;

  /**
   * Owner information
   */
  readonly owner?: {
    readonly id: string;
    readonly displayName?: string;
  };

  /**
   * Initiator information
   */
  readonly initiator?: {
    readonly id: string;
    readonly displayName?: string;
  };
}

/**
 * Response from listing multipart uploads in progress
 */
export interface ListMultipartUploadsOutput {
  /**
   * Name of the bucket
   */
  readonly bucket: string;

  /**
   * Array of in-progress uploads
   */
  readonly uploads: readonly MultipartUpload[];

  /**
   * Common prefixes (for delimiter-based grouping)
   */
  readonly commonPrefixes: readonly CommonPrefix[];

  /**
   * Whether there are more uploads available
   */
  readonly isTruncated: boolean;

  /**
   * Prefix used in the request
   */
  readonly prefix?: string;

  /**
   * Delimiter used in the request
   */
  readonly delimiter?: string;

  /**
   * Maximum uploads requested
   */
  readonly maxUploads: number;

  /**
   * Key marker from request
   */
  readonly keyMarker?: string;

  /**
   * Upload ID marker from request
   */
  readonly uploadIdMarker?: string;

  /**
   * Next key marker for pagination
   */
  readonly nextKeyMarker?: string;

  /**
   * Next upload ID marker for pagination
   */
  readonly nextUploadIdMarker?: string;

  /**
   * Request ID for troubleshooting
   */
  readonly requestId?: string;
}

/**
 * Presigned URL information
 */
export interface PresignedUrl {
  /**
   * The presigned URL
   */
  readonly url: string;

  /**
   * Expiration timestamp of the URL
   */
  readonly expiresAt: Date;

  /**
   * HTTP method the URL is valid for
   */
  readonly method: 'GET' | 'PUT' | 'DELETE' | 'HEAD';

  /**
   * Headers that must be included with the request
   */
  readonly requiredHeaders?: Record<string, string>;
}

/**
 * Response from generating a presigned GET URL
 */
export interface PresignGetOutput extends PresignedUrl {
  readonly method: 'GET';
}

/**
 * Response from generating a presigned PUT URL
 */
export interface PresignPutOutput extends PresignedUrl {
  readonly method: 'PUT';
}
