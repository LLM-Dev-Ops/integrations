/**
 * Docker service for OCI registry operations.
 * @module services/docker
 */

import type { ArtifactRegistryClient } from '../client/client.js';
import type { DockerTokenProvider } from '../auth/docker-token.js';
import type { ImageReference } from '../types/common.js';
import {
  getRegistryUrl,
  getFullImageName,
  getReferenceString,
  formatImageReference,
} from '../types/common.js';
import type {
  Manifest,
  SingleManifest,
  Platform,
  TagListResponse,
  BlobInfo,
  PutManifestResponse,
} from '../types/manifest.js';
import {
  isMultiPlatformManifest,
  findPlatformManifest,
  getDefaultPlatform,
  CHUNK_SIZE,
  CHUNKED_UPLOAD_THRESHOLD,
} from '../types/manifest.js';
import { ArtifactRegistryError, ArtifactRegistryErrorKind } from '../errors.js';
import { httpRequestRaw } from '../client/http.js';
import { createHash } from 'crypto';

/**
 * Service for Docker/OCI registry operations.
 */
export class DockerService {
  private readonly tokenProvider: DockerTokenProvider;

  constructor(_client: ArtifactRegistryClient, tokenProvider: DockerTokenProvider) {
    this.tokenProvider = tokenProvider;
  }

  // ============================================================
  // Manifest Operations
  // ============================================================

