/**
 * GitHub Issues Service
 *
 * Provides comprehensive issue management functionality including:
 * - Issue CRUD operations
 * - Comments management
 * - Labels management
 * - Milestones management
 *
 * @module services/issues
 */

import { Paginated } from './repositories';

/**
 * Parameters for listing issues
 */
export interface ListIssuesParams {
  /** Filter by issue state */
  state?: 'open' | 'closed' | 'all';
  /** Filter by comma-separated label names */
  labels?: string;
  /** Filter by assignee: username, 'none', or '*' for any */
  assignee?: string;
  /** Filter by creator username */
  creator?: string;
  /** Filter by username mentioned */
  mentioned?: string;
  /** Filter by milestone: number, 'none', or '*' for any */
  milestone?: string;
  /** Sort by: created, updated, or comments */
  sort?: 'created' | 'updated' | 'comments';
  /** Sort direction: asc or desc */
  direction?: 'asc' | 'desc';
  /** Filter by issues updated since timestamp (ISO 8601) */
  since?: string;
  /** Results per page (max 100) */
  per_page?: number;
  /** Page number */
  page?: number;
}

/**
 * Request to create an issue
 */
export interface CreateIssueRequest {
  /** Issue title */
  title: string;
  /** Issue body/description */
  body?: string;
  /** Username to assign */
  assignee?: string;
  /** Usernames to assign */
  assignees?: string[];
  /** Milestone number */
  milestone?: number;
  /** Label names */
  labels?: string[];
}

/**
 * Request to update an issue
 */
export interface UpdateIssueRequest {
  /** Issue title */
  title?: string;
  /** Issue body/description */
  body?: string;
  /** Issue state */
  state?: 'open' | 'closed';
  /** State reason */
  state_reason?: 'completed' | 'not_planned' | 'reopened';
  /** Username to assign (null to unassign) */
  assignee?: string | null;
  /** Usernames to assign */
  assignees?: string[];
  /** Milestone number (null to remove) */
  milestone?: number | null;
  /** Label names */
  labels?: string[];
}

/**
 * Lock reason
 */
export type LockReason = 'off-topic' | 'too heated' | 'resolved' | 'spam';

/**
 * Request to create an issue comment
 */
export interface CreateCommentRequest {
  /** Comment body */
  body: string;
}

/**
 * Request to update an issue comment
 */
export interface UpdateCommentRequest {
  /** Comment body */
  body: string;
}

/**
 * Request to create a label
 */
export interface CreateLabelRequest {
  /** Label name */
  name: string;
  /** Label color (hex without #) */
  color: string;
  /** Label description */
  description?: string;
}

/**
 * Request to update a label
 */
export interface UpdateLabelRequest {
  /** New label name */
  new_name?: string;
  /** Label color (hex without #) */
  color?: string;
  /** Label description */
  description?: string;
}

/**
 * Request to create a milestone
 */
export interface CreateMilestoneRequest {
  /** Milestone title */
  title: string;
  /** Milestone state */
  state?: 'open' | 'closed';
  /** Milestone description */
  description?: string;
  /** Due date (ISO 8601) */
  due_on?: string;
}

/**
 * Request to update a milestone
 */
export interface UpdateMilestoneRequest {
  /** Milestone title */
  title?: string;
  /** Milestone state */
  state?: 'open' | 'closed';
  /** Milestone description */
  description?: string;
  /** Due date (ISO 8601) */
  due_on?: string;
}

/**
 * Issue representation
 */
export interface Issue {
  id: number;
  node_id: string;
  url: string;
  repository_url: string;
  labels_url: string;
  comments_url: string;
  events_url: string;
  html_url: string;
  number: number;
  state: 'open' | 'closed';
  state_reason: 'completed' | 'not_planned' | 'reopened' | null;
  title: string;
  body: string | null;
  user: any;
  labels: Label[];
  assignee: any | null;
  assignees: any[];
  milestone: Milestone | null;
  locked: boolean;
  active_lock_reason: string | null;
  comments: number;
  pull_request?: {
    url: string;
    html_url: string;
    diff_url: string;
    patch_url: string;
  };
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  closed_by: any | null;
}

/**
 * Issue comment representation
 */
export interface IssueComment {
  id: number;
  node_id: string;
  url: string;
  html_url: string;
  body: string;
  user: any;
  created_at: string;
  updated_at: string;
}

/**
 * Label representation
 */
