/**
 * GitHub Container Registry Integration Module
 *
 * A thin adapter layer for GitHub Container Registry (ghcr.io) providing:
 * - Image operations (push, pull, delete, copy)
 * - Tag operations (list, create, delete, retag)
 * - Manifest operations (OCI & Docker v2 support)
 * - Blob operations (chunked upload, mount, verify)
 * - Version management (via GitHub Packages API)
 * - Vulnerability metadata (GHAS integration)
 * - Rate limit handling (preemptive throttling)
 * - Simulation layer (record/replay for testing)
 *
 * @module @integrations/ghcr
 */

// Export types
export type {
  Reference,
  ImageRef,
  MediaTypeValue,
  Platform,
  Descriptor,
  ImageManifest,
  ImageIndex,
  Manifest,
  OwnerType,
  Visibility,
  ContainerMetadata,
  PackageMetadata,
  PackageVersion,
  Package,
  CleanupResult,
  VersionFilter,
  CleanupConfig,
  Severity,
  CvssDetails,
  Vulnerability,
  VulnerabilityReport,
  VulnerableVersion,
  RateLimitInfo,
  RateLimitStatus,
} from './types/mod.js';

// Export type utilities
export {
  ImageRefNs as ImageRefUtils,
  ReferenceNs as ReferenceUtils,
  MediaType,
  isIndexMediaType,
  isImageManifestMediaType,
  getManifestAcceptHeader,
  PlatformNs as PlatformUtils,
  DescriptorNs as DescriptorUtils,
  isImageManifest,
  isImageIndex,
  ManifestUtils,
  PackageVersionUtils,
  SeverityOrder,
  compareSeverity,
  meetsThreshold,
  VulnerabilityReportUtils,
  RateLimitUtils,
} from './types/mod.js';

// Export errors
export {
  GhcrError,
  GhcrErrorKind,
  isGhcrError,
  isRetryable,
  errorKindFromStatus,
  type GhcrErrorOptions,
  type GhcrResult,
} from './errors.js';

// Export config
export {
  GhcrConfig,
  GhcrConfigBuilder,
  SimulationMode,
  type RetryConfig,
  type RateLimitConfig,
  type PartialGhcrConfig,
  DEFAULT_REGISTRY,
  DEFAULT_API_BASE,
  DEFAULT_TIMEOUT,
  DEFAULT_UPLOAD_TIMEOUT,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_MAX_RETRIES,
  DEFAULT_THROTTLE_THRESHOLD,
  DEFAULT_USER_AGENT,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_RATE_LIMIT_CONFIG,
} from './config.js';

// Export auth
export {
  SecretString,
  TokenManager,
  buildScope,
  parseScope,
  ScopeActions,
  type GhcrCredentials,
  type CredentialProvider,
  StaticCredentialProvider,
  EnvCredentialProvider,
  ChainCredentialProvider,
  createCredentialProvider,
} from './auth/mod.js';

// Export client
export type { GhcrClient, HttpMethod, RequestOptions, HttpResponse } from './client.js';
export { GhcrClientImpl, createClient } from './client.js';

// Export rate limiting and resilience
export {
  RateLimiter,
  RetryExecutor,
  CircuitBreaker,
  ResilienceOrchestrator,
  type CircuitState,
} from './rate-limit.js';

// Export operations
export {
  type ManifestOps,
  type ManifestWithDigest,
  type ManifestHeadResult,
  createManifestOps,
  type BlobOps,
  type BlobHeadResult,
  createBlobOps,
  type TagOps,
  type TagListResult,
  createTagOps,
  type ImageOps,
  createImageOps,
  type VersionOps,
  createVersionOps,
  type VulnOps,
  createVulnOps,
} from './operations/mod.js';

// Export simulation
export {
  type RecordedRequest,
  type RecordedResponse,
  type RecordingEntry,
  RequestRecorder,
  type MatchOptions,
  RequestReplayer,
  createMockResponse,
} from './simulation/mod.js';

