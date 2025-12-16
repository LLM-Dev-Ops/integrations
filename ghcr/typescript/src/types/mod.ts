/**
 * Type exports for GitHub Container Registry integration.
 * @module types
 */

// Image reference types
export type { Reference, ImageRef } from './image.js';
export { Reference as ReferenceNs, ImageRef as ImageRefNs } from './image.js';

// Manifest types
export type {
  MediaTypeValue,
  Platform,
  Descriptor,
  ImageManifest,
  ImageIndex,
  Manifest,
} from './manifest.js';
export {
  MediaType,
  isIndexMediaType,
  isImageManifestMediaType,
  getManifestAcceptHeader,
  Platform as PlatformNs,
  Descriptor as DescriptorNs,
  isImageManifest,
  isImageIndex,
  ManifestUtils,
} from './manifest.js';

// Package types
export type {
  OwnerType,
  Visibility,
  ContainerMetadata,
  PackageMetadata,
  PackageVersion,
  Package,
  CleanupResult,
  VersionFilter,
  CleanupConfig,
} from './package.js';
export { PackageVersionUtils } from './package.js';

// Vulnerability types
export type {
  Severity,
  CvssDetails,
  Vulnerability,
  VulnerabilityReport,
  VulnerableVersion,
} from './vulnerability.js';
export {
  SeverityOrder,
  compareSeverity,
  meetsThreshold,
  VulnerabilityReportUtils,
} from './vulnerability.js';

// Rate limit types
export type { RateLimitInfo, RateLimitStatus } from './rate-limit.js';
export { RateLimitUtils } from './rate-limit.js';
