/**
 * Azure Blob Storage Response Types
 *
 * Response type definitions for all blob operations.
 */

import type { BlobItem, BlobProperties, BlobVersion, CopyStatus } from './blob.js';

/** Upload response */
export interface UploadResponse {
  /** ETag of uploaded blob */
  etag: string;
  /** Version ID if versioning enabled */
  versionId?: string;
  /** Last modified timestamp */
  lastModified: Date;
  /** Content MD5 hash */
  contentMd5?: string;
  /** Client request ID */
  clientRequestId?: string;
  /** Server request ID */
  requestId?: string;
}

/** Append response */
export interface AppendResponse {
  /** ETag after append */
  etag: string;
  /** Byte offset of appended data */
  appendOffset: number;
  /** Total committed block count */
  committedBlockCount: number;
  /** Last modified timestamp */
  lastModified: Date;
  /** Client request ID */
  clientRequestId?: string;
  /** Server request ID */
  requestId?: string;
}

/** Download response */
export interface DownloadResponse {
  /** Downloaded data */
  data: Uint8Array;
  /** Blob properties */
  properties: BlobProperties;
  /** Custom metadata */
  metadata: Record<string, string>;
  /** Client request ID */
  clientRequestId?: string;
  /** Server request ID */
  requestId?: string;
}

/** Range download response */
export interface RangeDownloadResponse {
  /** Downloaded data for the range */
  data: Uint8Array;
  /** Content range (e.g., "bytes 0-1023/2048") */
  contentRange: string;
  /** ETag of the blob */
  etag: string;
  /** Client request ID */
  clientRequestId?: string;
  /** Server request ID */
  requestId?: string;
}

/** List blobs response */
export interface ListBlobsResponse {
  /** List of blob items */
  blobs: BlobItem[];
  /** Virtual directory prefixes (when using delimiter) */
  prefixes: string[];
  /** Continuation token for next page */
  continuationToken?: string;
  /** Whether there are more results */
  hasMore: boolean;
  /** Client request ID */
  clientRequestId?: string;
  /** Server request ID */
  requestId?: string;
}

/** Copy response */
export interface CopyResponse {
  /** Copy operation ID */
  copyId: string;
  /** Copy status */
  copyStatus: CopyStatus;
  /** ETag of destination blob */
  etag?: string;
  /** Last modified timestamp */
  lastModified?: Date;
  /** Version ID of destination */
  versionId?: string;
  /** Copy progress (e.g., "bytes copied/total bytes") */
  copyProgress?: string;
  /** Client request ID */
  clientRequestId?: string;
  /** Server request ID */
  requestId?: string;
}

/** Properties response (extends BlobProperties with metadata) */
export interface GetPropertiesResponse {
  /** Blob properties */
  properties: BlobProperties;
  /** Custom metadata */
  metadata: Record<string, string>;
  /** Client request ID */
  clientRequestId?: string;
  /** Server request ID */
  requestId?: string;
}

/** Delete response */
export interface DeleteResponse {
  /** Whether deletion was successful */
  deleted: boolean;
  /** Client request ID */
  clientRequestId?: string;
  /** Server request ID */
  requestId?: string;
}

/** Set metadata response */
export interface SetMetadataResponse {
  /** ETag after update */
  etag: string;
  /** Last modified timestamp */
  lastModified: Date;
  /** Client request ID */
  clientRequestId?: string;
  /** Server request ID */
  requestId?: string;
}

/** Set tier response */
export interface SetTierResponse {
  /** Whether tier was changed */
  success: boolean;
  /** Client request ID */
  clientRequestId?: string;
  /** Server request ID */
  requestId?: string;
}

/** List versions response */
export interface ListVersionsResponse {
  /** List of versions */
  versions: BlobVersion[];
  /** Client request ID */
  clientRequestId?: string;
  /** Server request ID */
  requestId?: string;
}

/** Streaming download chunk */
export interface DownloadChunk {
  /** Chunk data */
  data: Uint8Array;
  /** Byte offset of this chunk */
  offset: number;
  /** Total size of the blob */
  totalSize: number;
}
