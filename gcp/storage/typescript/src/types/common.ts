/**
 * Common types for GCS operations.
 *
 * Following the SPARC specification for Google Cloud Storage integration.
 */

/**
 * GCS storage class enumeration.
 */
export enum StorageClass {
  Standard = "STANDARD",
  Nearline = "NEARLINE",
  Coldline = "COLDLINE",
  Archive = "ARCHIVE",
  MultiRegional = "MULTI_REGIONAL",
  Regional = "REGIONAL",
  DurableReducedAvailability = "DURABLE_REDUCED_AVAILABILITY",
}

/**
 * Predefined ACL options.
 */
export enum PredefinedAcl {
  AuthenticatedRead = "authenticatedRead",
  BucketOwnerFullControl = "bucketOwnerFullControl",
  BucketOwnerRead = "bucketOwnerRead",
  Private = "private",
  ProjectPrivate = "projectPrivate",
  PublicRead = "publicRead",
}

/**
 * HTTP method for signed URLs.
 */
export enum HttpMethod {
  GET = "GET",
  PUT = "PUT",
  POST = "POST",
  DELETE = "DELETE",
  HEAD = "HEAD",
}

/**
 * Object metadata from GCS.
 */
export interface ObjectMetadata {
  /** Object name (path). */
  name: string;
  /** Bucket name. */
  bucket: string;
  /** Generation (version). */
  generation: string;
  /** Metageneration (metadata version). */
  metageneration: string;
  /** Content type (MIME). */
  contentType: string;
  /** Size in bytes. */
  size: number;
  /** MD5 hash (base64). */
  md5Hash?: string;
  /** CRC32c checksum (base64). */
  crc32c?: string;
  /** ETag. */
  etag: string;
  /** Creation time. */
  timeCreated: Date;
  /** Last update time. */
  updated: Date;
  /** Storage class. */
  storageClass: StorageClass;
  /** Content encoding (e.g., gzip). */
  contentEncoding?: string;
  /** Content disposition. */
  contentDisposition?: string;
  /** Content language. */
  contentLanguage?: string;
  /** Cache control header. */
  cacheControl?: string;
  /** Custom metadata (x-goog-meta-*). */
  metadata: Record<string, string>;
  /** Self link. */
  selfLink: string;
  /** Media link (download URL). */
  mediaLink: string;
}

/**
 * Full object with data.
 */
export interface GcsObject {
  /** Object metadata. */
  metadata: ObjectMetadata;
  /** Object data. */
  data: Buffer;
}

/**
 * Bucket metadata.
 */
export interface BucketMetadata {
  /** Bucket name. */
  name: string;
  /** Bucket ID. */
  id: string;
  /** Project number. */
  projectNumber: string;
  /** Creation time. */
  timeCreated: Date;
  /** Last update time. */
  updated: Date;
  /** Location. */
  location: string;
  /** Storage class. */
  storageClass: StorageClass;
  /** Self link. */
  selfLink: string;
  /** Metageneration. */
  metageneration: string;
  /** ETag. */
  etag: string;
}

/**
 * Signed URL with metadata.
 */
export interface SignedUrl {
  /** The signed URL. */
  url: string;
  /** Expiration time. */
  expiresAt: Date;
  /** HTTP method this URL is valid for. */
  method: HttpMethod;
  /** Required headers (for upload URLs). */
  requiredHeaders: Record<string, string>;
}

/**
 * Source object for compose operations.
 */
export interface SourceObject {
  /** Object name. */
  name: string;
  /** Optional generation. */
  generation?: string;
}

/**
 * Upload status for resumable uploads.
 */
export enum UploadStatus {
  InProgress = "in_progress",
  Complete = "complete",
  NotFound = "not_found",
}

/**
 * Chunk result for resumable uploads.
 */
export type ChunkResult =
  | { type: "incomplete"; bytesUploaded: number }
  | { type: "complete"; metadata: ObjectMetadata };

/**
 * Create a source object for compose operations.
 */
export function createSourceObject(name: string, generation?: string): SourceObject {
  return generation ? { name, generation } : { name };
}

/**
 * Parse storage class from string.
 */
export function parseStorageClass(value: string): StorageClass {
  const normalized = value.toUpperCase().replace(/-/g, "_");
  return (StorageClass as Record<string, StorageClass>)[normalized] ?? StorageClass.Standard;
}

/**
 * Parse date from ISO string.
 */
export function parseDate(value: string | undefined): Date {
  return value ? new Date(value) : new Date();
}

/**
 * Parse object metadata from GCS JSON response.
 */
export function parseObjectMetadata(json: Record<string, unknown>): ObjectMetadata {
  return {
    name: json.name as string,
    bucket: json.bucket as string,
    generation: json.generation as string,
    metageneration: json.metageneration as string,
    contentType: (json.contentType as string) ?? "application/octet-stream",
    size: parseInt(json.size as string, 10) || 0,
    md5Hash: json.md5Hash as string | undefined,
    crc32c: json.crc32c as string | undefined,
    etag: json.etag as string,
    timeCreated: parseDate(json.timeCreated as string),
    updated: parseDate(json.updated as string),
    storageClass: parseStorageClass((json.storageClass as string) ?? "STANDARD"),
    contentEncoding: json.contentEncoding as string | undefined,
    contentDisposition: json.contentDisposition as string | undefined,
    contentLanguage: json.contentLanguage as string | undefined,
    cacheControl: json.cacheControl as string | undefined,
    metadata: (json.metadata as Record<string, string>) ?? {},
    selfLink: json.selfLink as string,
    mediaLink: json.mediaLink as string,
  };
}

/**
 * Parse bucket metadata from GCS JSON response.
 */
export function parseBucketMetadata(json: Record<string, unknown>): BucketMetadata {
  return {
    name: json.name as string,
    id: json.id as string,
    projectNumber: json.projectNumber as string,
    timeCreated: parseDate(json.timeCreated as string),
    updated: parseDate(json.updated as string),
    location: json.location as string,
    storageClass: parseStorageClass((json.storageClass as string) ?? "STANDARD"),
    selfLink: json.selfLink as string,
    metageneration: json.metageneration as string,
    etag: json.etag as string,
  };
}