// Import for facade
import type { GhcrConfig, PartialGhcrConfig } from './config.js';
import { GhcrConfig as GhcrConfigNs, createDefaultConfig, SimulationMode } from './config.js';
import { GhcrError } from './errors.js';
import { createClient, type GhcrClient } from './client.js';
import { createCredentialProvider, type CredentialProvider } from './auth/mod.js';
import {
  createManifestOps,
  createBlobOps,
  createTagOps,
  createImageOps,
  createVersionOps,
  createVulnOps,
  type ManifestOps,
  type BlobOps,
  type TagOps,
  type ImageOps,
  type VersionOps,
  type VulnOps,
} from './operations/mod.js';
import type {
  ImageRef,
  Manifest,
  Platform,
  OwnerType,
  CleanupConfig,
  CleanupResult,
  Severity,
  PackageVersion,
  VulnerabilityReport,
  VulnerableVersion,
} from './types/mod.js';
import type { ManifestWithDigest } from './operations/mod.js';

/**
 * High-level GHCR facade providing a unified API.
 */
export class Ghcr {
  private readonly client: GhcrClient;
  private readonly manifestOps: ManifestOps;
  private readonly blobOps: BlobOps;
  private readonly tagOps: TagOps;
  private readonly imageOps: ImageOps;
  private readonly versionOps: VersionOps;
  private readonly vulnOps: VulnOps;

  constructor(client: GhcrClient) {
    this.client = client;
    this.manifestOps = createManifestOps(client);
    this.blobOps = createBlobOps(client);
    this.tagOps = createTagOps(client, this.manifestOps);
    this.imageOps = createImageOps(client, this.manifestOps, this.blobOps);
    this.versionOps = createVersionOps(client);
    this.vulnOps = createVulnOps(client, this.versionOps);
  }

  // === Image Operations ===

  /**
   * Checks if an image exists.
   */
  async imageExists(image: ImageRef): Promise<boolean> {
    return this.imageOps.exists(image);
  }

  /**
   * Pulls an image manifest.
   */
  async pullManifest(image: ImageRef): Promise<ManifestWithDigest> {
    return this.imageOps.pullManifest(image);
  }

  /**
   * Pushes an image manifest.
   */
  async pushManifest(image: ImageRef, manifest: Manifest): Promise<string> {
    return this.imageOps.pushManifest(image, manifest);
  }

  /**
   * Deletes an image.
   */
  async deleteImage(image: ImageRef): Promise<void> {
    return this.imageOps.deleteImage(image);
  }

  /**
   * Copies an image from source to target.
   */
  async copyImage(source: ImageRef, target: ImageRef): Promise<string> {
    return this.imageOps.copyImage(source, target);
  }

  /**
   * Gets a platform-specific manifest.
   */
  async getPlatformManifest(
    image: ImageRef,
    platform: Platform
  ): Promise<ManifestWithDigest> {
    return this.imageOps.getPlatformManifest(image, platform);
  }

  // === Tag Operations ===

  /**
   * Lists all tags for an image.
   */
  async listTags(imageName: string): Promise<string[]> {
    return this.tagOps.list(imageName);
  }

  /**
   * Creates or updates a tag.
   */
  async tagImage(image: ImageRef, newTag: string): Promise<void> {
    return this.tagOps.tag(image, newTag);
  }

  /**
   * Deletes a tag.
   */
  async deleteTag(imageName: string, tag: string): Promise<void> {
    return this.tagOps.delete(imageName, tag);
  }

  /**
   * Retags an image atomically.
   */
  async retagAtomic(
    imageName: string,
    oldTag: string,
    newTag: string
  ): Promise<void> {
    return this.tagOps.retagAtomic(imageName, oldTag, newTag);
  }

  // === Blob Operations ===

  /**
   * Checks if a blob exists.
   */
  async blobExists(image: ImageRef, digest: string): Promise<boolean> {
    return this.blobOps.exists(image, digest);
  }

  /**
   * Uploads a blob.
   */
  async uploadBlob(image: ImageRef, data: Uint8Array): Promise<string> {
    return this.blobOps.upload(image, data);
  }

  /**
   * Mounts a blob from another repository.
   */
  async mountBlob(
    source: ImageRef,
    target: ImageRef,
    digest: string
  ): Promise<boolean> {
    return this.blobOps.mount(source, target, digest);
  }

  /**
   * Gets blob content.
   */
  async getBlob(image: ImageRef, digest: string): Promise<Uint8Array> {
    return this.blobOps.get(image, digest);
  }

  // === Version Operations ===

