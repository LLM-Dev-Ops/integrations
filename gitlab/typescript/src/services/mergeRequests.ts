/**
 * GitLab Merge Requests Service
 *
 * Provides comprehensive merge request management functionality including:
 * - Merge request CRUD operations
 * - Merge operations and approvals
 * - Changes and diff retrieval
 * - Commit history
 * - Notes (comments) management
 * - State transitions
 *
 * @module services/mergeRequests
 */

import type { GitLabClient } from '../client.js';
import type {
  MergeRequest,
  MergeRequestRef,
  ProjectRef,
  CreateMergeRequest,
  UpdateMergeRequest,
  MergeOptions,
  MergeRequestQuery,
  Page,
  Commit,
  Note,
  User,
} from '../types.js';

/**
 * Diff entry showing changes to a file
 */
export interface Diff {
  /** Old file path (before change) */
  readonly old_path: string;
  /** New file path (after change) */
  readonly new_path: string;
  /** Old file mode */
  readonly a_mode: string;
  /** New file mode */
  readonly b_mode: string;
  /** Whether this is a new file */
  readonly new_file: boolean;
  /** Whether the file was renamed */
  readonly renamed_file: boolean;
  /** Whether the file was deleted */
  readonly deleted_file: boolean;
  /** Unified diff content */
  readonly diff: string;
}

/**
 * Merge request with detailed changes
 */
export interface MergeRequestChanges extends MergeRequest {
  /** List of file changes/diffs */
  readonly changes: readonly Diff[];
}

/**
 * Approval information for a merge request
 */
export interface MergeRequestApprovals {
  /** Whether the MR is approved */
  readonly approved: boolean;
  /** List of users who approved */
  readonly approved_by: readonly User[];
  /** Number of approvals required */
  readonly approvals_required: number;
  /** Number of approvals still needed */
  readonly approvals_left: number;
}


/**
 * Merge Requests Service
 *
 * Handles all merge request operations including CRUD, approvals, merging, and comments.
 */
export class MergeRequestsService {
  /**
   * Creates a new MergeRequestsService instance
   *
   * @param client - GitLab client for making API calls
   */
  constructor(private readonly client: GitLabClient) {}

  // ============================================================================
  // CRUD Operations
  // ============================================================================

  /**
   * Create a new merge request
   *
   * @param project - Project reference (ID, path, or URL)
   * @param request - Merge request creation parameters
   * @returns Created merge request
   *
   * @example
   * ```typescript
   * const mr = await service.create(
   *   { type: 'Path', value: 'my-group/my-project' },
   *   {
   *     source_branch: 'feature-branch',
   *     target_branch: 'main',
   *     title: 'Add new feature',
   *     description: 'This MR adds...',
   *     draft: true,
   *     squash: true,
   *     remove_source_branch: true
   *   }
   * );
   * ```
   */
  async create(project: ProjectRef, request: CreateMergeRequest): Promise<MergeRequest> {
    const projectId = this.encodeProjectRef(project);

    return this.client.request<MergeRequest>('POST', `/projects/${projectId}/merge_requests`, {
      body: request,
    });
  }

  /**
   * Get a specific merge request
   *
   * @param ref - Merge request reference (project + IID)
   * @returns Merge request details
   *
   * @example
   * ```typescript
   * const mr = await service.get({
   *   project: { type: 'Path', value: 'my-group/my-project' },
   *   iid: 42
   * });
   * console.log(`${mr.title} (${mr.state})`);
   * ```
   */
  async get(ref: MergeRequestRef): Promise<MergeRequest> {
    const projectId = this.encodeProjectRef(ref.project);

    return this.client.request<MergeRequest>('GET', `/projects/${projectId}/merge_requests/${ref.iid}`);
  }

