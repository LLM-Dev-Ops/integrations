/**
 * Manifest Service for Docker Hub Registry API v2
 *
 * Handles Docker Registry API v2 manifest operations including:
 * - GET /v2/{name}/manifests/{reference} - Get manifest
 * - PUT /v2/{name}/manifests/{reference} - Put manifest
 * - DELETE /v2/{name}/manifests/{reference} - Delete manifest
 * - HEAD /v2/{name}/manifests/{reference} - Check exists
 *
 * Supports multiple manifest types:
 * - Docker Manifest V2 Schema 2
 * - Docker Manifest List (multi-arch)
 * - OCI Image Manifest
 * - OCI Image Index
 *
 * @module services/manifest
 */

import {
  ImageReference,
  Manifest,
  ManifestV2,
  ManifestList,
  Platform,
  isManifestList,
  isManifestV2,
  findPlatformManifest,
} from '../types/index.js';
import {
  DockerHubError,
  DockerHubErrorKind,
} from '../errors.js';
import { DockerHubConfig } from '../config.js';

// ============================================================================
// Media Types for Docker Registry API v2
// ============================================================================

/**
 * Supported manifest media types.
 */
export const MANIFEST_MEDIA_TYPES = {
  /** Docker Manifest V2 Schema 2 */
  DOCKER_V2: 'application/vnd.docker.distribution.manifest.v2+json',
  /** Docker Manifest List (multi-arch) */
  DOCKER_LIST: 'application/vnd.docker.distribution.manifest.list.v2+json',
  /** OCI Image Manifest */
  OCI_MANIFEST: 'application/vnd.oci.image.manifest.v1+json',
  /** OCI Image Index (multi-arch) */
  OCI_INDEX: 'application/vnd.oci.image.index.v1+json',
} as const;

/**
 * Accept header value for manifest requests.
 * Includes all supported manifest types.
 */
export const MANIFEST_ACCEPT_HEADER = [
  MANIFEST_MEDIA_TYPES.DOCKER_V2,
  MANIFEST_MEDIA_TYPES.DOCKER_LIST,
  MANIFEST_MEDIA_TYPES.OCI_MANIFEST,
  MANIFEST_MEDIA_TYPES.OCI_INDEX,
].join(', ');

// ============================================================================
// Docker Hub Client Interface
// ============================================================================

/**
 * Minimal DockerHubClient interface required by ManifestService.
 * This allows the service to work with any client implementation.
 */
export interface DockerHubClient {
  /**
   * Gets the configuration.
   */
  readonly config: DockerHubConfig;

  /**
   * Executes an authenticated registry request.
   *
   * @param options - Request options
   * @param scope - Registry scope for authentication
   * @returns Response with data and headers
   */
  executeRegistryRequest<T = unknown>(
    options: RequestOptions,
    scope: string
  ): Promise<RegistryResponse<T>>;
}

/**
 * Request options for registry operations.
 */
export interface RequestOptions {
  /** HTTP method */
  method: 'GET' | 'PUT' | 'DELETE' | 'HEAD';
  /** Request path (relative to registry URL) */
  path: string;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Request body */
  body?: unknown;
}

/**
 * Registry response with headers and data.
 */
export interface RegistryResponse<T> {
  /** Response data */
  data: T;
  /** Response status code */
  status: number;
  /** Response headers */
  headers: Record<string, string>;
}

// ============================================================================
// Manifest Service Interface
// ============================================================================

/**
 * Result of getWithDigest operation.
 */
export interface ManifestWithDigest {
  /** The manifest */
  manifest: Manifest;
  /** Content digest from Docker-Content-Digest header */
  digest: string;
}

/**
 * Manifest service interface for Docker Hub Registry API v2 operations.
 */
export interface ManifestService {
  /**
   * Gets a manifest by reference (tag or digest).
   *
   * @param image - Image reference
   * @returns Manifest
   * @throws {DockerHubError} If manifest not found or request fails
   */
  get(image: ImageReference): Promise<Manifest>;

  /**
   * Gets a manifest along with its digest.
   * Useful for operations that need the canonical digest.
   *
   * @param image - Image reference
   * @returns Manifest and its digest
   * @throws {DockerHubError} If manifest not found or request fails
   */
  getWithDigest(image: ImageReference): Promise<ManifestWithDigest>;

  /**
   * Gets a platform-specific manifest from a multi-arch image.
   * If the image is already a single-platform manifest, returns it.
   * If it's a manifest list, fetches the specific platform manifest.
   *
   * @param image - Image reference
   * @param platform - Target platform (architecture, OS, variant)
   * @returns Platform-specific manifest
   * @throws {DockerHubError} If platform not found or request fails
   */
  getForPlatform(image: ImageReference, platform: Platform): Promise<ManifestV2>;

  /**
   * Pushes a manifest to the registry.
   * Creates or updates a tag with the specified manifest.
   *
   * @param image - Image reference (must use tag, not digest)
   * @param manifest - Manifest to push
   * @returns Content digest of the pushed manifest
   * @throws {DockerHubError} If push fails or image uses digest reference
   */
  put(image: ImageReference, manifest: Manifest): Promise<string>;

