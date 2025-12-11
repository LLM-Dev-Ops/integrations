/**
 * Core data types for GitHub API.
 *
 * This module provides TypeScript type definitions for all GitHub API entities,
 * matching the structure of the Rust implementation exactly.
 *
 * @module types
 */

/**
 * GitHub user (minimal representation).
 */
export interface User {
  /** User ID. */
  readonly id: number;
  /** Username (login). */
  readonly login: string;
  /** User node ID. */
  readonly node_id: string;
  /** Avatar URL. */
  readonly avatar_url: string;
  /** User type (User, Organization, Bot). */
  readonly type: string;
  /** Site admin flag. */
  readonly site_admin: boolean;
  /** Profile URL. */
  readonly html_url: string;
}

/**
 * Repository license.
 */
export interface License {
  /** License key. */
  readonly key: string;
  /** License name. */
  readonly name: string;
  /** SPDX ID. */
  readonly spdx_id?: string;
  /** License URL. */
  readonly url?: string;
}

/**
 * GitHub repository.
 */
export interface Repository {
  /** Repository ID. */
  readonly id: number;
  /** Node ID. */
  readonly node_id: string;
  /** Repository name. */
  readonly name: string;
  /** Full name (owner/repo). */
  readonly full_name: string;
  /** Owner information. */
  readonly owner: User;
  /** Whether the repository is private. */
  readonly private: boolean;
  /** Repository description. */
  readonly description?: string;
  /** Whether the repository is a fork. */
  readonly fork: boolean;
  /** Repository URL. */
  readonly url: string;
  /** HTML URL. */
  readonly html_url: string;
  /** Clone URL. */
  readonly clone_url: string;
  /** SSH URL. */
  readonly ssh_url: string;
  /** Default branch. */
  readonly default_branch: string;
  /** Primary language. */
  readonly language?: string;
  /** Fork count. */
  readonly forks_count: number;
  /** Stargazer count. */
  readonly stargazers_count: number;
  /** Watcher count. */
  readonly watchers_count: number;
  /** Open issue count. */
  readonly open_issues_count: number;
  /** Repository size in KB. */
  readonly size: number;
  /** Topics. */
  readonly topics: string[];
  /** Whether issues are enabled. */
  readonly has_issues: boolean;
  /** Whether projects are enabled. */
  readonly has_projects: boolean;
  /** Whether wiki is enabled. */
  readonly has_wiki: boolean;
  /** Whether downloads are enabled. */
  readonly has_downloads: boolean;
  /** Whether the repository is archived. */
  readonly archived: boolean;
  /** Whether the repository is disabled. */
  readonly disabled: boolean;
  /** License information. */
  readonly license?: License;
  /** Creation time. */
  readonly created_at: string;
  /** Last update time. */
  readonly updated_at: string;
  /** Last push time. */
  readonly pushed_at?: string;
}

/**
 * Branch commit reference.
 */
export interface BranchCommit {
  /** Commit SHA. */
  readonly sha: string;
  /** Commit URL. */
  readonly url: string;
}

/**
 * GitHub branch.
 */
export interface Branch {
  /** Branch name. */
  readonly name: string;
  /** Commit reference. */
  readonly commit: BranchCommit;
  /** Whether branch is protected. */
  readonly protected: boolean;
}

/**
 * Issue state.
 */
export enum IssueState {
  /** Open issue. */
  Open = 'open',
  /** Closed issue. */
  Closed = 'closed',
}

/**
 * GitHub label.
 */
export interface Label {
  /** Label ID. */
  readonly id: number;
  /** Node ID. */
  readonly node_id: string;
  /** Label name. */
  readonly name: string;
  /** Label description. */
  readonly description?: string;
  /** Label color (hex). */
  readonly color: string;
  /** Default label flag. */
  readonly default: boolean;
}

/**
 * Milestone state.
 */
export enum MilestoneState {
  /** Open milestone. */
  Open = 'open',
  /** Closed milestone. */
  Closed = 'closed',
}

/**
 * GitHub milestone.
 */
export interface Milestone {
  /** Milestone ID. */
  readonly id: number;
  /** Node ID. */
  readonly node_id: string;
  /** Milestone number. */
  readonly number: number;
  /** Milestone title. */
  readonly title: string;
  /** Milestone description. */
  readonly description?: string;
  /** Milestone state. */
  readonly state: MilestoneState;
  /** Creator. */
  readonly creator: User;
  /** Open issue count. */
  readonly open_issues: number;
  /** Closed issue count. */
  readonly closed_issues: number;
  /** Due date. */
  readonly due_on?: string;
  /** Creation time. */
  readonly created_at: string;
  /** Last update time. */
  readonly updated_at: string;
  /** Close time. */
  readonly closed_at?: string;
}

