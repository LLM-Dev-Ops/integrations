/**
 * Buildkite build types.
 *
 * @module types/build
 */

import type { Job } from './job.js';

/**
 * Build state.
 */
export enum BuildState {
  /** Build is scheduled. */
  Scheduled = 'scheduled',
  /** Build is running. */
  Running = 'running',
  /** Build passed. */
  Passed = 'passed',
  /** Build failed. */
  Failed = 'failed',
  /** Build is blocked. */
  Blocked = 'blocked',
  /** Build was canceled. */
  Canceled = 'canceled',
  /** Build is being canceled. */
  Canceling = 'canceling',
  /** Build was skipped. */
  Skipped = 'skipped',
  /** Build did not run. */
  NotRun = 'not_run',
  /** Build is waiting. */
  Waiting = 'waiting',
}

/**
 * Build source.
 */
export enum BuildSource {
  /** Triggered by webhook. */
  Webhook = 'webhook',
  /** Triggered via API. */
  Api = 'api',
  /** Triggered via UI. */
  Ui = 'ui',
  /** Triggered by another build. */
  Trigger = 'trigger',
  /** Triggered by schedule. */
  Schedule = 'schedule',
}

/**
 * Commit author information.
 */
export interface Author {
  /** Author name. */
  readonly name: string;
  /** Author email. */
  readonly email: string;
}

/**
 * Build creator information.
 */
export interface Creator {
  /** Creator ID. */
  readonly id: string;
  /** Creator name. */
  readonly name: string;
  /** Creator email. */
  readonly email: string;
  /** Avatar URL. */
  readonly avatar_url: string;
  /** Creation time. */
  readonly created_at: string;
}

/**
 * Pull request information.
 */
export interface PullRequest {
  /** Pull request ID. */
  readonly id: string;
  /** Base branch. */
  readonly base: string;
  /** Repository URL. */
  readonly repository: string;
}

/**
 * Pipeline reference in build.
 */
export interface PipelineRef {
  /** Pipeline ID. */
  readonly id: string;
  /** Pipeline slug. */
  readonly slug: string;
  /** Pipeline name. */
  readonly name: string;
}

/**
 * Build reference (for rebuilt builds).
 */
export interface BuildRef {
  /** Build ID. */
  readonly id: string;
  /** Build number. */
  readonly number: number;
  /** Build URL. */
  readonly url: string;
}

/**
 * Buildkite build.
 */
export interface Build {
  /** Build ID. */
  readonly id: string;
  /** GraphQL ID. */
  readonly graphql_id: string;
  /** Build number. */
  readonly number: number;
  /** Build state. */
  readonly state: BuildState;
  /** Whether build is blocked. */
  readonly blocked: boolean;
  /** Commit message. */
  readonly message: string;
  /** Commit SHA. */
  readonly commit: string;
  /** Branch name. */
  readonly branch: string;
  /** Tag name. */
  readonly tag?: string;
  /** Build source. */
  readonly source: BuildSource;
  /** Commit author. */
  readonly author?: Author;
  /** Build creator. */
  readonly creator?: Creator;
  /** Environment variables. */
  readonly env: Record<string, string>;
  /** Web URL. */
  readonly web_url: string;
  /** Jobs in this build. */
  readonly jobs: Job[];
  /** Creation time. */
  readonly created_at: string;
  /** Scheduled time. */
  readonly scheduled_at?: string;
  /** Start time. */
  readonly started_at?: string;
  /** Finish time. */
  readonly finished_at?: string;
  /** Build metadata. */
  readonly meta_data: Record<string, string>;
  /** Pull request information. */
  readonly pull_request?: PullRequest;
  /** Pipeline reference. */
  readonly pipeline: PipelineRef;
  /** Build this was rebuilt from. */
  readonly rebuilt_from?: BuildRef;
}

/**
 * Request to create a new build.
 */
export interface CreateBuildRequest {
  /** Commit SHA to build. */
  commit: string;
  /** Branch to build. */
  branch: string;
  /** Commit message. */
  message?: string;
  /** Commit author. */
  author?: Author;
  /** Environment variables. */
  env?: Record<string, string>;
  /** Build metadata. */
  meta_data?: Record<string, string>;
  /** Ignore pipeline branch filters. */
  ignore_pipeline_branch_filters?: boolean;
  /** Force clean checkout. */
  clean_checkout?: boolean;
}

/**
 * Options for listing builds.
 */
export interface ListBuildsOptions {
  /** Filter by pipeline slug. */
  pipeline_slug?: string;
  /** Filter by branch. */
  branch?: string;
  /** Filter by commit. */
  commit?: string;
  /** Filter by state. */
  state?: BuildState;
  /** Filter by creator. */
  creator?: string;
  /** Filter by creation start date. */
  created_from?: string;
  /** Filter by creation end date. */
  created_to?: string;
  /** Filter by finish start date. */
  finished_from?: string;
  /** Filter by metadata. */
  meta_data_filters?: Record<string, string>;
  /** Results per page. */
  per_page?: number;
  /** Page number. */
  page?: number;
}

/**
 * Options for waiting on a build.
 */
export interface WaitOptions {
  /** Timeout in milliseconds. */
  timeout_ms?: number;
  /** Poll interval in milliseconds. */
  poll_interval_ms?: number;
  /** Automatically unblock blocked jobs. */
  auto_unblock?: boolean;
}
