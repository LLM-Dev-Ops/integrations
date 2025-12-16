/**
 * Repository service implementation following SPARC specification.
 *
 * Provides operations for listing repositories, retrieving repository metadata,
 * policies, and lifecycle policies.
 *
 * @module services/repository
 */

import {
  Repository,
  RepositoryList,
  ListRepositoriesOptions,
  RepositoryPolicy,
  LifecyclePolicy,
  ResourceTags,
} from '../types/index.js';
import { EcrError, EcrErrorKind } from '../errors.js';

// ============================================================================
// ECR Client Interface
// ============================================================================

/**
 * Interface for ECR client operations.
 * This allows for dependency injection and testing with mock clients.
 */
export interface EcrClientInterface {
  /**
   * Calls the AWS ECR DescribeRepositories API.
   */
  describeRepositories(request: DescribeRepositoriesRequest): Promise<DescribeRepositoriesResponse>;

  /**
   * Calls the AWS ECR GetRepositoryPolicy API.
   */
  getRepositoryPolicy(request: GetRepositoryPolicyRequest): Promise<GetRepositoryPolicyResponse>;

  /**
   * Calls the AWS ECR GetLifecyclePolicy API.
   */
  getLifecyclePolicy(request: GetLifecyclePolicyRequest): Promise<GetLifecyclePolicyResponse>;

  /**
   * Calls the AWS ECR ListTagsForResource API.
   */
  listTagsForResource(request: ListTagsForResourceRequest): Promise<ListTagsForResourceResponse>;

  /**
   * Emits a metric counter.
   */
  emitMetric?(name: string, value: number, tags?: Record<string, string>): void;
}

/**
 * AWS ECR DescribeRepositories request.
 */
export interface DescribeRepositoriesRequest {
  registryId?: string;
  repositoryNames?: string[];
  nextToken?: string;
  maxResults?: number;
}

/**
 * AWS ECR DescribeRepositories response.
 */
export interface DescribeRepositoriesResponse {
  repositories: Repository[];
  nextToken?: string;
}

/**
 * AWS ECR GetRepositoryPolicy request.
 */
export interface GetRepositoryPolicyRequest {
  repositoryName: string;
  registryId?: string;
}

/**
 * AWS ECR GetRepositoryPolicy response.
 */
export interface GetRepositoryPolicyResponse {
  registryId: string;
  repositoryName: string;
  policyText: string;
}

/**
 * AWS ECR GetLifecyclePolicy request.
 */
export interface GetLifecyclePolicyRequest {
  repositoryName: string;
  registryId?: string;
}

/**
 * AWS ECR GetLifecyclePolicy response.
 */
export interface GetLifecyclePolicyResponse {
  registryId: string;
  repositoryName: string;
  lifecyclePolicyText: string;
  lastEvaluatedAt?: string;
}

/**
 * AWS ECR ListTagsForResource request.
 */
export interface ListTagsForResourceRequest {
  resourceArn: string;
}

/**
 * AWS ECR ListTagsForResource response.
 */
export interface ListTagsForResourceResponse {
  tags: Array<{ Key: string; Value: string }>;
}

// ============================================================================
// Repository Service Interface
// ============================================================================

/**
 * Repository service interface.
 *
 * Provides operations for managing ECR repositories including:
 * - Listing repositories with pagination
 * - Getting repository details
 * - Retrieving repository policies
 * - Retrieving lifecycle policies
 * - Listing resource tags
 */
export interface RepositoryService {
  /**
   * Lists repositories in the registry.
   *
   * @param options - Optional filtering and pagination options
   * @returns Promise resolving to repository list with total count
   *
   * @example
   * ```typescript
   * const result = await repositoryService.listRepositories({
   *   maxResults: 50
   * });
   * console.log(`Found ${result.totalCount} repositories`);
   * ```
   */
  listRepositories(options?: ListRepositoriesOptions): Promise<RepositoryList>;

  /**
   * Gets a repository by name.
   *
   * @param repositoryName - Repository name to retrieve
   * @returns Promise resolving to repository details
   * @throws {EcrError} RepositoryNotFound if repository doesn't exist
   *
   * @example
   * ```typescript
   * const repo = await repositoryService.getRepository('my-app');
   * console.log(`Repository URI: ${repo.repositoryUri}`);
   * ```
   */
  getRepository(repositoryName: string): Promise<Repository>;

