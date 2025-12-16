/**
 * Docker Hub type definitions following SPARC specification.
 *
 * Core types for image management, manifest handling, repository operations,
 * vulnerability scanning, and webhook processing.
 */

import { z } from 'zod';

// ============================================================================
// Image Reference Types
// ============================================================================

/**
 * Reference type - either a tag or digest.
 */
export type Reference =
  | { type: 'tag'; value: string }
  | { type: 'digest'; value: string };

export const ReferenceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('tag'),
    value: z.string().min(1).max(128),
  }),
  z.object({
    type: z.literal('digest'),
    value: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  }),
]);

/**
 * Complete image reference with registry, namespace, repository, and reference.
 */
export interface ImageReference {
  /** Registry hostname (e.g., registry-1.docker.io) */
  registry: string;
  /** Namespace (e.g., library or username) */
  namespace: string;
  /** Repository name (e.g., nginx) */
  repository: string;
  /** Tag or digest reference */
  reference: Reference;
}

export const ImageReferenceSchema = z.object({
  registry: z.string().min(1),
  namespace: z.string().min(1).max(255),
  repository: z.string().min(1).max(255),
  reference: ReferenceSchema,
});

export type ImageReferenceInferred = z.infer<typeof ImageReferenceSchema>;

// ============================================================================
// Manifest Types
// ============================================================================

/**
 * Descriptor for layers and config in manifests.
 */
export interface Descriptor {
  /** Media type (e.g., application/vnd.docker.container.image.v1+json) */
  mediaType: string;
  /** Size in bytes */
  size: number;
  /** Content digest (sha256:...) */
  digest: string;
  /** Optional download URLs */
  urls?: string[];
}

export const DescriptorSchema = z.object({
  mediaType: z.string().min(1),
  size: z.number().int().nonnegative(),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  urls: z.array(z.string().url()).optional(),
});

/**
 * Platform specification for multi-architecture images.
 */
export interface Platform {
  /** CPU architecture (amd64, arm64, etc.) */
  architecture: string;
  /** Operating system (linux, windows, etc.) */
  os: string;
  /** Optional variant (v7, v8 for ARM) */
  variant?: string;
}

export const PlatformSchema = z.object({
  architecture: z.string().min(1),
  os: z.string().min(1),
  variant: z.string().optional(),
});

/**
 * Platform-specific manifest in a manifest list.
 */
export interface PlatformManifest {
  /** Media type */
  mediaType: string;
  /** Manifest size in bytes */
  size: number;
  /** Manifest digest */
  digest: string;
  /** Platform specification */
  platform: Platform;
}

export const PlatformManifestSchema = z.object({
  mediaType: z.string().min(1),
  size: z.number().int().nonnegative(),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  platform: PlatformSchema,
});

/**
 * Docker Image Manifest V2, Schema 2.
 */
export interface ManifestV2 {
  /** Schema version (must be 2) */
  schemaVersion: 2;
  /** Media type */
  mediaType: string;
  /** Config descriptor */
  config: Descriptor;
  /** Layer descriptors */
  layers: Descriptor[];
}

export const ManifestV2Schema = z.object({
  schemaVersion: z.literal(2),
  mediaType: z.string().min(1),
  config: DescriptorSchema,
  layers: z.array(DescriptorSchema),
});

/**
 * Manifest list (multi-architecture image).
 */
export interface ManifestList {
  /** Schema version (must be 2) */
  schemaVersion: 2;
  /** Media type */
  mediaType: string;
  /** Platform-specific manifests */
  manifests: PlatformManifest[];
}

export const ManifestListSchema = z.object({
  schemaVersion: z.literal(2),
  mediaType: z.string().min(1),
  manifests: z.array(PlatformManifestSchema),
});

/**
 * Unified manifest type.
 */
export type Manifest = ManifestV2 | ManifestList;

export const ManifestSchema = z.union([ManifestV2Schema, ManifestListSchema]);