  /**
   * Deletes a manifest by digest.
   * If image reference uses a tag, it will be resolved to a digest first.
   *
   * Note: This deletes the manifest itself, not just the tag.
   * All tags pointing to this manifest will become invalid.
   *
   * @param image - Image reference
   * @throws {DockerHubError} If delete fails
   */
  delete(image: ImageReference): Promise<void>;

  /**
   * Checks if a manifest exists.
   *
   * @param image - Image reference
   * @returns True if manifest exists
   */
  exists(image: ImageReference): Promise<boolean>;
}

// ============================================================================
// Manifest Service Implementation
// ============================================================================

/**
 * Implementation of ManifestService for Docker Hub Registry API v2.
 */
export class ManifestServiceImpl implements ManifestService {
  constructor(
    private readonly client: DockerHubClient,
    private readonly config: DockerHubConfig
  ) {}

  /**
   * Builds the scope string for manifest operations.
   *
   * @param image - Image reference
   * @param actions - Array of actions (pull, push)
   * @returns Scope string (e.g., "repository:namespace/repo:pull,push")
   */
  private buildScope(image: ImageReference, actions: string[]): string {
    return `repository:${image.namespace}/${image.repository}:${actions.join(',')}`;
  }

  /**
   * Builds the manifest URL path.
   *
   * @param image - Image reference
   * @returns URL path
   */
  private buildManifestPath(image: ImageReference): string {
    const referenceValue = image.reference.type === 'tag'
      ? image.reference.value
      : image.reference.value;

    return `/v2/${image.namespace}/${image.repository}/manifests/${referenceValue}`;
  }

  /**
   * Parses a manifest from response body based on content type.
   *
   * @param body - Response body (string or object)
   * @param contentType - Content-Type header value
   * @returns Parsed manifest
   * @throws {DockerHubError} If parsing fails
   */
  private parseManifest(body: unknown, contentType: string): Manifest {
    try {
      // Parse JSON if body is string
      const manifest = typeof body === 'string' ? JSON.parse(body) : body;

      // Validate it has required fields
      if (!manifest || typeof manifest !== 'object') {
        throw new Error('Invalid manifest: not an object');
      }

      const m = manifest as Record<string, unknown>;

      // Check schema version
      if (m.schemaVersion !== 2) {
        throw DockerHubError.manifestSchemaNotSupported(
          `Schema version ${m.schemaVersion} not supported`
        );
      }

      // Determine manifest type based on content type and structure
      if (contentType.includes('manifest.list') || contentType.includes('image.index')) {
        // Manifest list / OCI Index
        if (!Array.isArray(m.manifests)) {
          throw new Error('Invalid manifest list: missing manifests array');
        }
        return manifest as ManifestList;
      } else {
        // Single-platform manifest (V2 or OCI)
        if (!m.config || !Array.isArray(m.layers)) {
          throw new Error('Invalid manifest: missing config or layers');
        }
        return manifest as ManifestV2;
      }
    } catch (error) {
      if (error instanceof DockerHubError) {
        throw error;
      }
      throw DockerHubError.manifestInvalid(
        `Failed to parse manifest: ${(error as Error).message}`
      ).withCause(error as Error);
    }
  }

  /**
   * Serializes a manifest to JSON with appropriate content type.
   *
   * @param manifest - Manifest to serialize
   * @returns Tuple of [contentType, body]
   */
  private serializeManifest(manifest: Manifest): [string, string] {
    const contentType = isManifestList(manifest)
      ? MANIFEST_MEDIA_TYPES.DOCKER_LIST
      : MANIFEST_MEDIA_TYPES.DOCKER_V2;

    const body = JSON.stringify(manifest, null, 0); // Compact JSON
    return [contentType, body];
  }

  /**
   * Gets a manifest by reference.
   */
  async get(image: ImageReference): Promise<Manifest> {
    const { manifest } = await this.getWithDigest(image);
    return manifest;
  }

  /**
   * Gets a manifest along with its digest.
   */
  async getWithDigest(image: ImageReference): Promise<ManifestWithDigest> {
    const scope = this.buildScope(image, ['pull']);
    const path = this.buildManifestPath(image);

    try {
      const response = await this.client.executeRegistryRequest<string>(
        {
          method: 'GET',
          path,
          headers: {
            Accept: MANIFEST_ACCEPT_HEADER,
          },
        },
        scope
      );

      // Extract content type
      const contentType = response.headers['content-type'] ||
                         response.headers['Content-Type'] ||
                         MANIFEST_MEDIA_TYPES.DOCKER_V2;

      // Extract digest
      const digest = response.headers['docker-content-digest'] ||
                    response.headers['Docker-Content-Digest'];

      if (!digest) {
        throw DockerHubError.manifestInvalid(
          'Response missing Docker-Content-Digest header'
        );
      }

      // Parse manifest
      const manifest = this.parseManifest(response.data, contentType);

      return { manifest, digest };
    } catch (error) {
      if (error instanceof DockerHubError) {
        throw error;
      }
      throw DockerHubError.manifestNotFound(
        `${image.namespace}/${image.repository}:${image.reference.type === 'tag' ? image.reference.value : image.reference.value}`
      ).withCause(error as Error);
    }
  }

