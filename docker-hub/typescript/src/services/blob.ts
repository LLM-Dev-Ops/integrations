/**
 * Docker Hub Blob Service
 *
 * Handles Docker Registry API v2 blob operations for image layers and configs.
 *
 * Key Operations:
 * - Check blob existence (HEAD)
 * - Download blobs (GET)
 * - Upload blobs with digest verification
 * - Chunked uploads for large blobs
 * - Cross-repository blob mounting
 *
 * Blob Upload Flow:
 * 1. Compute SHA256 digest of data
 * 2. Check if blob already exists (skip if exists)
 * 3. For small blobs (< chunkSize): Single PUT
 * 4. For large blobs: POST → PATCH chunks → PUT complete
 * 5. Verify digest on completion
 *
 * @module services/blob
 */

import type { DockerHubClient, HttpResponse } from '../client.js';
import type { DockerHubConfig } from '../config.js';
import type { ImageReference } from '../types/index.js';
import {
  DockerHubError,
  DockerHubErrorKind,
  BlobNotFoundError,
  BlobUploadError,
  BlobDigestMismatchError,
} from '../errors.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default chunk size for blob uploads (5MB).
 */
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;

/**
 * Media type for blob data.
 */
const BLOB_MEDIA_TYPE = 'application/octet-stream';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Computes SHA256 digest of data using Web Crypto API.
 *
 * @param data - Data to hash
 * @returns Digest in format "sha256:hexstring"
 */
export async function computeDigest(data: Uint8Array): Promise<string> {
  // Use Web Crypto API for SHA256
  const hashBuffer = await crypto.subtle.digest('SHA-256', data as BufferSource);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `sha256:${hashHex}`;
}

/**
 * Builds a registry scope for blob operations.
 *
 * @param image - Image reference
 * @param actions - Array of actions (pull, push)
 * @returns Registry scope string
 */
function buildScope(image: ImageReference, actions: string[]): string {
  return `repository:${image.namespace}/${image.repository}:${actions.join(',')}`;
}

/**
 * Builds the full repository name.
 *
 * @param image - Image reference
 * @returns Full repository name (namespace/repository)
 */
function getRepositoryName(image: ImageReference): string {
  return `${image.namespace}/${image.repository}`;
}

// ============================================================================
// Service Interface
// ============================================================================

/**
 * Blob service interface for Docker Registry API v2 blob operations.
 */
export interface BlobService {
  /**
   * Checks if a blob exists in the registry.
   *
   * @param image - Image reference
   * @param digest - Blob digest (sha256:...)
   * @returns True if blob exists, false otherwise
   */
  exists(image: ImageReference, digest: string): Promise<boolean>;

  /**
   * Downloads a blob from the registry.
   *
   * @param image - Image reference
   * @param digest - Blob digest (sha256:...)
   * @returns Blob data as Uint8Array
   * @throws BlobNotFoundError if blob doesn't exist
   * @throws BlobDigestMismatchError if downloaded data doesn't match digest
   */
  get(image: ImageReference, digest: string): Promise<Uint8Array>;

  /**
   * Downloads a blob as a readable stream.
   *
   * @param image - Image reference
   * @param digest - Blob digest (sha256:...)
   * @returns Readable stream of blob data
   * @throws BlobNotFoundError if blob doesn't exist
   */
  getStream(image: ImageReference, digest: string): Promise<ReadableStream<Uint8Array>>;

  /**
   * Uploads a blob to the registry.
   *
   * Automatically computes digest and skips upload if blob already exists.
   * Uses single PUT for small blobs, chunked upload for large blobs.
   *
   * @param image - Image reference
   * @param data - Blob data to upload
   * @returns Digest of uploaded blob (sha256:...)
   * @throws BlobUploadError if upload fails
   */
  upload(image: ImageReference, data: Uint8Array): Promise<string>;

  /**
   * Uploads a blob using chunked transfer.
   *
   * Useful for large blobs that should be uploaded in multiple parts.
   *
   * @param image - Image reference
   * @param data - Blob data to upload
   * @param chunkSize - Size of each chunk in bytes (default: 5MB)
   * @returns Digest of uploaded blob (sha256:...)
   * @throws BlobUploadError if upload fails
   */
  uploadChunked(
    image: ImageReference,
    data: Uint8Array,
    chunkSize?: number
  ): Promise<string>;

  /**
   * Mounts a blob from another repository.
   *
   * This is an optimization to avoid re-uploading identical layers.
   * If the registry supports cross-repository blob mounting and the blob
   * exists in the source repository, it will be linked to the target repository.
   *
   * @param image - Target image reference
   * @param digest - Blob digest to mount (sha256:...)
   * @param fromImage - Source image reference containing the blob
   * @returns True if blob was mounted, false if upload is needed
   */
  mount(
    image: ImageReference,
    digest: string,
    fromImage: ImageReference
  ): Promise<boolean>;
}

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Blob service implementation.
 */
export class BlobServiceImpl implements BlobService {
  constructor(
    private readonly client: DockerHubClient,
    private readonly config: DockerHubConfig
  ) {}