  /**
   * Lists package versions.
   */
  async listVersions(
    owner: string,
    packageName: string,
    ownerType: OwnerType
  ): Promise<PackageVersion[]> {
    return this.versionOps.list(owner, packageName, ownerType);
  }

  /**
   * Gets a specific version.
   */
  async getVersion(
    owner: string,
    packageName: string,
    versionId: number,
    ownerType: OwnerType
  ): Promise<PackageVersion> {
    return this.versionOps.get(owner, packageName, versionId, ownerType);
  }

  /**
   * Deletes a version.
   */
  async deleteVersion(
    owner: string,
    packageName: string,
    versionId: number,
    ownerType: OwnerType
  ): Promise<void> {
    return this.versionOps.delete(owner, packageName, versionId, ownerType);
  }

  /**
   * Cleans up old versions.
   */
  async cleanupOldVersions(
    owner: string,
    packageName: string,
    ownerType: OwnerType,
    config: CleanupConfig
  ): Promise<CleanupResult> {
    return this.versionOps.cleanup(owner, packageName, ownerType, config);
  }

  // === Vulnerability Operations ===

  /**
   * Gets vulnerabilities for a version.
   */
  async getVulnerabilities(
    owner: string,
    packageName: string,
    versionId: number,
    ownerType: OwnerType
  ): Promise<VulnerabilityReport> {
    return this.vulnOps.getVulnerabilities(
      owner,
      packageName,
      versionId,
      ownerType
    );
  }

  /**
   * Lists versions with vulnerabilities.
   */
  async listVulnerableVersions(
    owner: string,
    packageName: string,
    ownerType: OwnerType,
    minSeverity: Severity
  ): Promise<VulnerableVersion[]> {
    return this.vulnOps.listVulnerableVersions(
      owner,
      packageName,
      ownerType,
      minSeverity
    );
  }

  // === Access to underlying components ===

  /**
   * Gets the underlying client.
   */
  getClient(): GhcrClient {
    return this.client;
  }

  /**
   * Gets the manifest operations.
   */
  getManifestOps(): ManifestOps {
    return this.manifestOps;
  }

  /**
   * Gets the blob operations.
   */
  getBlobOps(): BlobOps {
    return this.blobOps;
  }

  /**
   * Gets the tag operations.
   */
  getTagOps(): TagOps {
    return this.tagOps;
  }

  /**
   * Gets the image operations.
   */
  getImageOps(): ImageOps {
    return this.imageOps;
  }

  /**
   * Gets the version operations.
   */
  getVersionOps(): VersionOps {
    return this.versionOps;
  }

  /**
   * Gets the vulnerability operations.
   */
  getVulnOps(): VulnOps {
    return this.vulnOps;
  }

  // === Factory methods ===

  /**
   * Creates a Ghcr instance from configuration.
   */
  static create(
    config: GhcrConfig,
    credentialProvider?: CredentialProvider
  ): Ghcr {
    const provider = credentialProvider ?? createCredentialProvider();
    const client = createClient(config, provider);
    return new Ghcr(client);
  }

  /**
   * Creates a Ghcr instance from environment variables.
   */
  static fromEnv(): Ghcr {
    const config = GhcrConfigNs.fromEnv();
    const provider = createCredentialProvider();
    const client = createClient(config, provider);
    return new Ghcr(client);
  }

  /**
   * Creates a Ghcr instance with default configuration.
   */
  static withDefaults(credentialProvider?: CredentialProvider): Ghcr {
    const config = createDefaultConfig();
    const provider = credentialProvider ?? createCredentialProvider();
    const client = createClient(config, provider);
    return new Ghcr(client);
  }

  /**
   * Creates a Ghcr instance with custom options.
   */
  static withOptions(
    options: PartialGhcrConfig,
    credentialProvider?: CredentialProvider
  ): Ghcr {
    const config = GhcrConfigNs.from(options);
    const provider = credentialProvider ?? createCredentialProvider();
    const client = createClient(config, provider);
    return new Ghcr(client);
  }
}

// Re-export Ghcr as default
export default Ghcr;

/**
 * Prelude module for convenient imports.
 */
export const prelude = {
  Ghcr,
  GhcrError,
  GhcrConfig: GhcrConfigNs,
  SimulationMode,
  createClient,
  createCredentialProvider,
};
