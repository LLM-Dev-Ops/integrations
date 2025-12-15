/**
 * Google Cloud Storage Integration Module
 *
 * Production-ready, type-safe interface for interacting with Google Cloud Storage.
 *
 * ## Features
 *
 * - **Full API Coverage**: Objects, Buckets, Streaming, Signed URLs
 * - **V4 Signature**: Complete signed URL implementation
 * - **Streaming**: Memory-efficient uploads and downloads
 * - **Resumable Uploads**: Automatic chunked uploads for large files
 * - **Multiple Auth**: Service accounts, workload identity, ADC
 *
 * ## Quick Start
 *
 * ```typescript
 * import { createClientFromEnv, createInsertObjectRequest } from '@integrations/gcp-storage';
 *
 * const client = await createClientFromEnv();
 *
 * // Upload an object
 * const metadata = await client.objects().insert(
 *   createInsertObjectRequest('my-bucket', 'hello.txt', 'Hello, GCS!')
 * );
 *
 * console.log('Uploaded:', metadata.name, 'Generation:', metadata.generation);
 * ```
 *
 * @module @integrations/gcp-storage
 */

// Client
export {
  GcsClient,
  GcsClientImpl,
  GcsClientBuilder,
  clientBuilder,
  createClient,
  createClientFromEnv,
} from "./client/index.js";

// Configuration
export {
  GcsConfig,
  GcsConfigBuilder,
  GcpCredentials,
  ServiceAccountKey,
  RetryConfig,
  CircuitBreakerConfig,
  configBuilder,
  resolveEndpoint,
  resolveUploadEndpoint,
  validateBucketName,
  validateObjectName,
  encodeObjectName,
  DEFAULT_CONFIG,
} from "./config/index.js";

// Credentials
export {
  GcpAuthProvider,
  CachedToken,
  TokenResponse,
  createAuthProvider,
  StaticTokenAuthProvider,
  ServiceAccountAuthProvider,
  WorkloadIdentityAuthProvider,
  ApplicationDefaultAuthProvider,
  UserCredentialsAuthProvider,
} from "./credentials/index.js";

// Errors
export {
  GcsError,
  ConfigurationError,
  AuthenticationError,
  ObjectError,
  BucketError,
  UploadError,
  DownloadError,
  NetworkError,
  ServerError,
  SigningError,
  GcsErrorResponse,
  parseGcsError,
  mapGcsErrorCode,
} from "./error/index.js";

// Services
export {
  ObjectsService,
  BucketsService,
  StreamingService,
  determineChunkSize,
} from "./services/index.js";

// Signing
export { SigningService } from "./signing/index.js";

// Transport
export {
  HttpRequest,
  HttpResponse,
  HttpTransport,
  StreamingHttpResponse,
  FetchTransport,
  isSuccess,
  getHeader,
  getGeneration,
  getMetageneration,
  getRequestId,
  getContentLength,
  getContentType,
  createRequest,
  createTransport,
} from "./transport/index.js";

// Types
export {
  // Common types
  StorageClass,
  PredefinedAcl,
  HttpMethod,
  ObjectMetadata,
  GcsObject,
  BucketMetadata,
  SignedUrl,
  SourceObject,
  ChunkResult,
  createSourceObject,
  parseStorageClass,
  parseDate,
  parseObjectMetadata,
  parseBucketMetadata,

  // Request types
  InsertObjectRequest,
  GetObjectRequest,
  GetMetadataRequest,
  DeleteObjectRequest,
  CopyObjectRequest,
  ComposeObjectsRequest,
  ListObjectsRequest,
  PatchObjectRequest,
  UploadStreamRequest,
  DownloadStreamRequest,
  DownloadRangeRequest,
  CreateResumableUploadRequest,
  SignUrlRequest,
  SignDownloadUrlRequest,
  SignUploadUrlRequest,
  ListBucketsRequest,
  GetBucketRequest,
  createInsertObjectRequest,
  createGetObjectRequest,
  createDeleteObjectRequest,
  createListObjectsRequest,
  createCopyObjectRequest,

  // Response types
  ListObjectsResponse,
  ListBucketsResponse,
  DownloadStreamResponse,
  DownloadRangeResponse,
  ResumableUploadSession,
  ResumableUploadStatus,
} from "./types/index.js";

// Simulation/Mock
export { MockGcsClient, createMockClient } from "./simulation/index.js";
