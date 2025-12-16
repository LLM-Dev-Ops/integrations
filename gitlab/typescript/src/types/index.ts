/**
 * GitLab Pipelines Integration Type Definitions
 * Based on GitLab API v4 and SPARC specifications
 */

// ============================================================================
// Token and Authentication Types
// ============================================================================

/**
 * GitLab authentication token types
 */
export enum TokenType {
  /** Personal Access Token (PAT) */
  PersonalAccessToken = 'personal_access_token',
  /** Project Access Token */
  ProjectAccessToken = 'project_access_token',
  /** Group Access Token */
  GroupAccessToken = 'group_access_token',
  /** Pipeline Trigger Token */
  TriggerToken = 'trigger_token',
  /** CI Job Token (temporary) */
  CIJobToken = 'ci_job_token',
}

/**
 * Variable types for CI/CD pipelines
 */
export enum VariableType {
  /** Environment variable */
  EnvVar = 'env_var',
  /** File variable */
  File = 'file',
}

// ============================================================================
// Pipeline Status and Source Types
// ============================================================================

/**
 * Pipeline execution status
 *
 * States representing the lifecycle of a pipeline:
 * - Created: Pipeline created but not yet started
 * - WaitingForResource: Waiting for runner resources
 * - Preparing: Preparing environment
 * - Pending: Queued and waiting to run
 * - Running: Currently executing
 * - Success: Completed successfully
 * - Failed: Failed with errors
 * - Canceled: Manually canceled
 * - Skipped: Skipped due to conditions
 * - Manual: Requires manual intervention
 * - Scheduled: Scheduled to run later
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
 * Source that triggered the pipeline
 */
export enum PipelineSource {
  /** Triggered by a git push */
  Push = 'push',
  /** Triggered via web UI */
  Web = 'web',
  /** Triggered via API trigger token */
  Trigger = 'trigger',
  /** Triggered by pipeline schedule */
  Schedule = 'schedule',
  /** Triggered via API */
  Api = 'api',
  /** Triggered by external service */
  External = 'external',
  /** Triggered by another pipeline */
  Pipeline = 'pipeline',
  /** Triggered via chat command */
  Chat = 'chat',
  /** Triggered from Web IDE */
  WebIde = 'webide',
  /** Triggered by merge request event */
  MergeRequestEvent = 'merge_request_event',
  /** Triggered from parent pipeline */
  ParentPipeline = 'parent_pipeline',
}

// ============================================================================
// Job Status Types
// ============================================================================

/**
 * Job execution status
 *
 * States representing the lifecycle of a CI/CD job:
 * - Created: Job created but not yet queued
 * - Pending: Queued and waiting for runner
 * - Running: Currently executing
 * - Success: Completed successfully
 * - Failed: Failed with errors
 * - Canceled: Manually canceled
 * - Skipped: Skipped due to conditions
 * - Manual: Manual job waiting to be triggered
 * - Waiting: Waiting for resources
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

// ============================================================================
// User Type
// ============================================================================

/**
 * GitLab user information
 */
export interface User {
  /** User ID */
  readonly id: number;
  /** Username */
  readonly username: string;
  /** Display name */
  readonly name: string;
  /** Avatar URL */
  readonly avatar_url?: string;
  /** Profile web URL */
  readonly web_url?: string;
  /** User state */
  readonly state?: string;
  /** Email address */
  readonly email?: string;
}

// ============================================================================
// Pipeline Variable Type
// ============================================================================

/**
 * Pipeline variable for creating pipelines
 */
export interface Variable {
  /** Variable key/name */
  readonly key: string;
  /** Variable value */
  readonly value: string;
  /** Variable type (environment variable or file) */
  readonly variableType?: VariableType;
}

// ============================================================================
// Pipeline Types
// ============================================================================

/**
 * GitLab CI/CD Pipeline
 *
 * Represents a complete pipeline execution with all jobs
 */
