/**
 * AWS S3 Integration Module
 *
 * Production-ready, type-safe interface for interacting with Amazon S3.
 *
 * ## Features
 *
 * - **Full API Coverage**: Objects, Buckets, Multipart, Presign, Tagging
 * - **AWS Signature V4**: Complete signing implementation
 * - **Streaming**: Memory-efficient uploads and downloads
 * - **S3-Compatible**: Works with MinIO, LocalStack, R2, etc.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { createClientFromEnv, createPutObjectRequest } from '@integrations/aws-s3';
 *
 * const client = await createClientFromEnv();
 *
 * // Upload an object
 * const response = await client.objects().put(
 *   createPutObjectRequest('my-bucket', 'hello.txt', 'Hello, S3!')
 * );
 *
 * console.log('Uploaded with ETag:', response.eTag);
 * ```
 *
 * @module @integrations/aws-s3
 */

// Client
export {
  S3Client,
  S3ClientImpl,
  S3ClientBuilder,
  clientBuilder,
  createClient,
  createClientFromEnv,
} from "./client";

// Configuration
export {
  S3Config,
  S3ConfigBuilder,
  AddressingStyle,
  configBuilder,
  resolveEndpoint,
  buildPath,
  isValidVirtualHostBucket,
  validateBucketName,
  validateObjectKey,
} from "./config";

// Credentials
export {
  AwsCredentials,
  CredentialsProvider,
  StaticCredentialsProvider,
  EnvCredentialsProvider,
  ProfileCredentialsProvider,
  ImdsCredentialsProvider,
  ImdsConfig,
  ChainCredentialsProvider,
  createCredentials,
  createTemporaryCredentials,
  isExpired,
  willExpireWithin,
  isTemporary,
} from "./credentials";

// Errors
export {
  S3Error,
  ConfigurationError,
  CredentialsError,
  SigningError,
  RequestError,
  BucketError,
  ObjectError,
  MultipartError,
  AccessError,
  NetworkError,
  ServerError,
  ResponseError,
  TransferError,
  S3ErrorResponse,
  mapS3ErrorCode,
} from "./error";

// Services
export {
  ObjectsService,
  BucketsService,
  MultipartService,
  TaggingService,
  PresignService,
} from "./services";

// Signing
export { AwsSignerV4, SignedRequest, SigningOptions, createSigner } from "./signing";

// Transport
export {
  HttpRequest,
  HttpResponse,
  HttpTransport,
  FetchTransport,
  isSuccess,
  getHeader,
  getETag,
  getRequestId,
  getContentLength,
  createRequest,
  createTransport,
} from "./transport";

// Types
export {
  // Common types
  StorageClass,
  ServerSideEncryption,
  CannedAcl,
  ChecksumAlgorithm,
  Tag,
  ObjectIdentifier,
  Owner,
  S3Object,
  Bucket,
  Part,
  CompletedPart,
  DeletedObject,
  DeleteError,
  MultipartUpload,
  createTag,
  createObjectIdentifier,
  createCompletedPart,

  // Request types
  PutObjectRequest,
  GetObjectRequest,
  DeleteObjectRequest,
  DeleteObjectsRequest,
  HeadObjectRequest,
  CopyObjectRequest,
  ListObjectsV2Request,
  CreateBucketRequest,
  DeleteBucketRequest,
  HeadBucketRequest,
  CreateMultipartUploadRequest,
  UploadPartRequest,
  ListPartsRequest,
  ListMultipartUploadsRequest,
  PresignGetRequest,
  PresignPutRequest,
  PresignDeleteRequest,
  GetObjectTaggingRequest,
  PutObjectTaggingRequest,
  GetBucketTaggingRequest,
  PutBucketTaggingRequest,
  DeleteBucketTaggingRequest,
  createPutObjectRequest,
  createGetObjectRequest,
  createDeleteObjectRequest,
  createListObjectsRequest,
  createCreateBucketRequest,
  createMultipartUploadRequest,

  // Response types
  PutObjectOutput,
  GetObjectOutput,
  DeleteObjectOutput,
  DeleteObjectsOutput,
  HeadObjectOutput,
  CopyObjectOutput,
  ListObjectsV2Output,
  CreateBucketOutput,
  HeadBucketOutput,
  ListBucketsOutput,
  GetBucketLocationOutput,
  CreateMultipartUploadOutput,
  UploadPartOutput,
  CompleteMultipartUploadOutput,
  ListPartsOutput,
  ListMultipartUploadsOutput,
  PresignedUrl,
  GetObjectTaggingOutput,
  PutObjectTaggingOutput,
  GetBucketTaggingOutput,
  PutBucketTaggingOutput,
  DeleteBucketTaggingOutput,
} from "./types";

// XML utilities (internal, but exported for extensibility)
export * as xml from "./xml";