  /**
   * Gets the repository access policy.
   *
   * @param repositoryName - Repository name
   * @returns Promise resolving to repository policy document
   * @throws {EcrError} RepositoryPolicyNotFound if no policy exists
   *
   * @example
   * ```typescript
   * const policy = await repositoryService.getRepositoryPolicy('my-app');
   * const policyDoc = JSON.parse(policy.policyText);
   * ```
   */
  getRepositoryPolicy(repositoryName: string): Promise<RepositoryPolicy>;

  /**
   * Gets the lifecycle policy for automatic image cleanup.
   *
   * @param repositoryName - Repository name
   * @returns Promise resolving to lifecycle policy
   * @throws {EcrError} LifecyclePolicyNotFound if no policy exists
   *
   * @example
   * ```typescript
   * const lifecycle = await repositoryService.getLifecyclePolicy('my-app');
   * const rules = JSON.parse(lifecycle.lifecyclePolicyText);
   * ```
   */
  getLifecyclePolicy(repositoryName: string): Promise<LifecyclePolicy>;

  /**
   * Lists tags for a resource (repository).
   *
   * @param resourceArn - ARN of the repository
   * @returns Promise resolving to resource tags as a Map
   *
   * @example
   * ```typescript
   * const repo = await repositoryService.getRepository('my-app');
   * const tags = await repositoryService.listTagsForResource(repo.repositoryArn);
   * console.log(`Environment: ${tags.get('Environment')}`);
   * ```
   */
  listTagsForResource(resourceArn: string): Promise<ResourceTags>;
}

// ============================================================================
// Repository Service Implementation
// ============================================================================

/**
 * Repository service implementation.
 *
 * Handles all repository-related operations including listing, retrieval,
 * and policy management. Uses the ECR client interface for AWS API calls
 * and provides error handling and observability.
 */
export class RepositoryServiceImpl implements RepositoryService {
  private readonly client: EcrClientInterface;

  /**
   * Creates a new repository service instance.
   *
   * @param client - ECR client interface for making API calls
   */
  constructor(client: EcrClientInterface) {
    this.client = client;
  }

  /**
   * Lists repositories in the registry with pagination support.
   *
   * Implementation follows pseudocode from SPARC specification section 2.1.
   * Handles pagination automatically by collecting all results.
   */
  async listRepositories(options?: ListRepositoriesOptions): Promise<RepositoryList> {
    const repositories: Repository[] = [];
    let nextToken: string | undefined = undefined;

    try {
      // Paginate through all repositories
      do {
        const request: DescribeRepositoriesRequest = {
          registryId: options?.registryId,
          repositoryNames: options?.repositoryNames,
          nextToken: nextToken,
          maxResults: options?.maxResults ?? 100,
        };

        const response = await this.client.describeRepositories(request);

        // Collect repositories from this page
        repositories.push(...response.repositories);

        nextToken = response.nextToken;
      } while (nextToken);

      // Emit observability metric
      this.emitMetric('ecr.repositories.listed', repositories.length);

      return {
        repositories,
        totalCount: repositories.length,
      };
    } catch (error) {
      throw this.handleError(error, 'listRepositories');
    }
  }

  /**
   * Gets a single repository by name.
   *
   * Implementation follows pseudocode from SPARC specification section 2.2.
   * Throws RepositoryNotFound if the repository doesn't exist.
   */
  async getRepository(repositoryName: string): Promise<Repository> {
    try {
      const request: DescribeRepositoriesRequest = {
        repositoryNames: [repositoryName],
      };

      const response = await this.client.describeRepositories(request);

      if (!response.repositories || response.repositories.length === 0) {
        throw new EcrError(
          EcrErrorKind.RepositoryNotFound,
          `Repository not found: ${repositoryName}`,
          { statusCode: 404 }
        );
      }

      return response.repositories[0];
    } catch (error) {
      throw this.handleError(error, 'getRepository');
    }
  }

