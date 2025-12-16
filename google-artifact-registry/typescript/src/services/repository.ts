/**
 * Repository service for Artifact Registry operations.
 * @module services/repository
 */

import type { ArtifactRegistryClient } from '../client/client.js';
import type {
  Repository,
  ListRepositoriesResponse,
  CleanupPolicy,
} from '../types/repository.js';
import type { PaginationOptions, PaginatedResponse } from '../types/common.js';

/**
 * Service for repository operations.
 */
export class RepositoryService {
  private readonly client: ArtifactRegistryClient;

  constructor(client: ArtifactRegistryClient) {
    this.client = client;
  }

  /**
   * Lists repositories in a location.
   *
   * @param location - GCP location (e.g., "us-central1", "us")
   * @param options - Pagination options
   * @returns Paginated list of repositories
   */
  async list(
    location?: string,
    options?: PaginationOptions
  ): Promise<PaginatedResponse<Repository>> {
    const loc = location ?? this.client.getDefaultLocation();

    const response = await this.client.get<ListRepositoriesResponse>(
      `/projects/${this.client.getProjectId()}/locations/${loc}/repositories`,
      {
        query: {
          pageSize: options?.pageSize,
          pageToken: options?.pageToken,
        },
      }
    );

    return {
      items: response.data.repositories ?? [],
      nextPageToken: response.data.nextPageToken,
    };
  }

  /**
   * Lists all repositories in a location (handles pagination automatically).
   *
   * @param location - GCP location
   * @returns All repositories
   */
  async listAll(location?: string): Promise<Repository[]> {
    const repositories: Repository[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.list(location, { pageToken });
      repositories.push(...response.items);
      pageToken = response.nextPageToken;
    } while (pageToken);

    return repositories;
  }

  /**
   * Gets a repository by name.
   *
   * @param location - GCP location
   * @param repositoryId - Repository ID
   * @returns Repository details
   */
  async get(location: string, repositoryId: string): Promise<Repository> {
    const response = await this.client.get<Repository>(
      `/projects/${this.client.getProjectId()}/locations/${location}/repositories/${repositoryId}`
    );

    return response.data;
  }

  /**
   * Gets cleanup policies for a repository.
   *
   * @param location - GCP location
   * @param repositoryId - Repository ID
   * @returns Cleanup policies
   */
  async getCleanupPolicies(
    location: string,
    repositoryId: string
  ): Promise<CleanupPolicy[]> {
    const repo = await this.get(location, repositoryId);

    if (!repo.cleanupPolicies) {
      return [];
    }

    return Object.entries(repo.cleanupPolicies).map(([id, policy]) => ({
      ...policy,
      id,
    }));
  }

  /**
   * Checks if a repository exists.
   *
   * @param location - GCP location
   * @param repositoryId - Repository ID
   * @returns True if repository exists
   */
  async exists(location: string, repositoryId: string): Promise<boolean> {
    try {
      await this.get(location, repositoryId);
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Gets the Docker registry URL for a repository.
   *
   * @param location - GCP location
   * @returns Docker registry URL
   */
  getDockerRegistryUrl(location: string): string {
    return `${location}-docker.pkg.dev`;
  }

  /**
   * Builds a full Docker image path.
   *
   * @param location - GCP location
   * @param repositoryId - Repository ID
   * @param imageName - Image name
   * @param tag - Image tag (default: "latest")
   * @returns Full image path
   */
  buildImagePath(
    location: string,
    repositoryId: string,
    imageName: string,
    tag: string = 'latest'
  ): string {
    return `${this.getDockerRegistryUrl(location)}/${this.client.getProjectId()}/${repositoryId}/${imageName}:${tag}`;
  }
}
