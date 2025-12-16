/**
 * Jenkins integration type definitions.
 *
 * This module provides TypeScript type definitions for all Jenkins API entities,
 * following the SPARC specification. It includes types for jobs, builds, pipelines,
 * queue items, and artifacts.
 *
 * The type system is designed to be:
 * - Type-safe: Leveraging TypeScript's type system for compile-time safety
 * - Immutable: Using readonly modifiers where appropriate
 * - Well-documented: JSDoc comments for all public APIs
 * - Consistent: Following patterns from other integrations (GitHub, Jira)
 *
 * @module types
 */

// ============================================================================
// Reference Types
// ============================================================================

export type { JobRef, BuildRef, QueueRef } from './refs.js';

export {
  simpleJob,
  folderJob,
  urlJob,
  jobRefToPath,
  buildNumber,
  lastBuild,
  lastSuccessfulBuild,
  lastFailedBuild,
  lastStableBuild,
  lastUnstableBuild,
  buildRefToPath,
  queueItem,
} from './refs.js';

// ============================================================================
// Status Types
// ============================================================================

export { BuildResult, StageStatus } from './status.js';
export type { BuildStatus } from './status.js';

export {
  buildResultFromString,
  buildingStatus,
  queuedStatus,
  completedStatus,
  unknownStatus,
  isBuilding,
  isQueued,
  isCompleted,
  stageStatusFromString,
  isStageCompleted,
  isStageRunning,
  isStagePaused,
} from './status.js';

// ============================================================================
// Resource Types
// ============================================================================

export type {
  HealthReport,
  Action,
  JobSummary,
  Job,
  BuildSummary,
  Build,
  StageExecNode,
  Stage,
  PipelineRun,
  QueueTask,
  QueueItem,
  Artifact,
  TestResult,
  ParameterDefinition,
  ParametersDefinitionProperty,
} from './resources.js';

// ============================================================================
// Configuration Types
// ============================================================================

export type {
  BasicAuthCredentials,
  CredentialProvider,
  RetryConfig,
  CrumbConfig,
  JenkinsConfig,
} from './config.js';

export {
  StaticCredentialProvider,
  EnvCredentialProvider,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CRUMB_CONFIG,
} from './config.js';

// ============================================================================
// Error Types
// ============================================================================

export { JenkinsErrorKind, JenkinsError, isJenkinsError } from './errors.js';
