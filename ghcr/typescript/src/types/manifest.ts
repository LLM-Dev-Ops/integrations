/**
 * OCI and Docker manifest types for GitHub Container Registry.
 * @module types/manifest
 */

import { createHash } from 'crypto';

/**
 * Media type constants for OCI and Docker manifests.
 */
export const MediaType = {
  // Docker manifest types
  DockerManifestV2: 'application/vnd.docker.distribution.manifest.v2+json',
  DockerManifestList: 'application/vnd.docker.distribution.manifest.list.v2+json',
  DockerConfig: 'application/vnd.docker.container.image.v1+json',
  DockerLayer: 'application/vnd.docker.image.rootfs.diff.tar.gzip',
  DockerLayerForeign: 'application/vnd.docker.image.rootfs.foreign.diff.tar.gzip',

  // OCI manifest types
  OciManifest: 'application/vnd.oci.image.manifest.v1+json',
  OciIndex: 'application/vnd.oci.image.index.v1+json',
  OciConfig: 'application/vnd.oci.image.config.v1+json',
  OciLayer: 'application/vnd.oci.image.layer.v1.tar+gzip',
  OciLayerZstd: 'application/vnd.oci.image.layer.v1.tar+zstd',

  // Empty descriptor
  OciEmpty: 'application/vnd.oci.empty.v1+json',
} as const;

export type MediaTypeValue = typeof MediaType[keyof typeof MediaType] | string;

/**
 * Checks if a media type is a manifest list/index type.
 */
export function isIndexMediaType(mediaType: string): boolean {
  return mediaType === MediaType.DockerManifestList ||
         mediaType === MediaType.OciIndex;
}

/**
 * Checks if a media type is a single image manifest type.
 */
export function isImageManifestMediaType(mediaType: string): boolean {
  return mediaType === MediaType.DockerManifestV2 ||
         mediaType === MediaType.OciManifest;
}

/**
 * Gets the Accept header value for pulling manifests.
 */
export function getManifestAcceptHeader(): string {
  return [
    MediaType.DockerManifestV2,
    MediaType.DockerManifestList,
    MediaType.OciManifest,
    MediaType.OciIndex,
  ].join(', ');
}

/**
 * Platform specification for multi-arch images.
 */
export interface Platform {
  /** CPU architecture (amd64, arm64, etc.) */
  readonly architecture: string;
  /** Operating system (linux, windows, etc.) */
  readonly os: string;
  /** OS version (optional) */
  readonly 'os.version'?: string;
  /** OS features (optional) */
  readonly 'os.features'?: readonly string[];
  /** Architecture variant (optional, e.g., v8 for arm64) */
  readonly variant?: string;
}

/**
 * Platform factory and utility functions.
 */
export const Platform = {
  /**
   * Creates a new platform.
   */
  create(os: string, architecture: string, variant?: string): Platform {
    const platform: Platform = { os, architecture };
    if (variant) {
      return { ...platform, variant };
    }
    return platform;
  },

  /**
   * Common platform presets.
   */
  LinuxAmd64: { os: 'linux', architecture: 'amd64' } as Platform,
  LinuxArm64: { os: 'linux', architecture: 'arm64' } as Platform,
  LinuxArmV7: { os: 'linux', architecture: 'arm', variant: 'v7' } as Platform,
  WindowsAmd64: { os: 'windows', architecture: 'amd64' } as Platform,

  /**
   * Checks if two platforms match.
   */
  matches(a: Platform, b: Platform): boolean {
    if (a.os !== b.os || a.architecture !== b.architecture) {
      return false;
    }
    if (a.variant !== b.variant) {
      return false;
    }
    return true;
  },

  /**
   * Formats platform as a string.
   */
  toString(p: Platform): string {
    let result = `${p.os}/${p.architecture}`;
    if (p.variant) {
      result += `/${p.variant}`;
    }
    return result;
  },
};

/**
 * Content descriptor for blobs and manifests.
 */
export interface Descriptor {
  /** Media type of the content */
  readonly mediaType: string;
  /** Content digest (sha256:...) */
  readonly digest: string;
  /** Content size in bytes */
  readonly size: number;
  /** Download URLs (optional) */
  readonly urls?: readonly string[];
  /** Annotations (optional) */
  readonly annotations?: Readonly<Record<string, string>>;
  /** Platform (for manifest list entries) */
  readonly platform?: Platform;
  /** Artifact type (for OCI artifacts) */
  readonly artifactType?: string;
  /** Data embedded (for small payloads) */
  readonly data?: string;
}

/**
 * Descriptor factory functions.
 */
