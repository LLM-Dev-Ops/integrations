/**
 * Resource types for Jenkins entities.
 *
 * This module provides interfaces for Jenkins resources such as jobs, builds,
 * pipelines, queue items, and artifacts. These types match the structure returned
 * by the Jenkins REST API.
 *
 * @module resources
 */

import type { BuildResult, StageStatus } from './status.js';

/**
 * Health report for a job.
 *
 * Provides information about the overall health of a job based on
 * recent build results and other metrics.
 */
export interface HealthReport {
  /** Human-readable description of the health status. */
  readonly description: string;
  /** CSS class name for the health icon. */
  readonly iconClassName: string;
  /** URL to the health icon image. */
  readonly iconUrl: string;
  /** Health score (0-100, higher is better). */
  readonly score: number;
}

/**
 * Generic action object.
 *
 * Actions provide additional metadata and capabilities for builds,
 * such as parameters, causes, and test results.
 */
export interface Action {
  /** Action class name (used for type discrimination). */
  readonly _class: string;
  /** Build parameters (if this is a ParametersAction). */
  readonly parameters?: Array<{
    readonly name: string;
    readonly value: unknown;
  }>;
  /** Additional action-specific properties. */
  readonly [key: string]: unknown;
}

/**
 * Summary information about a job.
 *
 * Minimal job representation used in lists and references.
 */
export interface JobSummary {
  /** Job name. */
  readonly name: string;
  /** Job URL. */
  readonly url: string;
  /** Job color/status indicator (e.g., "blue", "red", "blue_anime"). */
  readonly color: string;
}

/**
 * Full job information.
 *
 * Complete representation of a Jenkins job including builds,
 * health reports, and configuration.
 */
export interface Job {
  /** Job name. */
  readonly name: string;
  /** Job URL. */
  readonly url: string;
  /** Job color/status indicator. */
  readonly color: string;
  /** Whether the job can be built. */
  readonly buildable: boolean;
  /** Whether the job has builds in queue. */
  readonly inQueue: boolean;
  /** Reference to the last build (if any). */
  readonly lastBuild?: {
    readonly number: number;
    readonly url: string;
  };
  /** Health reports for the job. */
  readonly healthReport?: HealthReport[];
  /** Job properties and metadata. */
  readonly property?: unknown[];
  /** Job description. */
  readonly description?: string;
  /** Display name (may differ from name). */
  readonly displayName?: string;
  /** Full display name including folder path. */
  readonly fullDisplayName?: string;
  /** Full job name including folder path. */
  readonly fullName?: string;
  /** List of recent builds. */
  readonly builds?: Array<{
    readonly number: number;
    readonly url: string;
  }>;
  /** First build reference. */
  readonly firstBuild?: {
    readonly number: number;
    readonly url: string;
  };
  /** Last successful build reference. */
  readonly lastSuccessfulBuild?: {
    readonly number: number;
    readonly url: string;
  };
  /** Last failed build reference. */
  readonly lastFailedBuild?: {
    readonly number: number;
    readonly url: string;
  };
  /** Last stable build reference. */
  readonly lastStableBuild?: {
    readonly number: number;
    readonly url: string;
  };
  /** Last unstable build reference. */
  readonly lastUnstableBuild?: {
    readonly number: number;
    readonly url: string;
  };
  /** Last completed build reference. */
  readonly lastCompletedBuild?: {
    readonly number: number;
    readonly url: string;
  };
}

/**
 * Summary information about a build.
 *
 * Minimal build representation used in lists and references.
 */
export interface BuildSummary {
  /** Build number. */
  readonly number: number;
  /** Build URL. */
  readonly url: string;
  /** Build result (null if still building). */
  readonly result: BuildResult | null;
  /** Whether the build is currently running. */
  readonly building: boolean;
  /** Build start timestamp (milliseconds since epoch). */
  readonly timestamp: number;
  /** Build duration in milliseconds (0 if still building). */
  readonly duration: number;
}

/**
 * Full build information.
 *
 * Complete representation of a Jenkins build including parameters,
 * artifacts, test results, and timing information.
 */
export interface Build {
  /** Build number. */
  readonly number: number;
  /** Build URL. */
  readonly url: string;
  /** Build result (null if still building). */
  readonly result: BuildResult | null;
  /** Whether the build is currently running. */
  readonly building: boolean;
  /** Build duration in milliseconds. */
  readonly duration: number;
  /** Estimated duration based on previous builds (milliseconds). */
  readonly estimatedDuration: number;
  /** Build start timestamp (milliseconds since epoch). */
  readonly timestamp: number;
  /** Display name for the build. */
  readonly displayName: string;
  /** Build description (may be null). */
  readonly description?: string | null;
  /** Build actions (parameters, causes, test results, etc.). */
  readonly actions: Action[];
  /** ID of the build. */
  readonly id?: string;
  /** Queue ID that created this build. */
  readonly queueId?: number;
  /** Changeset information. */
  readonly changeSet?: {
    readonly items: unknown[];
    readonly kind: string;
  };
  /** Culprits (users who may have caused build failure). */
  readonly culprits?: Array<{
    readonly fullName: string;
  }>;
  /** Build executor (node information). */
  readonly executor?: unknown;
}

