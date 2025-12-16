/**
 * Tag service implementation following SPARC specification.
 *
 * Handles Docker Registry API v2 tag operations including listing, pagination,
 * and deletion. Tag deletion requires manifest resolution since tags are pointers
 * to manifest digests.
 */

import { ImageReference } from '../types/index.js';

// ============================================================================
// Response Types
// ============================================================================

/**
 * Response from the Docker Registry API v2 tag list endpoint.
 */
export interface TagListResponse {
  /** Repository name */
  name: string;
  /** Array of tag names */
  tags: string[];
}

/**
 * Extended tag list response with pagination support.
 */
export interface TagListWithPagination extends TagListResponse {
  /** Next page token (from Link header or last tag) */
  next?: string;
}

/**
 * Options for paginated tag listing.
 */
export interface TagListOptions {
  /** Maximum number of tags to return per page */
  n?: number;
  /** Last tag from previous page (for pagination) */
  last?: string;
}

// ============================================================================
// Tag Service Interface
// ============================================================================

/**
 * Service interface for Docker Registry tag operations.
 *
 * Implements Docker Registry API v2 tag endpoints:
 * - GET /v2/{name}/tags/list - List all tags
 * - DELETE /v2/{name}/manifests/{digest} - Delete tag (via manifest)
 */
export interface TagService {
  /**
   * Lists all tags for an image.
   *
   * This method automatically handles pagination and returns all tags.
   * For large repositories, this may require multiple API calls.
   *
   * @param image - Image reference (namespace/repository)
   * @returns Array of tag names
   * @throws {RepositoryNotFoundError} If the repository doesn't exist
   * @throws {UnauthorizedError} If authentication fails
   * @throws {NetworkError} On connection failures
   *
   * @example
   * ```typescript
   * const tags = await tagService.list({
   *   registry: 'registry-1.docker.io',
   *   namespace: 'library',
   *   repository: 'nginx',
   *   reference: { type: 'tag', value: 'latest' }
   * });
   * console.log(tags); // ['latest', 'stable', '1.21', ...]
   * ```
   */
  list(image: ImageReference): Promise<string[]>;

  /**
   * Lists tags with pagination support.
   *
   * Provides fine-grained control over pagination for repositories with
   * many tags. The registry may return a Link header or require using
   * the ?last=tag query parameter for pagination.
   *
   * @param image - Image reference (namespace/repository)
   * @param options - Pagination options (n: page size, last: last tag from previous page)
   * @returns Tag list response with pagination info
   * @throws {RepositoryNotFoundError} If the repository doesn't exist
   * @throws {UnauthorizedError} If authentication fails
   * @throws {NetworkError} On connection failures
   *
   * @example
   * ```typescript
   * // First page
   * const page1 = await tagService.listWithPagination(image, { n: 100 });
   * console.log(page1.tags); // ['alpine', 'latest', ...]
   * console.log(page1.next); // 'nginx' (last tag on page)
   *
   * // Next page
   * const page2 = await tagService.listWithPagination(image, {
   *   n: 100,
   *   last: page1.next
   * });
   * ```
   */
  listWithPagination(
    image: ImageReference,
    options?: TagListOptions
  ): Promise<TagListWithPagination>;

  /**
   * Deletes a tag from the repository.
   *
   * Implementation notes:
   * 1. Tags are pointers to manifest digests, not independent entities
   * 2. Deletion requires resolving the tag to its manifest digest
   * 3. The manifest is deleted by digest (HEAD then DELETE)
   * 4. This may affect other tags pointing to the same manifest
   *
   * Process:
   * 1. Resolve tag to manifest digest (HEAD /v2/{name}/manifests/{tag})
   * 2. Delete manifest by digest (DELETE /v2/{name}/manifests/{digest})
   *
   * @param image - Image reference (namespace/repository)
   * @param tag - Tag name to delete
   * @throws {TagNotFoundError} If the tag doesn't exist
   * @throws {UnauthorizedError} If lacking push permissions
   * @throws {ManifestNotFoundError} If manifest resolution fails
   * @throws {NetworkError} On connection failures
   *
   * @example
   * ```typescript
   * await tagService.delete({
   *   registry: 'registry-1.docker.io',
   *   namespace: 'myuser',
   *   repository: 'myapp',
   *   reference: { type: 'tag', value: 'latest' }
   * }, 'v1.0.0-rc1');
   * ```
   */
  delete(image: ImageReference, tag: string): Promise<void>;
}