  /**
   * Checks if a blob exists.
   */
  async exists(image: ImageReference, digest: string): Promise<boolean> {
    const scope = buildScope(image, ['pull']);
    const path = `/v2/${getRepositoryName(image)}/blobs/${digest}`;

    try {
      const response = await this.client.executeRegistryRequest<void>(
        {
          method: 'HEAD',
          path,
        },
        scope
      );

      return response.status === 200;
    } catch (error) {
      // 404 means blob doesn't exist
      if (
        error instanceof DockerHubError &&
        error.kind === DockerHubErrorKind.BlobNotFound
      ) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Downloads a blob.
   */
  async get(image: ImageReference, digest: string): Promise<Uint8Array> {
    const scope = buildScope(image, ['pull']);
    const path = `/v2/${getRepositoryName(image)}/blobs/${digest}`;

    try {
      const response = await this.client.executeRegistryRequest<ArrayBuffer>(
        {
          method: 'GET',
          path,
          headers: {
            Accept: BLOB_MEDIA_TYPE,
          },
        },
        scope
      );

      if (response.status !== 200) {
        throw new BlobNotFoundError(digest);
      }

      const data = new Uint8Array(response.data);

      // Verify digest
      const actualDigest = await computeDigest(data);
      if (actualDigest !== digest) {
        throw new BlobDigestMismatchError(digest, actualDigest);
      }

      return data;
    } catch (error) {
      if (
        error instanceof DockerHubError &&
        error.kind === DockerHubErrorKind.BlobNotFound
      ) {
        throw new BlobNotFoundError(digest);
      }
      throw error;
    }
  }

  /**
   * Downloads a blob as a stream.
   */
  async getStream(
    image: ImageReference,
    digest: string
  ): Promise<ReadableStream<Uint8Array>> {
    const scope = buildScope(image, ['pull']);
    const path = `/v2/${getRepositoryName(image)}/blobs/${digest}`;

    try {
      // Note: Actual streaming implementation would use fetch directly
      // For now, we'll download and create a stream from the data
      const data = await this.get(image, digest);

      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });
    } catch (error) {
      if (
        error instanceof DockerHubError &&
        error.kind === DockerHubErrorKind.BlobNotFound
      ) {
        throw new BlobNotFoundError(digest);
      }
      throw error;
    }
  }

  /**
   * Uploads a blob.
   */
  async upload(image: ImageReference, data: Uint8Array): Promise<string> {
    // Compute digest first
    const digest = await computeDigest(data);

    // Check if blob already exists (optimization)
    const exists = await this.exists(image, digest);
    if (exists) {
      return digest;
    }

    // Determine upload strategy based on size
    const chunkSize = this.config.chunkSize ?? DEFAULT_CHUNK_SIZE;

    if (data.length <= chunkSize) {
      // Small blob: single PUT
      return this.uploadSingle(image, data, digest);
    } else {
      // Large blob: chunked upload
      return this.uploadChunked(image, data, chunkSize);
    }
  }

  /**
   * Uploads a blob using chunked transfer.
   */
  async uploadChunked(
    image: ImageReference,
    data: Uint8Array,
    chunkSize: number = DEFAULT_CHUNK_SIZE
  ): Promise<string> {
    // Compute digest
    const digest = await computeDigest(data);

    // Check if blob already exists
    const exists = await this.exists(image, digest);
    if (exists) {
      return digest;
    }

    const scope = buildScope(image, ['pull', 'push']);

    // Step 1: Initiate upload
    const uploadUrl = await this.initiateUpload(image, scope);

    // Step 2: Upload chunks
    let currentUrl = uploadUrl;
    let offset = 0;

    while (offset < data.length) {
      const chunkEnd = Math.min(offset + chunkSize, data.length);
      const chunk = data.slice(offset, chunkEnd);

      currentUrl = await this.uploadChunk(currentUrl, chunk, offset, chunkEnd - 1, scope);
      offset = chunkEnd;
    }

    // Step 3: Complete upload
    await this.completeUpload(currentUrl, digest, scope);

    return digest;
  }