  /**
   * Update an existing merge request
   *
   * @param ref - Merge request reference (project + IID)
   * @param request - Update parameters
   * @returns Updated merge request
   *
   * @example
   * ```typescript
   * const mr = await service.update(
   *   {
   *     project: { type: 'Path', value: 'my-group/my-project' },
   *     iid: 42
   *   },
   *   {
   *     title: 'Updated title',
   *     state_event: 'close'
   *   }
   * );
   * ```
   */
  async update(ref: MergeRequestRef, request: UpdateMergeRequest): Promise<MergeRequest> {
    const projectId = this.encodeProjectRef(ref.project);

    return this.client.request<MergeRequest>('PUT', `/projects/${projectId}/merge_requests/${ref.iid}`, {
      body: request,
    });
  }

  /**
   * List merge requests for a project
   *
   * @param project - Project reference (ID, path, or URL)
   * @param query - Optional query parameters for filtering and pagination
   * @returns Paginated list of merge requests
   *
   * @example
   * ```typescript
   * const mrs = await service.list(
   *   { type: 'Path', value: 'my-group/my-project' },
   *   {
   *     state: MergeRequestState.Opened,
   *     scope: 'assigned_to_me',
   *     order_by: 'updated_at',
   *     sort: 'desc',
   *     per_page: 20
   *   }
   * );
   * ```
   */
  async list(project: ProjectRef, query?: MergeRequestQuery): Promise<Page<MergeRequest>> {
    const projectId = this.encodeProjectRef(project);

    return this.client.request<Page<MergeRequest>>('GET', `/projects/${projectId}/merge_requests`, {
      params: query as Record<string, unknown>,
    });
  }

  // ============================================================================
  // Merge Operations
  // ============================================================================

  /**
   * Merge a merge request
   *
   * @param ref - Merge request reference (project + IID)
   * @param options - Optional merge parameters
   * @returns Updated merge request after merge
   *
   * @example
   * ```typescript
   * const mr = await service.merge(
   *   {
   *     project: { type: 'Path', value: 'my-group/my-project' },
   *     iid: 42
   *   },
   *   {
   *     merge_commit_message: 'Merge feature branch',
   *     squash: true,
   *     should_remove_source_branch: true
   *   }
   * );
   * console.log(`Merged: ${mr.state === MergeRequestState.Merged}`);
   * ```
   */
  async merge(ref: MergeRequestRef, options?: MergeOptions): Promise<MergeRequest> {
    const projectId = this.encodeProjectRef(ref.project);

    return this.client.request<MergeRequest>('PUT', `/projects/${projectId}/merge_requests/${ref.iid}/merge`, {
      body: options,
    });
  }

  /**
   * Approve a merge request
   *
   * @param ref - Merge request reference (project + IID)
   * @param sha - Optional SHA to approve (ensures MR hasn't changed)
   *
   * @example
   * ```typescript
   * await service.approve({
   *   project: { type: 'Path', value: 'my-group/my-project' },
   *   iid: 42
   * }, 'abc123def456');
   * ```
   */
  async approve(ref: MergeRequestRef, sha?: string): Promise<void> {
    const projectId = this.encodeProjectRef(ref.project);

    await this.client.request<void>('POST', `/projects/${projectId}/merge_requests/${ref.iid}/approve`, {
      body: sha ? { sha } : undefined,
    });
  }

  /**
   * Remove approval from a merge request
   *
   * @param ref - Merge request reference (project + IID)
   *
   * @example
   * ```typescript
   * await service.unapprove({
   *   project: { type: 'Path', value: 'my-group/my-project' },
   *   iid: 42
   * });
   * ```
   */
  async unapprove(ref: MergeRequestRef): Promise<void> {
    const projectId = this.encodeProjectRef(ref.project);

    await this.client.request<void>('POST', `/projects/${projectId}/merge_requests/${ref.iid}/unapprove`);
  }

