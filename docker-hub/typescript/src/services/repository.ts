/**
 * Repository Service - Docker Hub API Operations
 *
 * Handles Docker Hub API (NOT registry API) operations for repositories.
 * Uses Hub URL: https://hub.docker.com/v2
 *
 * Key features:
 * - JWT authentication (not Bearer)
 * - Paginated responses: { count, next, previous, results }
 * - Repository listing, retrieval, searching, and deletion
 * - Maps API responses to strongly-typed Repository interfaces
 *
 * @module services/repository
 */

import type { DockerHubClient } from '../client.js';
import type { Repository } from '../types/index.js';

// ============================================================================
// API Response Types (Internal - from Docker Hub API)
// ============================================================================

/**
 * Repository data from Docker Hub API response.
 */
interface RepositoryApiResponse {
  /** Repository name */
  name: string;
  /** Namespace (owner) */
  namespace: string;
  /** Repository description */
  description?: string;
  /** Is private */
  is_private: boolean;
  /** Star count */
  star_count: number;
  /** Pull count */
  pull_count: number;
  /** Last updated timestamp (ISO 8601) */
  last_updated: string;
}

/**
 * List repositories API response.
 */
interface RepositoryListApiResponse {
  /** Total count of repositories */
  count: number;
  /** Next page URL */
  next?: string | null;
  /** Previous page URL */
  previous?: string | null;
  /** Array of repositories */
  results: RepositoryApiResponse[];
}

/**
 * Search repositories API response.
 */
interface SearchApiResponse {
  /** Total count of search results */
  count: number;
  /** Next page URL */
  next?: string | null;
  /** Previous page URL */
  previous?: string | null;
  /** Array of search results */
  results: RepositoryApiResponse[];
}

// ============================================================================
// Service Options
// ============================================================================

/**
 * Options for listing repositories.
 */
export interface ListOptions {
  /** Page size (number of results per page) */
  pageSize?: number;
  /** Page number (1-indexed) */
  page?: number;
}

/**
 * Options for searching repositories.
 */
export interface SearchOptions {
  /** Page size (number of results per page) */
  pageSize?: number;
  /** Page number (1-indexed) */
  page?: number;
}

/**
 * Search result with pagination metadata.
 */
export interface SearchResult {
  /** Total count of matching repositories */
  count: number;
  /** Array of matching repositories */
  results: Repository[];
  /** Next page URL (if available) */
  next?: string;
  /** Previous page URL (if available) */
  previous?: string;
}

/**
 * Repository list response with pagination metadata.
 */
export interface RepositoryListResponse {
  /** Total count of repositories */
  count: number;
  /** Array of repositories */
  results: Repository[];
  /** Next page URL (if available) */
  next?: string;
  /** Previous page URL (if available) */
  previous?: string;
}

// ============================================================================
// Repository Service Interface
// ============================================================================

/**
 * Repository service interface for Docker Hub operations.
 */
export interface RepositoryService {
  /**
   * Lists repositories for a namespace.
   *
   * @param namespace - Namespace (username or organization)
   * @param options - Pagination options
   * @returns Array of repositories
   *
   * @example
   * ```typescript
   * const repos = await client.repositories().list('library', { pageSize: 50 });
   * console.log(`Found ${repos.length} repositories`);
   * ```
   */
  list(namespace: string, options?: ListOptions): Promise<Repository[]>;

  /**
   * Lists repositories with pagination metadata.
   *
   * @param namespace - Namespace (username or organization)
   * @param options - Pagination options
   * @returns Repository list with pagination info
   *
   * @example
   * ```typescript
   * const response = await client.repositories().listPaginated('myorg', { page: 2 });
   * console.log(`Page 2 of ${response.count} total repositories`);
   * ```
   */
  listPaginated(namespace: string, options?: ListOptions): Promise<RepositoryListResponse>;

  /**
   * Gets a specific repository by namespace and name.
   *
   * @param namespace - Namespace (username or organization)
   * @param repo - Repository name
   * @returns Repository details
   * @throws {DockerHubError} If repository not found (404)
   *
   * @example
   * ```typescript
   * const repo = await client.repositories().get('library', 'nginx');
   * console.log(`${repo.name}: ${repo.description}`);
   * ```
   */
  get(namespace: string, repo: string): Promise<Repository>;

  /**
   * Searches for repositories matching a query.
   *
   * @param query - Search query string
   * @param options - Pagination options
   * @returns Search results with pagination
   *
   * @example
   * ```typescript
   * const results = await client.repositories().search('nginx alpine', { pageSize: 10 });
   * console.log(`Found ${results.count} matches`);
   * ```
   */
  search(query: string, options?: SearchOptions): Promise<SearchResult>;

  /**
   * Deletes a repository.
   *
   * **Warning**: This operation is destructive and cannot be undone!
   *
   * @param namespace - Namespace (username or organization)
   * @param repo - Repository name
   * @throws {DockerHubError} If deletion fails
   *
   * @example
   * ```typescript
   * await client.repositories().delete('myuser', 'old-repo');
   * console.log('Repository deleted');
   * ```
   */
  delete(namespace: string, repo: string): Promise<void>;
}

// ============================================================================
// Repository Service Implementation
// ============================================================================

