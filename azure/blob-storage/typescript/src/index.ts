/**
 * Azure Blob Storage Integration
 *
 * A minimal, precise adapter layer for Azure Blob Storage following SPARC specification.
 *
 * This module provides:
 * - Unified client interface for all blob operations
 * - Multiple authentication methods (StorageKey, AzureAD, SAS, ConnectionString)
 * - Upload: simple, chunked (block blob), append blob
 * - Download: simple, streaming (parallel range), range
 * - Management: list, delete, copy, properties, metadata, tier
 * - Versioning: list versions, get version, delete version
 * - Error handling with typed errors and retry support
 * - Simulation mode for testing (recording/replay)
 *
 * @example Basic usage
 * ```typescript
 * import { BlobStorageClient } from '@integrations/azure-blob-storage';
 *
 * // Create client from environment variables
 * const client = BlobStorageClient.fromEnv();
 *
 * // Upload a blob
 * await client.upload({
 *   blobName: 'my-file.txt',
 *   data: 'Hello, World!',
 *   contentType: 'text/plain',
 * });
 *
 * // Download a blob
 * const { data } = await client.download({ blobName: 'my-file.txt' });
 * console.log(new TextDecoder().decode(data));
 * ```
 *
 * @example Configuration builder
 * ```typescript
 * import { builder, BlobStorageClient } from '@integrations/azure-blob-storage';
 *
 * const config = builder('myaccount')
 *   .withAccountKey('mykey')
 *   .withContainer('mycontainer')
 *   .build();
 *
 * const client = new BlobStorageClient(config);
 * ```
 *
 * @example Streaming upload
 * ```typescript
 * const readStream = fs.createReadStream('large-file.zip');
 *
 * await client.uploadStream({
 *   blobName: 'large-file.zip',
 *   stream: readStream,
 *   contentType: 'application/zip',
 *   onProgress: (bytes, total) => {
 *     console.log(`Uploaded ${bytes} of ${total ?? 'unknown'} bytes`);
 *   },
 * });
 * ```
 *
 * @example Error handling
 * ```typescript
 * import { BlobNotFoundError, AuthenticationError } from '@integrations/azure-blob-storage';
 *
 * try {
 *   await client.download({ blobName: 'nonexistent.txt' });
 * } catch (error) {
 *   if (error instanceof BlobNotFoundError) {
 *     console.log('Blob does not exist');
 *   } else if (error instanceof AuthenticationError) {
 *     console.log('Authentication failed');
 *   }
 * }
 * ```
 *
 * @packageDocumentation
 */

// Main client
export { BlobStorageClient } from './client/client.js';

// Configuration
export {
  type BlobStorageConfig,
  type NormalizedBlobStorageConfig,
  type RetryConfig,
  type SimulationMode,
  BlobStorageConfigBuilder,
  builder,
  normalizeConfig,
  DEFAULT_CONFIG,
  MIN_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  MAX_BLOB_NAME_LENGTH,
  SIMPLE_UPLOAD_LIMIT,
} from './client/config.js';

// Authentication
export type { AuthMethod, AuthHeader, AuthProvider, AzureAdCredentials } from './auth/auth-provider.js';
export {
  StorageKeyAuthProvider,
  AzureAdAuthProvider,
  SasTokenAuthProvider,
  ConnectionStringAuthProvider,
  createAuthProvider,
} from './auth/auth-provider.js';

// Types - Blob
export type {
  BlobType,
  AccessTier,
  LeaseStatus,
  LeaseState,
  CopyStatus,
  DeleteSnapshotsOption,
  BlobProperties,
  BlobItem,
  BlobVersion,
  BlockInfo,
  BlockList,
} from './types/blob.js';

// Types - Request
export type {
  RequestOptions,
  UploadRequest,
  StreamUploadRequest,
  AppendRequest,
  DownloadRequest,
  StreamDownloadRequest,
  RangeDownloadRequest,
  ListBlobsRequest,
  DeleteRequest,
  CopyRequest,
  PropertiesRequest,
  MetadataRequest,
  SetTierRequest,
  VersionsRequest,
} from './types/request.js';

// Types - Response
export type {
  UploadResponse,
  AppendResponse,
  DownloadResponse,
  RangeDownloadResponse,
  ListBlobsResponse,
  CopyResponse,
  GetPropertiesResponse,
  DeleteResponse,
  SetMetadataResponse,
  SetTierResponse,
  ListVersionsResponse,
  DownloadChunk,
} from './types/response.js';

// Errors
export {
  BlobStorageError,
  BlobNotFoundError,
  ContainerNotFoundError,
  BlobAlreadyExistsError,
  AuthenticationError,
  AuthorizationError,
  QuotaExceededError,
  ServerBusyError,
  ServiceUnavailableError,
  TimeoutError,
  NetworkError,
  UploadFailedError,
  DownloadFailedError,
  ChecksumMismatchError,
  CopyFailedError,
  CopyAbortedError,
  ConfigurationError,
  SimulationNoMatchError,
  SimulationLoadError,
  ValidationError,
  createErrorFromResponse,
  isRetryableStatus,
} from './errors/error.js';
export type { BlobStorageErrorOptions } from './errors/error.js';

// Upload executors (for advanced usage)
export { SimpleUploader } from './upload/simple.js';
export { ChunkedUploader } from './upload/chunked.js';
export { AppendUploader } from './upload/append.js';

// Download executors (for advanced usage)
export { SimpleDownloader } from './download/simple.js';
export { StreamingDownloader, RangeReader } from './download/streaming.js';

// Management executors (for advanced usage)
export { BlobLister } from './management/list.js';
export { BlobDeleter } from './management/delete.js';
export { BlobCopier } from './management/copy.js';
export { PropertiesManager } from './management/properties.js';

// Versioning (for advanced usage)
export { VersionManager } from './versioning/versions.js';

// Simulation layer (for testing)
export { SimulationLayer, SimulationStorage } from './simulation/index.js';
export type {
  RecordedInteraction,
  SerializedRequest,
  SerializedResponse,
  SimulationFile,
  SimulationConfig,
  MatchingMode,
} from './simulation/types.js';