  /**
   * Get approval information for a merge request
   *
   * @param ref - Merge request reference (project + IID)
   * @returns Approval status and information
   *
   * @example
   * ```typescript
   * const approvals = await service.getApprovals({
   *   project: { type: 'Path', value: 'my-group/my-project' },
   *   iid: 42
   * });
   * console.log(`Approved: ${approvals.approved}, ${approvals.approvals_left} approvals needed`);
   * ```
   */
  async getApprovals(ref: MergeRequestRef): Promise<MergeRequestApprovals> {
    const projectId = this.encodeProjectRef(ref.project);

    return this.client.request<MergeRequestApprovals>(
      'GET',
      `/projects/${projectId}/merge_requests/${ref.iid}/approvals`
    );
  }

  // ============================================================================
  // Changes and Diffs
  // ============================================================================

  /**
   * Get detailed changes for a merge request
   *
   * @param ref - Merge request reference (project + IID)
   * @returns Merge request with detailed file changes
   *
   * @example
   * ```typescript
   * const changes = await service.getChanges({
   *   project: { type: 'Path', value: 'my-group/my-project' },
   *   iid: 42
   * });
   * changes.changes.forEach(diff => {
   *   console.log(`${diff.old_path} -> ${diff.new_path}`);
   * });
   * ```
   */
  async getChanges(ref: MergeRequestRef): Promise<MergeRequestChanges> {
    const projectId = this.encodeProjectRef(ref.project);

    return this.client.request<MergeRequestChanges>(
      'GET',
      `/projects/${projectId}/merge_requests/${ref.iid}/changes`
    );
  }

  /**
   * Get commits included in a merge request
   *
   * @param ref - Merge request reference (project + IID)
   * @returns List of commits
   *
   * @example
   * ```typescript
   * const commits = await service.getCommits({
   *   project: { type: 'Path', value: 'my-group/my-project' },
   *   iid: 42
   * });
   * commits.forEach(commit => console.log(`${commit.short_id}: ${commit.title}`));
   * ```
   */
  async getCommits(ref: MergeRequestRef): Promise<readonly Commit[]> {
    const projectId = this.encodeProjectRef(ref.project);

    return this.client.request<readonly Commit[]>(
      'GET',
      `/projects/${projectId}/merge_requests/${ref.iid}/commits`
    );
  }

  // ============================================================================
  // Comments (Notes)
  // ============================================================================

  /**
   * Add a comment (note) to a merge request
   *
   * @param ref - Merge request reference (project + IID)
   * @param body - Comment text
   * @returns Created note
   *
   * @example
   * ```typescript
   * const note = await service.addNote(
   *   {
   *     project: { type: 'Path', value: 'my-group/my-project' },
   *     iid: 42
   *   },
   *   'Looks good to me!'
   * );
   * ```
   */
  async addNote(ref: MergeRequestRef, body: string): Promise<Note> {
    const projectId = this.encodeProjectRef(ref.project);

    return this.client.request<Note>('POST', `/projects/${projectId}/merge_requests/${ref.iid}/notes`, {
      body: { body },
    });
  }

  /**
   * List comments (notes) on a merge request
   *
   * @param ref - Merge request reference (project + IID)
   * @param options - Optional pagination and sorting parameters
   * @returns Paginated list of notes
   *
   * @example
   * ```typescript
   * const notes = await service.listNotes(
   *   {
   *     project: { type: 'Path', value: 'my-group/my-project' },
   *     iid: 42
   *   },
   *   {
   *     sort: 'desc',
   *     per_page: 50
   *   }
   * );
   * ```
   */
  async listNotes(
    ref: MergeRequestRef,
    options?: {
      page?: number;
      perPage?: number;
      sort?: 'asc' | 'desc';
    }
  ): Promise<Page<Note>> {
    const projectId = this.encodeProjectRef(ref.project);

    const params: Record<string, unknown> = {};
    if (options?.page !== undefined) params.page = options.page;
    if (options?.perPage !== undefined) params.per_page = options.perPage;
    if (options?.sort !== undefined) params.sort = options.sort;

    return this.client.request<Page<Note>>('GET', `/projects/${projectId}/merge_requests/${ref.iid}/notes`, {
      params,
    });
  }

