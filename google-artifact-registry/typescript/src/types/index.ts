/**
 * Type exports for Google Artifact Registry integration.
 * @module types
 */

// Common types
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
} from './common.js';

export {
  createImageReference,
  getRegistryUrl,
  getFullImageName,
  getReferenceString,
  parseImageReference,
  formatImageReference,
  parseResourceName,
  isValidLocation,
  RepositoryFormatSchema,
  MULTI_REGIONAL_LOCATIONS,
  REGIONAL_LOCATIONS,
  ARTIFACT_REGISTRY_SCOPES,
  DEFAULT_API_ENDPOINT,
  CONTAINER_ANALYSIS_ENDPOINT,
} from './common.js';

// Repository types
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
} from './repository.js';

export {
  RepositorySchema,
  getRepositoryId,
  getRepositoryLocation,
  getRepositoryProject,
  buildRepositoryName,
} from './repository.js';

// Package types
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
} from './package.js';

export {
  PackageSchema,
  VersionSchema,
  TagSchema,
  getPackageId,
  getVersionId,
  getTagId,
  buildPackageName,
  buildVersionName,
  buildTagName,
  encodePackageName,
} from './package.js';

// Manifest types
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
} from './manifest.js';

export {
  MANIFEST_MEDIA_TYPES,
  LAYER_MEDIA_TYPES,
  CONFIG_MEDIA_TYPES,
  PlatformSchema,
  DescriptorSchema,
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
} from './manifest.js';

// Vulnerability types
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
} from './vulnerability.js';

export {
  SeverityOrder,
  SeveritySchema,
  OccurrenceSchema,
  buildVulnerabilityReport,
  sortBySeverity,
  filterBySeverity,
  filterFixable,
} from './vulnerability.js';