// ============================================================================
// Tag Service Implementation
// ============================================================================

/**
 * Production implementation of TagService.
 *
 * Delegates to DockerHubClient for HTTP operations and authentication.
 * Handles Docker Registry API v2 tag operations with proper error handling,
 * pagination, and manifest resolution for deletions.
 */
export class TagServiceImpl implements TagService {
  /**
   * Creates a new TagService instance.
   *
   * @param client - Docker Hub client for HTTP operations
   * @param manifestService - Manifest service for tag resolution
   */
  constructor(
    private readonly client: DockerHubClient,
    private readonly manifestService: ManifestService
  ) {}

  /**
   * Lists all tags for an image repository.
   *
   * Automatically handles pagination by making multiple requests if needed.
   * The registry may return partial results with a Link header or require
   * using the ?last=tag parameter for subsequent pages.
   *
   * @param image - Image reference
   * @returns Complete list of all tag names
   */
  async list(image: ImageReference): Promise<string[]> {
    return this.client.tracer.withSpan(
      'docker.tag.list',
      async (span) => {
        span.setAttribute('registry', image.registry);
        span.setAttribute('namespace', image.namespace);
        span.setAttribute('repository', image.repository);

        const allTags: string[] = [];
        let lastTag: string | undefined;

        // Paginate through all tags
        do {
          const options: TagListOptions = lastTag ? { last: lastTag } : {};
          const response = await this.listWithPagination(image, options);

          allTags.push(...response.tags);
          lastTag = response.next;

          // Break if no more pages
          if (!lastTag || response.tags.length === 0) {
            break;
          }
        } while (true);

        span.setAttribute('tag_count', allTags.length);
        this.client.logger.info('Listed tags', {
          repository: `${image.namespace}/${image.repository}`,
          count: allTags.length,
        });

        return allTags;
      },
      { operation: 'listTags' }
    );
  }

  /**
   * Lists tags with pagination support.
   *
   * Implements Docker Registry API v2 tag list endpoint with pagination:
   * GET /v2/{name}/tags/list?n={pageSize}&last={lastTag}
   *
   * The registry returns:
   * - Response body: { "name": "repo", "tags": ["tag1", "tag2", ...] }
   * - Optional Link header: </v2/{name}/tags/list?n=100&last=tag100>; rel="next"
   *
   * @param image - Image reference
   * @param options - Pagination options
   * @returns Tag list response with optional next page token
   */
  async listWithPagination(
    image: ImageReference,
    options?: TagListOptions
  ): Promise<TagListWithPagination> {
    return this.client.tracer.withSpan(
      'docker.tag.list.paginated',
      async (span) => {
        span.setAttribute('registry', image.registry);
        span.setAttribute('namespace', image.namespace);
        span.setAttribute('repository', image.repository);

        if (options?.n) {
          span.setAttribute('page_size', options.n);
        }
        if (options?.last) {
          span.setAttribute('last_tag', options.last);
        }

        // Build URL path
        const path = `/v2/${image.namespace}/${image.repository}/tags/list`;

        // Build query parameters
        const query: Record<string, string> = {};
        if (options?.n) {
          query.n = options.n.toString();
        }
        if (options?.last) {
          query.last = options.last;
        }

        // Build scope for authentication
        const scope = `repository:${image.namespace}/${image.repository}:pull`;

        // Execute request
        const response = await this.client.registryRequest<TagListResponse>({
          method: 'GET',
          path,
          query: Object.keys(query).length > 0 ? query : undefined,
          scope,
        });

        // Parse pagination info from Link header
        const linkHeader = response.headers?.get?.('link');
        let nextToken: string | undefined;

        if (linkHeader) {
          // Parse Link header: </v2/.../tags/list?n=100&last=tag100>; rel="next"
          const nextMatch = linkHeader.match(/[?&]last=([^&>]+)/);
          if (nextMatch) {
            nextToken = nextMatch[1];
          }
        } else if (response.body.tags && response.body.tags.length > 0) {
          // If no Link header, use the last tag as the next token
          // (only if we got a full page, indicating there might be more)
          if (options?.n && response.body.tags.length >= options.n) {
            nextToken = response.body.tags[response.body.tags.length - 1];
          }
        }

        span.setAttribute('tag_count', response.body.tags?.length ?? 0);
        span.setAttribute('has_next', !!nextToken);

        return {
          name: response.body.name,
          tags: response.body.tags ?? [],
          next: nextToken,
        };
      },
      { operation: 'listTagsPaginated' }
    );
  }

