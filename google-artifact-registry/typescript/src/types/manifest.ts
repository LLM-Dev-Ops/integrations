/**
 * Docker/OCI manifest types for Google Artifact Registry.
 * @module types/manifest
 */

import { z } from 'zod';

/**
 * Supported manifest media types.
 */
export const MANIFEST_MEDIA_TYPES = [
  'application/vnd.docker.distribution.manifest.v2+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.oci.image.index.v1+json',
] as const;

export type ManifestMediaType = typeof MANIFEST_MEDIA_TYPES[number];

/**
 * Layer media types.
 */
export const LAYER_MEDIA_TYPES = [
  'application/vnd.docker.image.rootfs.diff.tar.gzip',
  'application/vnd.docker.image.rootfs.foreign.diff.tar.gzip',
  'application/vnd.oci.image.layer.v1.tar',
  'application/vnd.oci.image.layer.v1.tar+gzip',
  'application/vnd.oci.image.layer.v1.tar+zstd',
  'application/vnd.oci.image.layer.nondistributable.v1.tar',
  'application/vnd.oci.image.layer.nondistributable.v1.tar+gzip',
] as const;

export type LayerMediaType = typeof LAYER_MEDIA_TYPES[number];

/**
 * Config media types.
 */
export const CONFIG_MEDIA_TYPES = [
  'application/vnd.docker.container.image.v1+json',
  'application/vnd.oci.image.config.v1+json',
] as const;

export type ConfigMediaType = typeof CONFIG_MEDIA_TYPES[number];

/**
 * Platform specification for multi-arch images.
 */
export interface Platform {
  /** CPU architecture (e.g., "amd64", "arm64") */
  architecture: string;
  /** Operating system (e.g., "linux", "windows") */
  os: string;
  /** OS version (e.g., for Windows) */
  'os.version'?: string;
  /** OS features */
  'os.features'?: string[];
  /** Architecture variant (e.g., "v7" for ARM) */
  variant?: string;
  /** Additional features */
  features?: string[];
}

/**
 * Descriptor for a blob (layer or config).
 */
export interface Descriptor {
  /** Media type */
  mediaType: string;
  /** Content digest (sha256:...) */
  digest: string;
  /** Size in bytes */
  size: number;
  /** URLs for external content */
  urls?: string[];
  /** Annotations */
  annotations?: Record<string, string>;
  /** Platform (for manifest list entries) */
  platform?: Platform;
}

/**
 * Docker V2 manifest (single image).
 */
export interface DockerManifestV2 {
  /** Schema version (always 2) */
  schemaVersion: 2;
  /** Media type */
  mediaType: 'application/vnd.docker.distribution.manifest.v2+json';
  /** Config descriptor */
  config: Descriptor;
  /** Layer descriptors */
  layers: Descriptor[];
}

/**
 * Docker manifest list (multi-arch).
 */
export interface DockerManifestList {
  /** Schema version (always 2) */
  schemaVersion: 2;
  /** Media type */
  mediaType: 'application/vnd.docker.distribution.manifest.list.v2+json';
  /** Manifest descriptors for each platform */
  manifests: Descriptor[];
}

/**
 * OCI image manifest (single image).
 */
export interface OCIManifest {
  /** Schema version (always 2) */
  schemaVersion: 2;
  /** Media type */
  mediaType: 'application/vnd.oci.image.manifest.v1+json';
  /** Config descriptor */
  config: Descriptor;
  /** Layer descriptors */
  layers: Descriptor[];
  /** Annotations */
  annotations?: Record<string, string>;
}

/**
 * OCI image index (multi-arch).
 */
export interface OCIIndex {
  /** Schema version (always 2) */
  schemaVersion: 2;
  /** Media type */
  mediaType: 'application/vnd.oci.image.index.v1+json';
  /** Manifest descriptors for each platform */
  manifests: Descriptor[];
  /** Annotations */
  annotations?: Record<string, string>;
}

/**
 * Union type for all manifest types.
 */
export type Manifest = DockerManifestV2 | DockerManifestList | OCIManifest | OCIIndex;

/**
 * Single platform manifest (not a list/index).
 */
export type SingleManifest = DockerManifestV2 | OCIManifest;

/**
 * Multi-platform manifest (list/index).
 */
export type MultiPlatformManifest = DockerManifestList | OCIIndex;

/**
 * Response from putting a manifest.
 */
export interface PutManifestResponse {
  /** Computed digest of the manifest */
  digest: string;
  /** Location header from response */
  location?: string;
}

