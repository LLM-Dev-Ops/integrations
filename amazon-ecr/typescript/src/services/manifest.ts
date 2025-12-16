/**
 * Manifest service implementation for Amazon ECR.
 *
 * Provides operations for retrieving and parsing container image manifests,
 * including multi-architecture manifest lists and platform-specific manifests.
 *
 * @module services/manifest
 */

import type {
  ImageIdentifier,
  ImageManifest,
  ManifestList,
  Platform,
  ImageConfig,
  LayerInfo,
  Image,
} from '../types/index.js';
import { EcrError, EcrErrorKind } from '../errors.js';

/**
 * Manifest service interface.
 */
export interface ManifestService {
  /**
   * Gets an image manifest.
   * @param repositoryName - The repository name
   * @param imageId - The image identifier (tag or digest)
   * @returns The image manifest
   * @throws {EcrError} InvalidParameter if the manifest is a list (use getManifestList instead)
   * @throws {EcrError} ImageNotFound if the image does not exist
   */
  getManifest(repositoryName: string, imageId: ImageIdentifier): Promise<ImageManifest>;

  /**
   * Gets a multi-architecture manifest list.
   * @param repositoryName - The repository name
   * @param imageId - The image identifier (tag or digest)
   * @returns The manifest list
   * @throws {EcrError} InvalidParameter if the image is not a multi-arch manifest
   * @throws {EcrError} ImageNotFound if the image does not exist
   */
  getManifestList(repositoryName: string, imageId: ImageIdentifier): Promise<ManifestList>;

  /**
   * Gets a platform-specific manifest from a multi-architecture image.
   * @param repositoryName - The repository name
   * @param imageId - The image identifier (tag or digest)
   * @param platform - The target platform
   * @returns The platform-specific manifest
   * @throws {EcrError} InvalidParameter if platform not found
   * @throws {EcrError} ImageNotFound if the image does not exist
   */
  getPlatformManifest(
    repositoryName: string,
    imageId: ImageIdentifier,
    platform: Platform
  ): Promise<ImageManifest>;

  /**
   * Gets the image configuration blob.
   * @param repositoryName - The repository name
   * @param imageId - The image identifier (tag or digest)
   * @returns The image configuration
   * @throws {EcrError} InvalidParameter if manifest has no config
   * @throws {EcrError} ImageNotFound if the image does not exist
   */
  getImageConfig(repositoryName: string, imageId: ImageIdentifier): Promise<ImageConfig>;

  /**
   * Gets layer information from an image manifest.
   * @param repositoryName - The repository name
   * @param imageId - The image identifier (tag or digest)
   * @returns Array of layer information
   * @throws {EcrError} ImageNotFound if the image does not exist
   */
  getLayers(repositoryName: string, imageId: ImageIdentifier): Promise<LayerInfo[]>;
}

/**
 * Manifest service implementation.
 */
export class ManifestServiceImpl implements ManifestService {
  constructor(private readonly getImage: (repo: string, id: ImageIdentifier) => Promise<Image>) {}

  async getManifest(repositoryName: string, imageId: ImageIdentifier): Promise<ImageManifest> {
    const image = await this.getImage(repositoryName, imageId);

    if (!image.imageManifest) {
      throw new EcrError(
        EcrErrorKind.InvalidParameter,
        'Image manifest not available'
      );
    }

    const manifest = parseManifest(image.imageManifest);

    if (isManifestList(manifest)) {
      throw new EcrError(
        EcrErrorKind.InvalidParameter,
        'Use getManifestList for multi-arch images'
      );
    }

    return manifest as ImageManifest;
  }

  async getManifestList(repositoryName: string, imageId: ImageIdentifier): Promise<ManifestList> {
    const image = await this.getImage(repositoryName, imageId);

    if (!image.imageManifest) {
      throw new EcrError(
        EcrErrorKind.InvalidParameter,
        'Image manifest not available'
      );
    }

    const manifest = parseManifest(image.imageManifest);

    if (!isManifestList(manifest)) {
      throw new EcrError(
        EcrErrorKind.InvalidParameter,
        'Image is not a multi-arch manifest list'
      );
    }

    return manifest as ManifestList;
  }

  async getPlatformManifest(
    repositoryName: string,
    imageId: ImageIdentifier,
    platform: Platform
  ): Promise<ImageManifest> {
    const manifestList = await this.getManifestList(repositoryName, imageId);

    const platformManifest = manifestList.manifests.find(m =>
      matchesPlatform(m.platform, platform)
    );

    if (!platformManifest) {
      const platformStr = platformToString(platform);
      throw new EcrError(
        EcrErrorKind.InvalidParameter,
        `Platform not found: ${platformStr}`
      );
    }

    const platformImageId: ImageIdentifier = {
      imageDigest: platformManifest.digest,
    };

    return this.getManifest(repositoryName, platformImageId);
  }

  async getImageConfig(repositoryName: string, imageId: ImageIdentifier): Promise<ImageConfig> {
    const manifest = await this.getManifest(repositoryName, imageId);

    if (!manifest.config) {
      throw new EcrError(
        EcrErrorKind.InvalidParameter,
        'Manifest has no config'
      );
    }

    const configDigest = manifest.config.digest;
    const configImage = await this.getImage(repositoryName, {
      imageDigest: configDigest,
    });

    if (!configImage.imageManifest) {
      throw new EcrError(
        EcrErrorKind.ImageNotFound,
        'Config not found'
      );
    }

    return JSON.parse(configImage.imageManifest) as ImageConfig;
  }

  async getLayers(repositoryName: string, imageId: ImageIdentifier): Promise<LayerInfo[]> {
    const manifest = await this.getManifest(repositoryName, imageId);

    return manifest.layers.map(layer => ({
      digest: layer.digest,
      size: layer.size,
      mediaType: layer.mediaType,
    }));
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Checks if a manifest is a manifest list.
 */
function isManifestList(manifest: any): boolean {
  const mediaType = manifest?.mediaType;
  if (!mediaType) return false;

  return (
    mediaType === 'application/vnd.docker.distribution.manifest.list.v2+json' ||
    mediaType === 'application/vnd.oci.image.index.v1+json'
  );
}

/**
 * Parses a manifest JSON string.
 */
function parseManifest(json: string): ImageManifest | ManifestList {
  try {
    return JSON.parse(json);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new EcrError(
      EcrErrorKind.InvalidParameter,
      `Failed to parse manifest: ${errorMessage}`
    );
  }
}

/**
 * Checks if a platform manifest matches the target platform.
 */
function matchesPlatform(manifest: Platform, target: Platform): boolean {
  if (manifest.os !== target.os || manifest.architecture !== target.architecture) {
    return false;
  }

  if (target.variant && manifest.variant !== target.variant) {
    return false;
  }

  if (target.osVersion && manifest.osVersion !== target.osVersion) {
    return false;
  }

  return true;
}

/**
 * Converts a platform to a string representation.
 */
function platformToString(platform: Platform): string {
  let result = `${platform.os}/${platform.architecture}`;
  if (platform.variant) {
    result += `/${platform.variant}`;
  }
  return result;
}
