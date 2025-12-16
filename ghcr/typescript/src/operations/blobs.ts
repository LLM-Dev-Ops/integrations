/**
 * Blob operations for GitHub Container Registry.
 * @module operations/blobs
 */

import { createHash } from 'crypto';
import type { GhcrClient } from '../client.js';
import type { GhcrConfig } from '../config.js';
import { GhcrError, GhcrErrorKind } from '../errors.js';
import type { ImageRef } from '../types/mod.js';

/**
 * Blob operations interface.
 */
export interface BlobOps {
  /**
   * Checks if a blob exists.
   */
  exists(image: ImageRef, digest: string): Promise<boolean>;

  /**
   * Gets blob content.
   */
  get(image: ImageRef, digest: string): Promise<Uint8Array>;

  /**
   * Gets blob metadata without content.
   */
  head(image: ImageRef, digest: string): Promise<BlobHeadResult>;

  /**
   * Uploads a blob from bytes.
   */
  upload(image: ImageRef, data: Uint8Array): Promise<string>;

  /**
   * Uploads a blob with chunked upload.
   */
  uploadChunked(image: ImageRef, data: Uint8Array): Promise<string>;

  /**
   * Mounts a blob from another repository.
   */
  mount(source: ImageRef, target: ImageRef, digest: string): Promise<boolean>;
}

/**
 * Result of a HEAD request for a blob.
 */
export interface BlobHeadResult {
  readonly exists: boolean;
  readonly digest?: string;
  readonly size?: number;
}

/**
 * Creates blob operations.
 */
export function createBlobOps(client: GhcrClient): BlobOps {
  return new BlobOpsImpl(client);
}

/**
 * Blob operations implementation.
 */
class BlobOpsImpl implements BlobOps {
  private readonly client: GhcrClient;
  private readonly config: GhcrConfig;

  constructor(client: GhcrClient) {
    this.client = client;
    this.config = client.getConfig();
  }

  async exists(image: ImageRef, digest: string): Promise<boolean> {
    try {
      const result = await this.head(image, digest);
      return result.exists;
    } catch (error) {
      if (error instanceof GhcrError && error.kind === GhcrErrorKind.NotFound) {
        return false;
      }
      throw error;
    }
  }

  async get(image: ImageRef, digest: string): Promise<Uint8Array> {
    const path = `/v2/${image.name}/blobs/${digest}`;

    const response = await this.client.registryGet<ArrayBuffer>(path, {
      headers: {
        'Accept': 'application/octet-stream',
      },
    });

    // Verify digest
    const data = new Uint8Array(response.data as ArrayBuffer);
    const actualDigest = this.calculateDigest(data);

    if (actualDigest !== digest) {
      throw GhcrError.digestMismatch(digest, actualDigest);
    }

    return data;
  }

  async head(image: ImageRef, digest: string): Promise<BlobHeadResult> {
    const path = `/v2/${image.name}/blobs/${digest}`;

    try {
      const response = await this.client.registryHead(path);

      const returnedDigest = response.headers.get('Docker-Content-Digest') ?? undefined;
      const sizeStr = response.headers.get('Content-Length');
      const size = sizeStr ? parseInt(sizeStr, 10) : undefined;

      return {
        exists: true,
        digest: returnedDigest,
        size,
      };
    } catch (error) {
      if (error instanceof GhcrError && error.kind === GhcrErrorKind.NotFound) {
        return { exists: false };
      }
      throw error;
    }
  }

  async upload(image: ImageRef, data: Uint8Array): Promise<string> {
    const digest = this.calculateDigest(data);

    // Check if blob already exists
    if (await this.exists(image, digest)) {
      return digest;
    }

    // Use chunked upload for large blobs
    if (data.length > this.config.chunkSize) {
      return this.uploadChunked(image, data);
    }

    // Single-request upload (monolithic)
    return this.uploadMonolithic(image, data, digest);
  }

