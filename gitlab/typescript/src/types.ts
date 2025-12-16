/**
 * GitLab Integration Type Definitions
 * Based on GitLab API v4 and SPARC specifications
 */

// ============================================================================
// Core Reference Types
// ============================================================================

/**
 * Reference to a GitLab project by ID, path, or URL
 */
export type ProjectRef =
  | { type: 'Id'; value: number }
  | { type: 'Path'; value: string }
  | { type: 'Url'; value: string };

/**
 * Reference to a merge request within a project
 */
export interface MergeRequestRef {
  readonly project: ProjectRef;
  readonly iid: number;
}

/**
 * Reference to a pipeline within a project
 */
export interface PipelineRef {
  readonly project: ProjectRef;
  readonly id: number;
}

/**
 * Reference to a job within a project
 */
export interface JobRef {
  readonly project: ProjectRef;
  readonly id: number;
}

/**
 * Reference to a commit by SHA, branch name, or tag name
 */
export type CommitRef =
  | { type: 'Sha'; value: string }
  | { type: 'Branch'; value: string }
  | { type: 'Tag'; value: string };

// ============================================================================
// Status and State Enums
// ============================================================================

/**
 * Pipeline execution status
 */
export enum PipelineStatus {
  Created = 'created',
  WaitingForResource = 'waiting_for_resource',
  Preparing = 'preparing',
  Pending = 'pending',
  Running = 'running',
  Success = 'success',
  Failed = 'failed',
  Canceled = 'canceled',
  Skipped = 'skipped',
  Manual = 'manual',
  Scheduled = 'scheduled',
}

/**
 * Job execution status
 */
export enum JobStatus {
  Created = 'created',
  Pending = 'pending',
  Running = 'running',
  Success = 'success',
  Failed = 'failed',
  Canceled = 'canceled',
  Skipped = 'skipped',
  Manual = 'manual',
  Waiting = 'waiting_for_resource',
}

/**
 * Merge request state
 */
export enum MergeRequestState {
  Opened = 'opened',
  Closed = 'closed',
  Merged = 'merged',
  Locked = 'locked',
  All = 'all',
}

/**
 * Merge request merge status
 */
export enum MergeStatus {
  CanBeMerged = 'can_be_merged',
  CannotBeMerged = 'cannot_be_merged',
  Checking = 'checking',
  CannotBeMergedRecheck = 'cannot_be_merged_recheck',
  Unchecked = 'unchecked',
}

/**
 * Project visibility level
 */
export enum Visibility {
  Public = 'public',
  Internal = 'internal',
  Private = 'private',
}

// ============================================================================
// Resource Types (GitLab API v4 Responses)
// ============================================================================

/**
 * GitLab user
 */
export interface User {
  readonly id: number;
  readonly username: string;
  readonly name: string;
  readonly avatar_url: string;
  readonly web_url: string;
  readonly state?: string;
  readonly email?: string;
}

/**
 * GitLab project
 */
export interface Project {
  readonly id: number;
  readonly name: string;
  readonly path: string;
  readonly path_with_namespace: string;
  readonly default_branch: string;
  readonly web_url: string;
  readonly visibility: Visibility;
  readonly description?: string;
  readonly created_at: string;
  readonly last_activity_at: string;
  readonly archived?: boolean;
  readonly star_count?: number;
  readonly forks_count?: number;
  readonly namespace?: {
    readonly id: number;
    readonly name: string;
    readonly path: string;
    readonly kind: string;
  };
  readonly owner?: User;
  readonly http_url_to_repo?: string;
  readonly ssh_url_to_repo?: string;
  readonly readme_url?: string;
  readonly topics?: readonly string[];
  readonly open_issues_count?: number;
}

/**
 * GitLab commit
 */
export interface Commit {
  readonly id: string;
  readonly short_id: string;
  readonly title: string;
  readonly message: string;
  readonly author_name: string;
  readonly author_email: string;
  readonly authored_date: string;
  readonly committer_name: string;
  readonly committer_email: string;
  readonly committed_date: string;
  readonly created_at: string;
  readonly parent_ids?: readonly string[];
  readonly web_url?: string;
  readonly stats?: {
    readonly additions: number;
    readonly deletions: number;
    readonly total: number;
  };
}

