/**
 * GitHub Pull Requests Service
 *
 * Provides comprehensive pull request management functionality including:
 * - Pull request CRUD operations
 * - Review management
 * - Review comments
 * - Merge operations
 *
 * @module services/pullRequests
 */

import { Paginated } from './repositories';

/**
 * Parameters for listing pull requests
 */
export interface ListPullRequestsParams {
  /** Filter by state: open, closed, or all */
  state?: 'open' | 'closed' | 'all';
  /** Filter by head user/branch: user:ref-name */
  head?: string;
  /** Filter by base branch */
  base?: string;
  /** Sort by: created, updated, popularity, or long-running */
  sort?: 'created' | 'updated' | 'popularity' | 'long-running';
  /** Sort direction: asc or desc */
  direction?: 'asc' | 'desc';
  /** Results per page (max 100) */
  per_page?: number;
  /** Page number */
  page?: number;
}

/**
 * Request to create a pull request
 */
export interface CreatePullRequestRequest {
  /** Pull request title */
  title: string;
  /** Pull request body/description */
  body?: string;
  /** Head branch (source) */
  head: string;
  /** Base branch (target) */
  base: string;
  /** Head repository (for forks): owner:branch */
  head_repo?: string;
  /** Allow maintainers to modify */
  maintainer_can_modify?: boolean;
  /** Create as draft */
  draft?: boolean;
}

/**
 * Request to update a pull request
 */
export interface UpdatePullRequestRequest {
  /** Pull request title */
  title?: string;
  /** Pull request body/description */
  body?: string;
  /** Pull request state */
  state?: 'open' | 'closed';
  /** Base branch */
  base?: string;
  /** Allow maintainers to modify */
  maintainer_can_modify?: boolean;
}

/**
 * Request to merge a pull request
 */
export interface MergePullRequestRequest {
  /** Commit title */
  commit_title?: string;
  /** Commit message */
  commit_message?: string;
  /** SHA that pull request head must match */
  sha?: string;
  /** Merge method: merge, squash, or rebase */
  merge_method?: 'merge' | 'squash' | 'rebase';
}

/**
 * Merge result
 */
export interface MergeResult {
  sha: string;
  merged: boolean;
  message: string;
}

/**
 * Request to create a review
 */
export interface CreateReviewRequest {
  /** Review body/comment */
  body?: string;
  /** Review event: APPROVE, REQUEST_CHANGES, or COMMENT */
  event?: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  /** Line-by-line comments */
  comments?: ReviewComment[];
  /** Commit ID to review */
  commit_id?: string;
}

/**
 * Review comment for creation
 */
export interface ReviewComment {
  /** Path to file */
  path: string;
  /** Position in diff (deprecated, use line) */
  position?: number;
  /** Comment body */
  body: string;
  /** Line number in the diff */
  line?: number;
  /** Side of diff: LEFT or RIGHT */
  side?: 'LEFT' | 'RIGHT';
  /** Start line for multi-line comment */
  start_line?: number;
  /** Start side for multi-line comment */
  start_side?: 'LEFT' | 'RIGHT';
}

/**
 * Request to update a review
 */
export interface UpdateReviewRequest {
  /** Review body/comment */
  body: string;
}

/**
 * Request to submit a review
 */
export interface SubmitReviewRequest {
  /** Review body/comment */
  body?: string;
  /** Review event: APPROVE, REQUEST_CHANGES, or COMMENT */
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
}

/**
 * Request to dismiss a review
 */
export interface DismissReviewRequest {
  /** Dismissal message */
  message: string;
}

/**
 * Request to create a review comment
 */
export interface CreateReviewCommentRequest {
  /** Comment body */
  body: string;
  /** Commit SHA */
  commit_id: string;
  /** Path to file */
  path: string;
  /** Position in diff (deprecated) */
  position?: number;
  /** Side of diff: LEFT or RIGHT */
  side?: 'LEFT' | 'RIGHT';
  /** Line number in diff */
  line?: number;
  /** Start line for multi-line comment */
  start_line?: number;
  /** Start side for multi-line comment */
  start_side?: 'LEFT' | 'RIGHT';
  /** Reply to comment ID */
  in_reply_to?: number;
}

