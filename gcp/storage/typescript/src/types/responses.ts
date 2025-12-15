/**
 * Response types for GCS operations.
 *
 * Following the SPARC specification for Google Cloud Storage integration.
 */

import { ObjectMetadata, BucketMetadata } from "./common.js";

/**
 * Response from listing objects.
 */
export interface ListObjectsResponse {
  /** Object metadata items. */
  items: ObjectMetadata[];
  /** Common prefixes (for delimiter queries). */
  prefixes: string[];
  /** Next page token for pagination. */
  nextPageToken?: string;
}

/**
 * Response from listing buckets.
 */
export interface ListBucketsResponse {
  /** Bucket metadata items. */
  items: BucketMetadata[];
  /** Next page token for pagination. */
  nextPageToken?: string;
}

/**
 * Response from a streaming download.
 */
export interface DownloadStreamResponse {
  /** Async iterator for data chunks. */
  stream: AsyncIterable<Buffer>;
  /** Total content length. */
  contentLength?: number;
  /** Content type. */
  contentType?: string;
  /** Object generation. */
  generation?: string;
}

/**
 * Response from a range download.
 */
export interface DownloadRangeResponse {
  /** Data buffer. */
  data: Buffer;
  /** Content range (e.g., "bytes 0-1023/5000"). */
  contentRange: string;
  /** Total content length. */
  totalLength: number;
}

/**
 * Upload session for resumable uploads.
 */
export interface ResumableUploadSession {
  /** Resumable upload URI. */
  uri: string;
  /** Bucket name. */
  bucket: string;
  /** Object name. */
  objectName: string;
  /** Total size to upload. */
  totalSize: number;
  /** Bytes uploaded so far. */
  bytesUploaded: number;
}

/**
 * Status of a resumable upload.
 */
export interface ResumableUploadStatus {
  /** Whether the upload is complete. */
  complete: boolean;
  /** Bytes uploaded so far. */
  bytesUploaded: number;
  /** Object metadata (only present when complete). */
  metadata?: ObjectMetadata;
}