/**
 * GitLab branch
 */
export interface Branch {
  readonly name: string;
  readonly commit: Commit;
  readonly protected: boolean;
  readonly merged?: boolean;
  readonly default?: boolean;
  readonly can_push?: boolean;
  readonly developers_can_push?: boolean;
  readonly developers_can_merge?: boolean;
  readonly web_url?: string;
}

/**
 * GitLab merge request
 */
export interface MergeRequest {
  readonly id: number;
  readonly iid: number;
  readonly title: string;
  readonly description: string;
  readonly state: MergeRequestState;
  readonly merge_status: MergeStatus;
  readonly source_branch: string;
  readonly target_branch: string;
  readonly author: User;
  readonly web_url: string;
  readonly has_conflicts: boolean;
  readonly draft: boolean;
  readonly created_at: string;
  readonly updated_at: string;
  readonly merged_at?: string;
  readonly closed_at?: string;
  readonly merged_by?: User;
  readonly closed_by?: User;
  readonly assignee?: User;
  readonly assignees?: readonly User[];
  readonly reviewers?: readonly User[];
  readonly source_project_id: number;
  readonly target_project_id: number;
  readonly project_id: number;
  readonly labels?: readonly string[];
  readonly milestone?: {
    readonly id: number;
    readonly title: string;
    readonly description: string;
    readonly state: string;
    readonly due_date?: string;
  };
  readonly work_in_progress?: boolean;
  readonly squash?: boolean;
  readonly upvotes?: number;
  readonly downvotes?: number;
  readonly user_notes_count?: number;
  readonly changes_count?: string;
  readonly should_remove_source_branch?: boolean;
  readonly force_remove_source_branch?: boolean;
  readonly blocking_discussions_resolved?: boolean;
  readonly sha?: string;
  readonly merge_commit_sha?: string;
  readonly squash_commit_sha?: string;
  readonly discussion_locked?: boolean;
  readonly time_stats?: {
    readonly time_estimate: number;
    readonly total_time_spent: number;
    readonly human_time_estimate?: string;
    readonly human_total_time_spent?: string;
  };
  readonly head_pipeline?: Pipeline;
  readonly diff_refs?: {
    readonly base_sha: string;
    readonly head_sha: string;
    readonly start_sha: string;
  };
}

/**
 * GitLab pipeline
 */
export interface Pipeline {
  readonly id: number;
  readonly iid?: number;
  readonly status: PipelineStatus;
  readonly ref: string;
  readonly sha: string;
  readonly web_url: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly started_at?: string;
  readonly finished_at?: string;
  readonly duration?: number;
  readonly queued_duration?: number;
  readonly coverage?: string;
  readonly source?: string;
  readonly user?: User;
  readonly project_id?: number;
  readonly detailed_status?: {
    readonly icon: string;
    readonly text: string;
    readonly label: string;
    readonly group: string;
    readonly tooltip?: string;
    readonly has_details: boolean;
    readonly details_path?: string;
    readonly illustration?: unknown;
    readonly favicon?: string;
  };
}

/**
 * GitLab job
 */
export interface Job {
  readonly id: number;
  readonly name: string;
  readonly stage: string;
  readonly status: JobStatus;
  readonly web_url: string;
  readonly duration?: number;
  readonly started_at?: string;
  readonly finished_at?: string;
  readonly created_at: string;
  readonly ref?: string;
  readonly coverage?: string;
  readonly tag?: boolean;
  readonly allow_failure?: boolean;
  readonly user?: User;
  readonly pipeline?: {
    readonly id: number;
    readonly ref: string;
    readonly sha: string;
    readonly status: PipelineStatus;
  };
  readonly commit?: Commit;
  readonly runner?: {
    readonly id: number;
    readonly description: string;
    readonly active: boolean;
    readonly is_shared: boolean;
    readonly name?: string;
  };
  readonly artifacts?: readonly {
    readonly file_type: string;
    readonly size: number;
    readonly filename: string;
    readonly file_format?: string;
  }[];
  readonly artifacts_file?: {
    readonly filename: string;
    readonly size: number;
  };
  readonly artifacts_expire_at?: string;
  readonly queued_duration?: number;
}

/**
 * GitLab issue
 */
