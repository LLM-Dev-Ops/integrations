/**
 * Request type definitions for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/types/requests
 */

import type { Tags, ObjectIdentifier, CompletedPart, MetadataDirective } from './common.js';

/**
 * Request to upload an object to R2
 */
export interface PutObjectRequest {
  /**
   * Name of the bucket
   */
  readonly bucket: string;

  /**
   * Object key (path)
   */
  readonly key: string;

  /**
   * Object content (string, Buffer, or stream)
   */
  readonly body: string | Buffer | ReadableStream<Uint8Array> | Uint8Array;

  /**
   * MIME type of the object
   */
  readonly contentType?: string;

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
   * MD5 hash of the content for integrity verification
   */
  readonly contentMd5?: string;

  /**
   * Custom metadata (x-amz-meta-* headers)
   */
  readonly metadata?: Record<string, string>;

  /**
   * Object tags
   */
  readonly tags?: Tags;

  /**
   * Server-side encryption algorithm
   */
  readonly serverSideEncryption?: string;

  /**
   * Storage class
   */
  readonly storageClass?: string;

  /**
   * Expires header
   */
  readonly expires?: Date;
}

/**
 * Request to retrieve an object from R2
 */
export interface GetObjectRequest {
  /**
   * Name of the bucket
   */
  readonly bucket: string;

  /**
   * Object key (path)
   */
  readonly key: string;

  /**
   * Byte range to retrieve (e.g., "bytes=0-1023")
   */
  readonly range?: string;

  /**
   * Return object only if ETag matches
   */
  readonly ifMatch?: string;

  /**
   * Return object only if ETag doesn't match
   */
  readonly ifNoneMatch?: string;

  /**
   * Return object only if modified since date
   */
  readonly ifModifiedSince?: Date;

  /**
   * Return object only if not modified since date
   */
  readonly ifUnmodifiedSince?: Date;

  /**
   * Version ID for versioned buckets
   */
  readonly versionId?: string;

  /**
   * Response cache control override
   */
  readonly responseCacheControl?: string;

  /**
   * Response content disposition override
   */
  readonly responseContentDisposition?: string;

  /**
   * Response content encoding override
   */
  readonly responseContentEncoding?: string;

  /**
   * Response content language override
   */
  readonly responseContentLanguage?: string;

  /**
   * Response content type override
   */
  readonly responseContentType?: string;

  /**
   * Response expires override
   */
  readonly responseExpires?: Date;
}

/**
 * Request to delete a single object from R2
 */
export interface DeleteObjectRequest {
  /**
   * Name of the bucket
   */
  readonly bucket: string;

  /**
   * Object key (path)
   */
  readonly key: string;

  /**
   * Version ID for versioned buckets
   */
  readonly versionId?: string;

  /**
   * Bypass governance-mode retention
   */
  readonly bypassGovernanceRetention?: boolean;
}

/**
 * Request to delete multiple objects from R2
 */
export interface DeleteObjectsRequest {
  /**
   * Name of the bucket
   */
  readonly bucket: string;

  /**
   * Array of objects to delete
   */
  readonly objects: readonly ObjectIdentifier[];

  /**
   * Enable quiet mode (only return errors)
   */
  readonly quiet?: boolean;

  /**
   * Bypass governance-mode retention
   */
  readonly bypassGovernanceRetention?: boolean;
}

/**
 * Request to retrieve object metadata
 */
export interface HeadObjectRequest {
  /**
   * Name of the bucket
   */
  readonly bucket: string;

  /**
   * Object key (path)
   */
  readonly key: string;

  /**
   * Version ID for versioned buckets
   */
  readonly versionId?: string;

  /**
   * Return metadata only if ETag matches
   */
  readonly ifMatch?: string;

  /**
   * Return metadata only if ETag doesn't match
   */
  readonly ifNoneMatch?: string;

  /**
   * Return metadata only if modified since date
   */
  readonly ifModifiedSince?: Date;

  /**
   * Return metadata only if not modified since date
   */
  readonly ifUnmodifiedSince?: Date;

  /**
   * Byte range for partial metadata
   */
  readonly range?: string;
}

/**
 * Request to copy an object within or between buckets
 */
export interface CopyObjectRequest {
  /**
   * Destination bucket name
   */
  readonly bucket: string;

  /**
   * Destination object key
   */
  readonly key: string;

  /**
   * Source bucket name
   */
  readonly sourceBucket: string;

  /**
   * Source object key
   */
  readonly sourceKey: string;

  /**
   * Source version ID (for versioned buckets)
   */
  readonly sourceVersionId?: string;

  /**
   * How to handle metadata (COPY or REPLACE)
   */
  readonly metadataDirective?: MetadataDirective;

  /**
   * New metadata (only if metadataDirective is REPLACE)
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
   * Content type header
   */
  readonly contentType?: string;

  /**
   * Copy only if source ETag matches
   */
  readonly copySourceIfMatch?: string;

  /**
   * Copy only if source ETag doesn't match
   */
  readonly copySourceIfNoneMatch?: string;

  /**
   * Copy only if source modified since date
   */
  readonly copySourceIfModifiedSince?: Date;

  /**
   * Copy only if source not modified since date
   */
  readonly copySourceIfUnmodifiedSince?: Date;

  /**
   * Server-side encryption algorithm
   */
  readonly serverSideEncryption?: string;

