/**
 * Buildkite Log Streamer
 *
 * Streams job logs as jobs complete during a build.
 * @module monitoring/LogStreamer
 */

import type { Build } from '../types/build.js';
import type { JobState, JobLog } from '../types/job.js';
import { type LogStreamConfig, DEFAULT_LOG_STREAM_CONFIG } from '../config.js';

// Re-export config types for convenience
export type { LogStreamConfig } from '../config.js';
export { DEFAULT_LOG_STREAM_CONFIG } from '../config.js';

export interface LogChunk {
  jobId: string;
  jobName: string;
  content: string;
  exitStatus?: number;
  error?: string;
  isComplete: boolean;
}

export type BuildFetcher = () => Promise<Build>;
export type LogFetcher = (jobId: string) => Promise<JobLog>;
export type LogCallback = (chunk: LogChunk) => void | Promise<void>;

const LOG_READY_STATES: JobState[] = ['passed', 'failed', 'canceled', 'timed_out'] as JobState[];

function isLogReady(state: JobState): boolean {
  return LOG_READY_STATES.includes(state);
}

export class LogStreamer {
  private readonly config: LogStreamConfig;
  private readonly processedJobs: Set<string> = new Set();
  private isRunning: boolean = false;
  private abortController: AbortController | null = null;

  constructor(config: Partial<LogStreamConfig> = {}) {
    this.config = { ...DEFAULT_LOG_STREAM_CONFIG, ...config };
  }

  /**
   * Stream logs for all jobs in a build
   */
  async stream(
    buildFetcher: BuildFetcher,
    logFetcher: LogFetcher,
    onLog: LogCallback
  ): Promise<void> {
    this.isRunning = true;
    this.abortController = new AbortController();
    this.processedJobs.clear();

    let attempts = 0;

    try {
      while (this.isRunning && attempts < this.config.maxPollAttempts) {
        // Check if aborted
        if (this.abortController.signal.aborted) {
          break;
        }

        // Fetch current build state
        const build = await buildFetcher();

        // Process jobs with completed logs
        for (const job of build.jobs) {
          if (this.processedJobs.has(job.id)) {
            continue;
          }

          // Only script jobs have logs
          if (job.type !== 'script') {
            this.processedJobs.add(job.id);
            continue;
          }

          // Check if log is ready
          if (isLogReady(job.state)) {
            try {
              const log = await logFetcher(job.id);
              await onLog({
                jobId: job.id,
                jobName: job.name || job.label || job.id,
                content: log.content,
                exitStatus: job.exit_status,
                isComplete: true,
              });
            } catch (error) {
              await onLog({
                jobId: job.id,
                jobName: job.name || job.label || job.id,
                content: '',
                error: (error as Error).message,
                isComplete: true,
              });
            }
            this.processedJobs.add(job.id);
          }
        }

        // Check if all jobs are done
        const allJobsProcessed = build.jobs
          .filter(j => j.type === 'script')
          .every(j => this.processedJobs.has(j.id));

        if (allJobsProcessed && this.isBuildTerminal(build)) {
          break;
        }

        // Wait before next poll
        await this.sleep(this.config.pollIntervalMs);
        attempts++;
      }
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
  }

  /**
   * Stop streaming
   */
  stop(): void {
    this.isRunning = false;
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Check if currently streaming
   */
  isStreaming(): boolean {
    return this.isRunning;
  }

  /**
   * Get count of processed jobs
   */
  getProcessedJobCount(): number {
    return this.processedJobs.size;
  }

  private isBuildTerminal(build: Build): boolean {
    const terminalStates = ['passed', 'failed', 'canceled', 'skipped', 'not_run'];
    return terminalStates.includes(build.state);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);
      if (this.abortController) {
        this.abortController.signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new Error('Sleep aborted'));
        });
      }
    });
  }
}