export interface Label {
  id: number;
  node_id: string;
  url: string;
  name: string;
  color: string;
  default: boolean;
  description: string | null;
}

/**
 * Milestone representation
 */
export interface Milestone {
  id: number;
  node_id: string;
  number: number;
  state: 'open' | 'closed';
  title: string;
  description: string | null;
  creator: any;
  open_issues: number;
  closed_issues: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  due_on: string | null;
}

/**
 * Issues Service
 *
 * Handles all issue-related operations including CRUD, comments, labels,
 * and milestones.
 */
export class IssuesService {
  /**
   * Creates a new IssuesService instance
   *
   * @param client - Reference to the GitHub client for making API calls
   */
  constructor(private client: any) {}

  /**
   * List issues for the authenticated user across all repositories
   *
   * @param params - Optional parameters for filtering and pagination
   * @returns Paginated list of issues
   *
   * @example
   * ```typescript
   * const issues = await client.issues.list({
   *   state: 'open',
   *   assignee: 'octocat',
   *   sort: 'updated'
   * });
   * ```
   */
  async list(params?: ListIssuesParams): Promise<Paginated<Issue>> {
    return this.client.request<Paginated<Issue>>('GET', '/issues', {
      params
    });
  }

  /**
   * List issues for a specific repository
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param params - Optional parameters for filtering and pagination
   * @returns Paginated list of issues
   *
   * @example
   * ```typescript
   * const issues = await client.issues.listForRepo('octocat', 'hello-world', {
   *   state: 'all',
   *   labels: 'bug,help wanted',
   *   per_page: 50
   * });
   * ```
   */
  async listForRepo(owner: string, repo: string, params?: ListIssuesParams): Promise<Paginated<Issue>> {
    return this.client.request<Paginated<Issue>>('GET', `/repos/${owner}/${repo}/issues`, {
      params
    });
  }

  /**
   * Get a specific issue
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   * @returns Issue details
   *
   * @example
   * ```typescript
   * const issue = await client.issues.get('octocat', 'hello-world', 42);
   * console.log(issue.title);
   * ```
   */
  async get(owner: string, repo: string, issueNumber: number): Promise<Issue> {
    return this.client.request<Issue>('GET', `/repos/${owner}/${repo}/issues/${issueNumber}`);
  }

  /**
   * Create a new issue
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param request - Issue creation parameters
   * @returns Created issue
   *
   * @example
   * ```typescript
   * const issue = await client.issues.create('octocat', 'hello-world', {
   *   title: 'Bug found',
   *   body: 'Something is broken...',
   *   labels: ['bug', 'critical'],
   *   assignees: ['octocat']
   * });
   * ```
   */
  async create(owner: string, repo: string, request: CreateIssueRequest): Promise<Issue> {
    return this.client.request<Issue>('POST', `/repos/${owner}/${repo}/issues`, {
      body: request
    });
  }

  /**
   * Update an issue
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   * @param request - Update parameters
   * @returns Updated issue
   *
   * @example
   * ```typescript
   * const issue = await client.issues.update('octocat', 'hello-world', 42, {
   *   state: 'closed',
   *   state_reason: 'completed',
   *   labels: ['bug', 'resolved']
   * });
   * ```
   */
  async update(owner: string, repo: string, issueNumber: number, request: UpdateIssueRequest): Promise<Issue> {
    return this.client.request<Issue>('PATCH', `/repos/${owner}/${repo}/issues/${issueNumber}`, {
      body: request
    });
  }

  /**
   * Lock an issue
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   * @param reason - Optional lock reason
   *
   * @example
   * ```typescript
   * await client.issues.lock('octocat', 'hello-world', 42, 'resolved');
   * ```
   */
  async lock(owner: string, repo: string, issueNumber: number, reason?: LockReason): Promise<void> {
    await this.client.request<void>('PUT', `/repos/${owner}/${repo}/issues/${issueNumber}/lock`, {
      body: reason ? { lock_reason: reason } : undefined
    });
  }

  /**
   * Unlock an issue
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   *
   * @example
   * ```typescript
   * await client.issues.unlock('octocat', 'hello-world', 42);
   * ```
   */
  async unlock(owner: string, repo: string, issueNumber: number): Promise<void> {
    await this.client.request<void>('DELETE', `/repos/${owner}/${repo}/issues/${issueNumber}/lock`);
  }

  // Comment operations