  /**
   * Storage class
   */
  readonly storageClass?: string;

  /**
   * Object tags
   */
  readonly tags?: Tags;
}

/**
 * Request to list objects in a bucket
 */
export interface ListObjectsRequest {
  /**
   * Name of the bucket
   */
  readonly bucket: string;

  /**
   * Prefix to filter objects
   */
  readonly prefix?: string;

  /**
   * Delimiter for grouping keys
   */
  readonly delimiter?: string;

  /**
   * Maximum number of keys to return (1-1000)
   */
  readonly maxKeys?: number;

  /**
   * Continuation token from previous response
   */
  readonly continuationToken?: string;

  /**
   * Start listing after this key
   */
  readonly startAfter?: string;

  /**
   * Request payer setting
   */
  readonly requestPayer?: string;

  /**
   * Include object owners in response
   */
  readonly fetchOwner?: boolean;
}

/**
 * Request to initiate a multipart upload
 */
export interface CreateMultipartRequest {
  /**
   * Name of the bucket
   */
  readonly bucket: string;

  /**
   * Object key (path)
   */
  readonly key: string;

  /**
   * MIME type of the object
   */
  readonly contentType?: string;

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
   * Custom metadata
   */
  readonly metadata?: Record<string, string>;

  /**
   * Server-side encryption algorithm
   */
  readonly serverSideEncryption?: string;

  /**
   * Storage class
   */
  readonly storageClass?: string;

  /**
   * Object tags
   */
  readonly tags?: Tags;

  /**
   * Expires header
   */
  readonly expires?: Date;
}

/**
 * Request to upload a part in a multipart upload
 */
export interface UploadPartRequest {
  /**
   * Name of the bucket
   */
  readonly bucket: string;

  /**
   * Object key (path)
   */
  readonly key: string;

  /**
   * Upload ID from CreateMultipartRequest
   */
  readonly uploadId: string;

  /**
   * Part number (1-10000)
   */
  readonly partNumber: number;

  /**
   * Part content
   */
  readonly body: string | Buffer | ReadableStream<Uint8Array> | Uint8Array;

  /**
   * MD5 hash of the part content
   */
  readonly contentMd5?: string;

  /**
   * Content length in bytes
   */
  readonly contentLength?: number;
}

/**
 * Request to complete a multipart upload
 */
export interface CompleteMultipartRequest {
  /**
   * Name of the bucket
   */
  readonly bucket: string;

  /**
   * Object key (path)
   */
  readonly key: string;

  /**
   * Upload ID from CreateMultipartRequest
   */
  readonly uploadId: string;

  /**
   * Array of completed parts (must be sorted by part number)
   */
  readonly parts: readonly CompletedPart[];
}

/**
 * Request to abort a multipart upload
 */
export interface AbortMultipartRequest {
  /**
   * Name of the bucket
   */
  readonly bucket: string;

  /**
   * Object key (path)
   */
  readonly key: string;

  /**
   * Upload ID from CreateMultipartRequest
   */
  readonly uploadId: string;
}

/**
 * Request to list parts of a multipart upload
 */
export interface ListPartsRequest {
  /**
   * Name of the bucket
   */
  readonly bucket: string;

  /**
   * Object key (path)
   */
  readonly key: string;

  /**
   * Upload ID from CreateMultipartRequest
   */
  readonly uploadId: string;

  /**
   * Maximum number of parts to return
   */
  readonly maxParts?: number;

  /**
   * Part number to start listing from
   */
  readonly partNumberMarker?: number;
}

/**
 * Request to generate a presigned GET URL
 */
export interface PresignGetRequest {
  /**
   * Name of the bucket
   */
  readonly bucket: string;

  /**
   * Object key (path)
   */
  readonly key: string;

  /**
   * URL expiration time in seconds (default: 3600, max: 604800)
   */
  readonly expiresIn?: number;

  /**
   * Version ID for versioned buckets
   */
  readonly versionId?: string;

  /**
   * Response content type override
   */
  readonly responseContentType?: string;

  /**
   * Response content disposition override
   */
  readonly responseContentDisposition?: string;

  /**
   * Response cache control override
   */
  readonly responseCacheControl?: string;
}

/**
 * Request to generate a presigned PUT URL
 */
export interface PresignPutRequest {
  /**
   * Name of the bucket
   */
  readonly bucket: string;

  /**
   * Object key (path)
   */
  readonly key: string;

  /**
   * URL expiration time in seconds (default: 3600, max: 604800)
   */
  readonly expiresIn?: number;

  /**
   * Content type that must be used with the presigned URL
   */
  readonly contentType?: string;

  /**
   * Metadata that must be included with the upload
   */
  readonly metadata?: Record<string, string>;

  /**
   * Server-side encryption algorithm
   */
  readonly serverSideEncryption?: string;
}

/**
 * Request to list multipart uploads in progress
 */
export interface ListMultipartUploadsRequest {
  /**
   * Name of the bucket
   */
  readonly bucket: string;

  /**
   * Prefix to filter uploads
   */
  readonly prefix?: string;

  /**
   * Delimiter for grouping keys
   */
  readonly delimiter?: string;

  /**
   * Maximum number of uploads to return
   */
  readonly maxUploads?: number;

  /**
   * Key marker from previous response
   */
  readonly keyMarker?: string;

  /**
   * Upload ID marker from previous response
   */
  readonly uploadIdMarker?: string;
}