export interface Pipeline {
  /** Pipeline ID */
  readonly id: number;
  /** Pipeline IID (project-scoped) */
  readonly iid?: number;
  /** Project ID */
  readonly projectId?: number;
  /** Commit SHA */
  readonly sha: string;
  /** Git ref (branch or tag) */
  readonly ref: string;
  /** Pipeline status */
  readonly status: PipelineStatus;
  /** Pipeline source */
  readonly source?: PipelineSource;
  /** Creation timestamp */
  readonly createdAt: string;
  /** Last update timestamp */
  readonly updatedAt: string;
  /** Start timestamp */
  readonly startedAt?: string;
  /** Finish timestamp */
  readonly finishedAt?: string;
  /** Duration in seconds */
  readonly duration?: number;
  /** Queue duration in seconds */
  readonly queuedDuration?: number;
  /** Web URL to view pipeline */
  readonly webUrl: string;
  /** User who triggered the pipeline */
  readonly user?: User;
  /** Code coverage percentage */
  readonly coverage?: string;
  /** Detailed status information */
  readonly detailedStatus?: {
    readonly icon: string;
    readonly text: string;
    readonly label: string;
    readonly group: string;
    readonly tooltip?: string;
    readonly hasDetails: boolean;
    readonly detailsPath?: string;
  };
}

/**
 * Input for creating a new pipeline
 */
export interface CreatePipelineInput {
  /** Git ref (branch or tag) to create pipeline for */
  readonly ref: string;
  /** Pipeline variables */
  readonly variables?: readonly Variable[];
}

// ============================================================================
// Job Types
// ============================================================================

/**
 * Runner information
 */
export interface Runner {
  /** Runner ID */
  readonly id: number;
  /** Runner description */
  readonly description: string;
  /** Whether runner is active */
  readonly active: boolean;
  /** Whether runner is shared */
  readonly isShared?: boolean;
  /** Runner name */
  readonly name?: string;
}

/**
 * Job artifact information
 */
export interface Artifact {
  /** Artifact filename */
  readonly filename: string;
  /** File size in bytes */
  readonly size: number;
  /** File type */
  readonly fileType: string;
  /** File format */
  readonly fileFormat?: string;
  /** Expiration timestamp */
  readonly expireAt?: string;
}

/**
 * Simplified pipeline info within a job
 */
export interface JobPipeline {
  /** Pipeline ID */
  readonly id: number;
  /** Git ref */
  readonly ref: string;
  /** Commit SHA */
  readonly sha: string;
  /** Pipeline status */
  readonly status: PipelineStatus;
}

/**
 * GitLab CI/CD Job
 *
 * Represents a single job within a pipeline
 */
export interface Job {
  /** Job ID */
  readonly id: number;
  /** Job name */
  readonly name: string;
  /** Pipeline stage */
  readonly stage: string;
  /** Job status */
  readonly status: JobStatus;
  /** Git ref (branch or tag) */
  readonly ref?: string;
  /** Creation timestamp */
  readonly createdAt: string;
  /** Start timestamp */
  readonly startedAt?: string;
  /** Finish timestamp */
  readonly finishedAt?: string;
  /** Duration in seconds */
  readonly duration?: number;
  /** Queue duration in seconds */
  readonly queuedDuration?: number;
  /** Whether job is allowed to fail */
  readonly allowFailure?: boolean;
  /** Associated pipeline */
  readonly pipeline?: JobPipeline;
  /** Job artifacts */
  readonly artifacts?: readonly Artifact[];
  /** Runner that executed the job */
  readonly runner?: Runner;
  /** Web URL to view job */
  readonly webUrl: string;
  /** Whether job is manual */
  readonly manual?: boolean;
  /** Whether job can be played (manual jobs) */
  readonly playable?: boolean;
  /** Whether job can be retried */
  readonly retryable?: boolean;
  /** Whether job can be canceled */
  readonly cancelable?: boolean;
  /** Code coverage percentage */
  readonly coverage?: string;
  /** Whether job is a tag job */
  readonly tag?: boolean;
}

// ============================================================================
// Webhook Types
// ============================================================================

/**
 * Project information in webhook events
 */
