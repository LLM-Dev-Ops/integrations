/**
 * Request types for S3 operations.
 */

import {
  StorageClass,
  ServerSideEncryption,
  CannedAcl,
  Tag,
  ObjectIdentifier,
  ChecksumAlgorithm,
} from "./common";

/**
 * Put object request.
 */
export interface PutObjectRequest {
  bucket: string;
  key: string;
  body?: Buffer | string;
  contentType?: string;
  contentEncoding?: string;
  contentDisposition?: string;
  cacheControl?: string;
  contentLanguage?: string;
  contentMd5?: string;
  storageClass?: StorageClass;
  serverSideEncryption?: ServerSideEncryption;
  acl?: CannedAcl;
  metadata?: Record<string, string>;
  tagging?: Tag[];
  checksumAlgorithm?: ChecksumAlgorithm;
  objectLockMode?: string;
  objectLockRetainUntilDate?: string;
  objectLockLegalHold?: boolean;
  expectedBucketOwner?: string;
}

/**
 * Get object request.
 */
export interface GetObjectRequest {
  bucket: string;
  key: string;
  versionId?: string;
  range?: string;
  ifMatch?: string;
  ifNoneMatch?: string;
  ifModifiedSince?: string;
  ifUnmodifiedSince?: string;
  responseContentType?: string;
  responseContentDisposition?: string;
  responseCacheControl?: string;
  responseContentEncoding?: string;
  responseContentLanguage?: string;
  responseExpires?: string;
  partNumber?: number;
  sseCustomerAlgorithm?: string;
  sseCustomerKey?: string;
  sseCustomerKeyMd5?: string;
  expectedBucketOwner?: string;
}

/**
 * Delete object request.
 */
export interface DeleteObjectRequest {
  bucket: string;
  key: string;
  versionId?: string;
  mfa?: string;
  bypassGovernanceRetention?: boolean;
  expectedBucketOwner?: string;
}

/**
 * Delete objects (batch) request.
 */
export interface DeleteObjectsRequest {
  bucket: string;
  objects: ObjectIdentifier[];
  quiet?: boolean;
  mfa?: string;
  bypassGovernanceRetention?: boolean;
  expectedBucketOwner?: string;
}

/**
 * Head object request.
 */
export interface HeadObjectRequest {
  bucket: string;
  key: string;
  versionId?: string;
  ifMatch?: string;
  ifNoneMatch?: string;
  ifModifiedSince?: string;
  ifUnmodifiedSince?: string;
  partNumber?: number;
  sseCustomerAlgorithm?: string;
  sseCustomerKey?: string;
  sseCustomerKeyMd5?: string;
  expectedBucketOwner?: string;
}

/**
 * Copy object request.
 */
export interface CopyObjectRequest {
  sourceBucket: string;
  sourceKey: string;
  sourceVersionId?: string;
  destBucket: string;
  destKey: string;
  metadataDirective?: "COPY" | "REPLACE";
  metadata?: Record<string, string>;
  contentType?: string;
  storageClass?: StorageClass;
  serverSideEncryption?: ServerSideEncryption;
  acl?: CannedAcl;
  taggingDirective?: "COPY" | "REPLACE";
  tagging?: Tag[];
  copySourceIfMatch?: string;
  copySourceIfNoneMatch?: string;
  expectedBucketOwner?: string;
}

/**
 * List objects v2 request.
 */
export interface ListObjectsV2Request {
  bucket: string;
  prefix?: string;
  delimiter?: string;
  maxKeys?: number;
  continuationToken?: string;
  startAfter?: string;
  fetchOwner?: boolean;
  expectedBucketOwner?: string;
}

/**
 * Create bucket request.
 */
export interface CreateBucketRequest {
  bucket: string;
  locationConstraint?: string;
  acl?: CannedAcl;
  grantRead?: string;
  grantWrite?: string;
  grantFullControl?: string;
  objectLockEnabled?: boolean;
}

/**
 * Delete bucket request.
 */
export interface DeleteBucketRequest {
  bucket: string;
  expectedBucketOwner?: string;
}

/**
 * Head bucket request.
 */