  /**
   * List comments on an issue
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   * @returns Paginated list of comments
   *
   * @example
   * ```typescript
   * const comments = await client.issues.listComments('octocat', 'hello-world', 42);
   * comments.items.forEach(comment => console.log(comment.body));
   * ```
   */
  async listComments(owner: string, repo: string, issueNumber: number): Promise<Paginated<IssueComment>> {
    return this.client.request<Paginated<IssueComment>>('GET', `/repos/${owner}/${repo}/issues/${issueNumber}/comments`);
  }

  /**
   * Get a specific comment
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param commentId - Comment ID
   * @returns Comment details
   *
   * @example
   * ```typescript
   * const comment = await client.issues.getComment('octocat', 'hello-world', 12345);
   * ```
   */
  async getComment(owner: string, repo: string, commentId: number): Promise<IssueComment> {
    return this.client.request<IssueComment>('GET', `/repos/${owner}/${repo}/issues/comments/${commentId}`);
  }

  /**
   * Create a comment on an issue
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   * @param request - Comment content
   * @returns Created comment
   *
   * @example
   * ```typescript
   * const comment = await client.issues.createComment('octocat', 'hello-world', 42, {
   *   body: 'Thanks for reporting this!'
   * });
   * ```
   */
  async createComment(
    owner: string,
    repo: string,
    issueNumber: number,
    request: CreateCommentRequest
  ): Promise<IssueComment> {
    return this.client.request<IssueComment>('POST', `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
      body: request
    });
  }

  /**
   * Update a comment
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param commentId - Comment ID
   * @param request - Updated content
   * @returns Updated comment
   *
   * @example
   * ```typescript
   * const comment = await client.issues.updateComment('octocat', 'hello-world', 12345, {
   *   body: 'Updated comment text'
   * });
   * ```
   */
  async updateComment(
    owner: string,
    repo: string,
    commentId: number,
    request: UpdateCommentRequest
  ): Promise<IssueComment> {
    return this.client.request<IssueComment>('PATCH', `/repos/${owner}/${repo}/issues/comments/${commentId}`, {
      body: request
    });
  }

  /**
   * Delete a comment
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param commentId - Comment ID
   *
   * @example
   * ```typescript
   * await client.issues.deleteComment('octocat', 'hello-world', 12345);
   * ```
   */
  async deleteComment(owner: string, repo: string, commentId: number): Promise<void> {
    await this.client.request<void>('DELETE', `/repos/${owner}/${repo}/issues/comments/${commentId}`);
  }

  // Label operations

  /**
   * List all labels for a repository
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @returns Paginated list of labels
   *
   * @example
   * ```typescript
   * const labels = await client.issues.listLabels('octocat', 'hello-world');
   * labels.items.forEach(label => console.log(`${label.name}: ${label.color}`));
   * ```
   */
  async listLabels(owner: string, repo: string): Promise<Paginated<Label>> {
    return this.client.request<Paginated<Label>>('GET', `/repos/${owner}/${repo}/labels`);
  }

  /**
   * Get a specific label
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param name - Label name
   * @returns Label details
   *
   * @example
   * ```typescript
   * const label = await client.issues.getLabel('octocat', 'hello-world', 'bug');
   * ```
   */
  async getLabel(owner: string, repo: string, name: string): Promise<Label> {
    return this.client.request<Label>('GET', `/repos/${owner}/${repo}/labels/${name}`);
  }

  /**
   * Create a new label
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param request - Label creation parameters
   * @returns Created label
   *
   * @example
   * ```typescript
   * const label = await client.issues.createLabel('octocat', 'hello-world', {
   *   name: 'priority:high',
   *   color: 'ff0000',
   *   description: 'High priority items'
   * });
   * ```
   */
  async createLabel(owner: string, repo: string, request: CreateLabelRequest): Promise<Label> {
    return this.client.request<Label>('POST', `/repos/${owner}/${repo}/labels`, {
      body: request
    });
  }

  /**
   * Update a label
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param name - Current label name
   * @param request - Update parameters
   * @returns Updated label
   *
   * @example
   * ```typescript
   * const label = await client.issues.updateLabel('octocat', 'hello-world', 'bug', {
   *   color: 'ff6600',
   *   description: 'Something is broken'
   * });
   * ```
   */
  async updateLabel(owner: string, repo: string, name: string, request: UpdateLabelRequest): Promise<Label> {
    return this.client.request<Label>('PATCH', `/repos/${owner}/${repo}/labels/${name}`, {
      body: request
    });
  }

  /**
   * Delete a label
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param name - Label name
   *
   * @example
   * ```typescript
   * await client.issues.deleteLabel('octocat', 'hello-world', 'wontfix');
   * ```
   */
  async deleteLabel(owner: string, repo: string, name: string): Promise<void> {
    await this.client.request<void>('DELETE', `/repos/${owner}/${repo}/labels/${name}`);
  }

  /**
   * Add labels to an issue
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   * @param labels - Label names to add
   * @returns Updated list of labels on the issue
   *
   * @example
   * ```typescript
   * const labels = await client.issues.addLabels('octocat', 'hello-world', 42, ['bug', 'urgent']);
   * ```
   */
  async addLabels(owner: string, repo: string, issueNumber: number, labels: string[]): Promise<Label[]> {
    return this.client.request<Label[]>('POST', `/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
      body: { labels }
    });
  }

  /**
   * Remove a label from an issue
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param issueNumber - Issue number
   * @param name - Label name to remove
   *
   * @example
   * ```typescript
   * await client.issues.removeLabel('octocat', 'hello-world', 42, 'wip');
   * ```
   */
  async removeLabel(owner: string, repo: string, issueNumber: number, name: string): Promise<void> {
    await this.client.request<void>('DELETE', `/repos/${owner}/${repo}/issues/${issueNumber}/labels/${name}`);
  }

  // Milestone operations

  /**
   * List milestones for a repository
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param state - Filter by state: open, closed, or all
   * @returns Paginated list of milestones
   *
   * @example
   * ```typescript
   * const milestones = await client.issues.listMilestones('octocat', 'hello-world', 'open');
   * milestones.items.forEach(ms => console.log(`${ms.title}: ${ms.open_issues} open`));
   * ```
   */
  async listMilestones(
    owner: string,
    repo: string,
    state?: 'open' | 'closed' | 'all'
  ): Promise<Paginated<Milestone>> {
    return this.client.request<Paginated<Milestone>>('GET', `/repos/${owner}/${repo}/milestones`, {
      params: state ? { state } : undefined
    });
  }

  /**
   * Get a specific milestone
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param milestoneNumber - Milestone number
   * @returns Milestone details
   *
   * @example
   * ```typescript
   * const milestone = await client.issues.getMilestone('octocat', 'hello-world', 1);
   * ```
   */
  async getMilestone(owner: string, repo: string, milestoneNumber: number): Promise<Milestone> {
    return this.client.request<Milestone>('GET', `/repos/${owner}/${repo}/milestones/${milestoneNumber}`);
  }

  /**
   * Create a new milestone
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param request - Milestone creation parameters
   * @returns Created milestone
   *
   * @example
   * ```typescript
   * const milestone = await client.issues.createMilestone('octocat', 'hello-world', {
   *   title: 'v2.0',
   *   description: 'Major release',
   *   due_on: '2024-12-31T23:59:59Z'
   * });
   * ```
   */
  async createMilestone(owner: string, repo: string, request: CreateMilestoneRequest): Promise<Milestone> {
    return this.client.request<Milestone>('POST', `/repos/${owner}/${repo}/milestones`, {
      body: request
    });
  }

  /**
   * Update a milestone
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param milestoneNumber - Milestone number
   * @param request - Update parameters
   * @returns Updated milestone
   *
   * @example
   * ```typescript
   * const milestone = await client.issues.updateMilestone('octocat', 'hello-world', 1, {
   *   state: 'closed',
   *   description: 'Completed successfully'
   * });
   * ```
   */
  async updateMilestone(
    owner: string,
    repo: string,
    milestoneNumber: number,
    request: UpdateMilestoneRequest
  ): Promise<Milestone> {
    return this.client.request<Milestone>('PATCH', `/repos/${owner}/${repo}/milestones/${milestoneNumber}`, {
      body: request
    });
  }

  /**
   * Delete a milestone
   *
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param milestoneNumber - Milestone number
   *
   * @example
   * ```typescript
   * await client.issues.deleteMilestone('octocat', 'hello-world', 1);
   * ```
   */
  async deleteMilestone(owner: string, repo: string, milestoneNumber: number): Promise<void> {
    await this.client.request<void>('DELETE', `/repos/${owner}/${repo}/milestones/${milestoneNumber}`);
  }
}
