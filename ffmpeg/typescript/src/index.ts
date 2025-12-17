/**
 * FFmpeg Integration Module
 *
 * A TypeScript integration for FFmpeg providing a high-level API for media
 * processing operations including transcoding, probing, audio extraction,
 * thumbnail generation, and video manipulation.
 *
 * @packageDocumentation
 *
 * @example Basic usage
 * ```typescript
 * import { createFFmpegClient } from '@integrations/ffmpeg';
 *
 * const client = createFFmpegClient({
 *   maxConcurrent: 2,
 *   timeout: 300000
 * });
 *
 * // Probe a media file
 * const info = await client.probe({ type: 'file', path: '/input.mp4' });
 * console.log(`Duration: ${info.duration}s`);
 *
 * // Transcode to web format
 * const result = await client.transcode({
 *   input: { type: 'file', path: '/input.mp4' },
 *   output: { type: 'file', path: '/output.mp4' },
 *   preset: 'web-hd'
 * });
 *
 * // Cleanup
 * await client.shutdown();
 * ```
 */

// ============================================================================
// Client
// ============================================================================

export {
  createFFmpegClient,
  FFmpegClientImpl,
} from './client.js';

export type {
  FFmpegClient,
  TranscodeJob,
  AudioExtractJob,
  ThumbnailJob,
  ResizeJob,
  CropJob,
} from './client.js';

// ============================================================================
// Command Builder
// ============================================================================

export {
  FFmpegCommandBuilderImpl,
  createCommandBuilder,
  deserializeCommand,
  CommandValidationError,
} from './command-builder.js';

// ============================================================================
// Process Executor
// ============================================================================

export {
  ProcessExecutorImpl,
  MockFFmpegExecutor,
  createProcessExecutor,
  createMockExecutor,
} from './process-executor.js';

// ============================================================================
// Filter Graph
// ============================================================================

export { FilterGraph } from './filter-graph.js';

// ============================================================================
// Job Manager
// ============================================================================

export { JobManager } from './job-manager.js';
export type { JobManagerConfig, JobManagerMetrics } from './job-manager.js';

// ============================================================================
// Presets
// ============================================================================

export { PRESETS, getPreset, mergeWithPreset } from './presets.js';

// ============================================================================
// Progress Tracker
// ============================================================================

export { ProgressTracker } from './progress-tracker.js';

// ============================================================================
// Job Serialization
// ============================================================================

export { serializeJob, deserializeJob } from './job-serializer.js';

// ============================================================================
// Types - Input/Output
// ============================================================================

export type { InputSpec, InputType } from './types/input.js';
export { validateInputSpec } from './types/input.js';

export type { OutputSpec, OutputType } from './types/output.js';
export { validateOutputSpec } from './types/output.js';

// ============================================================================
// Types - Commands
// ============================================================================

export type {
  FFmpegCommand,
  FFmpegCommandBuilder,
  SerializedCommand,
  SerializedInput,
  SerializedOutput,
} from './types/command.js';

// ============================================================================
// Types - Media Info
// ============================================================================

export type {
  MediaInfo,
  FormatInfo,
  StreamInfo,
  VideoStreamInfo,
  AudioStreamInfo,
  SubtitleStreamInfo,
  DataStreamInfo,
  StreamType,
} from './types/media-info.js';

export {
  isVideoStream,
  isAudioStream,
  isSubtitleStream,
  isDataStream,
} from './types/media-info.js';

// ============================================================================
// Types - Progress
// ============================================================================

export type { Progress, ProgressListener, ProgressEmitter } from './types/progress.js';

// ============================================================================
// Types - Jobs
// ============================================================================

export type { JobStatus, JobRecord, JobResult, JobStats } from './types/job.js';

// ============================================================================
// Types - Config
// ============================================================================

export type {
  FFmpegConfig,
  NormalizedFFmpegConfig,
  Logger,
  MetricsClient,
  ResourceLimits,
} from './types/config.js';

// ============================================================================
// Types - Executor
// ============================================================================

export type {
  ProcessExecutor,
  ExecuteOptions,
  ProcessResult,
  ExecutorConfig,
  CapturedCommand,
  MockExecutor,
} from './types/executor.js';

// ============================================================================
// Types - Filter
// ============================================================================

export type {
  FilterNode,
  FilterConnection,
  FilterGraph as FilterGraphType,
  FilterGraphBuilder,
  LoudnormParams,
  ScaleParams,
  CropParams,
  OverlayParams,
  FadeParams,
} from './types/filter.js';

// ============================================================================
// Types - Presets
// ============================================================================

export type { PresetName } from './types/index.js';

// ============================================================================
// Errors
// ============================================================================

export {
  FFmpegError,
  // Configuration errors
  ConfigurationError,
  BinaryNotFoundError,
  InvalidPathError,
  UnsupportedVersionError,
  // Input errors
  InputError,
  FileNotFoundError,
  InvalidFormatError,
  CorruptedInputError,
  UnsupportedCodecError,
  StreamNotFoundError,
  // Process errors
  ProcessError,
  SpawnFailedError,
  TimeoutExceededError,
  MemoryExceededError,
  SignalTerminatedError,
  NonZeroExitError,
  // Output errors
  OutputError,
  WriteFailureError,
  DiskFullError,
  InvalidOutputError,
  VerificationFailedError,
  // Resource errors
  ResourceError,
  ConcurrencyLimitReachedError,
  TempDirUnavailableError,
  InsufficientPermissionsError,
} from './errors/errors.js';

export { parseFFmpegError, isRetryable, isUserError } from './errors/error-parser.js';

// ============================================================================
// Security
// ============================================================================

export {
  sanitizePath,
  validateUrl,
  validateFilter,
  validateOptions,
  validateMediaConstraints,
  escapeForDisplay,
  type SecurityConfig,
  type ValidationResult,
  type MediaConstraints,
} from './security/index.js';