export interface HeadBucketRequest {
  bucket: string;
  expectedBucketOwner?: string;
}

/**
 * Create multipart upload request.
 */
export interface CreateMultipartUploadRequest {
  bucket: string;
  key: string;
  contentType?: string;
  contentEncoding?: string;
  contentDisposition?: string;
  cacheControl?: string;
  contentLanguage?: string;
  storageClass?: StorageClass;
  serverSideEncryption?: ServerSideEncryption;
  acl?: CannedAcl;
  metadata?: Record<string, string>;
  tagging?: Tag[];
}

/**
 * Upload part request.
 */
export interface UploadPartRequest {
  bucket: string;
  key: string;
  uploadId: string;
  partNumber: number;
  body: Buffer;
  contentMd5?: string;
  sseCustomerAlgorithm?: string;
  sseCustomerKey?: string;
  sseCustomerKeyMd5?: string;
}

/**
 * List parts request.
 */
export interface ListPartsRequest {
  bucket: string;
  key: string;
  uploadId: string;
  maxParts?: number;
  partNumberMarker?: number;
}

/**
 * List multipart uploads request.
 */
export interface ListMultipartUploadsRequest {
  bucket: string;
  prefix?: string;
  delimiter?: string;
  keyMarker?: string;
  uploadIdMarker?: string;
  maxUploads?: number;
  expectedBucketOwner?: string;
}

/**
 * Presign GET request.
 */
export interface PresignGetRequest {
  bucket: string;
  key: string;
  expiresIn: number; // seconds
  versionId?: string;
  responseContentType?: string;
  responseContentDisposition?: string;
}

/**
 * Presign PUT request.
 */
export interface PresignPutRequest {
  bucket: string;
  key: string;
  expiresIn: number; // seconds
  contentType?: string;
  contentLength?: number;
  storageClass?: StorageClass;
}

/**
 * Presign DELETE request.
 */
export interface PresignDeleteRequest {
  bucket: string;
  key: string;
  expiresIn: number; // seconds
  versionId?: string;
}

/**
 * Get object tagging request.
 */
export interface GetObjectTaggingRequest {
  bucket: string;
  key: string;
  versionId?: string;
  expectedBucketOwner?: string;
}

/**
 * Put object tagging request.
 */
export interface PutObjectTaggingRequest {
  bucket: string;
  key: string;
  tags: Tag[];
  versionId?: string;
  expectedBucketOwner?: string;
}

/**
 * Get bucket tagging request.
 */
export interface GetBucketTaggingRequest {
  bucket: string;
  expectedBucketOwner?: string;
}

/**
 * Put bucket tagging request.
 */
export interface PutBucketTaggingRequest {
  bucket: string;
  tags: Tag[];
  expectedBucketOwner?: string;
}

/**
 * Delete bucket tagging request.
 */
export interface DeleteBucketTaggingRequest {
  bucket: string;
  expectedBucketOwner?: string;
}

// Builder functions for common request patterns

/**
 * Create a put object request.
 */
export function createPutObjectRequest(
  bucket: string,
  key: string,
  body?: Buffer | string
): PutObjectRequest {
  return { bucket, key, body };
}

/**
 * Create a get object request.
 */
export function createGetObjectRequest(bucket: string, key: string): GetObjectRequest {
  return { bucket, key };
}

/**
 * Create a delete object request.
 */
export function createDeleteObjectRequest(bucket: string, key: string): DeleteObjectRequest {
  return { bucket, key };
}

/**
 * Create a list objects request.
 */
export function createListObjectsRequest(
  bucket: string,
  prefix?: string
): ListObjectsV2Request {
  return prefix ? { bucket, prefix } : { bucket };
}

/**
 * Create a create bucket request.
 */
export function createCreateBucketRequest(
  bucket: string,
  region?: string
): CreateBucketRequest {
  return region ? { bucket, locationConstraint: region } : { bucket };
}

/**
 * Create a multipart upload request.
 */
export function createMultipartUploadRequest(
  bucket: string,
  key: string
): CreateMultipartUploadRequest {
  return { bucket, key };
}