  /**
   * Gets the repository access policy.
   *
   * Implementation follows pseudocode from SPARC specification section 2.3.
   * The policy text is returned as a JSON string that can be parsed.
   */
  async getRepositoryPolicy(repositoryName: string): Promise<RepositoryPolicy> {
    try {
      const request: GetRepositoryPolicyRequest = {
        repositoryName,
      };

      const response = await this.client.getRepositoryPolicy(request);

      return {
        registryId: response.registryId,
        repositoryName: response.repositoryName,
        policyText: response.policyText,
      };
    } catch (error) {
      // Map RepositoryPolicyNotFoundException to our error type
      if (this.isAwsError(error, 'RepositoryPolicyNotFoundException')) {
        throw new EcrError(
          EcrErrorKind.RepositoryPolicyNotFound,
          `Repository policy not found for: ${repositoryName}`,
          { statusCode: 404 }
        );
      }
      throw this.handleError(error, 'getRepositoryPolicy');
    }
  }

  /**
   * Gets the lifecycle policy for automatic image cleanup.
   *
   * Implementation follows pseudocode from SPARC specification section 2.3.
   * The lifecycle policy text is a JSON string containing the policy rules.
   */
  async getLifecyclePolicy(repositoryName: string): Promise<LifecyclePolicy> {
    try {
      const request: GetLifecyclePolicyRequest = {
        repositoryName,
      };

      const response = await this.client.getLifecyclePolicy(request);

      return {
        registryId: response.registryId,
        repositoryName: response.repositoryName,
        lifecyclePolicyText: response.lifecyclePolicyText,
        lastEvaluatedAt: response.lastEvaluatedAt,
      };
    } catch (error) {
      // Map LifecyclePolicyNotFoundException to our error type
      if (this.isAwsError(error, 'LifecyclePolicyNotFoundException')) {
        throw new EcrError(
          EcrErrorKind.LifecyclePolicyNotFound,
          `Lifecycle policy not found for: ${repositoryName}`,
          { statusCode: 404 }
        );
      }
      throw this.handleError(error, 'getLifecyclePolicy');
    }
  }

  /**
   * Lists AWS resource tags for a repository.
   *
   * Tags are returned as a Map for easy lookup and manipulation.
   */
  async listTagsForResource(resourceArn: string): Promise<ResourceTags> {
    try {
      const request: ListTagsForResourceRequest = {
        resourceArn,
      };

      const response = await this.client.listTagsForResource(request);

      // Convert AWS tag format to Map
      const tags = new Map<string, string>();
      for (const tag of response.tags) {
        tags.set(tag.Key, tag.Value);
      }

      return tags;
    } catch (error) {
      throw this.handleError(error, 'listTagsForResource');
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Handles errors from AWS API calls.
   * Converts known AWS errors to EcrError types and passes through EcrErrors.
   */
  private handleError(error: unknown, operation: string): Error {
    // If already an EcrError, pass through
    if (error instanceof EcrError) {
      return error;
    }

    // Convert AWS SDK errors
    if (this.isAwsError(error)) {
      const awsError = error as any;
      const message = awsError.message || `${operation} failed`;
      const errorCode = awsError.name || awsError.__type;

      return EcrError.fromResponse(
        awsError.$metadata?.httpStatusCode || 500,
        message,
        {
          errorCode,
          requestId: awsError.$metadata?.requestId,
        }
      );
    }

    // Unknown error - wrap it
    return new EcrError(
      EcrErrorKind.Unknown,
      `${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error instanceof Error ? error : undefined }
    );
  }

  /**
   * Checks if an error is an AWS SDK error.
   */
  private isAwsError(error: unknown, errorName?: string): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const err = error as any;

    // Check for AWS SDK error structure
    const isAws = !!(err.name || err.__type || err.$metadata);

    if (!errorName) {
      return isAws;
    }

    // Check for specific error name
    return isAws && (err.name === errorName || err.__type === errorName);
  }

  /**
   * Emits a metric if the client supports it.
   */
  private emitMetric(name: string, value: number, tags?: Record<string, string>): void {
    if (this.client.emitMetric) {
      this.client.emitMetric(name, value, tags);
    }
  }
}

/**
 * Creates a repository service instance.
 *
 * @param client - ECR client interface for making API calls
 * @returns Repository service implementation
 *
 * @example
 * ```typescript
 * const repoService = createRepositoryService(ecrClient);
 * const repositories = await repoService.listRepositories();
 * ```
 */
export function createRepositoryService(client: EcrClientInterface): RepositoryService {
  return new RepositoryServiceImpl(client);
}