  /**
   * Update a comment (note) on a merge request
   *
   * @param ref - Merge request reference (project + IID)
   * @param noteId - Note ID to update
   * @param body - Updated comment text
   * @returns Updated note
   *
   * @example
   * ```typescript
   * const note = await service.updateNote(
   *   {
   *     project: { type: 'Path', value: 'my-group/my-project' },
   *     iid: 42
   *   },
   *   123,
   *   'Updated comment text'
   * );
   * ```
   */
  async updateNote(ref: MergeRequestRef, noteId: number, body: string): Promise<Note> {
    const projectId = this.encodeProjectRef(ref.project);

    return this.client.request<Note>(
      'PUT',
      `/projects/${projectId}/merge_requests/${ref.iid}/notes/${noteId}`,
      {
        body: { body },
      }
    );
  }

  /**
   * Delete a comment (note) from a merge request
   *
   * @param ref - Merge request reference (project + IID)
   * @param noteId - Note ID to delete
   *
   * @example
   * ```typescript
   * await service.deleteNote(
   *   {
   *     project: { type: 'Path', value: 'my-group/my-project' },
   *     iid: 42
   *   },
   *   123
   * );
   * ```
   */
  async deleteNote(ref: MergeRequestRef, noteId: number): Promise<void> {
    const projectId = this.encodeProjectRef(ref.project);

    await this.client.request<void>(
      'DELETE',
      `/projects/${projectId}/merge_requests/${ref.iid}/notes/${noteId}`
    );
  }

  // ============================================================================
  // State Operations
  // ============================================================================

  /**
   * Close a merge request
   *
   * @param ref - Merge request reference (project + IID)
   * @returns Updated merge request
   *
   * @example
   * ```typescript
   * const mr = await service.close({
   *   project: { type: 'Path', value: 'my-group/my-project' },
   *   iid: 42
   * });
   * console.log(`Closed: ${mr.state === MergeRequestState.Closed}`);
   * ```
   */
  async close(ref: MergeRequestRef): Promise<MergeRequest> {
    return this.update(ref, { state_event: 'close' });
  }

  /**
   * Reopen a closed merge request
   *
   * @param ref - Merge request reference (project + IID)
   * @returns Updated merge request
   *
   * @example
   * ```typescript
   * const mr = await service.reopen({
   *   project: { type: 'Path', value: 'my-group/my-project' },
   *   iid: 42
   * });
   * console.log(`Reopened: ${mr.state === MergeRequestState.Opened}`);
   * ```
   */
  async reopen(ref: MergeRequestRef): Promise<MergeRequest> {
    return this.update(ref, { state_event: 'reopen' });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Encode a project reference for use in API URLs
   *
   * @param project - Project reference (ID, path, or URL)
   * @returns Encoded project identifier
   * @private
   */
  private encodeProjectRef(project: ProjectRef): string {
    switch (project.type) {
      case 'Id':
        return String(project.value);
      case 'Path':
        // URL-encode the path (e.g., "my-group/my-project" -> "my-group%2Fmy-project")
        return encodeURIComponent(project.value);
      case 'Url':
        // Extract path from URL and encode it
        // Example: https://gitlab.com/my-group/my-project -> my-group/my-project
        const url = new URL(project.value);
        const path = url.pathname.replace(/^\//, '').replace(/\.git$/, '');
        return encodeURIComponent(path);
      default:
        // TypeScript exhaustiveness check
        const _exhaustive: never = project;
        throw new Error(`Unknown project reference type: ${(_exhaustive as ProjectRef).type}`);
    }
  }
}

/**
 * Factory function to create a MergeRequestsService instance
 *
 * @param client - GitLab client instance
 * @returns Configured MergeRequestsService
 *
 * @example
 * ```typescript
 * const client = createGitLabClient(config);
 * const mrService = createMergeRequestsService(client);
 *
 * const mr = await mrService.get({
 *   project: { type: 'Path', value: 'my-group/my-project' },
 *   iid: 42
 * });
 * ```
 */
export function createMergeRequestsService(client: GitLabClient): MergeRequestsService {
  return new MergeRequestsService(client);
}