export interface Issue {
  readonly id: number;
  readonly iid: number;
  readonly title: string;
  readonly description: string;
  readonly state: 'opened' | 'closed';
  readonly labels: readonly string[];
  readonly assignees: readonly User[];
  readonly author: User;
  readonly web_url: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly closed_at?: string;
  readonly closed_by?: User;
  readonly project_id: number;
  readonly milestone?: {
    readonly id: number;
    readonly title: string;
    readonly description: string;
    readonly state: string;
    readonly due_date?: string;
  };
  readonly due_date?: string;
  readonly confidential?: boolean;
  readonly discussion_locked?: boolean;
  readonly upvotes?: number;
  readonly downvotes?: number;
  readonly user_notes_count?: number;
  readonly merge_requests_count?: number;
  readonly weight?: number;
  readonly time_stats?: {
    readonly time_estimate: number;
    readonly total_time_spent: number;
    readonly human_time_estimate?: string;
    readonly human_total_time_spent?: string;
  };
}

/**
 * GitLab note (comment)
 */
export interface Note {
  readonly id: number;
  readonly body: string;
  readonly author: User;
  readonly created_at: string;
  readonly updated_at: string;
  readonly system: boolean;
  readonly noteable_id: number;
  readonly noteable_type: string;
  readonly noteable_iid?: number;
  readonly resolvable?: boolean;
  readonly resolved?: boolean;
  readonly resolved_by?: User;
  readonly confidential?: boolean;
}

/**
 * GitLab file content
 */
export interface FileContent {
  readonly file_name: string;
  readonly file_path: string;
  readonly size: number;
  readonly encoding: string;
  readonly content: string;
  readonly ref: string;
  readonly blob_id: string;
  readonly commit_id: string;
  readonly last_commit_id?: string;
  readonly content_sha256?: string;
}

// ============================================================================
// Request Types
// ============================================================================

/**
 * Request to create a new merge request
 */
export interface CreateMergeRequest {
  readonly source_branch: string;
  readonly target_branch: string;
  readonly title: string;
  readonly description?: string;
  readonly assignee_id?: number;
  readonly assignee_ids?: readonly number[];
  readonly reviewer_ids?: readonly number[];
  readonly labels?: readonly string[] | string;
  readonly draft?: boolean;
  readonly squash?: boolean;
  readonly remove_source_branch?: boolean;
  readonly milestone_id?: number;
  readonly allow_collaboration?: boolean;
}

/**
 * Request to update an existing merge request
 */
export interface UpdateMergeRequest {
  readonly title?: string;
  readonly description?: string;
  readonly state_event?: 'close' | 'reopen';
  readonly target_branch?: string;
  readonly labels?: readonly string[] | string;
  readonly assignee_id?: number;
  readonly assignee_ids?: readonly number[];
  readonly reviewer_ids?: readonly number[];
  readonly milestone_id?: number;
  readonly draft?: boolean;
  readonly squash?: boolean;
  readonly remove_source_branch?: boolean;
  readonly discussion_locked?: boolean;
  readonly allow_collaboration?: boolean;
}

/**
 * Options for merging a merge request
 */
export interface MergeOptions {
  readonly merge_commit_message?: string;
  readonly squash_commit_message?: string;
  readonly squash?: boolean;
  readonly should_remove_source_branch?: boolean;
  readonly merge_when_pipeline_succeeds?: boolean;
  readonly sha?: string;
}

/**
 * Request to create a file in a repository
 */
export interface CreateFileRequest {
  readonly branch: string;
  readonly commit_message: string;
  readonly content: string;
  readonly encoding?: 'text' | 'base64';
  readonly author_email?: string;
  readonly author_name?: string;
  readonly start_branch?: string;
}

/**
 * Request to update a file in a repository
 */
export interface UpdateFileRequest {
  readonly branch: string;
  readonly commit_message: string;
  readonly content: string;
  readonly encoding?: 'text' | 'base64';
  readonly author_email?: string;
  readonly author_name?: string;
  readonly start_branch?: string;
  readonly last_commit_id?: string;
}

/**
 * Request to delete a file from a repository
 */
export interface DeleteFileRequest {
  readonly branch: string;
  readonly commit_message: string;
  readonly author_email?: string;
  readonly author_name?: string;
  readonly start_branch?: string;
  readonly last_commit_id?: string;
}

