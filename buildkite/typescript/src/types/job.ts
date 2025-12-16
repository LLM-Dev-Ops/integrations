/**
 * Buildkite job types.
 *
 * @module types/job
 */

import type { Creator } from './build.js';

/**
 * Job type.
 */
export enum JobType {
  /** Script job. */
  Script = 'script',
  /** Waiter job. */
  Waiter = 'waiter',
  /** Block job. */
  Block = 'block',
  /** Trigger job. */
  Trigger = 'trigger',
  /** Manual job. */
  Manual = 'manual',
}

/**
 * Job state.
 */
export enum JobState {
  /** Job is pending. */
  Pending = 'pending',
  /** Job is waiting. */
  Waiting = 'waiting',
  /** Job waiting failed. */
  WaitingFailed = 'waiting_failed',
  /** Job is blocked. */
  Blocked = 'blocked',
  /** Job was unblocked. */
  Unblocked = 'unblocked',
  /** Job is being limited. */
  Limiting = 'limiting',
  /** Job was limited. */
  Limited = 'limited',
  /** Job is scheduled. */
  Scheduled = 'scheduled',
  /** Job is assigned. */
  Assigned = 'assigned',
  /** Job was accepted. */
  Accepted = 'accepted',
  /** Job is running. */
  Running = 'running',
  /** Job passed. */
  Passed = 'passed',
  /** Job failed. */
  Failed = 'failed',
  /** Job is being canceled. */
  Canceling = 'canceling',
  /** Job was canceled. */
  Canceled = 'canceled',
  /** Job timed out. */
  TimedOut = 'timed_out',
  /** Job was skipped. */
  Skipped = 'skipped',
  /** Job soft failed. */
  BrokenSoft = 'broken',
  /** Job expired. */
  Expired = 'expired',
}

/**
 * Agent reference in job.
 */
export interface AgentRef {
  /** Agent ID. */
  readonly id: string;
  /** Agent name. */
  readonly name: string;
  /** Agent URL. */
  readonly url: string;
}

/**
 * Buildkite job.
 */
export interface Job {
  /** Job ID. */
  readonly id: string;
  /** GraphQL ID. */
  readonly graphql_id: string;
  /** Job type. */
  readonly type: JobType;
  /** Job name. */
  readonly name?: string;
  /** Job label. */
  readonly label?: string;
  /** Step key. */
  readonly step_key?: string;
  /** Job state. */
  readonly state: JobState;
  /** Web URL. */
  readonly web_url: string;
  /** Log URL. */
  readonly log_url?: string;
  /** Raw log URL. */
  readonly raw_log_url?: string;
  /** Command to execute. */
  readonly command?: string;
  /** Exit status. */
  readonly exit_status?: number;
  /** Artifact paths pattern. */
  readonly artifact_paths?: string;
  /** Agent reference. */
  readonly agent?: AgentRef;
  /** Creation time. */
  readonly created_at: string;
  /** Scheduled time. */
  readonly scheduled_at?: string;
  /** Runnable time. */
  readonly runnable_at?: string;
  /** Start time. */
  readonly started_at?: string;
  /** Finish time. */
  readonly finished_at?: string;
  /** Whether job was retried. */
  readonly retried: boolean;
  /** ID of retry job. */
  readonly retried_in_job_id?: string;
  /** Number of retries. */
  readonly retries_count: number;
  /** Parallel group index. */
  readonly parallel_group_index?: number;
  /** Parallel group total. */
  readonly parallel_group_total?: number;
  /** Whether job soft failed. */
  readonly soft_failed: boolean;
  /** User who unblocked the job. */
  readonly unblocked_by?: Creator;
  /** Unblock time. */
  readonly unblocked_at?: string;
  /** Unblock URL. */
  readonly unblock_url?: string;
}

/**
 * Request to unblock a job.
 */
export interface UnblockRequest {
  /** User unblocking the job. */
  unblocker?: Creator;
  /** Form fields for unblock. */
  fields?: Record<string, string>;
}

/**
 * Job log content.
 */
export interface JobLog {
  /** Log content. */
  readonly content: string;
  /** Log size in bytes. */
  readonly size: number;
  /** Header timing information. */
  readonly header_times?: number[];
}