/**
 * GitHub issue.
 */
export interface Issue {
  /** Issue ID. */
  readonly id: number;
  /** Node ID. */
  readonly node_id: string;
  /** Issue number. */
  readonly number: number;
  /** Issue title. */
  readonly title: string;
  /** Issue body. */
  readonly body?: string;
  /** Issue state. */
  readonly state: IssueState;
  /** Issue author. */
  readonly user: User;
  /** Labels. */
  readonly labels: Label[];
  /** Assignees. */
  readonly assignees: User[];
  /** Milestone. */
  readonly milestone?: Milestone;
  /** Whether the issue is locked. */
  readonly locked: boolean;
  /** Lock reason. */
  readonly active_lock_reason?: string;
  /** Comment count. */
  readonly comments: number;
  /** HTML URL. */
  readonly html_url: string;
  /** Creation time. */
  readonly created_at: string;
  /** Last update time. */
  readonly updated_at: string;
  /** Close time. */
  readonly closed_at?: string;
  /** User who closed the issue. */
  readonly closed_by?: User;
}

/**
 * Pull request state.
 */
export enum PullRequestState {
  /** Open PR. */
  Open = 'open',
  /** Closed PR. */
  Closed = 'closed',
}

/**
 * Pull request branch reference.
 */
export interface PullRequestRef {
  /** Branch label. */
  readonly label: string;
  /** Branch name. */
  readonly ref: string;
  /** Commit SHA. */
  readonly sha: string;
  /** User. */
  readonly user: User;
  /** Repository. */
  readonly repo?: Repository;
}

/**
 * GitHub pull request.
 */
export interface PullRequest {
  /** PR ID. */
  readonly id: number;
  /** Node ID. */
  readonly node_id: string;
  /** PR number. */
  readonly number: number;
  /** PR title. */
  readonly title: string;
  /** PR body. */
  readonly body?: string;
  /** PR state. */
  readonly state: PullRequestState;
  /** PR author. */
  readonly user: User;
  /** Head branch info. */
  readonly head: PullRequestRef;
  /** Base branch info. */
  readonly base: PullRequestRef;
  /** Labels. */
  readonly labels: Label[];
  /** Assignees. */
  readonly assignees: User[];
  /** Requested reviewers. */
  readonly requested_reviewers: User[];
  /** Milestone. */
  readonly milestone?: Milestone;
  /** Whether the PR is locked. */
  readonly locked: boolean;
  /** Whether the PR is a draft. */
  readonly draft: boolean;
  /** Whether the PR is merged. */
  readonly merged: boolean;
  /** Merge commit SHA. */
  readonly merge_commit_sha?: string;
  /** User who merged the PR. */
  readonly merged_by?: User;
  /** Merged time. */
  readonly merged_at?: string;
  /** Whether the PR is mergeable. */
  readonly mergeable?: boolean;
  /** Mergeable state. */
  readonly mergeable_state?: string;
  /** Comment count. */
  readonly comments: number;
  /** Review comment count. */
  readonly review_comments: number;
  /** Commit count. */
  readonly commits: number;
  /** Additions. */
  readonly additions: number;
  /** Deletions. */
  readonly deletions: number;
  /** Changed files count. */
  readonly changed_files: number;
  /** HTML URL. */
  readonly html_url: string;
  /** Creation time. */
  readonly created_at: string;
  /** Last update time. */
  readonly updated_at: string;
  /** Close time. */
  readonly closed_at?: string;
}

/**
 * Release asset.
 */
export interface ReleaseAsset {
  /** Asset ID. */
  readonly id: number;
  /** Node ID. */
  readonly node_id: string;
  /** Asset name. */
  readonly name: string;
  /** Asset label. */
  readonly label?: string;
  /** Content type. */
  readonly content_type: string;
  /** Asset state. */
  readonly state: string;
  /** Asset size in bytes. */
  readonly size: number;
  /** Download count. */
  readonly download_count: number;
  /** Browser download URL. */
  readonly browser_download_url: string;
  /** Creation time. */
  readonly created_at: string;
  /** Last update time. */
  readonly updated_at: string;
  /** Uploader. */
  readonly uploader: User;
}

/**
 * GitHub release.
 */