/**
 * Pull request representation
 */
export interface PullRequest {
  id: number;
  node_id: string;
  url: string;
  html_url: string;
  diff_url: string;
  patch_url: string;
  issue_url: string;
  number: number;
  state: 'open' | 'closed';
  locked: boolean;
  title: string;
  user: any;
  body: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  merge_commit_sha: string | null;
  assignee: any | null;
  assignees: any[];
  requested_reviewers: any[];
  requested_teams: any[];
  labels: any[];
  milestone: any | null;
  draft: boolean;
  head: PullRequestRef;
  base: PullRequestRef;
  merged: boolean;
  mergeable: boolean | null;
  rebaseable: boolean | null;
  mergeable_state: string;
  merged_by: any | null;
  comments: number;
  review_comments: number;
  maintainer_can_modify: boolean;
  commits: number;
  additions: number;
  deletions: number;
  changed_files: number;
}

/**
 * Pull request reference (head or base)
 */
export interface PullRequestRef {
  label: string;
  ref: string;
  sha: string;
  user: any;
  repo: any;
}

/**
 * Pull request review
 */
export interface Review {
  id: number;
  node_id: string;
  user: any;
  body: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  html_url: string;
  pull_request_url: string;
  submitted_at: string | null;
  commit_id: string;
}

/**
 * Pull request review comment
 */
export interface PullRequestReviewComment {
  id: number;
  node_id: string;
  url: string;
  pull_request_review_id: number | null;
  diff_hunk: string;
  path: string;
  position: number | null;
  original_position: number | null;
  commit_id: string;
  original_commit_id: string;
  user: any;
  body: string;
  created_at: string;
  updated_at: string;
  html_url: string;
  pull_request_url: string;
  in_reply_to_id?: number;
  line?: number;
  side?: 'LEFT' | 'RIGHT';
  start_line?: number;
  start_side?: 'LEFT' | 'RIGHT';
}

/**
 * Pull Requests Service
 *
 * Handles all pull request operations including CRUD, reviews, and merging.
 */
export class PullRequestsService {
  /**
   * Creates a new PullRequestsService instance
   *
   * @param client - Reference to the GitHub client for making API calls
   */
  constructor(private client: any) {}

  /**
   * List pull requests for a repository
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param params - Optional parameters for filtering and pagination
   * @returns Paginated list of pull requests
   *
   * @example
   * ```typescript
   * const prs = await client.pullRequests.list('octocat', 'hello-world', {
   *   state: 'open',
   *   sort: 'updated',
   *   direction: 'desc'
   * });
   * ```
   */
  async list(owner: string, repo: string, params?: ListPullRequestsParams): Promise<Paginated<PullRequest>> {
    return this.client.request<Paginated<PullRequest>>('GET', `/repos/${owner}/${repo}/pulls`, {
      params
    });
  }

  /**
   * Get a specific pull request
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param pullNumber - Pull request number
   * @returns Pull request details
   *
   * @example
   * ```typescript
   * const pr = await client.pullRequests.get('octocat', 'hello-world', 42);
   * console.log(`${pr.title} (${pr.state})`);
   * ```
   */
  async get(owner: string, repo: string, pullNumber: number): Promise<PullRequest> {
    return this.client.request<PullRequest>('GET', `/repos/${owner}/${repo}/pulls/${pullNumber}`);
  }

  /**
   * Create a new pull request
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param request - Pull request creation parameters
   * @returns Created pull request
   *
   * @example
   * ```typescript
   * const pr = await client.pullRequests.create('octocat', 'hello-world', {
   *   title: 'Add new feature',
   *   body: 'This PR adds...',
   *   head: 'feature-branch',
   *   base: 'main',
   *   draft: true
   * });
   * ```
   */
  async create(owner: string, repo: string, request: CreatePullRequestRequest): Promise<PullRequest> {
    return this.client.request<PullRequest>('POST', `/repos/${owner}/${repo}/pulls`, {
      body: request
    });
  }