  /**
   * Mounts a blob from another repository.
   */
  async mount(
    image: ImageReference,
    digest: string,
    fromImage: ImageReference
  ): Promise<boolean> {
    const scope = buildScope(image, ['pull', 'push']);
    const fromRepo = getRepositoryName(fromImage);
    const path = `/v2/${getRepositoryName(image)}/blobs/uploads/?mount=${digest}&from=${fromRepo}`;

    try {
      const response = await this.client.executeRegistryRequest<void>(
        {
          method: 'POST',
          path,
        },
        scope
      );

      // 201 Created means blob was mounted successfully
      if (response.status === 201) {
        return true;
      }

      // 202 Accepted means mount not supported or blob not found, need to upload
      if (response.status === 202) {
        return false;
      }

      throw new BlobUploadError(`Unexpected mount response: ${response.status}`);
    } catch (error) {
      if (error instanceof DockerHubError) {
        throw error;
      }
      throw new BlobUploadError(`Failed to mount blob: ${(error as Error).message}`);
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Uploads a small blob in a single PUT request.
   */
  private async uploadSingle(
    image: ImageReference,
    data: Uint8Array,
    digest: string
  ): Promise<string> {
    const scope = buildScope(image, ['pull', 'push']);

    // Initiate upload
    const uploadUrl = await this.initiateUpload(image, scope);

    // Complete upload with data
    const completeUrl = `${uploadUrl}?digest=${encodeURIComponent(digest)}`;

    try {
      const response = await this.executeRawRegistryRequest(
        {
          method: 'PUT',
          url: completeUrl,
          headers: {
            'Content-Type': BLOB_MEDIA_TYPE,
            'Content-Length': data.length.toString(),
          },
          body: data,
        },
        scope
      );

      if (response.status !== 201) {
        throw new BlobUploadError(`Upload failed with status ${response.status}`);
      }

      return digest;
    } catch (error) {
      if (error instanceof DockerHubError) {
        throw error;
      }
      throw new BlobUploadError(`Failed to upload blob: ${(error as Error).message}`);
    }
  }

  /**
   * Initiates a blob upload session.
   *
   * @returns Upload URL from Location header
   */
  private async initiateUpload(image: ImageReference, scope: string): Promise<string> {
    const path = `/v2/${getRepositoryName(image)}/blobs/uploads/`;

    try {
      const response = await this.client.executeRegistryRequest<void>(
        {
          method: 'POST',
          path,
        },
        scope
      );

      if (response.status !== 202) {
        throw new BlobUploadError(
          `Unexpected initiate response: ${response.status}`
        );
      }

      const location = response.headers.get('Location');
      if (!location) {
        throw new BlobUploadError('Missing Location header in upload initiation');
      }

      return location;
    } catch (error) {
      if (error instanceof DockerHubError) {
        throw error;
      }
      throw new BlobUploadError(
        `Failed to initiate upload: ${(error as Error).message}`
      );
    }
  }

  /**
   * Uploads a chunk of data.
   *
   * @param uploadUrl - Current upload URL
   * @param chunk - Chunk data
   * @param startOffset - Start byte offset
   * @param endOffset - End byte offset (inclusive)
   * @param scope - Registry scope
   * @returns Updated upload URL from Location header
   */
  private async uploadChunk(
    uploadUrl: string,
    chunk: Uint8Array,
    startOffset: number,
    endOffset: number,
    scope: string
  ): Promise<string> {
    try {
      const response = await this.executeRawRegistryRequest(
        {
          method: 'PATCH',
          url: uploadUrl,
          headers: {
            'Content-Type': BLOB_MEDIA_TYPE,
            'Content-Length': chunk.length.toString(),
            'Content-Range': `${startOffset}-${endOffset}`,
          },
          body: chunk,
        },
        scope
      );

      if (response.status !== 202) {
        throw new BlobUploadError(
          `Chunk upload failed with status ${response.status}`
        );
      }

      const location = response.headers.get('Location');
      if (!location) {
        throw new BlobUploadError('Missing Location header in chunk upload');
      }

      return location;
    } catch (error) {
      if (error instanceof DockerHubError) {
        throw error;
      }
      throw new BlobUploadError(
        `Failed to upload chunk: ${(error as Error).message}`
      );
    }
  }

  /**
   * Completes a chunked upload.
   *
   * @param uploadUrl - Current upload URL
   * @param digest - Expected digest
   * @param scope - Registry scope
   */
  private async completeUpload(
    uploadUrl: string,
    digest: string,
    scope: string
  ): Promise<void> {
    const completeUrl = `${uploadUrl}?digest=${encodeURIComponent(digest)}`;

    try {
      const response = await this.executeRawRegistryRequest(
        {
          method: 'PUT',
          url: completeUrl,
          headers: {
            'Content-Length': '0',
          },
        },
        scope
      );

      if (response.status !== 201) {
        throw new BlobUploadError(
          `Upload completion failed with status ${response.status}`
        );
      }
    } catch (error) {
      if (error instanceof DockerHubError) {
        throw error;
      }
      throw new BlobUploadError(
        `Failed to complete upload: ${(error as Error).message}`
      );
    }
  }

  /**
   * Executes a raw registry request with a full URL.
   *
   * This is a helper for upload operations that use Location URLs.
   */
  private async executeRawRegistryRequest(
    options: {
      method: string;
      url: string;
      headers?: Record<string, string>;
      body?: Uint8Array | ArrayBuffer;
    },
    scope: string
  ): Promise<HttpResponse<void>> {
    // Note: This is a simplified implementation
    // In a real implementation, this would use the client's auth mechanism
    // For now, we'll extract the path from the URL and use executeRegistryRequest

    // Parse URL to extract path
    const url = new URL(options.url);
    const path = url.pathname + url.search;

    return this.client.executeRegistryRequest<void>(
      {
        method: options.method as any,
        path,
        headers: options.headers,
        body: options.body,
      },
      scope
    );
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a blob service instance.
 *
 * @param client - Docker Hub client
 * @param config - Docker Hub configuration
 * @returns BlobService implementation
 */
export function createBlobService(
  client: DockerHubClient,
  config: DockerHubConfig
): BlobService {
  return new BlobServiceImpl(client, config);
}