export interface Release {
  /** Release ID. */
  readonly id: number;
  /** Node ID. */
  readonly node_id: string;
  /** Tag name. */
  readonly tag_name: string;
  /** Target commitish. */
  readonly target_commitish: string;
  /** Release name. */
  readonly name?: string;
  /** Release body. */
  readonly body?: string;
  /** Whether it's a draft. */
  readonly draft: boolean;
  /** Whether it's a prerelease. */
  readonly prerelease: boolean;
  /** Creation time. */
  readonly created_at: string;
  /** Publish time. */
  readonly published_at?: string;
  /** Author. */
  readonly author: User;
  /** Assets. */
  readonly assets: ReleaseAsset[];
  /** HTML URL. */
  readonly html_url: string;
  /** Tarball URL. */
  readonly tarball_url?: string;
  /** Zipball URL. */
  readonly zipball_url?: string;
}

/**
 * Content type.
 */
export enum ContentType {
  /** File content. */
  File = 'file',
  /** Directory content. */
  Dir = 'dir',
  /** Symbolic link. */
  Symlink = 'symlink',
  /** Git submodule. */
  Submodule = 'submodule',
}

/**
 * Repository content (file or directory).
 */
export interface Content {
  /** Content type. */
  readonly type: ContentType;
  /** Content encoding. */
  readonly encoding?: string;
  /** Content size. */
  readonly size: number;
  /** Content name. */
  readonly name: string;
  /** Content path. */
  readonly path: string;
  /** Content (base64 encoded for files). */
  readonly content?: string;
  /** Git SHA. */
  readonly sha: string;
  /** Content URL. */
  readonly url: string;
  /** HTML URL. */
  readonly html_url: string;
  /** Git URL. */
  readonly git_url?: string;
  /** Download URL. */
  readonly download_url?: string;
}

/**
 * Workflow state.
 */
export enum WorkflowState {
  /** Active workflow. */
  Active = 'active',
  /** Deleted workflow. */
  Deleted = 'deleted',
  /** Disabled by user. */
  DisabledFork = 'disabled_fork',
  /** Disabled by inactivity. */
  DisabledInactivity = 'disabled_inactivity',
  /** Disabled manually. */
  DisabledManually = 'disabled_manually',
  /** Unknown state. */
  Unknown = 'unknown',
}

/**
 * Workflow.
 */
export interface Workflow {
  /** Workflow ID. */
  readonly id: number;
  /** Node ID. */
  readonly node_id: string;
  /** Workflow name. */
  readonly name: string;
  /** Workflow path. */
  readonly path: string;
  /** Workflow state. */
  readonly state: WorkflowState;
  /** Creation time. */
  readonly created_at: string;
  /** Last update time. */
  readonly updated_at: string;
  /** HTML URL. */
  readonly html_url: string;
  /** Badge URL. */
  readonly badge_url: string;
}

/**
 * Workflow run status.
 */
export enum WorkflowRunStatus {
  /** Queued. */
  Queued = 'queued',
  /** In progress. */
  InProgress = 'in_progress',
  /** Completed. */
  Completed = 'completed',
  /** Waiting. */
  Waiting = 'waiting',
  /** Requested. */
  Requested = 'requested',
  /** Pending. */
  Pending = 'pending',
}

/**
 * Workflow run conclusion.
 */
export enum WorkflowRunConclusion {
  /** Success. */
  Success = 'success',
  /** Failure. */
  Failure = 'failure',
  /** Neutral. */
  Neutral = 'neutral',
  /** Cancelled. */
  Cancelled = 'cancelled',
  /** Skipped. */
  Skipped = 'skipped',
  /** Timed out. */
  TimedOut = 'timed_out',
  /** Action required. */
  ActionRequired = 'action_required',
  /** Stale. */
  Stale = 'stale',
}

/**
 * Workflow run.
 */
export interface WorkflowRun {
  /** Run ID. */
  readonly id: number;
  /** Node ID. */
  readonly node_id: string;
  /** Run name. */
  readonly name?: string;
  /** Workflow ID. */
  readonly workflow_id: number;
  /** Run number. */
  readonly run_number: number;
  /** Run attempt. */
  readonly run_attempt: number;
  /** Event that triggered the run. */
  readonly event: string;
  /** Run status. */
  readonly status?: WorkflowRunStatus;
  /** Run conclusion. */
  readonly conclusion?: WorkflowRunConclusion;
  /** Head branch. */
  readonly head_branch?: string;
  /** Head SHA. */
  readonly head_sha: string;
  /** HTML URL. */
  readonly html_url: string;
  /** Creation time. */
  readonly created_at: string;
  /** Last update time. */
  readonly updated_at: string;
  /** Run start time. */
  readonly run_started_at?: string;
}

/**
 * Organization.
 */
