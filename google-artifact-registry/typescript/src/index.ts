/**
 * Google Artifact Registry Integration Library
 *
 * A production-ready client for Google Artifact Registry with:
 * - Full REST API coverage for repositories, packages, and versions
 * - Docker/OCI registry operations (manifest/blob push/pull)
 * - Multiple authentication methods (Service Account, Workload Identity, ADC)
 * - Container Analysis integration for vulnerability scanning
 * - Automatic pagination handling
 * - Resilience patterns (retry, circuit breaker)
 * - Comprehensive observability (metrics, logging, tracing)
 *
 * @example
 * ```typescript
 * import {
 *   ArtifactRegistryClient,
 *   ArtifactRegistryConfig,
 *   createImageReference,
 * } from '@integrations/google-artifact-registry';
 *
 * // Create client
 * const config = ArtifactRegistryConfig.builder('my-project')
 *   .location('us-central1')
 *   .build();
 *
 * const client = new ArtifactRegistryClient(config);
 *
 * // List repositories
 * const repos = await client.repositories().list('us-central1');
 *
 * // Get Docker manifest
 * const image = createImageReference(
 *   'us-central1',
 *   'my-project',
 *   'my-repo',
 *   'my-image',
 *   'latest'
 * );
 * const manifest = await client.docker().getManifest(image);
 *
 * // Get vulnerabilities
 * const vulns = await client.vulnerabilities().getVulnerabilities(image);
 * ```
 *
 * @module @integrations/google-artifact-registry
 */

// Configuration
export {
  type ArtifactRegistryConfig,
  ArtifactRegistryConfigBuilder,
  type AuthMethod,
  type RetryConfig,
  type CircuitBreakerConfig,
  type UploadConfig,
  type DownloadConfig,
  DEFAULT_API_ENDPOINT,
  DEFAULT_TIMEOUT,
  DEFAULT_USER_AGENT,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  createDefaultConfig,
  configFromEnv,
  validateConfig,
} from './config.js';

// Namespace export
export { ArtifactRegistryConfig as ArtifactRegistryConfigNamespace } from './config.js';

// Errors
export {
  ArtifactRegistryError,
  ArtifactRegistryErrorKind,
  type QuotaInfo,
  type RegistryErrorResponse,
  isArtifactRegistryError,
  isQuotaError,
  isAuthError,
  isNotFoundError,
} from './errors.js';

// Client
export {
  ArtifactRegistryClient,
  createClient,
  createClientFromEnv,
} from './client/client.js';

export type { HttpResponse, RequestOptions } from './client/http.js';

// Auth
export { SecretString } from './auth/secret.js';
export { GcpAuthProvider, type TokenResponse, type CachedToken } from './auth/provider.js';
export { DockerTokenProvider, type DockerTokenResponse } from './auth/docker-token.js';

// Services
export { RepositoryService } from './services/repository.js';
export { PackageService } from './services/package.js';
export { DockerService } from './services/docker.js';
export { VulnerabilityService } from './services/vulnerability.js';

// Types - Common
export type {
  TagOrDigest,
  ImageReference,
  RepositoryFormat,
  PaginationOptions,
  PaginatedResponse,
  ResourceName,
  Timestamp,
  MultiRegionalLocation,
  RegionalLocation,
  Location,
} from './types/common.js';

export {
  createImageReference,
  getRegistryUrl,
  getFullImageName,
  getReferenceString,
  parseImageReference,
  formatImageReference,
  parseResourceName,
  isValidLocation,
  MULTI_REGIONAL_LOCATIONS,
  REGIONAL_LOCATIONS,
  ARTIFACT_REGISTRY_SCOPES,
  CONTAINER_ANALYSIS_ENDPOINT,
} from './types/common.js';

// Types - Repository
export type {
  Repository,
  CleanupPolicy,
  CleanupCondition,
  CleanupPolicyAction,
  TagState,
  MostRecentVersions,
  RepositoryMode,
  VirtualRepositoryConfig,
  RemoteRepositoryConfig,
  UpstreamPolicy,
  DockerRepositoryConfig,
  MavenRepositoryConfig,
  ListRepositoriesResponse,
  ListRepositoriesRequest,
} from './types/repository.js';

export {
  getRepositoryId,
  getRepositoryLocation,
  getRepositoryProject,
  buildRepositoryName,
} from './types/repository.js';

// Types - Package
export type {
  Package,
  Version,
  Tag,
  File,
  Hash,
  ListPackagesResponse,
  ListVersionsResponse,
  ListTagsResponse,
  ListFilesResponse,
  CreateTagRequest,
  UpdateTagRequest,
} from './types/package.js';

export {
  getPackageId,
  getVersionId,
  getTagId,
  buildPackageName,
  buildVersionName,
  buildTagName,
  encodePackageName,
} from './types/package.js';

// Types - Manifest
export type {
  ManifestMediaType,
  LayerMediaType,
  ConfigMediaType,
  Platform,
  Descriptor,
  DockerManifestV2,
  DockerManifestList,
  OCIManifest,
  OCIIndex,
  Manifest,
  SingleManifest,
  MultiPlatformManifest,
  PutManifestResponse,
  TagListResponse,
  BlobInfo,
  UploadSession,
} from './types/manifest.js';

export {
  MANIFEST_MEDIA_TYPES,
  LAYER_MEDIA_TYPES,
  CONFIG_MEDIA_TYPES,
  isMultiPlatformManifest,
  isSingleManifest,
  getConfigDescriptor,
  getLayerDescriptors,
  getPlatformManifests,
  findPlatformManifest,
  platformMatches,
  normalizeArch,
  getDefaultPlatform,
  CHUNK_SIZE,
  CHUNKED_UPLOAD_THRESHOLD,
} from './types/manifest.js';

// Types - Vulnerability
export type {
  Severity,
  OccurrenceKind,
  PackageIssue,
  PackageVersion,
  CVSS,
  RelatedUrl,
  VulnerabilityDetails,
  DiscoveryDetails,
  SbomReferenceDetails,
  Occurrence,
  ListOccurrencesResponse,
  Note,
  ListNotesResponse,
  VulnerabilitySummary,
  SeverityCount,
  VulnerabilityReport,
  Vulnerability,
  ScanStatus,
} from './types/vulnerability.js';

export {
  SeverityOrder,
  buildVulnerabilityReport,
  sortBySeverity,
  filterBySeverity,
  filterFixable,
} from './types/vulnerability.js';

// Observability
export {
  MetricNames,
  type MetricLabels,
  type MetricCollector,
  type Logger,
  type Tracer,
  type Span,
  type SpanContext,
  type ObservabilityConfig,
  NoOpMetricCollector,
  NoOpLogger,
  NoOpTracer,
  ConsoleLogger,
  InMemoryMetricCollector,
  configureObservability,
  getObservability,
  getMetrics,
  getLogger,
  getTracer,
  withMetrics,
  withTracing,
} from './observability/index.js';
