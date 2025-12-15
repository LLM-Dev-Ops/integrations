/**
 * Request types for Azure Files operations.
 *
 * Following the SPARC specification for Azure Files integration.
 */

import type { ByteRange } from "./common.js";

/**
 * Create file request.
 */
export interface CreateFileRequest {
  /** Share name. */
  share: string;
  /** File path within the share. */
  path: string;
  /** File size in bytes. */
  size: number;
  /** Content type (MIME). */
  contentType?: string;
  /** Custom metadata. */
  metadata?: Record<string, string>;
  /** Lease ID for lease-protected operations. */
  leaseId?: string;
}

/**
 * Read file request.
 */
export interface ReadFileRequest {
  /** Share name. */
  share: string;
  /** File path within the share. */
  path: string;
  /** Optional byte range for partial read. */
  range?: ByteRange;
  /** Lease ID for lease-protected operations. */
  leaseId?: string;
}

/**
 * Write file request.
 */
export interface WriteFileRequest {
  /** Share name. */
  share: string;
  /** File path within the share. */
  path: string;
  /** Data to write. */
  data: Buffer;
  /** Offset to start writing at (default: 0). */
  offset?: number;
  /** Lease ID for lease-protected operations. */
  leaseId?: string;
}

/**
 * Delete file request.
 */
export interface DeleteFileRequest {
  /** Share name. */
  share: string;
  /** File path within the share. */
  path: string;
  /** Lease ID for lease-protected operations. */
  leaseId?: string;
}

/**
 * Get file properties request.
 */
export interface GetPropertiesRequest {
  /** Share name. */
  share: string;
  /** File path within the share. */
  path: string;
  /** Lease ID for lease-protected operations. */
  leaseId?: string;
}

/**
 * Set file metadata request.
 */
export interface SetMetadataRequest {
  /** Share name. */
  share: string;
  /** File path within the share. */
  path: string;
  /** Custom metadata to set. */
  metadata: Record<string, string>;
  /** Lease ID for lease-protected operations. */
  leaseId?: string;
}

/**
 * Copy file request.
 */
export interface CopyFileRequest {
  /** Source share name. */
  sourceShare: string;
  /** Source file path. */
  sourcePath: string;
  /** Destination share name. */
  destShare: string;
  /** Destination file path. */
  destPath: string;
  /** Custom metadata for destination. */
  metadata?: Record<string, string>;
}

/**
 * Create directory request.
 */
export interface CreateDirectoryRequest {
  /** Share name. */
  share: string;
  /** Directory path within the share. */
  path: string;
  /** Custom metadata. */
  metadata?: Record<string, string>;
}

/**
 * Delete directory request.
 */
export interface DeleteDirectoryRequest {
  /** Share name. */
  share: string;
  /** Directory path within the share. */
  path: string;
}

/**
 * List directory request.
 */
export interface ListDirectoryRequest {
  /** Share name. */
  share: string;
  /** Directory path within the share (empty for root). */
  path?: string;
  /** Prefix to filter results. */
  prefix?: string;
  /** Maximum results per page. */
  maxResults?: number;
  /** Continuation marker from previous request. */
  marker?: string;
}

/**
 * Acquire lease request.
 */
export interface AcquireLeaseRequest {
  /** Share name. */
  share: string;
  /** File path within the share. */
  path: string;
  /** Lease duration in seconds (15-60 or -1 for infinite). */
  durationSeconds?: number;
  /** Proposed lease ID. */
  proposedLeaseId?: string;
}

/**
 * Break lease request.
 */
export interface BreakLeaseRequest {
  /** Share name. */
  share: string;
  /** File path within the share. */
  path: string;
  /** Break period in seconds. */
  breakPeriodSeconds?: number;
}

/**
 * Upload stream request.
 */
export interface UploadStreamRequest {
  /** Share name. */
  share: string;
  /** File path within the share. */
  path: string;
  /** Total file size in bytes. */
  totalSize: number;
  /** Content type (MIME). */
  contentType?: string;
  /** Custom metadata. */
  metadata?: Record<string, string>;
  /** Lease ID for lease-protected operations. */
  leaseId?: string;
}

/**
 * Download stream request.
 */
export interface DownloadStreamRequest {
  /** Share name. */
  share: string;
  /** File path within the share. */
  path: string;
  /** Lease ID for lease-protected operations. */
  leaseId?: string;
  /** Buffer size for streaming (optional). */
  bufferSize?: number;
}

/**
 * Download range request.
 */
export interface DownloadRangeRequest {
  /** Share name. */
  share: string;
  /** File path within the share. */
  path: string;
  /** Start offset (inclusive). */
  start: number;
  /** End offset (inclusive). */
  end: number;
  /** Lease ID for lease-protected operations. */
  leaseId?: string;
}

/**
 * Conditional update request.
 */
export interface ConditionalUpdateRequest {
  /** Share name. */
  share: string;
  /** File path within the share. */
  path: string;
  /** Data to write. */
  data: Buffer;
  /** Offset to start writing at. */
  offset: number;
  /** ETag to match for conditional update. */
  etag: string;
  /** Lease ID for lease-protected operations. */
  leaseId?: string;
}

/**
 * Request builder helpers.
 */
export function createFileRequest(
  share: string,
  path: string,
  size: number
): CreateFileRequest {
  return { share, path, size };
}

export function readFileRequest(share: string, path: string): ReadFileRequest {
  return { share, path };
}

export function writeFileRequest(
  share: string,
  path: string,
  data: Buffer
): WriteFileRequest {
  return { share, path, data };
}

export function deleteFileRequest(share: string, path: string): DeleteFileRequest {
  return { share, path };
}

export function acquireLeaseRequest(share: string, path: string): AcquireLeaseRequest {
  return { share, path };
}

export function listDirectoryRequest(share: string, path?: string): ListDirectoryRequest {
  return { share, path };
}