  /**
   * Gets a platform-specific manifest from a multi-arch image.
   */
  async getForPlatform(
    image: ImageReference,
    platform: Platform
  ): Promise<ManifestV2> {
    const { manifest } = await this.getWithDigest(image);

    // If already a single-platform manifest, return it
    if (isManifestV2(manifest)) {
      return manifest;
    }

    // It's a manifest list, find the platform-specific manifest
    if (!isManifestList(manifest)) {
      throw DockerHubError.manifestInvalid(
        'Manifest is neither V2 nor ManifestList'
      );
    }

    const platformManifest = findPlatformManifest(
      manifest,
      platform.architecture,
      platform.os,
      platform.variant
    );

    if (!platformManifest) {
      throw DockerHubError.manifestNotFound(
        `No manifest found for platform ${platform.os}/${platform.architecture}${platform.variant ? `/${platform.variant}` : ''}`
      );
    }

    // Fetch the specific platform manifest by digest
    const digestReference: ImageReference = {
      ...image,
      reference: {
        type: 'digest',
        value: platformManifest.digest,
      },
    };

    const { manifest: specificManifest } = await this.getWithDigest(digestReference);

    if (!isManifestV2(specificManifest)) {
      throw DockerHubError.manifestInvalid(
        'Platform-specific manifest is not a V2 manifest'
      );
    }

    return specificManifest;
  }

  /**
   * Pushes a manifest to the registry.
   */
  async put(image: ImageReference, manifest: Manifest): Promise<string> {
    // Manifest push requires a tag reference
    if (image.reference.type !== 'tag') {
      throw DockerHubError.manifestInvalid(
        'Cannot push manifest with digest reference; use a tag instead'
      );
    }

    const scope = this.buildScope(image, ['pull', 'push']);
    const path = this.buildManifestPath(image);
    const [contentType, body] = this.serializeManifest(manifest);

    try {
      const response = await this.client.executeRegistryRequest<void>(
        {
          method: 'PUT',
          path,
          headers: {
            'Content-Type': contentType,
          },
          body,
        },
        scope
      );

      // Extract digest from response
      const digest = response.headers['docker-content-digest'] ||
                    response.headers['Docker-Content-Digest'];

      if (!digest) {
        throw DockerHubError.manifestInvalid(
          'Push response missing Docker-Content-Digest header'
        );
      }

      return digest;
    } catch (error) {
      if (error instanceof DockerHubError) {
        throw error;
      }
      throw DockerHubError.manifestInvalid(
        `Failed to push manifest: ${(error as Error).message}`
      ).withCause(error as Error);
    }
  }

  /**
   * Deletes a manifest by digest.
   */
  async delete(image: ImageReference): Promise<void> {
    // Determine the digest to delete
    let digest: string;

    if (image.reference.type === 'digest') {
      // Already have a digest
      digest = image.reference.value;
    } else {
      // Resolve tag to digest first
      const { digest: resolvedDigest } = await this.getWithDigest(image);
      digest = resolvedDigest;
    }

    // Build delete request with digest
    const scope = this.buildScope(image, ['pull', 'push']);
    const path = `/v2/${image.namespace}/${image.repository}/manifests/${digest}`;

    try {
      await this.client.executeRegistryRequest<void>(
        {
          method: 'DELETE',
          path,
        },
        scope
      );
    } catch (error) {
      if (error instanceof DockerHubError) {
        throw error;
      }
      throw DockerHubError.manifestNotFound(
        `Failed to delete manifest: ${(error as Error).message}`
      ).withCause(error as Error);
    }
  }

  /**
   * Checks if a manifest exists.
   */
  async exists(image: ImageReference): Promise<boolean> {
    const scope = this.buildScope(image, ['pull']);
    const path = this.buildManifestPath(image);

    try {
      const response = await this.client.executeRegistryRequest<void>(
        {
          method: 'HEAD',
          path,
          headers: {
            Accept: MANIFEST_ACCEPT_HEADER,
          },
        },
        scope
      );

      // 200 OK means manifest exists
      return response.status === 200;
    } catch (error) {
      // 404 means manifest doesn't exist
      if (error instanceof DockerHubError &&
          error.kind === DockerHubErrorKind.ManifestNotFound) {
        return false;
      }
      // Other errors should be thrown
      throw error;
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a new ManifestService instance.
 *
 * @param client - Docker Hub client
 * @param config - Docker Hub configuration
 * @returns ManifestService instance
 */
export function createManifestService(
  client: DockerHubClient,
  config: DockerHubConfig
): ManifestService {
  return new ManifestServiceImpl(client, config);
}

// ============================================================================
// Exports
// ============================================================================

export default ManifestServiceImpl;
