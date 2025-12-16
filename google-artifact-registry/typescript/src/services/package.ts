/**
 * Package service for Artifact Registry operations.
 * @module services/package
 */

import type { ArtifactRegistryClient } from '../client/client.js';
import type {
  Package,
  Version,
  Tag,
  ListPackagesResponse,
  ListVersionsResponse,
  ListTagsResponse,
} from '../types/package.js';
import { encodePackageName } from '../types/package.js';
import type { PaginationOptions, PaginatedResponse } from '../types/common.js';

/**
 * Service for package operations (packages, versions, tags).
 */
export class PackageService {
  private readonly client: ArtifactRegistryClient;

  constructor(client: ArtifactRegistryClient) {
    this.client = client;
  }

  // ============================================================
  // Package Operations
  // ============================================================

  /**
   * Lists packages in a repository.
   *
   * @param location - GCP location
   * @param repositoryId - Repository ID
   * @param options - Pagination options
   * @returns Paginated list of packages
   */
  async list(
    location: string,
    repositoryId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResponse<Package>> {
    const response = await this.client.get<ListPackagesResponse>(
      `/projects/${this.client.getProjectId()}/locations/${location}/repositories/${repositoryId}/packages`,
      {
        query: {
          pageSize: options?.pageSize,
          pageToken: options?.pageToken,
        },
      }
    );

    return {
      items: response.data.packages ?? [],
      nextPageToken: response.data.nextPageToken,
    };
  }

  /**
   * Lists all packages in a repository (handles pagination automatically).
   *
   * @param location - GCP location
   * @param repositoryId - Repository ID
   * @returns All packages
   */
  async listAll(location: string, repositoryId: string): Promise<Package[]> {
    const packages: Package[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.list(location, repositoryId, { pageToken });
      packages.push(...response.items);
      pageToken = response.nextPageToken;
    } while (pageToken);

    return packages;
  }

  /**
   * Gets a package by name.
   *
   * @param location - GCP location
   * @param repositoryId - Repository ID
   * @param packageName - Package name (may contain slashes for Docker images)
   * @returns Package details
   */
  async get(
    location: string,
    repositoryId: string,
    packageName: string
  ): Promise<Package> {
    const encoded = encodePackageName(packageName);
    const response = await this.client.get<Package>(
      `/projects/${this.client.getProjectId()}/locations/${location}/repositories/${repositoryId}/packages/${encoded}`
    );

    return response.data;
  }

  /**
   * Deletes a package.
   *
   * @param location - GCP location
   * @param repositoryId - Repository ID
   * @param packageName - Package name
   */
  async delete(
    location: string,
    repositoryId: string,
    packageName: string
  ): Promise<void> {
    const encoded = encodePackageName(packageName);
    await this.client.delete(
      `/projects/${this.client.getProjectId()}/locations/${location}/repositories/${repositoryId}/packages/${encoded}`
    );
  }

  // ============================================================
  // Version Operations
  // ============================================================

  /**
   * Lists versions of a package.
   *
   * @param location - GCP location
   * @param repositoryId - Repository ID
   * @param packageName - Package name
   * @param options - Pagination options
   * @returns Paginated list of versions
   */
  async listVersions(
    location: string,
    repositoryId: string,
    packageName: string,
    options?: PaginationOptions
  ): Promise<PaginatedResponse<Version>> {
    const encoded = encodePackageName(packageName);
    const response = await this.client.get<ListVersionsResponse>(
      `/projects/${this.client.getProjectId()}/locations/${location}/repositories/${repositoryId}/packages/${encoded}/versions`,
      {
        query: {
          pageSize: options?.pageSize,
          pageToken: options?.pageToken,
        },
      }
    );

    return {
      items: response.data.versions ?? [],
      nextPageToken: response.data.nextPageToken,
    };
  }

  /**
   * Lists all versions of a package (handles pagination automatically).
   *
   * @param location - GCP location
   * @param repositoryId - Repository ID
   * @param packageName - Package name
   * @returns All versions
   */
  async listAllVersions(
    location: string,
    repositoryId: string,
    packageName: string
  ): Promise<Version[]> {
    const versions: Version[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.listVersions(
        location,
        repositoryId,
        packageName,
        { pageToken }
      );
      versions.push(...response.items);
      pageToken = response.nextPageToken;
    } while (pageToken);

    return versions;
  }

  /**
   * Gets a version by name.
   *
   * @param location - GCP location
   * @param repositoryId - Repository ID
   * @param packageName - Package name
   * @param versionId - Version ID (usually a digest like "sha256:...")
   * @returns Version details
   */
  async getVersion(
    location: string,
    repositoryId: string,
    packageName: string,
    versionId: string
  ): Promise<Version> {
    const encodedPackage = encodePackageName(packageName);
    const encodedVersion = encodeURIComponent(versionId);

    const response = await this.client.get<Version>(
      `/projects/${this.client.getProjectId()}/locations/${location}/repositories/${repositoryId}/packages/${encodedPackage}/versions/${encodedVersion}`
    );

    return response.data;
  }

  /**
   * Deletes a version.
   *
   * @param location - GCP location
   * @param repositoryId - Repository ID
   * @param packageName - Package name
   * @param versionId - Version ID
   * @param force - Force delete even if tagged
   */
  async deleteVersion(
    location: string,
    repositoryId: string,
    packageName: string,
    versionId: string,
    force: boolean = false
  ): Promise<void> {
    const encodedPackage = encodePackageName(packageName);
    const encodedVersion = encodeURIComponent(versionId);

    await this.client.delete(
      `/projects/${this.client.getProjectId()}/locations/${location}/repositories/${repositoryId}/packages/${encodedPackage}/versions/${encodedVersion}`,
      {
        query: { force },
      }
    );
  }

  // ============================================================
  // Tag Operations
  // ============================================================

  /**
   * Lists tags for a package.
   *
   * @param location - GCP location
   * @param repositoryId - Repository ID
   * @param packageName - Package name
   * @param options - Pagination options
   * @returns Paginated list of tags
   */
  async listTags(
    location: string,
    repositoryId: string,
    packageName: string,
    options?: PaginationOptions
  ): Promise<PaginatedResponse<Tag>> {
    const encoded = encodePackageName(packageName);
    const response = await this.client.get<ListTagsResponse>(
      `/projects/${this.client.getProjectId()}/locations/${location}/repositories/${repositoryId}/packages/${encoded}/tags`,
      {
        query: {
          pageSize: options?.pageSize,
          pageToken: options?.pageToken,
        },
      }
    );

    return {
      items: response.data.tags ?? [],
      nextPageToken: response.data.nextPageToken,
    };
  }

  /**
   * Lists all tags for a package (handles pagination automatically).
   *
   * @param location - GCP location
   * @param repositoryId - Repository ID
   * @param packageName - Package name
   * @returns All tags
   */
  async listAllTags(
    location: string,
    repositoryId: string,
    packageName: string
  ): Promise<Tag[]> {
    const tags: Tag[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.listTags(
        location,
        repositoryId,
        packageName,
        { pageToken }
      );
      tags.push(...response.items);
      pageToken = response.nextPageToken;
    } while (pageToken);

    return tags;
  }

  /**
   * Gets a tag by name.
   *
   * @param location - GCP location
   * @param repositoryId - Repository ID
   * @param packageName - Package name
   * @param tagId - Tag ID (e.g., "latest", "v1.0.0")
   * @returns Tag details
   */
  async getTag(
    location: string,
    repositoryId: string,
    packageName: string,
    tagId: string
  ): Promise<Tag> {
    const encodedPackage = encodePackageName(packageName);

    const response = await this.client.get<Tag>(
      `/projects/${this.client.getProjectId()}/locations/${location}/repositories/${repositoryId}/packages/${encodedPackage}/tags/${tagId}`
    );

    return response.data;
  }

  /**
   * Creates a new tag.
   *
   * @param location - GCP location
   * @param repositoryId - Repository ID
   * @param packageName - Package name
   * @param tagId - Tag ID to create
   * @param version - Version resource name the tag should point to
   * @returns Created tag
   */
  async createTag(
    location: string,
    repositoryId: string,
    packageName: string,
    tagId: string,
    version: string
  ): Promise<Tag> {
    const encodedPackage = encodePackageName(packageName);

    const response = await this.client.post<Tag>(
      `/projects/${this.client.getProjectId()}/locations/${location}/repositories/${repositoryId}/packages/${encodedPackage}/tags`,
      {
        version,
      },
      {
        query: { tagId },
      }
    );

    return response.data;
  }

  /**
   * Updates an existing tag to point to a different version.
   *
   * @param location - GCP location
   * @param repositoryId - Repository ID
   * @param packageName - Package name
   * @param tagId - Tag ID to update
   * @param version - New version resource name
   * @returns Updated tag
   */
  async updateTag(
    location: string,
    repositoryId: string,
    packageName: string,
    tagId: string,
    version: string
  ): Promise<Tag> {
    const encodedPackage = encodePackageName(packageName);

    const response = await this.client.patch<Tag>(
      `/projects/${this.client.getProjectId()}/locations/${location}/repositories/${repositoryId}/packages/${encodedPackage}/tags/${tagId}`,
      {
        version,
      },
      {
        query: { updateMask: 'version' },
      }
    );

    return response.data;
  }

  /**
   * Deletes a tag.
   *
   * @param location - GCP location
   * @param repositoryId - Repository ID
   * @param packageName - Package name
   * @param tagId - Tag ID to delete
   */
  async deleteTag(
    location: string,
    repositoryId: string,
    packageName: string,
    tagId: string
  ): Promise<void> {
    const encodedPackage = encodePackageName(packageName);

    await this.client.delete(
      `/projects/${this.client.getProjectId()}/locations/${location}/repositories/${repositoryId}/packages/${encodedPackage}/tags/${tagId}`
    );
  }
}