/**
 * Query parameters for listing pipelines
 */
export interface PipelineQuery {
  readonly status?: PipelineStatus;
  readonly ref?: string;
  readonly sha?: string;
  readonly username?: string;
  readonly order_by?: 'id' | 'status' | 'ref' | 'updated_at' | 'user_id';
  readonly sort?: 'asc' | 'desc';
  readonly page?: number;
  readonly per_page?: number;
  readonly updated_after?: string;
  readonly updated_before?: string;
  readonly source?: string;
}

/**
 * Query parameters for listing merge requests
 */
export interface MergeRequestQuery {
  readonly state?: MergeRequestState;
  readonly scope?: 'created_by_me' | 'assigned_to_me' | 'all';
  readonly author_id?: number;
  readonly author_username?: string;
  readonly assignee_id?: number;
  readonly assignee_username?: string;
  readonly reviewer_id?: number;
  readonly reviewer_username?: string;
  readonly source_branch?: string;
  readonly target_branch?: string;
  readonly search?: string;
  readonly labels?: readonly string[] | string;
  readonly milestone?: string;
  readonly order_by?: 'created_at' | 'updated_at' | 'title';
  readonly sort?: 'asc' | 'desc';
  readonly page?: number;
  readonly per_page?: number;
  readonly created_after?: string;
  readonly created_before?: string;
  readonly updated_after?: string;
  readonly updated_before?: string;
  readonly draft?: boolean;
  readonly wip?: 'yes' | 'no';
}

/**
 * Query parameters for listing commits
 */
export interface CommitQuery {
  readonly ref_name?: string;
  readonly since?: string;
  readonly until?: string;
  readonly path?: string;
  readonly all?: boolean;
  readonly with_stats?: boolean;
  readonly first_parent?: boolean;
  readonly order?: 'default' | 'topo';
  readonly page?: number;
  readonly per_page?: number;
}

/**
 * Pipeline variable for triggering pipelines
 */
export interface PipelineVariable {
  readonly key: string;
  readonly value: string;
  readonly variable_type?: 'env_var' | 'file';
}

/**
 * Request to create a pipeline
 */
export interface CreatePipelineRequest {
  readonly ref: string;
  readonly variables?: readonly PipelineVariable[];
}

/**
 * Query parameters for listing issues
 */
export interface IssueQuery {
  readonly state?: 'opened' | 'closed' | 'all';
  readonly labels?: readonly string[] | string;
  readonly milestone?: string;
  readonly scope?: 'created_by_me' | 'assigned_to_me' | 'all';
  readonly author_id?: number;
  readonly author_username?: string;
  readonly assignee_id?: number;
  readonly assignee_username?: string;
  readonly search?: string;
  readonly order_by?: 'created_at' | 'updated_at' | 'priority' | 'due_date' | 'relative_position' | 'label_priority' | 'milestone_due' | 'popularity' | 'weight';
  readonly sort?: 'asc' | 'desc';
  readonly page?: number;
  readonly per_page?: number;
  readonly created_after?: string;
  readonly created_before?: string;
  readonly updated_after?: string;
  readonly updated_before?: string;
}

/**
 * Request to create an issue
 */
export interface CreateIssueRequest {
  readonly title: string;
  readonly description?: string;
  readonly labels?: readonly string[] | string;
  readonly assignee_ids?: readonly number[];
  readonly milestone_id?: number;
  readonly due_date?: string;
  readonly confidential?: boolean;
  readonly weight?: number;
}

/**
 * Request to update an issue
 */
export interface UpdateIssueRequest {
  readonly title?: string;
  readonly description?: string;
  readonly state_event?: 'close' | 'reopen';
  readonly labels?: readonly string[] | string;
  readonly assignee_ids?: readonly number[];
  readonly milestone_id?: number;
  readonly due_date?: string;
  readonly confidential?: boolean;
  readonly weight?: number;
  readonly discussion_locked?: boolean;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Paginated results wrapper
 */
export interface PaginatedResults<T> {
  readonly items: readonly T[];
  readonly total_count?: number;
  readonly next_page?: number;
  readonly prev_page?: number;
  readonly total_pages?: number;
  readonly per_page?: number;
}

/**
 * Page type for paginated responses
 * Used by services for consistent pagination handling
 * This type is compatible with the Page type exported from client.ts
 */
export interface Page<T> {
  /**
   * Items in the current page
   */
  items: T[];

