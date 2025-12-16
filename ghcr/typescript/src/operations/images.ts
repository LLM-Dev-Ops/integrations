/**
 * Image operations for GitHub Container Registry.
 * @module operations/images
 */

import type { GhcrClient } from '../client.js';
import { GhcrError, GhcrErrorKind } from '../errors.js';
import type {
  ImageRef,
  Manifest,
  ImageManifest,
  Platform,
  Descriptor,
} from '../types/mod.js';
import {
  ImageRef as ImageRefUtils,
  Reference,
  isImageManifest,
  isImageIndex,
  ManifestUtils,
} from '../types/mod.js';
import type { ManifestOps, ManifestWithDigest } from './manifests.js';
import type { BlobOps } from './blobs.js';

/**
 * Image operations interface.
 */
export interface ImageOps {
  /**
   * Checks if an image exists.
   */
  exists(image: ImageRef): Promise<boolean>;

  /**
   * Pulls an image manifest.
   */
  pullManifest(image: ImageRef): Promise<ManifestWithDigest>;

  /**
   * Pushes an image manifest.
   */
  pushManifest(image: ImageRef, manifest: Manifest): Promise<string>;

  /**
   * Deletes an image by reference.
   */
  deleteImage(image: ImageRef): Promise<void>;

  /**
   * Copies an image from source to target.
   */
  copyImage(source: ImageRef, target: ImageRef): Promise<string>;

  /**
   * Gets a platform-specific manifest from an index.
   */
  getPlatformManifest(
    image: ImageRef,
    platform: Platform
  ): Promise<ManifestWithDigest>;
}

/**
 * Creates image operations.
 */
export function createImageOps(
  client: GhcrClient,
  manifestOps: ManifestOps,
  blobOps: BlobOps
): ImageOps {
  return new ImageOpsImpl(client, manifestOps, blobOps);
}

/**
 * Image operations implementation.
 */
class ImageOpsImpl implements ImageOps {
  private readonly client: GhcrClient;
  private readonly manifestOps: ManifestOps;
  private readonly blobOps: BlobOps;

  constructor(
    client: GhcrClient,
    manifestOps: ManifestOps,
    blobOps: BlobOps
  ) {
    this.client = client;
    this.manifestOps = manifestOps;
    this.blobOps = blobOps;
  }

  async exists(image: ImageRef): Promise<boolean> {
    return this.manifestOps.exists(image);
  }

  async pullManifest(image: ImageRef): Promise<ManifestWithDigest> {
    return this.manifestOps.get(image);
  }

  async pushManifest(image: ImageRef, manifest: Manifest): Promise<string> {
    return this.manifestOps.put(image, manifest);
  }

  async deleteImage(image: ImageRef): Promise<void> {
    return this.manifestOps.delete(image);
  }

  async copyImage(source: ImageRef, target: ImageRef): Promise<string> {
    // Get source manifest
    const result = await this.manifestOps.get(source);

    // Copy all blobs
    await this.copyBlobs(source, target, result.manifest);

    // Push manifest to target
    return this.manifestOps.put(target, result.manifest);
  }

  async getPlatformManifest(
    image: ImageRef,
    platform: Platform
  ): Promise<ManifestWithDigest> {
    return this.manifestOps.getPlatform(image, platform);
  }

  /**
   * Copies all blobs from a manifest.
   */
  private async copyBlobs(
    source: ImageRef,
    target: ImageRef,
    manifest: Manifest
  ): Promise<void> {
    const blobs = this.collectBlobs(manifest);

    // Copy each blob
    for (const descriptor of blobs) {
      await this.copyBlob(source, target, descriptor);
    }
  }

  /**
   * Copies a single blob from source to target.
   */
  private async copyBlob(
    source: ImageRef,
    target: ImageRef,
    descriptor: Descriptor
  ): Promise<void> {
    // Try to mount first
    const mounted = await this.blobOps.mount(source, target, descriptor.digest);

    if (!mounted) {
      // Mount failed, need to copy
      const data = await this.blobOps.get(source, descriptor.digest);
      await this.blobOps.upload(target, data);
    }
  }

  /**
   * Collects all blob descriptors from a manifest.
   */
  private collectBlobs(manifest: Manifest): Descriptor[] {
    const blobs: Descriptor[] = [];

    if (isImageManifest(manifest)) {
      // Add config
      blobs.push(manifest.config);

      // Add layers
      blobs.push(...manifest.layers);
    } else if (isImageIndex(manifest)) {
      // Index doesn't have blobs directly
      // Individual platform manifests would need to be copied separately
    }

    return blobs;
  }
}
