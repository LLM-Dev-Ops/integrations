/**
 * Common types for Azure Files operations.
 *
 * Following the SPARC specification for Azure Files integration.
 */

/**
 * File metadata.
 */
export interface FileInfo {
  /** Share name. */
  share: string;
  /** File path within the share. */
  path: string;
  /** File size in bytes. */
  size: number;
  /** ETag for conditional operations. */
  etag: string;
  /** Last modified timestamp. */
  lastModified: Date;
  /** Content type (MIME). */
  contentType?: string;
  /** Custom metadata. */
  metadata: Record<string, string>;
}

/**
 * File content with properties.
 */
export interface FileContent {
  /** File data. */
  data: Buffer;
  /** File properties. */
  properties: FileProperties;
  /** ETag for conditional operations. */
  etag: string;
}

/**
 * File properties.
 */
export interface FileProperties {
  /** File size in bytes. */
  size: number;
  /** Content type (MIME). */
  contentType?: string;
  /** Content encoding (e.g., gzip). */
  contentEncoding?: string;
  /** Content MD5 hash. */
  contentMD5?: string;
  /** Last modified timestamp. */
  lastModified: Date;
  /** ETag for conditional operations. */
  etag: string;
  /** Custom metadata. */
  metadata: Record<string, string>;
  /** File attributes. */
  attributes?: string;
  /** Creation time. */
  creationTime?: Date;
  /** Last write time. */
  lastWriteTime?: Date;
}

/**
 * Directory metadata.
 */
export interface DirectoryInfo {
  /** Share name. */
  share: string;
  /** Directory path within the share. */
  path: string;
  /** ETag for conditional operations. */
  etag: string;
  /** Last modified timestamp. */
  lastModified: Date;
  /** Custom metadata. */
  metadata: Record<string, string>;
}

/**
 * Directory listing result.
 */
export interface DirectoryListing {
  /** Entries (files and directories). */
  entries: DirectoryEntry[];
  /** Continuation marker for pagination. */
  nextMarker?: string;
}

/**
 * Directory entry (file or directory).
 */
export type DirectoryEntry =
  | { type: "file"; info: FileInfo }
  | { type: "directory"; info: DirectoryInfo };

/**
 * Check if entry is a file.
 */
export function isFile(entry: DirectoryEntry): entry is { type: "file"; info: FileInfo } {
  return entry.type === "file";
}

/**
 * Check if entry is a directory.
 */
export function isDirectory(entry: DirectoryEntry): entry is { type: "directory"; info: DirectoryInfo } {
  return entry.type === "directory";
}

/**
 * Get name from directory entry.
 */
export function getEntryName(entry: DirectoryEntry): string {
  const path = entry.info.path;
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

/**
 * Lease information.
 */
export interface Lease {
  /** Lease ID. */
  id: string;
  /** Share name. */
  share: string;
  /** File path. */
  path: string;
  /** Lease duration in seconds (undefined for infinite). */
  durationSeconds?: number;
  /** Timestamp when lease was acquired. */
  acquiredAt: Date;
}

/**
 * Lease guard for use with with_lock pattern.
 */
export interface LeaseGuard {
  /** Get the lease ID. */
  id: string;
}

/**
 * Byte range for partial read/write.
 */
export interface ByteRange {
  /** Start offset (inclusive). */
  start: number;
  /** End offset (inclusive). */
  end: number;
}

/**
 * Copy operation status.
 */
export type CopyStatus =
  | { status: "success" }
  | { status: "pending"; copyId: string }
  | { status: "aborted" }
  | { status: "failed"; reason: string };

/**
 * Share metadata.
 */
export interface ShareInfo {
  /** Share name. */
  name: string;
  /** ETag for conditional operations. */
  etag: string;
  /** Last modified timestamp. */
  lastModified: Date;
  /** Share quota in GB. */
  quota?: number;
  /** Custom metadata. */
  metadata: Record<string, string>;
}

/**
 * Parse file info from Azure response headers.
 */
export function parseFileInfo(
  share: string,
  path: string,
  headers: Record<string, string>
): FileInfo {
  const getHeader = (name: string): string | undefined => {
    const lowerName = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === lowerName) {
        return value;
      }
    }
    return undefined;
  };

  const size = parseInt(getHeader("x-ms-content-length") ?? getHeader("content-length") ?? "0", 10);
  const etag = getHeader("etag") ?? "";
  const lastModified = getHeader("last-modified") ? new Date(getHeader("last-modified")!) : new Date();
  const contentType = getHeader("content-type") ?? getHeader("x-ms-content-type");

  // Extract custom metadata (x-ms-meta-*)
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase().startsWith("x-ms-meta-")) {
      metadata[key.slice(10)] = value;
    }
  }

  return {
    share,
    path,
    size,
    etag,
    lastModified,
    contentType,
    metadata,
  };
}

/**
 * Parse file properties from Azure response headers.
 */
export function parseFileProperties(headers: Record<string, string>): FileProperties {
  const getHeader = (name: string): string | undefined => {
    const lowerName = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === lowerName) {
        return value;
      }
    }
    return undefined;
  };

  const size = parseInt(getHeader("x-ms-content-length") ?? getHeader("content-length") ?? "0", 10);
  const etag = getHeader("etag") ?? "";
  const lastModified = getHeader("last-modified") ? new Date(getHeader("last-modified")!) : new Date();
  const contentType = getHeader("content-type") ?? getHeader("x-ms-content-type");
  const contentEncoding = getHeader("content-encoding") ?? getHeader("x-ms-content-encoding");
  const contentMD5 = getHeader("content-md5") ?? getHeader("x-ms-content-md5");
  const attributes = getHeader("x-ms-file-attributes");

  const creationTimeStr = getHeader("x-ms-file-creation-time");
  const lastWriteTimeStr = getHeader("x-ms-file-last-write-time");

  // Extract custom metadata
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase().startsWith("x-ms-meta-")) {
      metadata[key.slice(10)] = value;
    }
  }

  return {
    size,
    contentType,
    contentEncoding,
    contentMD5,
    lastModified,
    etag,
    metadata,
    attributes,
    creationTime: creationTimeStr ? new Date(creationTimeStr) : undefined,
    lastWriteTime: lastWriteTimeStr ? new Date(lastWriteTimeStr) : undefined,
  };
}

/**
 * Parse directory info from Azure response headers.
 */
export function parseDirectoryInfo(
  share: string,
  path: string,
  headers: Record<string, string>
): DirectoryInfo {
  const getHeader = (name: string): string | undefined => {
    const lowerName = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === lowerName) {
        return value;
      }
    }
    return undefined;
  };

  const etag = getHeader("etag") ?? "";
  const lastModified = getHeader("last-modified") ? new Date(getHeader("last-modified")!) : new Date();

  // Extract custom metadata
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase().startsWith("x-ms-meta-")) {
      metadata[key.slice(10)] = value;
    }
  }

  return {
    share,
    path,
    etag,
    lastModified,
    metadata,
  };
}