  /**
   * Gets a manifest for an image.
   *
   * @param image - Image reference
   * @returns Manifest (single or multi-platform)
   */
  async getManifest(image: ImageReference): Promise<Manifest> {
    const token = await this.tokenProvider.getToken(image, ['pull']);
    const registryUrl = getRegistryUrl(image);
    const imageName = getFullImageName(image);
    const reference = getReferenceString(image);

    const url = `https://${registryUrl}/v2/${imageName}/manifests/${reference}`;

    const response = await httpRequestRaw('GET', url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': [
          'application/vnd.docker.distribution.manifest.v2+json',
          'application/vnd.docker.distribution.manifest.list.v2+json',
          'application/vnd.oci.image.manifest.v1+json',
          'application/vnd.oci.image.index.v1+json',
        ].join(', '),
      },
    });

    if (!response.ok) {
      throw await this.parseRegistryError(response, image);
    }

    return response.json() as Promise<Manifest>;
  }

  /**
   * Gets a manifest for a specific platform from a multi-platform image.
   *
   * @param image - Image reference
   * @param platform - Target platform (defaults to current system)
   * @returns Single manifest for the platform
   */
  async getManifestForPlatform(
    image: ImageReference,
    platform?: Platform
  ): Promise<SingleManifest> {
    const manifest = await this.getManifest(image);

    if (!isMultiPlatformManifest(manifest)) {
      return manifest as SingleManifest;
    }

    const targetPlatform = platform ?? getDefaultPlatform();
    const platformManifest = findPlatformManifest(manifest, targetPlatform);

    if (!platformManifest) {
      const available = manifest.manifests
        .filter(m => m.platform)
        .map(m => m.platform!);

      throw ArtifactRegistryError.platformNotFound(targetPlatform, available);
    }

    // Fetch the platform-specific manifest by digest
    const platformImage: ImageReference = {
      ...image,
      reference: { type: 'digest', value: platformManifest.digest },
    };

    return this.getManifest(platformImage) as Promise<SingleManifest>;
  }

  /**
   * Checks if a manifest exists.
   *
   * @param image - Image reference
   * @returns True if manifest exists
   */
  async manifestExists(image: ImageReference): Promise<boolean> {
    const token = await this.tokenProvider.getToken(image, ['pull']);
    const registryUrl = getRegistryUrl(image);
    const imageName = getFullImageName(image);
    const reference = getReferenceString(image);

    const url = `https://${registryUrl}/v2/${imageName}/manifests/${reference}`;

    const response = await httpRequestRaw('HEAD', url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': [
          'application/vnd.docker.distribution.manifest.v2+json',
          'application/vnd.docker.distribution.manifest.list.v2+json',
          'application/vnd.oci.image.manifest.v1+json',
          'application/vnd.oci.image.index.v1+json',
        ].join(', '),
      },
    });

    return response.ok;
  }

  /**
   * Puts a manifest (push).
   *
   * @param image - Image reference
   * @param manifest - Manifest to push
   * @returns Push result with digest
   */
  async putManifest(
    image: ImageReference,
    manifest: Manifest
  ): Promise<PutManifestResponse> {
    const token = await this.tokenProvider.getToken(image, ['push', 'pull']);
    const registryUrl = getRegistryUrl(image);
    const imageName = getFullImageName(image);
    const reference = getReferenceString(image);

    const body = JSON.stringify(manifest);
    const url = `https://${registryUrl}/v2/${imageName}/manifests/${reference}`;

    const response = await httpRequestRaw('PUT', url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': manifest.mediaType,
      },
      body,
    });

    if (!response.ok) {
      throw await this.parseRegistryError(response, image);
    }

    const digest = response.headers.get('Docker-Content-Digest') ||
      `sha256:${createHash('sha256').update(body).digest('hex')}`;

    return {
      digest,
      location: response.headers.get('Location') || undefined,
    };
  }

  /**
   * Deletes a manifest.
   *
   * @param image - Image reference (must use digest)
   */
  async deleteManifest(image: ImageReference): Promise<void> {
    if (image.reference.type !== 'digest') {
      throw new ArtifactRegistryError(
        ArtifactRegistryErrorKind.InvalidConfiguration,
        'Manifest deletion requires a digest reference'
      );
    }

    const token = await this.tokenProvider.getToken(image, ['push', 'pull']);
    const registryUrl = getRegistryUrl(image);
    const imageName = getFullImageName(image);
    const reference = getReferenceString(image);

    const url = `https://${registryUrl}/v2/${imageName}/manifests/${reference}`;

    const response = await httpRequestRaw('DELETE', url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok && response.status !== 202) {
      throw await this.parseRegistryError(response, image);
    }
  }

  // ============================================================
  // Tag Operations (Docker Registry API)
  // ============================================================

  /**
   * Lists tags for an image using Docker Registry API.
   *
   * @param image - Image reference (tag/digest is ignored)
   * @returns List of tags
   */
  async listTags(image: ImageReference): Promise<string[]> {
    const token = await this.tokenProvider.getToken(image, ['pull']);
    const registryUrl = getRegistryUrl(image);
    const imageName = getFullImageName(image);

    const url = `https://${registryUrl}/v2/${imageName}/tags/list`;

    const response = await httpRequestRaw('GET', url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw await this.parseRegistryError(response, image);
    }

    const data = await response.json() as TagListResponse;
    return data.tags ?? [];
  }

  // ============================================================
  // Blob Operations
  // ============================================================

  /**
   * Checks if a blob exists.
   *
   * @param image - Image reference
   * @param digest - Blob digest
   * @returns Blob info if exists, undefined otherwise
   */
  async checkBlob(image: ImageReference, digest: string): Promise<BlobInfo | undefined> {
    const token = await this.tokenProvider.getToken(image, ['pull']);
    const registryUrl = getRegistryUrl(image);
    const imageName = getFullImageName(image);

    const url = `https://${registryUrl}/v2/${imageName}/blobs/${digest}`;

    const response = await httpRequestRaw('HEAD', url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (response.status === 404) {
      return undefined;
    }

    if (!response.ok) {
      throw await this.parseRegistryError(response, image);
    }

    const size = parseInt(response.headers.get('Content-Length') || '0', 10);
    const actualDigest = response.headers.get('Docker-Content-Digest') || digest;

    return {
      digest: actualDigest,
      size,
    };
  }

  /**
   * Downloads a blob.
   *
   * @param image - Image reference
   * @param digest - Blob digest
   * @returns Blob data
   */
  async downloadBlob(image: ImageReference, digest: string): Promise<Uint8Array> {
    const token = await this.tokenProvider.getToken(image, ['pull']);
    const registryUrl = getRegistryUrl(image);
    const imageName = getFullImageName(image);

    const url = `https://${registryUrl}/v2/${imageName}/blobs/${digest}`;

    const response = await httpRequestRaw('GET', url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw await this.parseRegistryError(response, image);
    }

    const data = new Uint8Array(await response.arrayBuffer());

    // Verify digest
    const actualDigest = `sha256:${createHash('sha256').update(data).digest('hex')}`;
    if (actualDigest !== digest) {
      throw ArtifactRegistryError.digestMismatch(digest, actualDigest);
    }

    return data;
  }

  /**
   * Uploads a blob (monolithic upload).
   *
   * @param image - Image reference
   * @param data - Blob data
   * @returns Blob digest
   */
  async uploadBlob(image: ImageReference, data: Uint8Array): Promise<string> {
    const digest = `sha256:${createHash('sha256').update(data).digest('hex')}`;

    // Check if blob already exists
    const existing = await this.checkBlob(image, digest);
    if (existing) {
      return digest;
    }

    // Use chunked upload for large blobs
    if (data.length > CHUNKED_UPLOAD_THRESHOLD) {
      return this.uploadBlobChunked(image, data, digest);
    }

    return this.uploadBlobMonolithic(image, data, digest);
  }

  /**
   * Uploads a blob using monolithic upload.
   */
  private async uploadBlobMonolithic(
    image: ImageReference,
    data: Uint8Array,
    digest: string
  ): Promise<string> {
    const token = await this.tokenProvider.getToken(image, ['push', 'pull']);
    const registryUrl = getRegistryUrl(image);
    const imageName = getFullImageName(image);

    // Initiate upload
    const initUrl = `https://${registryUrl}/v2/${imageName}/blobs/uploads/`;

    const initResponse = await httpRequestRaw('POST', initUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!initResponse.ok) {
      throw await this.parseRegistryError(initResponse, image);
    }

    const uploadUrl = initResponse.headers.get('Location');
    if (!uploadUrl) {
      throw ArtifactRegistryError.uploadFailed('No upload location returned');
    }

    // Complete upload
    const separator = uploadUrl.includes('?') ? '&' : '?';
    const completeUrl = `${uploadUrl}${separator}digest=${encodeURIComponent(digest)}`;

    const completeResponse = await httpRequestRaw('PUT', completeUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(data.length),
      },
      body: data,
    });

    if (!completeResponse.ok) {
      throw await this.parseRegistryError(completeResponse, image);
    }

    return digest;
  }

  /**
   * Uploads a blob using chunked upload.
   */
  private async uploadBlobChunked(
    image: ImageReference,
    data: Uint8Array,
    digest: string
  ): Promise<string> {
    const token = await this.tokenProvider.getToken(image, ['push', 'pull']);
    const registryUrl = getRegistryUrl(image);
    const imageName = getFullImageName(image);

    // Initiate upload
    const initUrl = `https://${registryUrl}/v2/${imageName}/blobs/uploads/`;

    const initResponse = await httpRequestRaw('POST', initUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!initResponse.ok) {
      throw await this.parseRegistryError(initResponse, image);
    }

    let uploadUrl = initResponse.headers.get('Location');
    if (!uploadUrl) {
      throw ArtifactRegistryError.uploadFailed('No upload location returned');
    }

    // Upload chunks
    let offset = 0;
    while (offset < data.length) {
      const end = Math.min(offset + CHUNK_SIZE, data.length);
      const chunk = data.slice(offset, end);

      const response = await httpRequestRaw('PATCH', uploadUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
          'Content-Range': `${offset}-${end - 1}`,
          'Content-Length': String(chunk.length),
        },
        body: chunk,
      });

      if (response.status !== 202) {
        throw await this.parseRegistryError(response, image);
      }

      uploadUrl = response.headers.get('Location') || uploadUrl;
      offset = end;
    }

    // Complete upload
    const separator = uploadUrl.includes('?') ? '&' : '?';
    const completeUrl = `${uploadUrl}${separator}digest=${encodeURIComponent(digest)}`;

    const completeResponse = await httpRequestRaw('PUT', completeUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Length': '0',
      },
    });

    if (!completeResponse.ok) {
      throw await this.parseRegistryError(completeResponse, image);
    }

    return digest;
  }

  /**
   * Mounts a blob from another repository.
   *
   * @param image - Target image reference
   * @param digest - Blob digest to mount
   * @param fromRepository - Source repository (project/repository/image)
   * @returns True if mounted, false if needs upload
   */
  async mountBlob(
    image: ImageReference,
    digest: string,
    fromRepository: string
  ): Promise<boolean> {
    const token = await this.tokenProvider.getToken(image, ['push', 'pull']);
    const registryUrl = getRegistryUrl(image);
    const imageName = getFullImageName(image);

    const url = new URL(`https://${registryUrl}/v2/${imageName}/blobs/uploads/`);
    url.searchParams.set('mount', digest);
    url.searchParams.set('from', fromRepository);

    const response = await httpRequestRaw('POST', url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    // 201 = mounted, 202 = mount failed, upload initiated
    return response.status === 201;
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  /**
   * Parses a registry error response.
   */
  private async parseRegistryError(
    response: Response,
    image: ImageReference
  ): Promise<ArtifactRegistryError> {
    const status = response.status;
    let body: unknown;

    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }

    if (typeof body === 'object' && body !== null && 'errors' in body) {
      const errors = (body as { errors: unknown }).errors;
      if (Array.isArray(errors)) {
        return ArtifactRegistryError.fromRegistryError(errors);
      }
    }

    const imageStr = formatImageReference(image);

    if (status === 404) {
      return ArtifactRegistryError.manifestNotFound(imageStr);
    }

    if (status === 401) {
      return new ArtifactRegistryError(
        ArtifactRegistryErrorKind.TokenExpired,
        `Authentication failed for ${imageStr}`,
        { statusCode: 401 }
      );
    }

    if (status === 403) {
      return ArtifactRegistryError.permissionDenied(imageStr);
    }

    return ArtifactRegistryError.fromHttpStatus(
      status,
      `Registry error for ${imageStr}: ${JSON.stringify(body)}`
    );
  }
}
