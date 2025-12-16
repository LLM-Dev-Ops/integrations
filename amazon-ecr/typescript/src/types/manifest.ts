/**
 * Manifest types for Amazon ECR.
 *
 * This module provides TypeScript type definitions for Docker/OCI image manifests,
 * matching the structure defined in the SPARC specification.
 *
 * @module types/manifest
 */

/**
 * Platform specification for multi-architecture images.
 */
export interface Platform {
  /** CPU architecture (e.g., amd64, arm64). */
  readonly architecture: string;
  /** Operating system (e.g., linux, windows). */
  readonly os: string;
  /** OS version. */
  readonly osVersion?: string;
  /** Architecture variant (e.g., v7 for arm). */
  readonly variant?: string;
}

/**
 * Manifest configuration reference.
 */
export interface ManifestConfig {
  /** Config media type. */
  readonly mediaType: string;
  /** Config size in bytes. */
  readonly size: number;
  /** Config digest (SHA256). */
  readonly digest: string;
}

/**
 * Image layer reference in manifest.
 */
export interface ManifestLayer {
  /** Layer media type. */
  readonly mediaType: string;
  /** Layer size in bytes. */
  readonly size: number;
  /** Layer digest (SHA256). */
  readonly digest: string;
}

/**
 * Docker/OCI image manifest.
 */
export interface ImageManifest {
  /** Manifest schema version. */
  readonly schemaVersion: number;
  /** Manifest media type. */
  readonly mediaType: string;
  /** Image configuration reference. */
  readonly config?: ManifestConfig;
  /** Image layers. */
  readonly layers: ManifestLayer[];
}

/**
 * Platform-specific manifest in a manifest list.
 */
export interface PlatformManifest {
  /** Manifest media type. */
  readonly mediaType: string;
  /** Manifest size in bytes. */
  readonly size: number;
  /** Manifest digest (SHA256). */
  readonly digest: string;
  /** Target platform. */
  readonly platform: Platform;
}

/**
 * Multi-architecture manifest list (OCI index).
 */
export interface ManifestList {
  /** Manifest list schema version. */
  readonly schemaVersion: number;
  /** Manifest list media type. */
  readonly mediaType: string;
  /** Platform-specific manifests. */
  readonly manifests: PlatformManifest[];
}

/**
 * Image configuration blob.
 */
export interface ImageConfig {
  /** Architecture */
  readonly architecture: string;
  /** Operating system */
  readonly os: string;
  /** OS version (optional) */
  readonly osVersion?: string;
  /** Container configuration */
  readonly config?: {
    readonly Env?: string[];
    readonly Cmd?: string[];
    readonly Entrypoint?: string[];
    readonly WorkingDir?: string;
    readonly User?: string;
    readonly ExposedPorts?: Record<string, unknown>;
    readonly Labels?: Record<string, string>;
  };
  /** Root filesystem layer diff IDs */
  readonly rootfs?: {
    readonly type: string;
    readonly diff_ids: string[];
  };
  /** Build history */
  readonly history?: Array<{
    readonly created?: string;
    readonly created_by?: string;
    readonly comment?: string;
    readonly empty_layer?: boolean;
  }>;
}

/**
 * Layer information.
 */
export interface LayerInfo {
  /** Layer digest */
  readonly digest: string;
  /** Layer size in bytes */
  readonly size: number;
  /** Layer media type */
  readonly mediaType: string;
}

/**
 * Media type constants for manifests.
 */
export const MediaType = {
  // Docker manifest types
  DockerManifestV2: 'application/vnd.docker.distribution.manifest.v2+json',
  DockerManifestList: 'application/vnd.docker.distribution.manifest.list.v2+json',
  DockerConfig: 'application/vnd.docker.container.image.v1+json',
  DockerLayer: 'application/vnd.docker.image.rootfs.diff.tar.gzip',

  // OCI manifest types
  OciManifest: 'application/vnd.oci.image.manifest.v1+json',
  OciIndex: 'application/vnd.oci.image.index.v1+json',
  OciConfig: 'application/vnd.oci.image.config.v1+json',
  OciLayer: 'application/vnd.oci.image.layer.v1.tar+gzip',
} as const;