  /**
   * Update a pull request
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param pullNumber - Pull request number
   * @param request - Update parameters
   * @returns Updated pull request
   *
   * @example
   * ```typescript
   * const pr = await client.pullRequests.update('octocat', 'hello-world', 42, {
   *   title: 'Updated title',
   *   state: 'closed'
   * });
   * ```
   */
  async update(
    owner: string,
    repo: string,
    pullNumber: number,
    request: UpdatePullRequestRequest
  ): Promise<PullRequest> {
    return this.client.request<PullRequest>('PATCH', `/repos/${owner}/${repo}/pulls/${pullNumber}`, {
      body: request
    });
  }

  /**
   * Merge a pull request
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param pullNumber - Pull request number
   * @param request - Merge parameters
   * @returns Merge result
   *
   * @example
   * ```typescript
   * const result = await client.pullRequests.merge('octocat', 'hello-world', 42, {
   *   commit_title: 'Merge feature branch',
   *   merge_method: 'squash'
   * });
   * console.log(`Merged: ${result.merged}, SHA: ${result.sha}`);
   * ```
   */
  async merge(
    owner: string,
    repo: string,
    pullNumber: number,
    request?: MergePullRequestRequest
  ): Promise<MergeResult> {
    return this.client.request<MergeResult>('PUT', `/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, {
      body: request
    });
  }

  // Review operations

  /**
   * List reviews for a pull request
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param pullNumber - Pull request number
   * @returns Paginated list of reviews
   *
   * @example
   * ```typescript
   * const reviews = await client.pullRequests.listReviews('octocat', 'hello-world', 42);
   * reviews.items.forEach(review => console.log(`${review.state}: ${review.body}`));
   * ```
   */
  async listReviews(owner: string, repo: string, pullNumber: number): Promise<Paginated<Review>> {
    return this.client.request<Paginated<Review>>('GET', `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`);
  }

  /**
   * Get a specific review
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param pullNumber - Pull request number
   * @param reviewId - Review ID
   * @returns Review details
   *
   * @example
   * ```typescript
   * const review = await client.pullRequests.getReview('octocat', 'hello-world', 42, 12345);
   * ```
   */
  async getReview(owner: string, repo: string, pullNumber: number, reviewId: number): Promise<Review> {
    return this.client.request<Review>('GET', `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${reviewId}`);
  }

  /**
   * Create a review
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param pullNumber - Pull request number
   * @param request - Review creation parameters
   * @returns Created review
   *
   * @example
   * ```typescript
   * const review = await client.pullRequests.createReview('octocat', 'hello-world', 42, {
   *   body: 'Looks good!',
   *   event: 'APPROVE'
   * });
   * ```
   */
  async createReview(
    owner: string,
    repo: string,
    pullNumber: number,
    request: CreateReviewRequest
  ): Promise<Review> {
    return this.client.request<Review>('POST', `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, {
      body: request
    });
  }

  /**
   * Update a pending review
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param pullNumber - Pull request number
   * @param reviewId - Review ID
   * @param request - Update parameters
   * @returns Updated review
   *
   * @example
   * ```typescript
   * const review = await client.pullRequests.updateReview('octocat', 'hello-world', 42, 12345, {
   *   body: 'Updated review comments'
   * });
   * ```
   */
  async updateReview(
    owner: string,
    repo: string,
    pullNumber: number,
    reviewId: number,
    request: UpdateReviewRequest
  ): Promise<Review> {
    return this.client.request<Review>('PUT', `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${reviewId}`, {
      body: request
    });
  }

  /**
   * Submit a pending review
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param pullNumber - Pull request number
   * @param reviewId - Review ID
   * @param request - Submission parameters
   * @returns Submitted review
   *
   * @example
   * ```typescript
   * const review = await client.pullRequests.submitReview('octocat', 'hello-world', 42, 12345, {
   *   event: 'APPROVE',
   *   body: 'LGTM!'
   * });
   * ```
   */
  async submitReview(
    owner: string,
    repo: string,
    pullNumber: number,
    reviewId: number,
    request: SubmitReviewRequest
  ): Promise<Review> {
    return this.client.request<Review>('POST', `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${reviewId}/events`, {
      body: request
    });
  }