export interface ProjectInfo {
  /** Project ID */
  readonly id: number;
  /** Project name */
  readonly name: string;
  /** Project description */
  readonly description?: string;
  /** Web URL */
  readonly web_url: string;
  /** Avatar URL */
  readonly avatar_url?: string;
  /** Git SSH URL */
  readonly git_ssh_url?: string;
  /** Git HTTP URL */
  readonly git_http_url?: string;
  /** Namespace */
  readonly namespace: string;
  /** Visibility level */
  readonly visibility_level?: number;
  /** Path with namespace */
  readonly path_with_namespace: string;
  /** Default branch */
  readonly default_branch: string;
}

/**
 * Pipeline attributes in webhook events
 */
export interface PipelineAttributes {
  /** Pipeline ID */
  readonly id: number;
  /** Pipeline IID */
  readonly iid?: number;
  /** Git ref */
  readonly ref: string;
  /** Commit SHA */
  readonly sha: string;
  /** Before SHA */
  readonly before_sha?: string;
  /** Source */
  readonly source?: string;
  /** Status */
  readonly status: PipelineStatus;
  /** Stages */
  readonly stages?: readonly string[];
  /** Creation timestamp */
  readonly created_at: string;
  /** Finish timestamp */
  readonly finished_at?: string;
  /** Duration in seconds */
  readonly duration?: number;
  /** Variables */
  readonly variables?: readonly Variable[];
}

/**
 * Job attributes in webhook build events
 */
export interface JobAttributes {
  /** Job ID */
  readonly id: number;
  /** Git ref */
  readonly ref: string;
  /** Tag flag */
  readonly tag: boolean;
  /** Commit SHA */
  readonly sha: string;
  /** Status */
  readonly status: JobStatus;
  /** Stage */
  readonly stage: string;
  /** Job name */
  readonly name: string;
  /** Allow failure flag */
  readonly allow_failure: boolean;
  /** Creation timestamp */
  readonly created_at: string;
  /** Start timestamp */
  readonly started_at?: string;
  /** Finish timestamp */
  readonly finished_at?: string;
  /** Duration in seconds */
  readonly duration?: number;
  /** Queued duration in seconds */
  readonly queued_duration?: number;
  /** Manual flag */
  readonly manual?: boolean;
  /** Runner */
  readonly runner?: Runner;
  /** Pipeline ID */
  readonly pipeline_id?: number;
  /** Environment */
  readonly environment?: string;
}

/**
 * GitLab webhook event
 *
 * Base structure for webhook events
 */
export interface WebhookEvent {
  /** Event type (object_kind) */
  readonly objectKind: string;
  /** Event-specific attributes */
  readonly objectAttributes: PipelineAttributes | JobAttributes;
  /** Project information */
  readonly project: ProjectInfo;
  /** Builds/jobs (for pipeline events) */
  readonly builds?: readonly JobAttributes[];
  /** User who triggered the event */
  readonly user?: User;
}

// ============================================================================
// Pagination Types
// ============================================================================

/**
 * Paginated result wrapper
 *
 * Generic type for paginated API responses
 */
export interface PaginatedResult<T> {
  /** Array of items */
  readonly items: readonly T[];
  /** Current page number */
  readonly page?: number;
  /** Items per page */
  readonly perPage?: number;
  /** Total number of items */
  readonly total?: number;
  /** Total number of pages */
  readonly totalPages?: number;
  /** Next page number */
  readonly nextPage?: number;
  /** Previous page number */
  readonly prevPage?: number;
}

// ============================================================================
// Query and List Options
// ============================================================================

/**
 * Options for listing pipelines
 */
export interface ListPipelinesOptions {
  /** Filter by status */
  readonly status?: PipelineStatus;
  /** Filter by git ref */
  readonly ref?: string;
  /** Filter by commit SHA */
  readonly sha?: string;
  /** Filter by username */
  readonly username?: string;
  /** Order by field */
  readonly orderBy?: 'id' | 'status' | 'ref' | 'updated_at' | 'user_id';
  /** Sort direction */
  readonly sort?: 'asc' | 'desc';
  /** Page number */
  readonly page?: number;
  /** Items per page */
  readonly perPage?: number;
  /** Filter pipelines updated after this date */
  readonly updatedAfter?: string;
  /** Filter pipelines updated before this date */
  readonly updatedBefore?: string;
  /** Filter by source */
  readonly source?: PipelineSource;
  /** Scope of pipelines */
  readonly scope?: 'running' | 'pending' | 'finished' | 'branches' | 'tags';
}

