/**
 * Response types for S3 operations.
 */

import {
  StorageClass,
  S3Object,
  Bucket,
  Owner,
  Part,
  DeletedObject,
  DeleteError,
  Tag,
  MultipartUpload,
} from "./common";

/**
 * Put object response.
 */
export interface PutObjectOutput {
  eTag?: string;
  versionId?: string;
  serverSideEncryption?: string;
  sseKmsKeyId?: string;
  bucketKeyEnabled?: boolean;
  requestId?: string;
}

/**
 * Get object response.
 */
export interface GetObjectOutput {
  body: Buffer;
  eTag?: string;
  contentLength?: number;
  contentType?: string;
  contentEncoding?: string;
  contentDisposition?: string;
  cacheControl?: string;
  contentLanguage?: string;
  lastModified?: string;
  versionId?: string;
  storageClass?: StorageClass;
  serverSideEncryption?: string;
  sseKmsKeyId?: string;
  metadata?: Record<string, string>;
  tagCount?: number;
  deleteMarker?: boolean;
  partsCount?: number;
  contentRange?: string;
  acceptRanges?: string;
  requestId?: string;
}

/**
 * Head object response.
 */
export interface HeadObjectOutput {
  eTag?: string;
  contentLength?: number;
  contentType?: string;
  contentEncoding?: string;
  contentDisposition?: string;
  cacheControl?: string;
  contentLanguage?: string;
  lastModified?: string;
  versionId?: string;
  storageClass?: StorageClass;
  serverSideEncryption?: string;
  sseKmsKeyId?: string;
  metadata?: Record<string, string>;
  deleteMarker?: boolean;
  partsCount?: number;
  objectLockMode?: string;
  objectLockRetainUntilDate?: string;
  objectLockLegalHoldStatus?: string;
  requestId?: string;
}

/**
 * Delete object response.
 */
export interface DeleteObjectOutput {
  deleteMarker?: boolean;
  versionId?: string;
  requestId?: string;
}

/**
 * Delete objects (batch) response.
 */
export interface DeleteObjectsOutput {
  deleted: DeletedObject[];
  errors: DeleteError[];
  requestId?: string;
}

/**
 * Copy object response.
 */
export interface CopyObjectOutput {
  eTag?: string;
  lastModified?: string;
  versionId?: string;
  copySourceVersionId?: string;
  serverSideEncryption?: string;
  sseKmsKeyId?: string;
  requestId?: string;
}

/**
 * List objects v2 response.
 */
export interface ListObjectsV2Output {
  name?: string;
  prefix?: string;
  delimiter?: string;
  maxKeys?: number;
  keyCount?: number;
  isTruncated: boolean;
  nextContinuationToken?: string;
  startAfter?: string;
  continuationToken?: string;
  contents: S3Object[];
  commonPrefixes: string[];
  requestId?: string;
}

/**
 * Create bucket response.
 */
export interface CreateBucketOutput {
  location?: string;
  requestId?: string;
}

/**
 * Head bucket response.
 */
export interface HeadBucketOutput {
  bucketRegion?: string;
  accessPointAlias?: boolean;
  requestId?: string;
}

/**
 * List buckets response.
 */
export interface ListBucketsOutput {
  owner?: Owner;
  buckets: Bucket[];
  requestId?: string;
}

/**
 * Get bucket location response.
 */
export interface GetBucketLocationOutput {
  location?: string;
  requestId?: string;
}

/**
 * Create multipart upload response.
 */
export interface CreateMultipartUploadOutput {
  bucket: string;
  key: string;
  uploadId: string;
  serverSideEncryption?: string;
  sseKmsKeyId?: string;
  requestId?: string;
}

/**
 * Upload part response.
 */
export interface UploadPartOutput {
  eTag: string;
  serverSideEncryption?: string;
  requestId?: string;
}

/**
 * Complete multipart upload response.
 */
export interface CompleteMultipartUploadOutput {
  bucket?: string;
  key?: string;
  eTag?: string;
  location?: string;
  versionId?: string;
  serverSideEncryption?: string;
  sseKmsKeyId?: string;
  requestId?: string;
}

/**
 * List parts response.
 */
export interface ListPartsOutput {
  bucket?: string;
  key?: string;
  uploadId?: string;
  partNumberMarker?: number;
  nextPartNumberMarker?: number;
  maxParts?: number;
  isTruncated: boolean;
  parts: Part[];
  initiator?: Owner;
  owner?: Owner;
  storageClass?: StorageClass;
  requestId?: string;
}

/**
 * List multipart uploads response.
 */
export interface ListMultipartUploadsOutput {
  bucket?: string;
  prefix?: string;
  delimiter?: string;
  keyMarker?: string;
  uploadIdMarker?: string;
  nextKeyMarker?: string;
  nextUploadIdMarker?: string;
  maxUploads?: number;
  isTruncated: boolean;
  uploads: MultipartUpload[];
  commonPrefixes: string[];
  requestId?: string;
}

/**
 * Presigned URL response.
 */
export interface PresignedUrl {
  url: string;
  method: string;
  expiresAt: Date;
  signedHeaders: Record<string, string>;
}

/**
 * Get object tagging response.
 */
export interface GetObjectTaggingOutput {
  versionId?: string;
  tags: Tag[];
  requestId?: string;
}

/**
 * Put object tagging response.
 */
export interface PutObjectTaggingOutput {
  versionId?: string;
  requestId?: string;
}

/**
 * Get bucket tagging response.
 */
export interface GetBucketTaggingOutput {
  tags: Tag[];
  requestId?: string;
}

/**
 * Put bucket tagging response.
 */
export interface PutBucketTaggingOutput {
  requestId?: string;
}

/**
 * Delete bucket tagging response.
 */
export interface DeleteBucketTaggingOutput {
  requestId?: string;
}
