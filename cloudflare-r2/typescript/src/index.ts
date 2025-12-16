/**
 * Cloudflare R2 Storage Integration
 *
 * A production-ready TypeScript client for Cloudflare R2 object storage,
 * providing S3-compatible API with advanced features:
 * - Complete object lifecycle management (PUT, GET, DELETE, HEAD, LIST, COPY)
 * - Multipart uploads with configurable chunking
 * - Presigned URL generation (GET/PUT)
 * - S3 Signature V4 authentication
 * - Resilience patterns (retry, circuit breaker, timeout)
 * - Comprehensive error handling
 * - Mock client for testing
 *
 * @module @llm-devops/cloudflare-r2
 * @example
 * ```typescript
 * import { createClient } from '@llm-devops/cloudflare-r2';
 *
 * const client = createClient({
 *   accountId: 'my-account',
 *   accessKeyId: 'my-key-id',
 *   secretAccessKey: 'my-secret-key'
 * });
 *
 * // Upload an object
 * await client.objects.put('my-bucket', 'file.txt', 'Hello, World!');
 *
 * // Download an object
 * const data = await client.objects.get('my-bucket', 'file.txt');
 * console.log(data.body);
 *
 * // Clean up
 * await client.close();
 * ```
 */

// ============================================================================
// Client API
// ============================================================================

/**
 * Main client interface and factory functions
 * @see {@link R2Client} for the primary client interface
 */
export type { R2Client, R2ObjectsService, R2MultipartService, R2PresignService } from './client/interface.js';

// Client will be exported when implementation is complete
// export { R2ClientImpl } from './client/implementation.js';
// export { R2ClientBuilder } from './client/builder.js';
// export { createClient, createClientFromEnv, createMockClient } from './client/factory.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration types and utilities
 */
export type {
  R2Config,
  R2CircuitBreakerConfig,
  R2RetryConfig,
  R2SimulationConfig,
  R2FullConfig,
  NormalizedR2Config,
} from './config/index.js';

export {
  DEFAULT_TIMEOUT,
  DEFAULT_MULTIPART_THRESHOLD,
  DEFAULT_MULTIPART_PART_SIZE,
  DEFAULT_MULTIPART_CONCURRENCY,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  validateConfig,
  normalizeConfig,
  R2ConfigBuilder,
  createConfigFromEnv,
} from './config/index.js';

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Error types and utilities
 */
export {
  R2Error,
  type R2ErrorParams,
  AuthError,
  BucketError,
  ConfigError,
  MultipartError,
  NetworkError,
  ObjectError,
  ServerError,
  TransferError,
  ValidationError,
  mapHttpStatusToError,
  mapS3ErrorCode,
  isRetryableError,
  isR2Error,
  mapAwsSdkError,
  wrapError,
} from './errors/index.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Request and response types for all R2 operations
 */
export type {
  // Common types
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

  // Request types
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

  // Response types
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
} from './types/index.js';

// ============================================================================
// Signing (Advanced)
// ============================================================================

/**
 * S3 Signature V4 signing utilities
 * For advanced use cases requiring custom signing
 */
export type {
  SigningRequest,
  SignedRequest,
  PresignedUrlOptions,
  PresignedUrlResult,
} from './signing/index.js';

export {
  R2Signer,
  type R2SignerConfig,
  UNSIGNED_PAYLOAD,
  EMPTY_SHA256,
  createPresignedUrl,
  hmacSha256,
  sha256Hash,
  sha256Hex,
  toHex,
  createCanonicalRequest,
  getCanonicalUri,
  getCanonicalQueryString,
  getCanonicalHeaders,
  getSignedHeaders,
  uriEncode,
  uriEncodePath,
  deriveSigningKey,
  SigningKeyCache,
  formatDateStamp,
  formatAmzDate,
  parseAmzDate,
} from './signing/index.js';

// ============================================================================
// Authentication (Advanced)
// ============================================================================

/**
 * Authentication provider system
 */
export type {
  R2Credentials,
  AuthProvider,
} from './auth/index.js';

export {
  StaticAuthProvider,
  EnvironmentAuthProvider,
  createAuthProvider,
  createAuthProviderFromEnv,
} from './auth/index.js';

// ============================================================================
// Resilience (Advanced)
// ============================================================================

/**
 * Resilience patterns for reliability
 */
export type {
  RetryOptions,
  CircuitState,
  CircuitBreakerOptions,
  ResilienceOrchestrator,
} from './resilience/index.js';

export {
  RetryExecutor,
  createRetryExecutor,
  createDefaultRetryExecutor,
  CircuitBreaker,
  CircuitOpenError,
  createCircuitBreaker,
  createDefaultCircuitBreaker,
  DefaultResilienceOrchestrator,
  PassthroughOrchestrator,
  createResilienceOrchestrator,
  createDefaultResilienceOrchestrator,
  createPassthroughOrchestrator,
} from './resilience/index.js';

// Note: Testing utilities will be exported when implementation is complete
// export { createMockClient, MockR2Client } from './testing/index.js';
