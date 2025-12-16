/**
 * Status and result types for Jenkins builds and pipeline stages.
 *
 * This module provides enums and types for representing the state of builds,
 * pipeline stages, and overall execution status.
 *
 * @module status
 */

import type { QueueRef } from './refs.js';

/**
 * Jenkins build result.
 *
 * Represents the final outcome of a completed build.
 */
export enum BuildResult {
  /** Build completed successfully. */
  Success = 'SUCCESS',
  /** Build completed with test failures but did not fail. */
  Unstable = 'UNSTABLE',
  /** Build failed. */
  Failure = 'FAILURE',
  /** Build was not built (skipped). */
  NotBuilt = 'NOT_BUILT',
  /** Build was aborted by user or system. */
  Aborted = 'ABORTED',
  /** Unknown result. */
  Unknown = 'UNKNOWN',
}

/**
 * Converts a string to a BuildResult enum value.
 *
 * @param value - The string value from Jenkins API
 * @returns The corresponding BuildResult enum value
 *
 * @example
 * BuildResult.fromString('SUCCESS'); // Returns BuildResult.Success
 * BuildResult.fromString('failure'); // Returns BuildResult.Failure
 * BuildResult.fromString('invalid'); // Returns BuildResult.Unknown
 */
export function buildResultFromString(value: string | null | undefined): BuildResult {
  if (!value) {
    return BuildResult.Unknown;
  }

  const normalized = value.toUpperCase();
  switch (normalized) {
    case 'SUCCESS':
      return BuildResult.Success;
    case 'UNSTABLE':
      return BuildResult.Unstable;
    case 'FAILURE':
      return BuildResult.Failure;
    case 'NOT_BUILT':
    case 'NOTBUILT':
      return BuildResult.NotBuilt;
    case 'ABORTED':
      return BuildResult.Aborted;
    default:
      return BuildResult.Unknown;
  }
}

/**
 * Overall build status.
 *
 * Represents the current state of a build, including whether it's running,
 * queued, completed, or in an unknown state.
 */
export type BuildStatus =
  | { type: 'building' }
  | { type: 'queued'; queueRef: QueueRef }
  | { type: 'completed'; result: BuildResult }
  | { type: 'unknown' };

/**
 * Creates a building status.
 *
 * @param estimatedDuration - Optional estimated duration in milliseconds
 * @returns A BuildStatus representing an in-progress build
 */
export function buildingStatus(_estimatedDuration?: number): BuildStatus {
  return { type: 'building' };
}

/**
 * Creates a queued status.
 *
 * @param queueRef - Reference to the queue item
 * @returns A BuildStatus representing a queued build
 */
export function queuedStatus(queueRef: QueueRef): BuildStatus {
  return { type: 'queued', queueRef };
}

/**
 * Creates a completed status.
 *
 * @param result - The build result
 * @param duration - Optional duration in milliseconds
 * @returns A BuildStatus representing a completed build
 */
export function completedStatus(result: BuildResult, _duration?: number): BuildStatus {
  return { type: 'completed', result };
}

/**
 * Creates an unknown status.
 *
 * @returns A BuildStatus representing an unknown state
 */
export function unknownStatus(): BuildStatus {
  return { type: 'unknown' };
}

/**
 * Determines if a build status represents a running build.
 *
 * @param status - The build status
 * @returns True if the build is currently running
 */
export function isBuilding(status: BuildStatus): boolean {
  return status.type === 'building';
}

/**
 * Determines if a build status represents a queued build.
 *
 * @param status - The build status
 * @returns True if the build is queued
 */
export function isQueued(status: BuildStatus): boolean {
  return status.type === 'queued';
}

/**
 * Determines if a build status represents a completed build.
 *
 * @param status - The build status
 * @returns True if the build is completed
 */
export function isCompleted(status: BuildStatus): boolean {
  return status.type === 'completed';
}

/**
 * Pipeline stage status.
 *
 * Represents the state of a pipeline stage during execution.
 */
export enum StageStatus {
  /** Stage completed successfully. */
  Success = 'SUCCESS',
  /** Stage failed. */
  Failed = 'FAILED',
  /** Stage was aborted. */
  Aborted = 'ABORTED',
  /** Stage is currently in progress. */
  InProgress = 'IN_PROGRESS',
  /** Stage has not run yet. */
  NotRun = 'NOT_EXECUTED',
  /** Stage is paused (waiting for input). */
  Paused = 'PAUSED_PENDING_INPUT',
  /** Unknown stage status. */
  Unknown = 'UNKNOWN',
}

/**
 * Converts a string to a StageStatus enum value.
 *
 * @param value - The string value from Jenkins API
 * @returns The corresponding StageStatus enum value
 *
 * @example
 * StageStatus.fromString('SUCCESS'); // Returns StageStatus.Success
 * StageStatus.fromString('failed'); // Returns StageStatus.Failed
 * StageStatus.fromString('invalid'); // Returns StageStatus.Unknown
 */
export function stageStatusFromString(value: string | null | undefined): StageStatus {
  if (!value) {
    return StageStatus.Unknown;
  }

  const normalized = value.toUpperCase();
  switch (normalized) {
    case 'SUCCESS':
      return StageStatus.Success;
    case 'FAILED':
    case 'FAILURE':
      return StageStatus.Failed;
    case 'ABORTED':
      return StageStatus.Aborted;
    case 'IN_PROGRESS':
    case 'INPROGRESS':
      return StageStatus.InProgress;
    case 'NOT_EXECUTED':
    case 'NOTEXECUTED':
    case 'NOT_RUN':
    case 'NOTRUN':
      return StageStatus.NotRun;
    case 'PAUSED_PENDING_INPUT':
    case 'PAUSEDPENDINGINPUT':
    case 'PAUSED':
      return StageStatus.Paused;
    default:
      return StageStatus.Unknown;
  }
}

/**
 * Determines if a stage status represents a completed stage.
 *
 * @param status - The stage status
 * @returns True if the stage is completed (success, failed, or aborted)
 */
export function isStageCompleted(status: StageStatus): boolean {
  return (
    status === StageStatus.Success ||
    status === StageStatus.Failed ||
    status === StageStatus.Aborted
  );
}

/**
 * Determines if a stage status represents a running stage.
 *
 * @param status - The stage status
 * @returns True if the stage is currently running
 */
export function isStageRunning(status: StageStatus): boolean {
  return status === StageStatus.InProgress;
}

/**
 * Determines if a stage status represents a paused stage.
 *
 * @param status - The stage status
 * @returns True if the stage is paused
 */
export function isStagePaused(status: StageStatus): boolean {
  return status === StageStatus.Paused;
}
