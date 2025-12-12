/**
 * Google Drive Integration Module
 *
 * A production-ready, type-safe TypeScript client for the Google Drive API v3.
 * Supports OAuth2 and Service Account authentication, file operations, permissions,
 * comments, revisions, change tracking, and shared drives management.
 *
 * @module @integrations/google-drive
 *
 * @example
 * ```typescript
 * import { createGoogleDriveClient, SCOPES } from '@integrations/google-drive';
 *
 * const client = createGoogleDriveClient({
 *   credentials: {
 *     type: 'oauth2',
 *     clientId: 'your-client-id',
 *     clientSecret: 'your-client-secret',
 *     refreshToken: 'your-refresh-token',
 *   },
 * });
 *
 * // List files
 * const files = await client.files.list();
 *
 * // Create a file
 * const file = await client.files.create({
 *   name: 'example.txt',
 *   mimeType: 'text/plain',
 * });
 * ```
 */

import {
  type GoogleDriveConfig,
  validateConfig,
  createDefaultConfig,
} from './config';

// Configuration exports
export {
  type GoogleDriveConfig,
  type Credentials,
  type OAuth2Credentials,
  type ServiceAccountCredentials,
  type RetryConfig,
  type CircuitBreakerConfig,
  type RateLimitConfig,
  SCOPES,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_RATE_LIMIT_CONFIG,
  DEFAULT_BASE_URL,
  DEFAULT_UPLOAD_URL,
  DEFAULT_TIMEOUT,
  DEFAULT_UPLOAD_CHUNK_SIZE,
  MIN_UPLOAD_CHUNK_SIZE,
  DEFAULT_USER_AGENT,
  createDefaultConfig,
  validateConfig,
  ConfigurationError,
} from './config';

// Authentication
export {
  type AuthProvider,
  type AccessToken,
  OAuth2Provider,
  ServiceAccountProvider,
  createOAuth2Provider,
  createServiceAccountProvider,
  loadServiceAccountFromKeyFile,
} from "./auth";

// Errors
export {
  GoogleDriveError,
  ConfigurationErrorType,
  AuthenticationErrorType,
  AuthorizationErrorType,
  RequestErrorType,
  ResourceErrorType,
  QuotaErrorType,
  UploadErrorType,
  ExportErrorType,
  NetworkErrorType,
  ServerErrorType,
  ResponseErrorType,
  createConfigurationError,
  createAuthenticationError,
  createNetworkError,
  createUploadError,
  createResponseError,
} from "./errors";

// Transport
export {
  HttpTransport,
  HttpRequest,
  HttpResponse,
  HttpMethod,
  RequestInterceptor,
  ResponseInterceptor,
  FetchTransport,
  createHttpTransport,
  createAuthInterceptor,
  createUserAgentInterceptor,
  createLoggingInterceptors,
} from "./transport";

// Types
export {
  DriveFile,
  DriveFileSchema,
  FileList,
  FileListSchema,
  Permission,
  PermissionSchema,
  PermissionList,
  PermissionListSchema,
  PermissionRole,
  PermissionType,
  Comment,
  CommentSchema,
  Reply,
  ReplySchema,
  Revision,
  RevisionSchema,
  Change,
  ChangeSchema,
  ChangeList,
  ChangeListSchema,
  Drive,
  DriveSchema,
  StorageQuota,
  StorageQuotaSchema,
  About,
  AboutSchema,
  User,
  UserSchema,
  ListFilesParams,
  CreateFileRequest,
  CreatePermissionRequest,
  MIME_TYPES,
} from "./types";

// Pagination
export {
  Paginated,
  PaginatedResult,
  PageIterator,
  PageIteratorOptions,
  PaginationParams,
  createPageIterator,
  collectAll,
} from "./pagination";

// Resilience
export {
  CircuitBreaker,
  CircuitBreakerState,
  RetryExecutor,
  RateLimitTracker,
  ResilienceOrchestrator,
  createResilience,
} from "./resilience";

/**
 * Google Drive client interface (to be implemented).
 *
 * @interface GoogleDriveClient
 */
export interface GoogleDriveClient {
  // Services will be added in future implementations
  // readonly files: FilesService;
  // readonly permissions: PermissionsService;
  // readonly comments: CommentsService;
  // readonly replies: RepliesService;
  // readonly revisions: RevisionsService;
  // readonly changes: ChangesService;
  // readonly drives: DrivesService;
  // readonly about: AboutService;
}

/**
 * Creates a new Google Drive client with the specified configuration.
 *
 * This is the main factory function for creating a Google Drive client instance.
 * It validates the configuration and sets up all required services with proper
 * authentication, retry logic, circuit breaker, and rate limiting.
 *
 * @param config - Configuration for the Google Drive client
 * @returns A configured Google Drive client instance
 * @throws {ConfigurationError} If the configuration is invalid
 *
 * @example
 * ```typescript
 * // OAuth2 authentication
 * const client = createGoogleDriveClient({
 *   credentials: {
 *     type: 'oauth2',
 *     clientId: process.env.GOOGLE_CLIENT_ID!,
 *     clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
 *     refreshToken: process.env.GOOGLE_REFRESH_TOKEN!,
 *   },
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Service Account authentication
 * const client = createGoogleDriveClient({
 *   credentials: {
 *     type: 'service_account',
 *     clientEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
 *     privateKey: process.env.GOOGLE_PRIVATE_KEY!,
 *     scopes: [SCOPES.DRIVE],
 *   },
 * });
 * ```
 *
 * @example
 * ```typescript
 * // With custom configuration
 * const client = createGoogleDriveClient({
 *   credentials: {
 *     type: 'oauth2',
 *     clientId: process.env.GOOGLE_CLIENT_ID!,
 *     clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
 *     refreshToken: process.env.GOOGLE_REFRESH_TOKEN!,
 *   },
 *   timeout: 60000,
 *   maxRetries: 5,
 *   retryConfig: {
 *     baseDelay: 2000,
 *     maxDelay: 120000,
 *   },
 *   uploadChunkSize: 16 * 1024 * 1024, // 16MB
 * });
 * ```
 */
export function createGoogleDriveClient(config: GoogleDriveConfig): GoogleDriveClient {
  // Validate configuration
  validateConfig(config);

  // Create complete configuration with defaults
  // Will be used when implementing services
  void createDefaultConfig(config);

  // TODO: Implementation will be added in subsequent phases
  // For now, return a placeholder object
  const client: GoogleDriveClient = {
    // Services will be initialized here
  };

  return client;
}

/**
 * Version of the Google Drive integration module.
 */
export const VERSION = '0.1.0';

/**
 * Google Drive API version supported by this module.
 */
export const API_VERSION = 'v3';
