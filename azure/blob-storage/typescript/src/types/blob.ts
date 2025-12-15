/**
 * Azure Blob Storage Core Types
 *
 * Type definitions for blob items and properties following SPARC specification.
 */

/** Supported blob types */
export type BlobType = 'BlockBlob' | 'AppendBlob' | 'PageBlob';

/** Access tier for blob storage */
export type AccessTier = 'Hot' | 'Cool' | 'Cold' | 'Archive';

/** Lease status of a blob */
export type LeaseStatus = 'locked' | 'unlocked';

/** Lease state of a blob */
export type LeaseState = 'available' | 'leased' | 'expired' | 'breaking' | 'broken';

/** Copy status for async copy operations */
export type CopyStatus = 'pending' | 'success' | 'aborted' | 'failed';

/** Delete snapshots option */
export type DeleteSnapshotsOption = 'include' | 'only' | 'none';

/** Blob properties */
export interface BlobProperties {
  /** ETag for concurrency control */
  etag: string;
  /** Last modified timestamp */
  lastModified: Date;
  /** Size in bytes */
  contentLength: number;
  /** MIME content type */
  contentType: string;
  /** Content encoding */
  contentEncoding?: string;
  /** MD5 hash of content */
  contentMd5?: string;
  /** Content language */
  contentLanguage?: string;
  /** Cache control header */
  cacheControl?: string;
  /** Content disposition */
  contentDisposition?: string;
  /** Access tier */
  accessTier?: AccessTier;
  /** Whether access tier is inferred */
  accessTierInferred?: boolean;
  /** Access tier change time */
  accessTierChangedOn?: Date;
  /** Lease status */
  leaseStatus?: LeaseStatus;
  /** Lease state */
  leaseState?: LeaseState;
  /** Lease duration */
  leaseDuration?: 'infinite' | 'fixed';
  /** Creation time */
  creationTime: Date;
  /** Blob type */
  blobType: BlobType;
  /** Server encrypted */
  serverEncrypted?: boolean;
  /** Version ID */
  versionId?: string;
  /** Is current version */
  isCurrentVersion?: boolean;
  /** Copy ID for copy operations */
  copyId?: string;
  /** Copy status */
  copyStatus?: CopyStatus;
  /** Copy source URL */
  copySource?: string;
  /** Copy progress */
  copyProgress?: string;
  /** Copy completion time */
  copyCompletedOn?: Date;
  /** Copy status description */
  copyStatusDescription?: string;
  /** Rehydrate priority for archived blobs */
  rehydratePriority?: 'High' | 'Standard';
  /** Archive status */
  archiveStatus?: 'rehydrate-pending-to-hot' | 'rehydrate-pending-to-cool';
  /** Last accessed time */
  lastAccessedOn?: Date;
  /** Immutability policy expiry */
  immutabilityPolicyExpiresOn?: Date;
  /** Immutability policy mode */
  immutabilityPolicyMode?: 'unlocked' | 'locked';
  /** Legal hold */
  legalHold?: boolean;
}

/** Blob item in a listing */
export interface BlobItem {
  /** Blob name (path) */
  name: string;
  /** Container name */
  container: string;
  /** Blob properties */
  properties: BlobProperties;
  /** Custom metadata */
  metadata: Record<string, string>;
  /** Version ID if versioning enabled */
  versionId?: string;
  /** Is this the current version */
  isCurrentVersion: boolean;
  /** Snapshot timestamp if this is a snapshot */
  snapshot?: string;
  /** Whether blob is deleted (soft delete) */
  deleted?: boolean;
  /** Deleted time */
  deletedOn?: Date;
  /** Remaining retention days */
  remainingRetentionDays?: number;
}

/** Blob version information */
export interface BlobVersion {
  /** Version ID */
  versionId: string;
  /** Is current version */
  isCurrentVersion: boolean;
  /** Last modified time */
  lastModified: Date;
  /** Content length */
  contentLength: number;
  /** Access tier */
  accessTier?: AccessTier;
}

/** Block information for block blobs */
export interface BlockInfo {
  /** Block ID (base64 encoded) */
  blockId: string;
  /** Block size in bytes */
  size: number;
}

/** Block list for committed/uncommitted blocks */
export interface BlockList {
  /** Committed blocks */
  committedBlocks: BlockInfo[];
  /** Uncommitted blocks */
  uncommittedBlocks: BlockInfo[];
}