export type ManifestInferred = z.infer<typeof ManifestSchema>;

// ============================================================================
// Repository Types
// ============================================================================

/**
 * Docker Hub repository representation.
 */
export interface Repository {
  /** Repository namespace */
  namespace: string;
  /** Repository name */
  name: string;
  /** Repository description */
  description?: string;
  /** Whether the repository is private */
  isPrivate: boolean;
  /** Number of stars */
  starCount: number;
  /** Total pull count */
  pullCount: number;
  /** Last updated timestamp */
  lastUpdated: Date;
}

export const RepositorySchema = z.object({
  namespace: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  isPrivate: z.boolean(),
  starCount: z.number().int().nonnegative(),
  pullCount: z.number().int().nonnegative(),
  lastUpdated: z.coerce.date(),
});

export type RepositoryInferred = z.infer<typeof RepositorySchema>;

/**
 * Docker Hub repository data (from API responses).
 */
export interface RepositoryData {
  /** Repository name */
  name: string;
  /** Namespace (owner) */
  namespace: string;
  /** Repository URL */
  repoUrl?: string;
  /** Full repository name (namespace/name) */
  repoName: string;
  /** Description */
  description?: string;
  /** Is private */
  isPrivate: boolean;
  /** Star count */
  starCount: number;
  /** Pull count */
  pullCount: number;
  /** Last updated ISO timestamp */
  lastUpdated?: string;
  /** Date pushed */
  datePushed?: string;
}

export const RepositoryDataSchema = z.object({
  name: z.string().min(1),
  namespace: z.string().min(1),
  repoUrl: z.string().optional(),
  repoName: z.string().min(1),
  description: z.string().optional(),
  isPrivate: z.boolean(),
  starCount: z.number().int().nonnegative(),
  pullCount: z.number().int().nonnegative(),
  lastUpdated: z.string().optional(),
  datePushed: z.string().optional(),
});

// ============================================================================
// Vulnerability Types
// ============================================================================

/**
 * Scan status for vulnerability scanning.
 */
export type ScanStatus = 'pending' | 'scanning' | 'completed' | 'failed' | 'not_scanned';

export const ScanStatusSchema = z.enum([
  'pending',
  'scanning',
  'completed',
  'failed',
  'not_scanned',
]);

/**
 * Summary of vulnerability counts by severity.
 */
export interface VulnerabilitySummary {
  /** Number of critical vulnerabilities */
  critical: number;
  /** Number of high severity vulnerabilities */
  high: number;
  /** Number of medium severity vulnerabilities */
  medium: number;
  /** Number of low severity vulnerabilities */
  low: number;
  /** Number of unknown severity vulnerabilities */
  unknown: number;
}

export const VulnerabilitySummarySchema = z.object({
  critical: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
});

/**
 * Vulnerability scan overview for an image.
 */
export interface ScanOverview {
  /** Current scan status */
  scanStatus: ScanStatus;
  /** When the last scan was performed */
  lastScanned?: Date;
  /** Summary of vulnerabilities found */
  vulnerabilitySummary: VulnerabilitySummary;
}

export const ScanOverviewSchema = z.object({
  scanStatus: ScanStatusSchema,
  lastScanned: z.coerce.date().optional(),
  vulnerabilitySummary: VulnerabilitySummarySchema,
});

export type ScanOverviewInferred = z.infer<typeof ScanOverviewSchema>;

// ============================================================================
// Webhook Types
// ============================================================================

/**
 * Push data in webhook payload.
 */
export interface PushData {
  /** When the push occurred */
  pushedAt: Date;
  /** Username of the pusher */
  pusher: string;
  /** Tag that was pushed */
  tag: string;
  /** List of image digests */
  images: string[];
}

export const PushDataSchema = z.object({
  pushedAt: z.coerce.date(),
  pusher: z.string().min(1),
  tag: z.string().min(1),
  images: z.array(z.string()),
});

/**
 * Docker Hub webhook payload.
 */
