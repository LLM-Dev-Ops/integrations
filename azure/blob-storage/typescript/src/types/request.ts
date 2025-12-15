/**
 * Azure Blob Storage Request Types
 *
 * Request type definitions for all blob operations.
 */

import type { AccessTier, DeleteSnapshotsOption } from './blob.js';

/** Base request options */
export interface RequestOptions {
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Additional headers */
  headers?: Record<string, string>;
}

/** Upload request for simple uploads */
export interface UploadRequest extends RequestOptions {
  /** Container name */
  container?: string;
  /** Blob name (path) */
  blobName: string;
  /** Data to upload */
  data: Uint8Array | ArrayBuffer | Blob | string;
  /** Content type MIME */
  contentType?: string;
  /** Content encoding */
  contentEncoding?: string;
  /** Content language */
  contentLanguage?: string;
  /** Cache control header */
  cacheControl?: string;
  /** Content disposition */
  contentDisposition?: string;
  /** Custom metadata */
  metadata?: Record<string, string>;
  /** Access tier */
  accessTier?: AccessTier;
  /** Whether to overwrite existing blob */
  overwrite?: boolean;
  /** Content MD5 for validation */
  contentMd5?: string;
}

/** Stream upload request for chunked uploads */
export interface StreamUploadRequest extends RequestOptions {
  /** Container name */
  container?: string;
  /** Blob name (path) */
  blobName: string;
  /** Async iterable of chunks or ReadableStream */
  stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>;
  /** Total content length if known */
  contentLength?: number;
  /** Content type MIME */
  contentType?: string;
  /** Custom metadata */
  metadata?: Record<string, string>;
  /** Access tier */
  accessTier?: AccessTier;
  /** Chunk size for block upload (default 4MB) */
  chunkSize?: number;
  /** Maximum concurrent uploads */
  concurrency?: number;
  /** Progress callback */
  onProgress?: (bytesTransferred: number, totalBytes?: number) => void;
}

/** Append request for append blobs */
export interface AppendRequest extends RequestOptions {
  /** Container name */
  container?: string;
  /** Blob name (path) */
  blobName: string;
  /** Data to append */
  data: Uint8Array | ArrayBuffer | string;
  /** Create blob if it doesn't exist */
  createIfNotExists?: boolean;
  /** Expected append position (for optimistic concurrency) */
  appendPosition?: number;
  /** Maximum size of append blob */
  maxSize?: number;
}

/** Download request for simple downloads */
export interface DownloadRequest extends RequestOptions {
  /** Container name */
  container?: string;
  /** Blob name (path) */
  blobName: string;
  /** Specific version ID */
  versionId?: string;
  /** Snapshot timestamp */
  snapshot?: string;
  /** ETag for conditional request */
  ifMatch?: string;
  /** ETag for conditional request (not match) */
  ifNoneMatch?: string;
}

/** Stream download request for large files */
export interface StreamDownloadRequest extends RequestOptions {
  /** Container name */
  container?: string;
  /** Blob name (path) */
  blobName: string;
  /** Specific version ID */
  versionId?: string;
  /** Chunk size for parallel download */
  chunkSize?: number;
  /** Maximum concurrent downloads */
  concurrency?: number;
  /** Progress callback */
  onProgress?: (bytesTransferred: number, totalBytes: number) => void;
}

/** Range download request */
export interface RangeDownloadRequest extends RequestOptions {
  /** Container name */
  container?: string;
  /** Blob name (path) */
  blobName: string;
  /** Start offset (inclusive) */
  offset: number;
  /** Number of bytes to read */
  count: number;
  /** Specific version ID */
  versionId?: string;
}

/** List blobs request */
export interface ListBlobsRequest extends RequestOptions {
  /** Container name */
  container?: string;
  /** Prefix filter */
  prefix?: string;
  /** Delimiter for hierarchy */
  delimiter?: string;
  /** Continuation token for pagination */
  continuationToken?: string;
  /** Maximum results per page */
  maxResults?: number;
  /** Include metadata */
  includeMetadata?: boolean;
  /** Include versions */
  includeVersions?: boolean;
  /** Include snapshots */
  includeSnapshots?: boolean;
  /** Include deleted blobs (soft delete) */
  includeDeleted?: boolean;
  /** Include copy status */
  includeCopy?: boolean;
  /** Include uncommitted blobs */
  includeUncommittedBlobs?: boolean;
}

/** Delete blob request */
export interface DeleteRequest extends RequestOptions {
  /** Container name */
  container?: string;
  /** Blob name (path) */
  blobName: string;
  /** Specific version ID to delete */
  versionId?: string;
  /** Snapshot timestamp to delete */
  snapshot?: string;
  /** How to handle snapshots */
  deleteSnapshots?: DeleteSnapshotsOption;
  /** ETag for conditional delete */
  ifMatch?: string;
}

/** Copy blob request */
export interface CopyRequest extends RequestOptions {
  /** Source URL (full URL or blob in same account) */
  sourceUrl: string;
  /** Destination container */
  destContainer?: string;
  /** Destination blob name */
  destBlobName: string;
  /** Custom metadata for destination */
  metadata?: Record<string, string>;
  /** Access tier for destination */
  accessTier?: AccessTier;
  /** Wait for copy to complete */
  waitForCompletion?: boolean;
  /** Poll interval for async copy (ms) */
  pollInterval?: number;
}

/** Get properties request */
export interface PropertiesRequest extends RequestOptions {
  /** Container name */
  container?: string;
  /** Blob name (path) */
  blobName: string;
  /** Specific version ID */
  versionId?: string;
  /** Snapshot timestamp */
  snapshot?: string;
}

/** Set metadata request */
export interface MetadataRequest extends RequestOptions {
  /** Container name */
  container?: string;
  /** Blob name (path) */
  blobName: string;
  /** Metadata to set (replaces existing) */
  metadata: Record<string, string>;
  /** ETag for conditional update */
  ifMatch?: string;
}

/** Set tier request */
export interface SetTierRequest extends RequestOptions {
  /** Container name */
  container?: string;
  /** Blob name (path) */
  blobName: string;
  /** Target access tier */
  tier: AccessTier;
  /** Rehydrate priority for archive tier */
  rehydratePriority?: 'High' | 'Standard';
}

/** List versions request */
export interface VersionsRequest extends RequestOptions {
  /** Container name */
  container?: string;
  /** Blob name (path) */
  blobName: string;
}