  async uploadChunked(image: ImageRef, data: Uint8Array): Promise<string> {
    const digest = this.calculateDigest(data);

    // Check if blob already exists
    if (await this.exists(image, digest)) {
      return digest;
    }

    // Start upload session
    const uploadUrl = await this.startUpload(image);

    // Upload in chunks
    let location = uploadUrl;
    let offset = 0;

    while (offset < data.length) {
      const end = Math.min(offset + this.config.chunkSize, data.length);
      const chunk = data.slice(offset, end);

      location = await this.uploadChunk(location, chunk, offset, end - 1, data.length);
      offset = end;
    }

    // Complete upload
    return this.completeUpload(location, digest);
  }

  async mount(source: ImageRef, target: ImageRef, digest: string): Promise<boolean> {
    const path = `/v2/${target.name}/blobs/uploads/`;
    const url = `${path}?mount=${encodeURIComponent(digest)}&from=${encodeURIComponent(source.name)}`;

    try {
      const response = await this.client.registryPost(url);

      // 201 Created = mount succeeded
      // 202 Accepted = mount failed, need to upload
      return response.status === 201;
    } catch (error) {
      if (error instanceof GhcrError && error.kind === GhcrErrorKind.NotFound) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Uploads a blob in a single request.
   */
  private async uploadMonolithic(
    image: ImageRef,
    data: Uint8Array,
    digest: string
  ): Promise<string> {
    const path = `/v2/${image.name}/blobs/uploads/?digest=${encodeURIComponent(digest)}`;

    const response = await this.client.registryPost(path, data as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': data.length.toString(),
      },
      timeout: this.config.uploadTimeout,
    });

    const returnedDigest = response.headers.get('Docker-Content-Digest');
    if (returnedDigest && returnedDigest !== digest) {
      throw GhcrError.digestMismatch(digest, returnedDigest);
    }

    return returnedDigest ?? digest;
  }

  /**
   * Starts an upload session.
   */
  private async startUpload(image: ImageRef): Promise<string> {
    const path = `/v2/${image.name}/blobs/uploads/`;

    const response = await this.client.registryPost(path);

    const location = response.headers.get('Location');
    if (!location) {
      throw GhcrError.uploadFailed('Missing Location header in upload response');
    }

    // Handle relative URLs
    if (location.startsWith('/')) {
      return `https://${this.config.registry}${location}`;
    }

    return location;
  }

  /**
   * Uploads a chunk of data.
   */
  private async uploadChunk(
    uploadUrl: string,
    chunk: Uint8Array,
    start: number,
    end: number,
    total: number
  ): Promise<string> {
    // GHCR expects PATCH for chunked uploads
    const response = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': chunk.length.toString(),
        'Content-Range': `${start}-${end}`,
      },
      body: chunk as unknown as BodyInit,
    });

    if (!response.ok) {
      throw GhcrError.uploadFailed(`Chunk upload failed: ${response.status}`);
    }

    const location = response.headers.get('Location');
    if (!location) {
      throw GhcrError.uploadFailed('Missing Location header in chunk response');
    }

    // Handle relative URLs
    if (location.startsWith('/')) {
      return `https://${this.config.registry}${location}`;
    }

    return location;
  }

  /**
   * Completes a chunked upload.
   */
  private async completeUpload(uploadUrl: string, digest: string): Promise<string> {
    // Add digest parameter
    const url = uploadUrl.includes('?')
      ? `${uploadUrl}&digest=${encodeURIComponent(digest)}`
      : `${uploadUrl}?digest=${encodeURIComponent(digest)}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Length': '0',
      },
    });

    if (!response.ok) {
      throw GhcrError.uploadFailed(`Upload completion failed: ${response.status}`);
    }

    const returnedDigest = response.headers.get('Docker-Content-Digest');
    if (returnedDigest && returnedDigest !== digest) {
      throw GhcrError.digestMismatch(digest, returnedDigest);
    }

    return returnedDigest ?? digest;
  }

  /**
   * Calculates the digest of data.
   */
  private calculateDigest(data: Uint8Array): string {
    const hash = createHash('sha256').update(data).digest('hex');
    return `sha256:${hash}`;
  }
}