/**
 * Pipeline stage execution node information.
 *
 * Represents the execution environment for a stage.
 */
export interface StageExecNode {
  /** Node ID. */
  readonly id: string;
  /** Node name. */
  readonly name: string;
  /** Execution status. */
  readonly status: StageStatus;
}

/**
 * Pipeline stage information.
 *
 * Represents a single stage in a pipeline execution.
 */
export interface Stage {
  /** Stage ID. */
  readonly id: string;
  /** Stage name. */
  readonly name: string;
  /** Stage execution status. */
  readonly status: StageStatus;
  /** Stage start time (milliseconds since epoch). */
  readonly startTimeMillis: number;
  /** Stage duration in milliseconds. */
  readonly durationMillis: number;
  /** Pause duration in milliseconds (for input steps). */
  readonly pauseDurationMillis?: number;
  /** Execution node information. */
  readonly execNode?: string;
  /** Stage error information (if failed). */
  readonly error?: {
    readonly message: string;
    readonly type: string;
  };
}

/**
 * Pipeline run information.
 *
 * Represents a complete pipeline execution including all stages.
 */
export interface PipelineRun {
  /** Pipeline run ID. */
  readonly id: string;
  /** Pipeline name. */
  readonly name: string;
  /** Overall pipeline status. */
  readonly status: StageStatus;
  /** Pipeline start time (milliseconds since epoch). */
  readonly startTimeMillis: number;
  /** Pipeline duration in milliseconds. */
  readonly durationMillis: number;
  /** Pipeline end time (milliseconds since epoch, may be null if running). */
  readonly endTimeMillis?: number | null;
  /** Pipeline stages. */
  readonly stages: Stage[];
  /** Pause duration in milliseconds. */
  readonly pauseDurationMillis?: number;
  /** Queue duration in milliseconds. */
  readonly queueDurationMillis?: number;
}

/**
 * Queue task information.
 *
 * Minimal representation of a job that has been queued.
 */
export interface QueueTask {
  /** Task name (job name). */
  readonly name: string;
  /** Task URL (job URL). */
  readonly url: string;
  /** Task color/status indicator. */
  readonly color?: string;
}

/**
 * Queue item information.
 *
 * Represents a queued build waiting to be executed.
 */
export interface QueueItem {
  /** Queue item ID. */
  readonly id: number;
  /** Associated task (job). */
  readonly task: QueueTask;
  /** Reason why the item is queued. */
  readonly why?: string | null;
  /** Whether the item is blocked. */
  readonly blocked: boolean;
  /** Whether the item is buildable. */
  readonly buildable: boolean;
  /** Whether the item is stuck. */
  readonly stuck: boolean;
  /** Executable build reference (set when build starts). */
  readonly executable?: {
    readonly number: number;
    readonly url: string;
  } | null;
  /** Time when item entered queue (milliseconds since epoch). */
  readonly inQueueSince: number;
  /** Whether the item was cancelled. */
  readonly cancelled?: boolean;
  /** Build parameters (if any). */
  readonly params?: string;
  /** Actions associated with the queue item. */
  readonly actions?: Action[];
}

/**
 * Build artifact information.
 *
 * Represents a file artifact produced by a build.
 */
export interface Artifact {
  /** Artifact file name. */
  readonly fileName: string;
  /** Relative path within the artifacts directory. */
  readonly relativePath: string;
  /** File size in bytes (may be undefined for some artifacts). */
  readonly size?: number;
  /** Artifact fingerprint hash (may be undefined). */
  readonly fingerprint?: string;
  /** Display path for the artifact. */
  readonly displayPath?: string;
}

/**
 * Test result summary.
 *
 * Aggregated test results from a build.
 */
export interface TestResult {
  /** Total number of tests. */
  readonly totalCount: number;
  /** Number of failed tests. */
  readonly failCount: number;
  /** Number of skipped tests. */
  readonly skipCount: number;
  /** Number of passed tests. */
  readonly passCount: number;
  /** URL to detailed test results. */
  readonly urlName?: string;
}

/**
 * Parameter definition for a parameterized job.
 */
export interface ParameterDefinition {
  /** Parameter name. */
  readonly name: string;
  /** Parameter type. */
  readonly type: string;
  /** Default value. */
  readonly defaultParameterValue?: {
    readonly value: unknown;
  };
  /** Parameter description. */
  readonly description?: string;
  /** Possible choices (for choice parameters). */
  readonly choices?: string[];
}

/**
 * Job property containing parameter definitions.
 */
export interface ParametersDefinitionProperty {
  /** Property class. */
  readonly _class: string;
  /** Parameter definitions. */
  readonly parameterDefinitions: ParameterDefinition[];
}