export const Descriptor = {
  /**
   * Creates a new descriptor.
   */
  create(
    mediaType: string,
    digest: string,
    size: number,
    options?: {
      platform?: Platform;
      annotations?: Record<string, string>;
      urls?: string[];
    }
  ): Descriptor {
    const desc: Descriptor = { mediaType, digest, size };
    if (options?.platform) {
      return { ...desc, platform: options.platform };
    }
    if (options?.annotations) {
      return { ...desc, annotations: options.annotations };
    }
    if (options?.urls) {
      return { ...desc, urls: options.urls };
    }
    return desc;
  },

  /**
   * Creates a descriptor from content.
   */
  fromContent(mediaType: string, content: string | Buffer): Descriptor {
    const buffer = typeof content === 'string' ? Buffer.from(content) : content;
    const hash = createHash('sha256').update(buffer).digest('hex');
    return {
      mediaType,
      digest: `sha256:${hash}`,
      size: buffer.length,
    };
  },
};

/**
 * Image manifest (single platform).
 */
export interface ImageManifest {
  /** Schema version (always 2) */
  readonly schemaVersion: 2;
  /** Media type */
  readonly mediaType: string;
  /** Config descriptor */
  readonly config: Descriptor;
  /** Layer descriptors */
  readonly layers: readonly Descriptor[];
  /** Annotations (optional) */
  readonly annotations?: Readonly<Record<string, string>>;
  /** Subject (for referrers API) */
  readonly subject?: Descriptor;
  /** Artifact type (for OCI artifacts) */
  readonly artifactType?: string;
}

/**
 * Image index / manifest list (multi-platform).
 */
export interface ImageIndex {
  /** Schema version (always 2) */
  readonly schemaVersion: 2;
  /** Media type */
  readonly mediaType: string;
  /** Manifest descriptors */
  readonly manifests: readonly Descriptor[];
  /** Annotations (optional) */
  readonly annotations?: Readonly<Record<string, string>>;
  /** Subject (for referrers API) */
  readonly subject?: Descriptor;
  /** Artifact type (for OCI artifacts) */
  readonly artifactType?: string;
}

/**
 * Union type for all manifest types.
 */
export type Manifest = ImageManifest | ImageIndex;

/**
 * Type guard for ImageManifest.
 */
export function isImageManifest(manifest: Manifest): manifest is ImageManifest {
  return 'config' in manifest && 'layers' in manifest;
}

/**
 * Type guard for ImageIndex.
 */
export function isImageIndex(manifest: Manifest): manifest is ImageIndex {
  return 'manifests' in manifest && !('config' in manifest);
}

/**
 * Manifest utility functions.
 */
export const ManifestUtils = {
  /**
   * Calculates the digest of a manifest.
   */
  digest(manifest: Manifest): string {
    const json = JSON.stringify(manifest);
    const hash = createHash('sha256').update(json).digest('hex');
    return `sha256:${hash}`;
  },

  /**
   * Gets the media type of a manifest.
   */
  mediaType(manifest: Manifest): string {
    return manifest.mediaType;
  },

  /**
   * Checks if a manifest is a multi-arch manifest.
   */
  isMultiArch(manifest: Manifest): boolean {
    return isImageIndex(manifest);
  },

  /**
   * Gets all platforms from an index.
   */
  platforms(manifest: Manifest): Platform[] {
    if (isImageIndex(manifest)) {
      return manifest.manifests
        .filter((m): m is Descriptor & { platform: Platform } => m.platform !== undefined)
        .map(m => m.platform);
    }
    return [];
  },

  /**
   * Finds a manifest descriptor for a specific platform in an index.
   */
  findPlatform(manifest: ImageIndex, platform: Platform): Descriptor | undefined {
    return manifest.manifests.find(m =>
      m.platform !== undefined && Platform.matches(m.platform, platform)
    );
  },

  /**
   * Gets total size of all layers in an image manifest.
   */
  totalLayerSize(manifest: ImageManifest): number {
    return manifest.layers.reduce((sum, layer) => sum + layer.size, 0);
  },

  /**
   * Creates an empty image manifest.
   */
  createEmpty(mediaType: string = MediaType.OciManifest): ImageManifest {
    return {
      schemaVersion: 2,
      mediaType,
      config: {
        mediaType: MediaType.OciConfig,
        digest: 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
        size: 2,
      },
      layers: [],
    };
  },

  /**
   * Creates an image index from manifest descriptors.
   */
  createIndex(
    manifests: Descriptor[],
    annotations?: Record<string, string>
  ): ImageIndex {
    return {
      schemaVersion: 2,
      mediaType: MediaType.OciIndex,
      manifests,
      ...(annotations && { annotations }),
    };
  },
};
