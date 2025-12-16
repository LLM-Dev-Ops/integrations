/**
 * Manifest operations for GitHub Container Registry.
 * @module operations/manifests
 */

import { createHash } from 'crypto';
import type { GhcrClient } from '../client.js';
import { GhcrError, GhcrErrorKind } from '../errors.js';
import type {
  ImageRef,
  Manifest,
  ImageManifest,
  ImageIndex,
  Descriptor,
  Platform,
} from '../types/mod.js';
import {
  ImageRefNs as ImageRefUtils,
  ReferenceNs as Reference,
  MediaType,
  isImageManifest,
  isImageIndex,
  ManifestUtils,
  getManifestAcceptHeader,
} from '../types/mod.js';

/**
 * Manifest operations interface.
 */
export interface ManifestOps {
  /**
   * Checks if a manifest exists.
   */
  exists(image: ImageRef): Promise<boolean>;

  /**
   * Gets a manifest by reference.
   */
  get(image: ImageRef): Promise<ManifestWithDigest>;

  /**
   * Gets manifest headers without body.
   */
  head(image: ImageRef): Promise<ManifestHeadResult>;

  /**
   * Puts a manifest by reference.
   */
  put(image: ImageRef, manifest: Manifest): Promise<string>;

  /**
   * Deletes a manifest by reference.
   */
  delete(image: ImageRef): Promise<void>;

  /**
   * Gets a platform-specific manifest from an index.
   */
  getPlatform(image: ImageRef, platform: Platform): Promise<ManifestWithDigest>;
}

/**
 * Manifest with its digest.
 */
export interface ManifestWithDigest {
  readonly manifest: Manifest;
  readonly digest: string;
  readonly mediaType: string;
}

/**
 * Result of a HEAD request for a manifest.
 */
export interface ManifestHeadResult {
  readonly exists: boolean;
  readonly digest?: string;
  readonly mediaType?: string;
  readonly size?: number;
}

/**
 * Creates manifest operations.
 */
export function createManifestOps(client: GhcrClient): ManifestOps {
  return new ManifestOpsImpl(client);
}

/**
 * Manifest operations implementation.
 */
class ManifestOpsImpl implements ManifestOps {
  private readonly client: GhcrClient;

  constructor(client: GhcrClient) {
    this.client = client;
  }

  async exists(image: ImageRef): Promise<boolean> {
    try {
      const result = await this.head(image);
      return result.exists;
    } catch (error) {
      if (error instanceof GhcrError && error.kind === GhcrErrorKind.NotFound) {
        return false;
      }
      throw error;
    }
  }

  async get(image: ImageRef): Promise<ManifestWithDigest> {
    const path = ImageRefUtils.manifestUrl(image);

    const response = await this.client.registryGet<Manifest>(path, {
      headers: {
        'Accept': getManifestAcceptHeader(),
      },
    });

    const digest = response.headers.get('Docker-Content-Digest');
    const mediaType = response.headers.get('Content-Type') ?? MediaType.OciManifest;

    if (!digest) {
      throw GhcrError.invalidManifest('Missing Docker-Content-Digest header');
    }

    // Verify the manifest is valid
    const manifest = this.parseManifest(response.data, mediaType);

    return {
      manifest,
      digest,
      mediaType,
    };
  }

  async head(image: ImageRef): Promise<ManifestHeadResult> {
    const path = ImageRefUtils.manifestUrl(image);

    try {
      const response = await this.client.registryHead(path, {
        headers: {
          'Accept': getManifestAcceptHeader(),
        },
      });

      const digest = response.headers.get('Docker-Content-Digest') ?? undefined;
      const mediaType = response.headers.get('Content-Type') ?? undefined;
      const sizeStr = response.headers.get('Content-Length');
      const size = sizeStr ? parseInt(sizeStr, 10) : undefined;

      return {
        exists: true,
        digest,
        mediaType,
        size,
      };
    } catch (error) {
      if (error instanceof GhcrError && error.kind === GhcrErrorKind.NotFound) {
        return { exists: false };
      }
      throw error;
    }
  }

  async put(image: ImageRef, manifest: Manifest): Promise<string> {
    const path = ImageRefUtils.manifestUrl(image);
    const body = JSON.stringify(manifest);
    const digest = this.calculateDigest(body);

    const response = await this.client.registryPut(path, body, {
      headers: {
        'Content-Type': manifest.mediaType,
      },
    });

    // Verify digest matches
    const returnedDigest = response.headers.get('Docker-Content-Digest');
    if (returnedDigest && returnedDigest !== digest) {
      throw GhcrError.digestMismatch(digest, returnedDigest);
    }

    return returnedDigest ?? digest;
  }

  async delete(image: ImageRef): Promise<void> {
    const path = ImageRefUtils.manifestUrl(image);
    await this.client.registryDelete(path);
  }

  async getPlatform(
    image: ImageRef,
    platform: Platform
  ): Promise<ManifestWithDigest> {
    // First, get the manifest which might be an index
    const result = await this.get(image);

    if (isImageManifest(result.manifest)) {
      // Already a single manifest, return it
      return result;
    }

    if (!isImageIndex(result.manifest)) {
      throw GhcrError.invalidManifest('Expected image manifest or index');
    }

    // Find the platform-specific manifest
    const descriptor = ManifestUtils.findPlatform(result.manifest, platform);
    if (!descriptor) {
      throw new GhcrError(
        GhcrErrorKind.NotFound,
        `No manifest found for platform ${platform.os}/${platform.architecture}`
      );
    }

    // Fetch the platform-specific manifest
    const platformImage = ImageRefUtils.withDigest(image, descriptor.digest);
    return this.get(platformImage);
  }

  /**
   * Parses a manifest from JSON.
   */
  private parseManifest(data: unknown, mediaType: string): Manifest {
    const json = data as Record<string, unknown>;

    if (typeof json !== 'object' || json === null) {
      throw GhcrError.invalidManifest('Manifest is not an object');
    }

    if (json['schemaVersion'] !== 2) {
      throw GhcrError.invalidManifest('Invalid schema version');
    }

    // Set media type if not present
    if (!json['mediaType']) {
      (json as Record<string, unknown>)['mediaType'] = mediaType;
    }

    // Determine type based on content
    if ('config' in json && 'layers' in json) {
      return json as unknown as ImageManifest;
    }

    if ('manifests' in json) {
      return json as unknown as ImageIndex;
    }

    throw GhcrError.invalidManifest('Unknown manifest type');
  }

  /**
   * Calculates the digest of content.
   */
  private calculateDigest(content: string): string {
    const hash = createHash('sha256').update(content).digest('hex');
    return `sha256:${hash}`;
  }
}
