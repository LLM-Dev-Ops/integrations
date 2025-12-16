/**
 * Docker Hub Integration Library
 *
 * A production-ready Docker Hub and Docker Registry API client with:
 * - Full Docker Registry API v2 coverage (manifests, blobs, tags)
 * - Docker Hub API support (repositories, search, vulnerabilities)
 * - Dual authentication (Hub JWT + Registry Bearer tokens)
 * - Automatic rate limit tracking (100/200 pulls per 6 hours)
 * - Multi-architecture manifest support (OCI + Docker)
 * - Webhook handling with Zod validation
 * - Comprehensive error handling
 *
 * @example
 * ```typescript
 * import {
 *   DockerHubClient,
 *   DockerHubConfig,
 *   parseImageReference,
 * } from '@integrations/docker-hub';
 *
 * // Create client with credentials
 * const config = DockerHubConfig.builder()
 *   .credentials('username', 'password')
 *   .build();
 *
 * const client = new DockerHubClient(config);
 *
 * // Parse image reference
 * const image = parseImageReference('library/nginx:latest');
 *
 * // Get manifest
 * const manifest = await client.manifests().get(image, 'latest');
 * console.log(manifest.mediaType, manifest.digest);
 *
 * // List tags
 * const tags = await client.tags().list(image);
 * console.log('Tags:', tags);
 *
 * // Check rate limits
 * const rateLimits = client.getRateLimitStatus();
 * console.log(`Remaining: ${rateLimits.remaining}/${rateLimits.limit}`);
 * ```
 *
 * @module @integrations/docker-hub
 */

// =============================================================================
// Error Exports
// =============================================================================

export {
  // Error class and enum
  DockerHubError,
  DockerHubErrorKind,
  // Rate limit info type
  type DockerHubRateLimitInfo,
  // Result type alias
  type DockerHubResult,
  // Type guards
  isDockerHubError,
  isRateLimitError,
  isAuthenticationError,
  isRepositoryError,
  isManifestError,
  isBlobError,
  isNetworkError,
  isServerError,
  // Specialized error classes
  AuthenticationError,
  RateLimitError,
  NetworkError,
  TimeoutError,
  BlobNotFoundError,
  BlobUploadError,
  BlobDigestMismatchError,
} from './errors.js';

// =============================================================================
// Configuration Exports
// =============================================================================

export {
  // Config types
  type DockerHubConfig,
  type RetryConfig,
  type CircuitBreakerConfig,
  type RateLimitConfig,
  type PoolConfig,
  type AuthMethod,
  type UsernamePasswordAuth,
  type AccessTokenAuth,
  type AnonymousAuth,
  // Builder
  DockerHubConfigBuilder,
  // Factory functions
  createDefaultConfig,
  validateConfig,
  // Error types
  DockerHubConfigError,
  DockerHubConfigErrorKind,
  // Default values
  DEFAULT_HUB_URL,
  DEFAULT_REGISTRY_URL,
  DEFAULT_AUTH_URL,
  DEFAULT_TIMEOUT,
  DEFAULT_MAX_RETRIES,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_USER_AGENT,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_RATE_LIMIT_CONFIG,
  DEFAULT_POOL_CONFIG,
} from './config.js';

// =============================================================================
// Authentication Exports
// =============================================================================

export {
  // Classes
  SecretString,
  TokenCache,
  AuthManager,
  // Factory functions
  createAuthManager,
  createAuthManagerFromEnv,
  // Types
  type HubJwtToken,
  type RegistryToken,
  type DockerHubCredentials,
  type AuthManagerOptions,
} from './auth/index.js';

// =============================================================================
// Type Exports
// =============================================================================

export {
  // Image reference
  type ImageReference,
  type Reference,
  parseImageReference,
  buildFullName,
  // Validation
  validateTag,
  validateDigest,
  validateRepositoryName,
  validateNamespace,
  // Validation patterns
  TAG_NAME_PATTERN,
  DIGEST_PATTERN,
  REPOSITORY_NAME_PATTERN,
  NAMESPACE_PATTERN,
  // Manifest types
  type Manifest,
  type ManifestList,
  type ManifestV2,
  type Descriptor,
  type Platform,
  type PlatformManifest,
  // Manifest helpers
  isManifestList,
  isManifestV2,
  calculateManifestSize,
  extractArchitectures,
  extractOperatingSystems,
  findPlatformManifest,
  // Repository types
  type Repository,
  type RepositoryData,
  // Vulnerability types
  type ScanOverview,
  type ScanStatus,
  type VulnerabilitySummary,
  hasCriticalVulnerabilities,
  totalVulnerabilities,
  // Tag types
  type Tag,
  type TagList,
  // Webhook types from types module
  type PushData,
  type WebhookPayload as TypesWebhookPayload,
  // Zod schemas
  ImageReferenceSchema,
  ReferenceSchema,
  ManifestV2Schema,
  ManifestListSchema,
  ManifestSchema,
  DescriptorSchema,
  PlatformSchema,
  PlatformManifestSchema,
  RepositorySchema,
  RepositoryDataSchema,
  ScanOverviewSchema,
  ScanStatusSchema,
  VulnerabilitySummarySchema,
  TagSchema,
  TagListSchema,
  PushDataSchema,
  WebhookPayloadSchema as TypesWebhookPayloadSchema,
} from './types/index.js';

// =============================================================================
// Client Export
// =============================================================================

export { DockerHubClient, type HttpResponse } from './client.js';

// =============================================================================
// Service Exports
// =============================================================================

export {
  // Manifest service
  type ManifestService,
  ManifestServiceImpl,
  createManifestService,
  MANIFEST_ACCEPT_HEADER,
  // Blob service
  type BlobService,
  BlobServiceImpl,
  createBlobService,
  computeDigest,
  // Tag service
  type TagService,
  TagServiceImpl,
  createTagService,
  // Repository service
  type RepositoryService,
  RepositoryServiceImpl,
  createRepositoryService,
  // Vulnerability service
  type VulnerabilityService,
  VulnerabilityServiceImpl,
  createVulnerabilityService,
} from './services/index.js';

// =============================================================================
// Webhook Exports
// =============================================================================

export {
  type WebhookHandler,
  WebhookHandlerImpl,
  type WebhookPayload,
  type WebhookEvent,
  type WebhookEventType,
  createWebhookHandler,
  // Validation helpers
  validateWebhookPayload,
  isWebhookPayload,
  isPushEvent,
  isDeleteEvent,
  // Event helpers
  getFullRepositoryName,
  getImageReference,
  isPrivateRepository,
  isOfficialImage,
  isTrustedRepository,
  extractRepositoryMetadata,
} from './webhook/index.js';

// =============================================================================
// Utility Exports
// =============================================================================

export {
  DockerRateLimiter,
  type RateLimitStatus,
  createRateLimiter,
} from './util/rate-limiter.js';
