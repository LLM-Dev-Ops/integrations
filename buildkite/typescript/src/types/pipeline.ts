/**
 * Buildkite pipeline types.
 *
 * @module types/pipeline
 */

/**
 * Pipeline visibility level.
 */
export enum PipelineVisibility {
  /** Private pipeline. */
  Private = 'private',
  /** Public pipeline. */
  Public = 'public',
}

/**
 * Pipeline step type.
 */
export enum StepType {
  /** Script step. */
  Script = 'script',
  /** Waiter step. */
  Waiter = 'waiter',
  /** Block step. */
  Block = 'block',
  /** Trigger step. */
  Trigger = 'trigger',
  /** Input step. */
  Input = 'input',
}

/**
 * Pipeline step definition.
 */
export interface PipelineStep {
  /** Step type. */
  readonly type: StepType;
  /** Step name. */
  readonly name?: string;
  /** Command to execute. */
  readonly command?: string;
  /** Step label. */
  readonly label?: string;
}

/**
 * Provider settings for pipeline.
 */
export interface ProviderSettings {
  /** Provider ID. */
  readonly id: string;
  /** Webhook URL. */
  readonly webhook_url?: string;
  /** Repository URL. */
  readonly repository?: string;
}

/**
 * Buildkite pipeline.
 */
export interface Pipeline {
  /** Pipeline ID. */
  readonly id: string;
  /** GraphQL ID. */
  readonly graphql_id: string;
  /** Pipeline slug (URL-friendly identifier). */
  readonly slug: string;
  /** Pipeline name. */
  readonly name: string;
  /** Pipeline description. */
  readonly description?: string;
  /** Repository URL. */
  readonly repository: string;
  /** Branch filter configuration. */
  readonly branch_configuration?: string;
  /** Default branch. */
  readonly default_branch: string;
  /** Pipeline visibility. */
  readonly visibility: PipelineVisibility;
  /** Pipeline steps. */
  readonly steps: PipelineStep[];
  /** Provider settings. */
  readonly provider?: ProviderSettings;
  /** Builds API URL. */
  readonly builds_url: string;
  /** Web URL. */
  readonly web_url: string;
  /** Creation time. */
  readonly created_at: string;
  /** Scheduled builds count. */
  readonly scheduled_builds_count: number;
  /** Running builds count. */
  readonly running_builds_count: number;
  /** Scheduled jobs count. */
  readonly scheduled_jobs_count: number;
  /** Running jobs count. */
  readonly running_jobs_count: number;
  /** Waiting jobs count. */
  readonly waiting_jobs_count: number;
}