/**
 * Repository service implementation.
 */
export class RepositoryServiceImpl implements RepositoryService {
  constructor(private readonly client: DockerHubClient) {}

  async list(namespace: string, options?: ListOptions): Promise<Repository[]> {
    const response = await this.listPaginated(namespace, options);
    return response.results;
  }

  async listPaginated(
    namespace: string,
    options?: ListOptions
  ): Promise<RepositoryListResponse> {
    // Validate namespace
    this.validateNamespace(namespace);

    // Build query parameters
    const query: Record<string, string | number> = {};
    if (options?.pageSize !== undefined) {
      query.page_size = options.pageSize;
    }
    if (options?.page !== undefined) {
      query.page = options.page;
    }

    // Execute Hub API request
    const response = await this.client.executeHubRequest<RepositoryListApiResponse>({
      method: 'GET',
      path: `/v2/repositories/${encodeURIComponent(namespace)}`,
      query,
    });

    // Map API response to our types
    return {
      count: response.data.count,
      results: response.data.results.map((r) => this.mapApiResponseToRepository(r)),
      next: response.data.next || undefined,
      previous: response.data.previous || undefined,
    };
  }

  async get(namespace: string, repo: string): Promise<Repository> {
    // Validate inputs
    this.validateNamespace(namespace);
    this.validateRepositoryName(repo);

    // Execute Hub API request
    const response = await this.client.executeHubRequest<RepositoryApiResponse>({
      method: 'GET',
      path: `/v2/repositories/${encodeURIComponent(namespace)}/${encodeURIComponent(repo)}`,
    });

    // Map API response to our types
    return this.mapApiResponseToRepository(response.data);
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    // Validate query
    if (!query || query.trim().length === 0) {
      throw new Error('Search query cannot be empty');
    }

    // Build query parameters
    const queryParams: Record<string, string | number> = {
      query: query.trim(),
    };

    if (options?.pageSize !== undefined) {
      queryParams.page_size = options.pageSize;
    }
    if (options?.page !== undefined) {
      queryParams.page = options.page;
    }

    // Execute Hub API request
    const response = await this.client.executeHubRequest<SearchApiResponse>({
      method: 'GET',
      path: '/v2/search/repositories',
      query: queryParams,
    });

    // Map API response to our types
    return {
      count: response.data.count,
      results: response.data.results.map((r) => this.mapApiResponseToRepository(r)),
      next: response.data.next || undefined,
      previous: response.data.previous || undefined,
    };
  }

  async delete(namespace: string, repo: string): Promise<void> {
    // Validate inputs
    this.validateNamespace(namespace);
    this.validateRepositoryName(repo);

    // Execute Hub API request
    await this.client.executeHubRequest<void>({
      method: 'DELETE',
      path: `/v2/repositories/${encodeURIComponent(namespace)}/${encodeURIComponent(repo)}`,
    });
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Maps Docker Hub API response to our Repository type.
   */
  private mapApiResponseToRepository(apiRepo: RepositoryApiResponse): Repository {
    return {
      namespace: apiRepo.namespace,
      name: apiRepo.name,
      description: apiRepo.description,
      isPrivate: apiRepo.is_private,
      starCount: apiRepo.star_count,
      pullCount: apiRepo.pull_count,
      lastUpdated: this.parseDate(apiRepo.last_updated),
    };
  }

  /**
   * Parses an ISO 8601 date string to a Date object.
   * Handles invalid dates gracefully by returning current date.
   */
  private parseDate(dateString: string): Date {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        // Invalid date, return current date as fallback
        return new Date();
      }
      return date;
    } catch {
      // Parse error, return current date as fallback
      return new Date();
    }
  }

  /**
   * Validates a namespace string.
   */
  private validateNamespace(namespace: string): void {
    if (!namespace || namespace.trim().length === 0) {
      throw new Error('Namespace cannot be empty');
    }

    // Docker Hub official images use 'library' namespace
    if (namespace === 'library') {
      return;
    }

    // Namespace validation (4-30 chars, lowercase, alphanumeric, hyphens, underscores)
    if (namespace.length < 4 || namespace.length > 30) {
      throw new Error('Namespace must be between 4 and 30 characters');
    }

    const namespacePattern = /^[a-z0-9_-]{4,30}$/;
    if (!namespacePattern.test(namespace)) {
      throw new Error(
        'Namespace must contain only lowercase letters, numbers, hyphens, and underscores'
      );
    }
  }

  /**
   * Validates a repository name string.
   */
  private validateRepositoryName(repo: string): void {
    if (!repo || repo.trim().length === 0) {
      throw new Error('Repository name cannot be empty');
    }

    if (repo.length > 255) {
      throw new Error('Repository name must be less than 255 characters');
    }

    // Repository name pattern (lowercase, alphanumeric with separators)
    const repoPattern = /^[a-z0-9]+([._-][a-z0-9]+)*$/;
    if (!repoPattern.test(repo)) {
      throw new Error(
        'Repository name must contain only lowercase letters, numbers, and separators (-, _, .)'
      );
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a repository service instance.
 *
 * @param client - Docker Hub client
 * @returns Repository service instance
 */
export function createRepositoryService(client: DockerHubClient): RepositoryService {
  return new RepositoryServiceImpl(client);
}