export interface WebhookPayload {
  /** Callback URL for the webhook */
  callbackUrl: string;
  /** Push event data */
  pushData: PushData;
  /** Repository information */
  repository: RepositoryData;
}

export const WebhookPayloadSchema = z.object({
  callbackUrl: z.string().url(),
  pushData: PushDataSchema,
  repository: RepositoryDataSchema,
});

export type WebhookPayloadInferred = z.infer<typeof WebhookPayloadSchema>;

// ============================================================================
// Tag Types
// ============================================================================

/**
 * Image tag information.
 */
export interface Tag {
  /** Tag name */
  name: string;
  /** Full image size in bytes */
  fullSize: number;
  /** Image digest */
  digest: string;
  /** Last updated timestamp */
  lastUpdated: Date;
  /** Last pushed timestamp */
  lastPusher?: string;
}

export const TagSchema = z.object({
  name: z.string().min(1),
  fullSize: z.number().int().nonnegative(),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  lastUpdated: z.coerce.date(),
  lastPusher: z.string().optional(),
});

/**
 * List of tags for a repository.
 */
export interface TagList {
  /** Total count of tags */
  count: number;
  /** Next page URL */
  next?: string;
  /** Previous page URL */
  previous?: string;
  /** Array of tags */
  results: Tag[];
}

export const TagListSchema = z.object({
  count: z.number().int().nonnegative(),
  next: z.string().url().nullable().optional(),
  previous: z.string().url().nullable().optional(),
  results: z.array(TagSchema),
});

// ============================================================================
// Validation Constants
// ============================================================================

/**
 * Tag name validation pattern.
 * Tags must be valid ASCII and less than 128 characters.
 * They can contain lowercase/uppercase letters, digits, underscores, periods, and hyphens.
 * They cannot start with a period or hyphen.
 */
export const TAG_NAME_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$/;

/**
 * Digest validation pattern (SHA256).
 */
export const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

/**
 * Repository name pattern.
 * Must be lowercase alphanumeric with optional separators (-, _, .).
 */
export const REPOSITORY_NAME_PATTERN = /^[a-z0-9]+([._-][a-z0-9]+)*$/;

/**
 * Namespace pattern (username or organization).
 */
export const NAMESPACE_PATTERN = /^[a-z0-9_-]{4,30}$/;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parses an image reference string into structured components.
 *
 * Supports formats:
 * - repository:tag
 * - namespace/repository:tag
 * - registry/namespace/repository:tag
 * - repository@sha256:digest
 * - registry/namespace/repository@sha256:digest
 *
 * @param input - Image reference string
 * @returns Parsed ImageReference
 * @throws Error if the input format is invalid
 */
