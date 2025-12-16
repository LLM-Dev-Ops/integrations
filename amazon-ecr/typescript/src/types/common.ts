/**
 * Common types for Amazon ECR.
 *
 * @module types/common
 */

/**
 * AWS resource tags.
 */
export type ResourceTags = Map<string, string>;

/**
 * Repository policy document.
 */
export interface RepositoryPolicy {
  /** AWS account ID that owns the repository. */
  readonly registryId: string;
  /** Repository name. */
  readonly repositoryName: string;
  /** IAM policy document as JSON string. */
  readonly policyText: string;
}

/**
 * Options for listing repositories.
 */
export interface ListRepositoriesOptions {
  /** Filter by registry ID (AWS account). */
  readonly registryId?: string;
  /** Filter by specific repository names. */
  readonly repositoryNames?: string[];
  /** Maximum results per page. */
  readonly maxResults?: number;
}

/**
 * Repository list result.
 */
export interface RepositoryList {
  /** Array of repositories. */
  readonly repositories: import('./repository.js').Repository[];
  /** Total count of repositories. */
  readonly totalCount: number;
}
