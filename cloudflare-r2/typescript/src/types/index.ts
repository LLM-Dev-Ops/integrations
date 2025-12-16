/**
 * Type definitions for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/types
 */

// Common types
export type {
  Tags,
  StorageClass,
  MetadataDirective,
  R2Object,
  ObjectIdentifier,
  DeletedObject,
  DeleteError,
  CompletedPart,
  Part,
  CommonPrefix,
  HttpMethod,
  ContentEncoding,
  CacheControlDirective,
  ContentDisposition,
} from './common.js';

// Request types
export type {
  PutObjectRequest,
  GetObjectRequest,
  DeleteObjectRequest,
  DeleteObjectsRequest,
  HeadObjectRequest,
  CopyObjectRequest,
  ListObjectsRequest,
  CreateMultipartRequest,
  UploadPartRequest,
  CompleteMultipartRequest,
  AbortMultipartRequest,
  ListPartsRequest,
  PresignGetRequest,
  PresignPutRequest,
  ListMultipartUploadsRequest,
} from './requests.js';

// Response types
export type {
  PutObjectOutput,
  GetObjectOutput,
  GetObjectStreamOutput,
  DeleteObjectOutput,
  DeleteObjectsOutput,
  HeadObjectOutput,
  CopyObjectOutput,
  ListObjectsOutput,
  CreateMultipartOutput,
  UploadPartOutput,
  CompleteMultipartOutput,
  AbortMultipartOutput,
  ListPartsOutput,
  MultipartUpload,
  ListMultipartUploadsOutput,
  PresignedUrl,
  PresignGetOutput,
  PresignPutOutput,
} from './responses.js';