export function parseImageReference(input: string): ImageReference {
  if (!input || input.trim().length === 0) {
    throw new Error('Image reference cannot be empty');
  }

  const trimmed = input.trim();

  // Check for digest reference
  const digestMatch = trimmed.match(/^(.+)@(sha256:[a-f0-9]{64})$/);
  if (digestMatch) {
    const [, imagePath, digest] = digestMatch;
    const parts = imagePath.split('/');

    if (parts.length === 1) {
      // repository@digest
      return {
        registry: 'registry-1.docker.io',
        namespace: 'library',
        repository: parts[0],
        reference: { type: 'digest', value: digest },
      };
    } else if (parts.length === 2) {
      // namespace/repository@digest
      return {
        registry: 'registry-1.docker.io',
        namespace: parts[0],
        repository: parts[1],
        reference: { type: 'digest', value: digest },
      };
    } else if (parts.length >= 3) {
      // registry/namespace/repository@digest
      return {
        registry: parts[0],
        namespace: parts[1],
        repository: parts.slice(2).join('/'),
        reference: { type: 'digest', value: digest },
      };
    }
  }

  // Check for tag reference
  const tagMatch = trimmed.match(/^(.+):([^:]+)$/);
  if (tagMatch) {
    const [, imagePath, tag] = tagMatch;
    const parts = imagePath.split('/');

    if (parts.length === 1) {
      // repository:tag
      return {
        registry: 'registry-1.docker.io',
        namespace: 'library',
        repository: parts[0],
        reference: { type: 'tag', value: tag },
      };
    } else if (parts.length === 2) {
      // namespace/repository:tag
      return {
        registry: 'registry-1.docker.io',
        namespace: parts[0],
        repository: parts[1],
        reference: { type: 'tag', value: tag },
      };
    } else if (parts.length >= 3) {
      // registry/namespace/repository:tag
      return {
        registry: parts[0],
        namespace: parts[1],
        repository: parts.slice(2).join('/'),
        reference: { type: 'tag', value: tag },
      };
    }
  }

  // No tag or digest specified, default to 'latest' tag
  const parts = trimmed.split('/');
  if (parts.length === 1) {
    // repository
    return {
      registry: 'registry-1.docker.io',
      namespace: 'library',
      repository: parts[0],
      reference: { type: 'tag', value: 'latest' },
    };
  } else if (parts.length === 2) {
    // namespace/repository
    return {
      registry: 'registry-1.docker.io',
      namespace: parts[0],
      repository: parts[1],
      reference: { type: 'tag', value: 'latest' },
    };
  } else if (parts.length >= 3) {
    // registry/namespace/repository
    return {
      registry: parts[0],
      namespace: parts[1],
      repository: parts.slice(2).join('/'),
      reference: { type: 'tag', value: 'latest' },
    };
  }

  throw new Error(`Invalid image reference format: ${input}`);
}

/**
 * Validates a tag name.
 *
 * @param tag - Tag name to validate
 * @throws Error if the tag is invalid
 */
export function validateTag(tag: string): void {
  if (!tag || tag.trim().length === 0) {
    throw new Error('Tag cannot be empty');
  }

  if (tag.length > 128) {
    throw new Error('Tag must be less than 128 characters');
  }

  if (!TAG_NAME_PATTERN.test(tag)) {
    throw new Error(
      'Tag must contain only ASCII letters, digits, underscores, periods, and hyphens, and cannot start with a period or hyphen'
    );
  }
}

/**
 * Validates a digest string.
 *
 * @param digest - Digest to validate (e.g., sha256:abc123...)
 * @throws Error if the digest is invalid
 */
export function validateDigest(digest: string): void {
  if (!digest || digest.trim().length === 0) {
    throw new Error('Digest cannot be empty');
  }

  if (!DIGEST_PATTERN.test(digest)) {
    throw new Error('Digest must be in format sha256:<64 hex characters>');
  }
}

/**
 * Validates a repository name.
 *
 * @param repository - Repository name to validate
 * @throws Error if the repository name is invalid
 */
export function validateRepositoryName(repository: string): void {
  if (!repository || repository.trim().length === 0) {
    throw new Error('Repository name cannot be empty');
  }

  if (repository.length > 255) {
    throw new Error('Repository name must be less than 255 characters');
  }

  if (!REPOSITORY_NAME_PATTERN.test(repository)) {
    throw new Error(
      'Repository name must contain only lowercase letters, numbers, and separators (-, _, .)'
    );
  }
}

/**
 * Validates a namespace (username or organization).
 *
 * @param namespace - Namespace to validate
 * @throws Error if the namespace is invalid
 */
export function validateNamespace(namespace: string): void {
  if (!namespace || namespace.trim().length === 0) {
    throw new Error('Namespace cannot be empty');
  }

  // Docker Hub official images use 'library' namespace
  if (namespace === 'library') {
    return;
  }

  if (namespace.length < 4 || namespace.length > 30) {
    throw new Error('Namespace must be between 4 and 30 characters');
  }

  if (!NAMESPACE_PATTERN.test(namespace)) {
    throw new Error(
      'Namespace must contain only lowercase letters, numbers, hyphens, and underscores'
    );
  }
}