  /**
   * Whether there is a next page
   */
  hasNext: boolean;

  /**
   * Whether there is a previous page
   */
  hasPrev: boolean;

  /**
   * Function to retrieve the next page (if available)
   */
  nextPage?: () => Promise<Page<T>>;

  /**
   * Function to retrieve the previous page (if available)
   */
  prevPage?: () => Promise<Page<T>>;
}

/**
 * Result of comparing two refs
 */
export interface CompareResult {
  readonly commit: Commit;
  readonly commits: readonly Commit[];
  readonly diffs: readonly {
    readonly old_path: string;
    readonly new_path: string;
    readonly a_mode: string;
    readonly b_mode: string;
    readonly new_file: boolean;
    readonly renamed_file: boolean;
    readonly deleted_file: boolean;
    readonly diff: string;
  }[];
  readonly compare_timeout: boolean;
  readonly compare_same_ref: boolean;
}

/**
 * File action for commit operations
 */
export interface FileAction {
  readonly action: 'create' | 'delete' | 'move' | 'update' | 'chmod';
  readonly file_path: string;
  readonly previous_path?: string;
  readonly content?: string;
  readonly encoding?: 'text' | 'base64';
  readonly last_commit_id?: string;
  readonly execute_filemode?: boolean;
}

/**
 * Request to create a commit with multiple file actions
 */
export interface CreateCommitRequest {
  readonly branch: string;
  readonly commit_message: string;
  readonly actions: readonly FileAction[];
  readonly author_email?: string;
  readonly author_name?: string;
  readonly start_branch?: string;
  readonly start_sha?: string;
  readonly start_project?: number;
  readonly stats?: boolean;
  readonly force?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a pipeline status is terminal (completed/finished)
 */
export function isTerminalPipelineStatus(status: PipelineStatus): boolean {
  return [
    PipelineStatus.Success,
    PipelineStatus.Failed,
    PipelineStatus.Canceled,
    PipelineStatus.Skipped,
  ].includes(status);
}

/**
 * Check if a job status is terminal (completed/finished)
 */
export function isTerminalJobStatus(status: JobStatus): boolean {
  return [
    JobStatus.Success,
    JobStatus.Failed,
    JobStatus.Canceled,
    JobStatus.Skipped,
  ].includes(status);
}

/**
 * Check if a pipeline is running
 */
export function isPipelineRunning(status: PipelineStatus): boolean {
  return [
    PipelineStatus.WaitingForResource,
    PipelineStatus.Preparing,
    PipelineStatus.Pending,
    PipelineStatus.Running,
  ].includes(status);
}

/**
 * Check if a job is running
 */
export function isJobRunning(status: JobStatus): boolean {
  return [
    JobStatus.Pending,
    JobStatus.Running,
    JobStatus.Waiting,
  ].includes(status);
}

/**
 * Check if a merge request is open
 */
export function isMergeRequestOpen(state: MergeRequestState): boolean {
  return state === MergeRequestState.Opened;
}

/**
 * Check if a merge request can be merged
 */
export function canMerge(mergeStatus: MergeStatus): boolean {
  return mergeStatus === MergeStatus.CanBeMerged;
}

/**
 * Helper to create a project reference by ID
 */
export function projectRefById(id: number): ProjectRef {
  return { type: 'Id', value: id };
}

/**
 * Helper to create a project reference by path
 */
export function projectRefByPath(path: string): ProjectRef {
  return { type: 'Path', value: path };
}

/**
 * Helper to create a project reference by URL
 */
export function projectRefByUrl(url: string): ProjectRef {
  return { type: 'Url', value: url };
}

/**
 * Helper to create a commit reference by SHA
 */
export function commitRefBySha(sha: string): CommitRef {
  return { type: 'Sha', value: sha };
}

/**
 * Helper to create a commit reference by branch
 */
export function commitRefByBranch(branch: string): CommitRef {
  return { type: 'Branch', value: branch };
}

/**
 * Helper to create a commit reference by tag
 */
export function commitRefByTag(tag: string): CommitRef {
  return { type: 'Tag', value: tag };
}
