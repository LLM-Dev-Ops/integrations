/**
 * Amazon ECR Integration for LLM Dev Ops Platform.
 *
 * This module provides a comprehensive TypeScript client for Amazon Elastic
 * Container Registry (ECR), supporting repository and image management,
 * vulnerability scanning, cross-region replication, and ECR Public.
 *
 * @module @integrations/amazon-ecr
 *
 * @example
 * ```typescript
 * import {
 *   EcrClient,
 *   createClient,
 *   createClientFromEnv,
 *   EcrConfig,
 * } from '@integrations/amazon-ecr';
 *
 * // Create client from environment variables
 * const client = createClientFromEnv();
 *
 * // Or with explicit configuration
 * const client = createClient({
 *   region: 'us-east-1',
 *   credentials: {
 *     accessKeyId: 'AKIA...',
 *     secretAccessKey: '...',
 *   },
 * });
 *
 * // List repositories
 * const repos = await client.repositories.listRepositories();
 *
 * // List images
 * const images = await client.images.listImages('my-repo');
 *
 * // Get scan findings
 * const findings = await client.scans.getScanFindings('my-repo', {
 *   imageTag: 'latest',
 * });
 * ```
 */

// ============================================================================
// Core Client
// ============================================================================

export {
  EcrClient,
  createClient,
  createClientFromEnv,
  createRegionalClient,
  createRegionalClientPool,
} from './client.js';

// ============================================================================
// Configuration
// ============================================================================

export {
  EcrConfig,
  validateConfig,
} from './config.js';

// ============================================================================
// Errors
// ============================================================================

export {
  EcrError,
  EcrErrorKind,
  isEcrError,
} from './errors.js';

// ============================================================================
// Types - Re-export specific types to avoid conflicts
// ============================================================================

// Repository types
export type {
  Repository,
  ScanConfig,
  EncryptionConfig,
} from './types/repository.js';

// Image types
export type {
  ImageIdentifier,
  ImageDetail,
  Image,
  ScanStatus,
} from './types/image.js';

// Manifest types
export type {
  ImageManifest,
  ManifestList,
  Platform,
  ManifestConfig,
  ManifestLayer,
  PlatformManifest,
  ImageConfig,
  LayerInfo,
} from './types/manifest.js';

// Scan types
export type {
  ScanFindings,
  Finding,
  EnhancedFinding,
  ScanFindingsOptions,
  WaitOptions,
} from './types/scan.js';

// Auth types
export type {
  AuthorizationData,
  DockerCredentials,
  LoginCommand,
} from './types/auth.js';

// Replication types
export type {
  ReplicationStatus,
  ReplicationConfiguration,
  ReplicationDestination,
  ReplicationRule,
  ReplicationWaitOptions,
} from './types/replication.js';

// Public types
export type {
  PublicRepository,
  PublicCatalogData,
  PublicRepositoryList,
  ListPublicReposOptions,
  ImageList,
  ListImagesOptions,
} from './types/public.js';

// Client types
export type {
  EcrClientInterface,
} from './types/client.js';

// Common types - these may not exist, so skip for now

// Export enums (not types)
export { ScanState, Severity } from './types/scan.js';
export { TagMutability, ScanType, EncryptionType } from './types/repository.js';
export { ReplicationState } from './types/replication.js';

// ============================================================================
// Services
// ============================================================================

export { RepositoryServiceImpl } from './services/repository.js';
export { ImageService } from './services/image.js';
export { AuthService } from './services/auth.js';
export { ReplicationService } from './services/replication.js';
export { PublicRegistryService } from './services/public.js';
export { ManifestServiceImpl } from './services/manifest.js';
export type { ManifestService } from './services/manifest.js';
export { ScanServiceImpl } from './services/scan.js';
export type { ScanService } from './services/scan.js';

// ============================================================================
// Transport Layer
// ============================================================================

export * from './transport/index.js';

// ============================================================================
// Cache
// ============================================================================

export * from './cache/index.js';

// ============================================================================
// Validation
// ============================================================================

export * from './validation/index.js';

// ============================================================================
// Simulation (for testing)
// ============================================================================

export * from './simulation/index.js';
