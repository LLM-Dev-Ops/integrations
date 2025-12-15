/**
 * Request types for GCS operations.
 *
 * Following the SPARC specification for Google Cloud Storage integration.
 */

import { PredefinedAcl, SourceObject, HttpMethod } from "./common.js";

/**
 * Request to insert (upload) an object.
 */
export interface InsertObjectRequest {
  /** Target bucket. */
  bucket: string;
  /** Object name (path). */
  name: string;
  /** Object data. */
  data: Buffer;
  /** Content type (MIME). */
  contentType?: string;
  /** Content encoding (e.g., gzip). */
  contentEncoding?: string;
  /** Content disposition. */
  contentDisposition?: string;
  /** Cache control header. */
  cacheControl?: string;
  /** Custom metadata (x-goog-meta-*). */
  metadata?: Record<string, string>;
  /** Predefined ACL. */
  predefinedAcl?: PredefinedAcl;
  /** Conditional: only if generation matches. */
  ifGenerationMatch?: string;
  /** Conditional: only if generation doesn't match. */
  ifGenerationNotMatch?: string;
  /** Conditional: only if metageneration matches. */
  ifMetagenerationMatch?: string;
}

/**
 * Request to get an object.
 */
export interface GetObjectRequest {
  /** Bucket name. */
  bucket: string;
  /** Object name (path). */
  object: string;
  /** Specific generation. */
  generation?: string;
  /** Conditional: only if generation matches. */
  ifGenerationMatch?: string;
  /** Conditional: only if generation doesn't match. */
  ifGenerationNotMatch?: string;
  /** Conditional: only if metageneration matches. */
  ifMetagenerationMatch?: string;
}

/**
 * Request to get object metadata only.
 */
export interface GetMetadataRequest {
  /** Bucket name. */
  bucket: string;
  /** Object name (path). */
  object: string;
  /** Specific generation. */
  generation?: string;
  /** Conditional: only if generation matches. */
  ifGenerationMatch?: string;
}

/**
 * Request to delete an object.
 */
export interface DeleteObjectRequest {
  /** Bucket name. */
  bucket: string;
  /** Object name (path). */
  object: string;
  /** Specific generation. */
  generation?: string;
  /** Conditional: only if generation matches. */
  ifGenerationMatch?: string;
  /** Conditional: only if metageneration matches. */
  ifMetagenerationMatch?: string;
}

/**
 * Request to copy an object.
 */
export interface CopyObjectRequest {
  /** Source bucket. */
  sourceBucket: string;
  /** Source object name. */
  sourceObject: string;
  /** Source generation (optional). */
  sourceGeneration?: string;
  /** Destination bucket. */
  destinationBucket: string;
  /** Destination object name. */
  destinationObject: string;
  /** New metadata (replaces source metadata). */
  metadata?: Record<string, string>;
  /** Content type override. */
  contentType?: string;
  /** Conditional: only if destination generation matches. */
  ifGenerationMatch?: string;
  /** Conditional: only if source generation matches. */
  ifSourceGenerationMatch?: string;
}

/**
 * Request to compose multiple objects.
 */
export interface ComposeObjectsRequest {
  /** Bucket name. */
  bucket: string;
  /** Destination object name. */
  destinationObject: string;
  /** Source objects to compose. */
  sourceObjects: SourceObject[];
  /** Content type for destination. */
  contentType?: string;
  /** Metadata for destination. */
  metadata?: Record<string, string>;
  /** Conditional: only if destination generation matches. */
  ifGenerationMatch?: string;
}

/**
 * Request to list objects.
 */
export interface ListObjectsRequest {
  /** Bucket name. */
  bucket: string;
  /** Filter by prefix. */
  prefix?: string;
  /** Hierarchy delimiter. */
  delimiter?: string;
  /** Maximum results per page. */
  maxResults?: number;
  /** Pagination token. */
  pageToken?: string;
  /** Include all generations. */
  versions?: boolean;
  /** Start after this object. */
  startOffset?: string;
  /** End before this object. */
  endOffset?: string;
  /** Include trailing delimiter. */
  includeTrailingDelimiter?: boolean;
}

/**
 * Request to update object metadata.
 */
