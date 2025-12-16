/**
 * @integrations/jenkins - Production-ready Jenkins API client
 *
 * A clean, minimal adapter layer for Jenkins CI/CD automation with:
 * - Job triggering and management
 * - Build status monitoring
 * - Pipeline stage inspection
 * - Artifact downloading
 * - Console output streaming
 * - Queue awareness with exponential backoff
 * - CSRF/crumb protection
 *
 * @module @integrations/jenkins
 */

// Types - References
export type { JobRef, BuildRef, QueueRef } from './types/refs.js';

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
} from './types/refs.js';

// Types - Status
export type { BuildStatus } from './types/status.js';

export {
  BuildResult,
  StageStatus,
  buildResultFromString,
  stageStatusFromString,
  buildingStatus,
  queuedStatus,
  completedStatus,
  unknownStatus,
  isBuilding,
  isQueued,
  isCompleted,
  isStageCompleted,
  isStageRunning,
  isStagePaused,
} from './types/status.js';

// Types - Resources
export type {
  Job,
  JobSummary,
  Build,
  BuildSummary,
  PipelineRun,
  Stage,
  QueueItem,
  QueueTask,
  Artifact,
  HealthReport,
  Action,
  TestResult,
  ParameterDefinition,
  ParametersDefinitionProperty,
  StageExecNode,
} from './types/resources.js';

// Errors
export {
  JenkinsErrorKind,
  JenkinsError,
  isJenkinsError,
} from './types/errors.js';

// Config (from /src/config.ts)
export type { RetryConfig, JenkinsConfig } from './config.js';

export {
  DEFAULT_TIMEOUT,
  DEFAULT_LOG_TIMEOUT,
  DEFAULT_CRUMB_TTL,
  DEFAULT_MAX_RETRIES,
  JenkinsConfigBuilder,
  createConfigFromEnv,
  createDefaultConfig,
  validateConfig,
} from './config.js';

// Auth
export type { JenkinsCredentials, CredentialProvider } from './auth/index.js';

export {
  SecretString,
  StaticCredentialProvider,
  EnvCredentialProvider,
} from './auth/index.js';

// Client
export type { Crumb } from './client/crumb.js';

export { CrumbManager } from './client/crumb.js';

export { RetryExecutor } from './client/resilience.js';

export type { HttpMethod, RequestOptions, HttpResponse } from './client/index.js';

export {
  JenkinsClient,
  createClient,
  createClientFromEnv,
} from './client/index.js';

// Services
export { JobService } from './services/jobs.js';
export type { TriggerBuildOptions } from './services/jobs.js';

export { BuildService } from './services/builds.js';

export { PipelineService } from './services/pipelines.js';
export type { InputSubmitParams } from './services/pipelines.js';

export { QueueService } from './services/queue.js';

export { ArtifactService } from './services/artifacts.js';

export { ConsoleService } from './services/console.js';
export type { ConsoleChunk, ProgressiveConsoleResponse } from './services/console.js';

export { createServices } from './services/index.js';
export type { JenkinsServices } from './services/index.js';
