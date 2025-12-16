/**
 * Job status and result types for FFmpeg operations.
 *
 * Defines job lifecycle states, records, and result structures.
 */

/**
 * Status of an FFmpeg job
 */
export type JobStatus =
  | 'pending'    // Job created but not started
  | 'running'    // Job currently executing
  | 'completed'  // Job finished successfully
  | 'failed'     // Job failed with error
  | 'cancelled'  // Job was cancelled
  | 'timeout';   // Job exceeded timeout

/**
 * Record of a job being tracked by the job manager
 */
export interface JobRecord {
  /** Unique job identifier */
  id: string;

  /** The job being executed */
  job: Record<string, unknown>;

  /** Current status of the job */
  status: JobStatus;

  /** Current progress information */
  progress: number | null;

  /** When the job was created */
  createdAt: Date;

  /** When the job started executing */
  startedAt?: Date;

  /** When the job completed (success or failure) */
  completedAt?: Date;

  /** Error if job failed */
  error?: Error;
}

/**
 * Result of an FFmpeg job execution
 */
export interface JobResult {
  /** Job identifier */
  jobId: string;

  /** Final status of the job */
  status: JobStatus;

  /** Output file path (if applicable) */
  outputPath?: string;

  /** Execution duration in milliseconds */
  duration: number;

  /** Additional statistics from FFmpeg */
  stats?: JobStats;

  /** Error if job failed */
  error?: Error;
}

/**
 * Statistics from FFmpeg job execution
 */
export interface JobStats {
  /** Total frames processed */
  frames?: number;

  /** Average processing FPS */
  averageFps?: number;

  /** Output file size in bytes */
  outputSize?: number;

  /** Output bitrate in kbps */
  outputBitrate?: number;

  /** Processing speed multiplier (e.g., 2.5x) */
  speed?: number;

  /** Input file metadata */
  inputMetadata?: Record<string, unknown>;

  /** Output file metadata */
  outputMetadata?: Record<string, unknown>;
}