/**
 * Docker registry tag list response.
 */
export interface TagListResponse {
  /** Repository name */
  name: string;
  /** List of tags */
  tags: string[];
}

/**
 * Blob information from HEAD request.
 */
export interface BlobInfo {
  /** Blob digest */
  digest: string;
  /** Blob size in bytes */
  size: number;
}

/**
 * Upload session for chunked blob uploads.
 */
export interface UploadSession {
  /** Upload URL from Location header */
  uploadUrl: string;
  /** Expected digest */
  digest: string;
  /** Total size of the blob */
  totalSize: number;
  /** Bytes uploaded so far */
  uploadedBytes: number;
}

/**
 * Zod schema for Platform validation.
 */
export const PlatformSchema = z.object({
  architecture: z.string(),
  os: z.string(),
  'os.version': z.string().optional(),
  'os.features': z.array(z.string()).optional(),
  variant: z.string().optional(),
  features: z.array(z.string()).optional(),
});

/**
 * Zod schema for Descriptor validation.
 */
export const DescriptorSchema = z.object({
  mediaType: z.string(),
  digest: z.string(),
  size: z.number(),
  urls: z.array(z.string()).optional(),
  annotations: z.record(z.string()).optional(),
  platform: PlatformSchema.optional(),
});

/**
 * Checks if a manifest is a multi-platform manifest (list/index).
 */
export function isMultiPlatformManifest(
  manifest: Manifest
): manifest is MultiPlatformManifest {
  return (
    manifest.mediaType === 'application/vnd.docker.distribution.manifest.list.v2+json' ||
    manifest.mediaType === 'application/vnd.oci.image.index.v1+json'
  );
}

/**
 * Checks if a manifest is a single platform manifest.
 */
export function isSingleManifest(
  manifest: Manifest
): manifest is SingleManifest {
  return (
    manifest.mediaType === 'application/vnd.docker.distribution.manifest.v2+json' ||
    manifest.mediaType === 'application/vnd.oci.image.manifest.v1+json'
  );
}

/**
 * Gets the config descriptor from a single manifest.
 */
export function getConfigDescriptor(manifest: SingleManifest): Descriptor {
  return manifest.config;
}

/**
 * Gets the layer descriptors from a single manifest.
 */
export function getLayerDescriptors(manifest: SingleManifest): Descriptor[] {
  return manifest.layers;
}

/**
 * Gets the platform manifests from a multi-platform manifest.
 */
export function getPlatformManifests(manifest: MultiPlatformManifest): Descriptor[] {
  return manifest.manifests;
}

/**
 * Finds a manifest for a specific platform in a multi-platform manifest.
 */
export function findPlatformManifest(
  manifest: MultiPlatformManifest,
  platform: Platform
): Descriptor | undefined {
  return manifest.manifests.find(m => {
    if (!m.platform) return false;
    return platformMatches(m.platform, platform);
  });
}

/**
 * Checks if two platforms match.
 */
export function platformMatches(a: Platform, b: Platform): boolean {
  // Architecture must match (with normalization)
  if (normalizeArch(a.architecture) !== normalizeArch(b.architecture)) {
    return false;
  }

  // OS must match
  if (a.os.toLowerCase() !== b.os.toLowerCase()) {
    return false;
  }

  // If variant is specified in the target, it must match
  if (b.variant && a.variant !== b.variant) {
    return false;
  }

  return true;
}

/**
 * Normalizes architecture names.
 */
export function normalizeArch(arch: string): string {
  const lower = arch.toLowerCase();
  switch (lower) {
    case 'x86_64':
    case 'x86-64':
    case 'amd64':
      return 'amd64';
    case 'aarch64':
    case 'arm64':
      return 'arm64';
    case 'armv7l':
    case 'armhf':
    case 'arm':
      return 'arm';
    case 'i386':
    case 'i686':
    case '386':
      return '386';
    default:
      return lower;
  }
}

/**
 * Gets the default platform for the current system.
 */
export function getDefaultPlatform(): Platform {
  return {
    architecture: process.arch === 'x64' ? 'amd64' : process.arch,
    os: process.platform === 'win32' ? 'windows' : process.platform,
  };
}

/**
 * Chunk size for blob uploads (5MB).
 */
export const CHUNK_SIZE = 5 * 1024 * 1024;

/**
 * Threshold for chunked uploads (10MB).
 */
export const CHUNKED_UPLOAD_THRESHOLD = 10 * 1024 * 1024;