/**
 * Options for listing jobs
 */
export interface ListJobsOptions {
  /** Filter by scope (array of job statuses) */
  readonly scope?: readonly JobStatus[];
  /** Include retried jobs */
  readonly includeRetried?: boolean;
  /** Page number */
  readonly page?: number;
  /** Items per page */
  readonly perPage?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a pipeline status is terminal (completed/finished)
 *
 * @param status - Pipeline status to check
 * @returns true if pipeline is in a terminal state
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
 *
 * @param status - Job status to check
 * @returns true if job is in a terminal state
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
 * Check if a pipeline is currently running
 *
 * @param status - Pipeline status to check
 * @returns true if pipeline is in a running state
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
 * Check if a job is currently running
 *
 * @param status - Job status to check
 * @returns true if job is in a running state
 */
export function isJobRunning(status: JobStatus): boolean {
  return [JobStatus.Pending, JobStatus.Running, JobStatus.Waiting].includes(
    status
  );
}

/**
 * Check if a pipeline can be canceled
 *
 * @param status - Pipeline status to check
 * @returns true if pipeline can be canceled
 */
export function isPipelineCancelable(status: PipelineStatus): boolean {
  return [
    PipelineStatus.Created,
    PipelineStatus.WaitingForResource,
    PipelineStatus.Preparing,
    PipelineStatus.Pending,
    PipelineStatus.Running,
  ].includes(status);
}

/**
 * Check if a job can be canceled
 *
 * @param status - Job status to check
 * @returns true if job can be canceled
 */
export function isJobCancelable(status: JobStatus): boolean {
  return [
    JobStatus.Created,
    JobStatus.Pending,
    JobStatus.Running,
    JobStatus.Waiting,
  ].includes(status);
}

/**
 * Check if a pipeline can be retried
 *
 * @param status - Pipeline status to check
 * @returns true if pipeline can be retried
 */
export function isPipelineRetryable(status: PipelineStatus): boolean {
  return [
    PipelineStatus.Failed,
    PipelineStatus.Canceled,
    PipelineStatus.Success,
  ].includes(status);
}

/**
 * Check if a job can be retried
 *
 * @param status - Job status to check
 * @returns true if job can be retried
 */
export function isJobRetryable(status: JobStatus): boolean {
  return [JobStatus.Failed, JobStatus.Canceled, JobStatus.Success].includes(
    status
  );
}

/**
 * Check if a pipeline was successful
 *
 * @param status - Pipeline status to check
 * @returns true if pipeline succeeded
 */
export function isPipelineSuccessful(status: PipelineStatus): boolean {
  return status === PipelineStatus.Success;
}

/**
 * Check if a job was successful
 *
 * @param status - Job status to check
 * @returns true if job succeeded
 */
export function isJobSuccessful(status: JobStatus): boolean {
  return status === JobStatus.Success;
}

/**
 * Check if a pipeline failed
 *
 * @param status - Pipeline status to check
 * @returns true if pipeline failed
 */
export function isPipelineFailed(status: PipelineStatus): boolean {
  return status === PipelineStatus.Failed;
}

/**
 * Check if a job failed
 *
 * @param status - Job status to check
 * @returns true if job failed
 */
export function isJobFailed(status: JobStatus): boolean {
  return status === JobStatus.Failed;
}

/**
 * Check if a pipeline is pending
 *
 * @param status - Pipeline status to check
 * @returns true if pipeline is pending
 */
export function isPipelinePending(status: PipelineStatus): boolean {
  return [
    PipelineStatus.Created,
    PipelineStatus.WaitingForResource,
    PipelineStatus.Preparing,
    PipelineStatus.Pending,
  ].includes(status);
}

/**
 * Check if a job is pending
 *
 * @param status - Job status to check
 * @returns true if job is pending
 */
export function isJobPending(status: JobStatus): boolean {
  return [JobStatus.Created, JobStatus.Pending, JobStatus.Waiting].includes(
    status
  );
}