  /**
   * Deletes a tag by removing its manifest.
   *
   * Implementation:
   * 1. Resolve tag to manifest digest via HEAD request
   * 2. Delete manifest by digest via DELETE request
   *
   * The Docker Registry API v2 doesn't have a direct tag deletion endpoint.
   * Tags are pointers to manifests, so we must:
   * 1. GET/HEAD the manifest to obtain its digest
   * 2. DELETE the manifest by digest
   *
   * WARNING: If multiple tags point to the same manifest digest, deleting
   * the manifest will affect all those tags.
   *
   * @param image - Image reference (repository path)
   * @param tag - Tag name to delete
   */
  async delete(image: ImageReference, tag: string): Promise<void> {
    return this.client.tracer.withSpan(
      'docker.tag.delete',
      async (span) => {
        span.setAttribute('registry', image.registry);
        span.setAttribute('namespace', image.namespace);
        span.setAttribute('repository', image.repository);
        span.setAttribute('tag', tag);

        // Step 1: Resolve tag to digest
        // Create an image reference with the tag to delete
        const tagRef: ImageReference = {
          ...image,
          reference: { type: 'tag', value: tag },
        };

        this.client.logger.debug('Resolving tag to digest', {
          repository: `${image.namespace}/${image.repository}`,
          tag,
        });

        // Get the manifest to retrieve its digest
        // The manifest service will return the Docker-Content-Digest header
        const digest = await this.manifestService.getDigest(tagRef);

        span.setAttribute('digest', digest);

        this.client.logger.debug('Resolved tag to digest', {
          repository: `${image.namespace}/${image.repository}`,
          tag,
          digest,
        });

        // Step 2: Delete manifest by digest
        // Create an image reference with the digest
        const digestRef: ImageReference = {
          ...image,
          reference: { type: 'digest', value: digest },
        };

        this.client.logger.info('Deleting manifest by digest', {
          repository: `${image.namespace}/${image.repository}`,
          tag,
          digest,
        });

        // Delete the manifest (this will delete the tag)
        await this.manifestService.delete(digestRef);

        this.client.logger.info('Deleted tag', {
          repository: `${image.namespace}/${image.repository}`,
          tag,
          digest,
        });

        // Record metrics
        this.client.metrics.increment('docker_tags_deleted_total', 1, {
          repository: `${image.namespace}/${image.repository}`,
        });
      },
      { operation: 'deleteTag' }
    );
  }
}

// ============================================================================
// Type Imports (for documentation)
// ============================================================================

/**
 * Docker Hub client interface.
 * Provides HTTP operations, authentication, observability, and metrics.
 */
interface DockerHubClient {
  /** Distributed tracing support */
  tracer: Tracer;
  /** Structured logging */
  logger: Logger;
  /** Metrics collection */
  metrics: MetricsCollector;
  /** Registry API request execution */
  registryRequest<T>(config: RequestConfig): Promise<{ body: T; headers?: Headers }>;
}

/**
 * Manifest service interface.
 * Provides manifest resolution and deletion operations needed for tag deletion.
 */
interface ManifestService {
  /**
   * Gets the digest for a manifest without downloading the full manifest.
   * Uses HEAD request to retrieve Docker-Content-Digest header.
   */
  getDigest(image: ImageReference): Promise<string>;

  /**
   * Deletes a manifest by digest.
   * DELETE /v2/{name}/manifests/{digest}
   */
  delete(image: ImageReference): Promise<void>;
}

/**
 * Tracing interface for distributed tracing.
 */
interface Tracer {
  withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    options?: { operation?: string }
  ): Promise<T>;
}

/**
 * Span interface for tracing attributes.
 */
interface Span {
  setAttribute(key: string, value: string | number | boolean): void;
}

/**
 * Logger interface for structured logging.
 */
interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Metrics collector interface.
 */
interface MetricsCollector {
  increment(metric: string, value: number, labels?: Record<string, string>): void;
  gauge(metric: string, value: number, labels?: Record<string, string>): void;
  histogram(metric: string, value: number, labels?: Record<string, string>): void;
}

/**
 * HTTP request configuration.
 */
interface RequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
  scope?: string;
  timeout?: number;
}

/**
 * HTTP headers interface.
 */
interface Headers {
  get(name: string): string | null;
}