/**
 * Builds a full image name from an ImageReference.
 *
 * @param ref - ImageReference object
 * @returns Full image name string
 */
export function buildFullName(ref: ImageReference): string {
  const { registry, namespace, repository, reference } = ref;

  // Build base path
  let fullName = '';

  // Include registry if not Docker Hub
  if (registry !== 'registry-1.docker.io' && registry !== 'docker.io') {
    fullName += `${registry}/`;
  }

  // Include namespace (but not 'library' for official images on Docker Hub)
  if (
    namespace !== 'library' ||
    (registry !== 'registry-1.docker.io' && registry !== 'docker.io')
  ) {
    fullName += `${namespace}/`;
  }

  // Add repository
  fullName += repository;

  // Add reference (tag or digest)
  if (reference.type === 'tag') {
    fullName += `:${reference.value}`;
  } else {
    fullName += `@${reference.value}`;
  }

  return fullName;
}

/**
 * Checks if a manifest is a manifest list (multi-arch).
 *
 * @param manifest - Manifest to check
 * @returns True if the manifest is a ManifestList
 */
export function isManifestList(manifest: Manifest): manifest is ManifestList {
  return 'manifests' in manifest;
}

/**
 * Checks if a manifest is a single-platform V2 manifest.
 *
 * @param manifest - Manifest to check
 * @returns True if the manifest is a ManifestV2
 */
export function isManifestV2(manifest: Manifest): manifest is ManifestV2 {
  return 'config' in manifest && 'layers' in manifest;
}

/**
 * Calculates total size of a manifest V2 (config + all layers).
 *
 * @param manifest - ManifestV2 to calculate size for
 * @returns Total size in bytes
 */
export function calculateManifestSize(manifest: ManifestV2): number {
  const configSize = manifest.config.size;
  const layersSize = manifest.layers.reduce((sum, layer) => sum + layer.size, 0);
  return configSize + layersSize;
}

/**
 * Extracts architectures from a manifest list.
 *
 * @param manifestList - ManifestList to extract from
 * @returns Array of architecture strings
 */
export function extractArchitectures(manifestList: ManifestList): string[] {
  return manifestList.manifests.map((m) => m.platform.architecture);
}

/**
 * Extracts operating systems from a manifest list.
 *
 * @param manifestList - ManifestList to extract from
 * @returns Array of OS strings
 */
export function extractOperatingSystems(manifestList: ManifestList): string[] {
  return [...new Set(manifestList.manifests.map((m) => m.platform.os))];
}

/**
 * Finds a platform-specific manifest in a manifest list.
 *
 * @param manifestList - ManifestList to search
 * @param architecture - Target architecture (e.g., 'amd64', 'arm64')
 * @param os - Target OS (e.g., 'linux', 'windows')
 * @param variant - Optional variant (e.g., 'v7', 'v8')
 * @returns Matching PlatformManifest or undefined
 */
export function findPlatformManifest(
  manifestList: ManifestList,
  architecture: string,
  os: string,
  variant?: string
): PlatformManifest | undefined {
  return manifestList.manifests.find(
    (m) =>
      m.platform.architecture === architecture &&
      m.platform.os === os &&
      (variant === undefined || m.platform.variant === variant)
  );
}

/**
 * Checks if a vulnerability summary has any critical or high severity issues.
 *
 * @param summary - VulnerabilitySummary to check
 * @returns True if critical or high vulnerabilities exist
 */
export function hasCriticalVulnerabilities(summary: VulnerabilitySummary): boolean {
  return summary.critical > 0 || summary.high > 0;
}

/**
 * Calculates total vulnerability count.
 *
 * @param summary - VulnerabilitySummary to sum
 * @returns Total number of vulnerabilities
 */
export function totalVulnerabilities(summary: VulnerabilitySummary): number {
  return (
    summary.critical +
    summary.high +
    summary.medium +
    summary.low +
    summary.unknown
  );
}
