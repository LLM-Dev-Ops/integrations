/**
 * Common types for S3 operations.
 */

/**
 * Storage class enumeration.
 */
export enum StorageClass {
  Standard = "STANDARD",
  ReducedRedundancy = "REDUCED_REDUNDANCY",
  StandardIa = "STANDARD_IA",
  OnezoneIa = "ONEZONE_IA",
  IntelligentTiering = "INTELLIGENT_TIERING",
  Glacier = "GLACIER",
  DeepArchive = "DEEP_ARCHIVE",
  GlacierIr = "GLACIER_IR",
  ExpressOnezone = "EXPRESS_ONEZONE",
}

/**
 * Server-side encryption options.
 */
export enum ServerSideEncryption {
  Aes256 = "AES256",
  AwsKms = "aws:kms",
  AwsKmsDsse = "aws:kms:dsse",
}

/**
 * Canned ACL options.
 */
export enum CannedAcl {
  Private = "private",
  PublicRead = "public-read",
  PublicReadWrite = "public-read-write",
  AuthenticatedRead = "authenticated-read",
  AwsExecRead = "aws-exec-read",
  BucketOwnerRead = "bucket-owner-read",
  BucketOwnerFullControl = "bucket-owner-full-control",
}

/**
 * Checksum algorithm options.
 */
export enum ChecksumAlgorithm {
  Crc32 = "CRC32",
  Crc32c = "CRC32C",
  Sha1 = "SHA1",
  Sha256 = "SHA256",
}

/**
 * Tag key-value pair.
 */
export interface Tag {
  key: string;
  value: string;
}

/**
 * Object identifier for batch operations.
 */
export interface ObjectIdentifier {
  key: string;
  versionId?: string;
}

/**
 * Object owner information.
 */
export interface Owner {
  id?: string;
  displayName?: string;
}

/**
 * S3 object information.
 */
export interface S3Object {
  key: string;
  lastModified?: string;
  eTag?: string;
  size?: number;
  storageClass?: StorageClass;
  owner?: Owner;
  checksumAlgorithm?: ChecksumAlgorithm;
}

/**
 * Bucket information.
 */
export interface Bucket {
  name: string;
  creationDate?: string;
}

/**
 * Part information for multipart uploads.
 */
export interface Part {
  partNumber: number;
  eTag: string;
  size?: number;
  lastModified?: string;
  checksumCrc32?: string;
  checksumCrc32c?: string;
  checksumSha1?: string;
  checksumSha256?: string;
}

/**
 * Completed part for finishing multipart upload.
 */
export interface CompletedPart {
  partNumber: number;
  eTag: string;
  checksumCrc32?: string;
  checksumCrc32c?: string;
  checksumSha1?: string;
  checksumSha256?: string;
}

/**
 * Deleted object result.
 */
export interface DeletedObject {
  key: string;
  versionId?: string;
  deleteMarker?: boolean;
  deleteMarkerVersionId?: string;
}

/**
 * Delete error result.
 */
export interface DeleteError {
  key: string;
  versionId?: string;
  code: string;
  message: string;
}

/**
 * Multipart upload information.
 */
export interface MultipartUpload {
  key: string;
  uploadId: string;
  initiator?: Owner;
  owner?: Owner;
  storageClass?: StorageClass;
  initiated?: string;
}

/**
 * Create a tag.
 */
export function createTag(key: string, value: string): Tag {
  return { key, value };
}

/**
 * Create an object identifier.
 */
export function createObjectIdentifier(key: string, versionId?: string): ObjectIdentifier {
  return versionId ? { key, versionId } : { key };
}

/**
 * Create a completed part.
 */
export function createCompletedPart(partNumber: number, eTag: string): CompletedPart {
  return { partNumber, eTag };
}