export interface Organization {
  /** Organization ID. */
  readonly id: number;
  /** Node ID. */
  readonly node_id: string;
  /** Organization login. */
  readonly login: string;
  /** Organization name. */
  readonly name?: string;
  /** Description. */
  readonly description?: string;
  /** Company. */
  readonly company?: string;
  /** Blog URL. */
  readonly blog?: string;
  /** Location. */
  readonly location?: string;
  /** Email. */
  readonly email?: string;
  /** Twitter username. */
  readonly twitter_username?: string;
  /** Avatar URL. */
  readonly avatar_url: string;
  /** HTML URL. */
  readonly html_url: string;
  /** Public repos count. */
  readonly public_repos: number;
  /** Public gists count. */
  readonly public_gists: number;
  /** Followers count. */
  readonly followers: number;
  /** Following count. */
  readonly following: number;
  /** Creation time. */
  readonly created_at: string;
  /** Last update time. */
  readonly updated_at: string;
}

/**
 * Team privacy level.
 */
export enum TeamPrivacy {
  /** Secret team. */
  Secret = 'secret',
  /** Closed team. */
  Closed = 'closed',
}

/**
 * Team.
 */
export interface Team {
  /** Team ID. */
  readonly id: number;
  /** Node ID. */
  readonly node_id: string;
  /** Team slug. */
  readonly slug: string;
  /** Team name. */
  readonly name: string;
  /** Team description. */
  readonly description?: string;
  /** Privacy level. */
  readonly privacy: TeamPrivacy;
  /** Permission level. */
  readonly permission: string;
  /** HTML URL. */
  readonly html_url: string;
  /** Members count. */
  readonly members_count: number;
  /** Repos count. */
  readonly repos_count: number;
  /** Parent team. */
  readonly parent?: Team;
}

/**
 * Gist file.
 */
export interface GistFile {
  /** Filename. */
  readonly filename: string;
  /** File type. */
  readonly type: string;
  /** File language. */
  readonly language?: string;
  /** Raw URL. */
  readonly raw_url: string;
  /** File size. */
  readonly size: number;
  /** File content (may be truncated). */
  readonly content?: string;
  /** Whether content is truncated. */
  readonly truncated: boolean;
}

/**
 * Gist.
 */
export interface Gist {
  /** Gist ID. */
  readonly id: string;
  /** Node ID. */
  readonly node_id: string;
  /** Gist description. */
  readonly description?: string;
  /** Whether the gist is public. */
  readonly public: boolean;
  /** Gist owner. */
  readonly owner?: User;
  /** Gist files. */
  readonly files: Record<string, GistFile>;
  /** Comment count. */
  readonly comments: number;
  /** HTML URL. */
  readonly html_url: string;
  /** Git pull URL. */
  readonly git_pull_url: string;
  /** Git push URL. */
  readonly git_push_url: string;
  /** Creation time. */
  readonly created_at: string;
  /** Last update time. */
  readonly updated_at: string;
}

/**
 * Comment (generic for issues, PRs, gists).
 */
export interface Comment {
  /** Comment ID. */
  readonly id: number;
  /** Node ID. */
  readonly node_id: string;
  /** Comment body. */
  readonly body: string;
  /** Comment author. */
  readonly user: User;
  /** HTML URL. */
  readonly html_url: string;
  /** Creation time. */
  readonly created_at: string;
  /** Last update time. */
  readonly updated_at: string;
}

/**
 * Webhook configuration.
 */
export interface WebhookConfig {
  /** Webhook URL. */
  readonly url: string;
  /** Content type. */
  readonly content_type: string;
  /** Secret (redacted in responses). */
  readonly secret?: string;
  /** Whether to allow insecure SSL. */
  readonly insecure_ssl: string;
}

/**
 * Webhook last response.
 */
export interface WebhookLastResponse {
  /** Response code. */
  readonly code?: number;
  /** Response status. */
  readonly status?: string;
  /** Response message. */
  readonly message?: string;
}

/**
 * Webhook.
 */
export interface Webhook {
  /** Webhook ID. */
  readonly id: number;
  /** Webhook type. */
  readonly type: string;
  /** Webhook name. */
  readonly name: string;
  /** Whether the webhook is active. */
  readonly active: boolean;
  /** Events that trigger the webhook. */
  readonly events: string[];
  /** Webhook configuration. */
  readonly config: WebhookConfig;
  /** Last response. */
  readonly last_response?: WebhookLastResponse;
  /** Creation time. */
  readonly created_at: string;
  /** Last update time. */
  readonly updated_at: string;
}
