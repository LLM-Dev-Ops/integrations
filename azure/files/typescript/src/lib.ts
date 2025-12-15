/**
 * Azure Files Integration
 *
 * A TypeScript client library for Azure Files REST API.
 * Provides file, directory, share, and lease operations with built-in
 * resilience, observability, and simulation support.
 *
 * Following the SPARC specification for Azure Files integration.
 *
 * @example
 * ```typescript
 * import { createClient } from '@integrations/azure-files';
 *
 * // Create client from environment variables
 * const client = createClient()
 *   .fromEnv()
 *   .build();
 *
 * // Or with explicit credentials
 * const client = createClient()
 *   .sharedKey('accountName', 'accountKey')
 *   .defaultShare('myshare')
 *   .build();
 *
 * // File operations
 * await client.files().create({ share: 'myshare', path: 'file.txt', size: 100 });
 * await client.files().write({ share: 'myshare', path: 'file.txt', data: Buffer.from('hello') });
 * const content = await client.files().read({ share: 'myshare', path: 'file.txt' });
 *
 * // Directory operations
 * await client.directories().create({ share: 'myshare', path: 'mydir' });
 * const listing = await client.directories().list({ share: 'myshare', path: 'mydir' });
 *
 * // Lease operations
 * const lease = await client.leases().acquire({ share: 'myshare', path: 'file.txt' });
 * await client.leases().release(lease);
 *
 * // Streaming operations
 * await client.streaming().uploadBuffer({ share: 'myshare', path: 'large.bin', totalSize: 1000 }, buffer);
 * const data = await client.streaming().downloadToBuffer({ share: 'myshare', path: 'large.bin' });
 * ```
 */

// Client
export {
  AzureFilesClient,
  AzureFilesClientBuilder,
  AzureFilesClientOptions,
  MockAzureFilesClient,
  createClient,
  createMockClient,
} from "./client/index.js";

// Configuration
export {
  AzureFilesConfig,
  AzureFilesConfigBuilder,
  AzureCredentials,
  RetryConfig,
  CircuitBreakerConfig,
  TimeoutConfig,
  configBuilder,
  resolveEndpoint,
  validateShareName,
  validatePath,
  encodePath,
  getTimeout,
  API_VERSION,
  DEFAULT_RANGE_SIZE,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_TIMEOUT_CONFIG,
  DEFAULT_CONFIG,
} from "./config/index.js";

// Authentication
export {
  AzureAuthProvider,
  SharedKeyAuthProvider,
  SasTokenAuthProvider,
  SasGenerator,
  SasPermissions,
  SasGenerationOptions,
  SasToken,
  createAuthProvider,
  createSharedKeyAuth,
  createSasTokenAuth,
  createSasGenerator,
} from "./auth/index.js";

// Services
export {
  FileService,
  ShareBoundFileService,
} from "./services/files.js";

export { DirectoryService } from "./services/directories.js";

export {
  LeaseService,
  AutoRenewingLease,
  createAutoRenewingLease,
} from "./services/leases.js";

export {
  ShareService,
  ListSharesRequest,
  ListSharesResponse,
} from "./services/shares.js";

// Streaming
export {
  StreamingService,
  StreamingUploadService,
  StreamingDownloadService,
  UploadProgress,
  UploadProgressCallback,
  DownloadProgress,
  DownloadProgressCallback,
} from "./streaming/index.js";

// Types
export {
  FileInfo,
  FileContent,
  FileProperties,
  DirectoryInfo,
  DirectoryListing,
  DirectoryEntry,
  Lease,
  LeaseGuard,
  ByteRange,
  CopyStatus,
  ShareInfo,
  isFile,
  isDirectory,
  getEntryName,
  parseFileInfo,
  parseFileProperties,
  parseDirectoryInfo,
} from "./types/common.js";

export {
  CreateFileRequest,
  ReadFileRequest,
  WriteFileRequest,
  DeleteFileRequest,
  GetPropertiesRequest,
  SetMetadataRequest,
  CopyFileRequest,
  CreateDirectoryRequest,
  DeleteDirectoryRequest,
  ListDirectoryRequest,
  AcquireLeaseRequest,
  BreakLeaseRequest,
  UploadStreamRequest,
  DownloadStreamRequest,
  DownloadRangeRequest,
  ConditionalUpdateRequest,
  createFileRequest,
  readFileRequest,
  writeFileRequest,
  deleteFileRequest,
  acquireLeaseRequest,
  listDirectoryRequest,
} from "./types/requests.js";

// Transport
export {
  HttpRequest,
  HttpResponse,
  StreamingHttpResponse,
  HttpTransport,
  FetchTransport,
  isSuccess,
  getHeader,
  getRequestId,
  getETag,
  getContentLength,
  getContentType,
  getLastModified,
  createRequest,
  createTransport,
} from "./transport/index.js";

// Errors
export {
  AzureFilesError,
  ConfigurationError,
  AuthenticationError,
  FileError,
  DirectoryError,
  LeaseError,
  NetworkError,
  ServerError,
  parseAzureFilesError,
  isRetryable,
} from "./errors.js";

// Resilience
export {
  CircuitBreaker,
  CircuitState,
  RetryExecutor,
  ResilientExecutor,
  createCircuitBreaker,
  createRetryExecutor,
  createResilientExecutor,
} from "./resilience/index.js";

// Observability
export {
  Logger,
  LogLevel,
  MetricsCollector,
  SpanContext,
  Tracer,
  MetricNames,
  ConsoleLogger,
  NoopLogger,
  InMemoryLogger,
  InMemoryMetricsCollector,
  NoopMetricsCollector,
  InMemoryTracer,
  NoopTracer,
  createConsoleLogger,
  createNoopLogger,
  createInMemoryLogger,
  createNoopMetricsCollector,
  createInMemoryMetricsCollector,
  createNoopTracer,
  createInMemoryTracer,
} from "./observability/index.js";

// Simulation
export {
  RecordedInteraction,
  SerializedRequest,
  SerializedResponse,
  SimulationFile,
  MatchingMode,
  RecordingTransport,
  ReplayTransport,
  MockTransport,
  loadSimulationFile,
  createRecordingTransport,
  createReplayTransport,
  createMockTransport,
  createSuccessResponse,
  createErrorResponse,
  createFileInfoResponse,
} from "./simulation/index.js";