  /**
   * Dismiss a review
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param pullNumber - Pull request number
   * @param reviewId - Review ID
   * @param request - Dismissal parameters
   * @returns Dismissed review
   *
   * @example
   * ```typescript
   * const review = await client.pullRequests.dismissReview('octocat', 'hello-world', 42, 12345, {
   *   message: 'Outdated after recent changes'
   * });
   * ```
   */
  async dismissReview(
    owner: string,
    repo: string,
    pullNumber: number,
    reviewId: number,
    request: DismissReviewRequest
  ): Promise<Review> {
    return this.client.request<Review>('PUT', `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews/${reviewId}/dismissals`, {
      body: request
    });
  }

  // Review comment operations

  /**
   * List review comments on a pull request
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param pullNumber - Pull request number
   * @returns Paginated list of review comments
   *
   * @example
   * ```typescript
   * const comments = await client.pullRequests.listReviewComments('octocat', 'hello-world', 42);
   * comments.items.forEach(comment => console.log(`${comment.path}:${comment.line} - ${comment.body}`));
   * ```
   */
  async listReviewComments(owner: string, repo: string, pullNumber: number): Promise<Paginated<PullRequestReviewComment>> {
    return this.client.request<Paginated<PullRequestReviewComment>>('GET', `/repos/${owner}/${repo}/pulls/${pullNumber}/comments`);
  }

  /**
   * Get a specific review comment
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param commentId - Comment ID
   * @returns Review comment details
   *
   * @example
   * ```typescript
   * const comment = await client.pullRequests.getReviewComment('octocat', 'hello-world', 54321);
   * ```
   */
  async getReviewComment(owner: string, repo: string, commentId: number): Promise<PullRequestReviewComment> {
    return this.client.request<PullRequestReviewComment>('GET', `/repos/${owner}/${repo}/pulls/comments/${commentId}`);
  }

  /**
   * Create a review comment
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param pullNumber - Pull request number
   * @param request - Review comment parameters
   * @returns Created review comment
   *
   * @example
   * ```typescript
   * const comment = await client.pullRequests.createReviewComment('octocat', 'hello-world', 42, {
   *   body: 'Consider using const here',
   *   commit_id: 'abc123',
   *   path: 'src/index.ts',
   *   line: 42,
   *   side: 'RIGHT'
   * });
   * ```
   */
  async createReviewComment(
    owner: string,
    repo: string,
    pullNumber: number,
    request: CreateReviewCommentRequest
  ): Promise<PullRequestReviewComment> {
    return this.client.request<PullRequestReviewComment>('POST', `/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, {
      body: request
    });
  }

  /**
   * Reply to a review comment
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param pullNumber - Pull request number
   * @param commentId - Comment ID to reply to
   * @param body - Reply text
   * @returns Created reply comment
   *
   * @example
   * ```typescript
   * const reply = await client.pullRequests.replyToReviewComment(
   *   'octocat',
   *   'hello-world',
   *   42,
   *   54321,
   *   'Good catch, will fix that!'
   * );
   * ```
   */
  async replyToReviewComment(
    owner: string,
    repo: string,
    pullNumber: number,
    commentId: number,
    body: string
  ): Promise<PullRequestReviewComment> {
    return this.client.request<PullRequestReviewComment>('POST', `/repos/${owner}/${repo}/pulls/${pullNumber}/comments`, {
      body: {
        body,
        in_reply_to: commentId
      }
    });
  }

  /**
   * Update a review comment
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param commentId - Comment ID
   * @param body - Updated comment text
   * @returns Updated review comment
   *
   * @example
   * ```typescript
   * const comment = await client.pullRequests.updateReviewComment(
   *   'octocat',
   *   'hello-world',
   *   54321,
   *   'Updated: Consider using const or let here'
   * );
   * ```
   */
  async updateReviewComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string
  ): Promise<PullRequestReviewComment> {
    return this.client.request<PullRequestReviewComment>('PATCH', `/repos/${owner}/${repo}/pulls/comments/${commentId}`, {
      body: { body }
    });
  }

  /**
   * Delete a review comment
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param commentId - Comment ID
   *
   * @example
   * ```typescript
   * await client.pullRequests.deleteReviewComment('octocat', 'hello-world', 54321);
   * ```
   */
  async deleteReviewComment(owner: string, repo: string, commentId: number): Promise<void> {
    await this.client.request<void>('DELETE', `/repos/${owner}/${repo}/pulls/comments/${commentId}`);
  }
}