export interface PatchObjectRequest {
  /** Bucket name. */
  bucket: string;
  /** Object name (path). */
  object: string;
  /** Generation (optional). */
  generation?: string;
  /** Updated metadata. */
  metadata?: Record<string, string>;
  /** Updated content type. */
  contentType?: string;
  /** Updated cache control. */
  cacheControl?: string;
  /** Updated content disposition. */
  contentDisposition?: string;
  /** Updated content encoding. */
  contentEncoding?: string;
  /** Conditional: only if metageneration matches. */
  ifMetagenerationMatch?: string;
}

/**
 * Request for streaming upload.
 */
export interface UploadStreamRequest {
  /** Bucket name. */
  bucket: string;
  /** Object name (path). */
  name: string;
  /** Content type. */
  contentType?: string;
  /** Total size (required for resumable). */
  totalSize?: number;
  /** Custom metadata. */
  metadata?: Record<string, string>;
  /** Chunk size for resumable upload. */
  chunkSize?: number;
}

/**
 * Request for streaming download.
 */
export interface DownloadStreamRequest {
  /** Bucket name. */
  bucket: string;
  /** Object name (path). */
  object: string;
  /** Specific generation. */
  generation?: string;
  /** Buffer size for streaming. */
  bufferSize?: number;
}

/**
 * Request for range download.
 */
export interface DownloadRangeRequest {
  /** Bucket name. */
  bucket: string;
  /** Object name (path). */
  object: string;
  /** Specific generation. */
  generation?: string;
  /** Start byte (inclusive). */
  start: number;
  /** End byte (inclusive). */
  end: number;
}

/**
 * Request to create a resumable upload session.
 */
export interface CreateResumableUploadRequest {
  /** Bucket name. */
  bucket: string;
  /** Object name (path). */
  name: string;
  /** Total size of the upload. */
  totalSize: number;
  /** Content type. */
  contentType?: string;
  /** Custom metadata. */
  metadata?: Record<string, string>;
}

/**
 * Request to sign a URL.
 */
export interface SignUrlRequest {
  /** Bucket name. */
  bucket: string;
  /** Object name. */
  object: string;
  /** HTTP method. */
  method: HttpMethod;
  /** Expiration duration in seconds. */
  expiresIn: number;
  /** Content type (for uploads). */
  contentType?: string;
  /** Custom headers. */
  headers?: Record<string, string>;
  /** Custom query parameters. */
  queryParams?: Record<string, string>;
}

/**
 * Request to sign a download URL.
 */
export interface SignDownloadUrlRequest {
  /** Bucket name. */
  bucket: string;
  /** Object name. */
  object: string;
  /** Expiration duration in seconds. */
  expiresIn: number;
  /** Response content type override. */
  responseContentType?: string;
  /** Response content disposition override. */
  responseContentDisposition?: string;
}

/**
 * Request to sign an upload URL.
 */
export interface SignUploadUrlRequest {
  /** Bucket name. */
  bucket: string;
  /** Object name. */
  object: string;
  /** Expiration duration in seconds. */
  expiresIn: number;
  /** Content type. */
  contentType?: string;
  /** Expected content length. */
  contentLength?: number;
}

/**
 * Request to list buckets.
 */
export interface ListBucketsRequest {
  /** Project ID. */
  projectId: string;
  /** Maximum results per page. */
  maxResults?: number;
  /** Pagination token. */
  pageToken?: string;
  /** Prefix filter. */
  prefix?: string;
}

/**
 * Request to get bucket metadata.
 */
export interface GetBucketRequest {
  /** Bucket name. */
  bucket: string;
}

// Factory functions for creating requests

/**
 * Create an insert object request.
 */
export function createInsertObjectRequest(
  bucket: string,
  name: string,
  data: Buffer | string
): InsertObjectRequest {
  return {
    bucket,
    name,
    data: typeof data === "string" ? Buffer.from(data) : data,
  };
}

/**
 * Create a get object request.
 */
export function createGetObjectRequest(bucket: string, object: string): GetObjectRequest {
  return { bucket, object };
}

/**
 * Create a delete object request.
 */
export function createDeleteObjectRequest(bucket: string, object: string): DeleteObjectRequest {
  return { bucket, object };
}

/**
 * Create a list objects request.
 */
export function createListObjectsRequest(bucket: string, prefix?: string): ListObjectsRequest {
  return prefix ? { bucket, prefix } : { bucket };
}

/**
 * Create a copy object request.
 */
export function createCopyObjectRequest(
  sourceBucket: string,
  sourceObject: string,
  destinationBucket: string,
  destinationObject: string
): CopyObjectRequest {
  return { sourceBucket, sourceObject, destinationBucket, destinationObject };
}
