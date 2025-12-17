/**
 * FFmpeg Integration Module - Job Manager
 * Manages job queue, concurrency control, and lifecycle tracking
 */

import { randomUUID } from "crypto";
import { FFmpegJob, JobRecord, JobStatus, Progress } from "./types/index.js";

export interface JobManagerConfig {
  maxConcurrent?: number;
  tempDir?: string;
}

export interface JobManagerMetrics {
  activeJobs: number;
  queueDepth: number;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
}

/**
 * JobManager class for managing FFmpeg job queue and concurrency
 *
 * Features:
 * - Queue jobs when at maxConcurrent limit
 * - Process queue FIFO when slots become available
 * - Track job lifecycle (pending -> running -> completed/failed/cancelled)
 * - Support job cancellation for running and pending jobs
 * - Emit metrics for active jobs and queue depth
 */
export class JobManager {
  private jobs: Map<string, JobRecord> = new Map();
  private activeCount: number = 0;
  private queue: string[] = []; // Job IDs in FIFO order
  private maxConcurrent: number;
  /** @internal */ tempDir: string;
  private paused: boolean = false;

  constructor(config: JobManagerConfig = {}) {
    this.maxConcurrent = config.maxConcurrent ?? 4;
    this.tempDir = config.tempDir ?? "/tmp";

    if (this.maxConcurrent < 1) {
      throw new Error("maxConcurrent must be >= 1");
    }
  }

  /**
   * Submit a job for execution
   * Jobs are queued if at capacity, otherwise started immediately
   * @param job - The FFmpeg job to submit
   * @returns Promise resolving to job ID
   */
  async submitJob(job: FFmpegJob): Promise<string> {
    const jobId = job.id ?? randomUUID();

    const record: JobRecord = {
      id: jobId,
      job: { ...job, id: jobId },
      status: "pending",
      progress: null,
      pid: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      error: null,
    };

    this.jobs.set(jobId, record);

    if (this.paused || this.activeCount >= this.maxConcurrent) {
      // Queue the job
      this.queue.push(jobId);
      record.status = "pending";
    } else {
      // Start immediately
      this.startJob(jobId);
    }

    return jobId;
  }

  /**
   * Register a job in the manager
   * Used by executor to register jobs before execution
   * @param jobId - The job identifier
   * @param job - The job data
   */
  registerJob(jobId: string, job: FFmpegJob): void {
    if (this.jobs.has(jobId)) {
      return; // Already registered
    }

    const record: JobRecord = {
      id: jobId,
      job,
      status: "pending",
      progress: null,
      pid: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      error: null,
    };

    this.jobs.set(jobId, record);
  }

  /**
   * Mark a job as started
   * @param jobId - The job identifier
   */
  private startJob(jobId: string): void {
    const record = this.jobs.get(jobId);
    if (!record) {
      return;
    }

    this.activeCount++;
    record.status = "running";
    record.startedAt = new Date();
  }

  /**
   * Complete a job with final status
   * @param jobId - The job identifier
   * @param status - Final job status
   * @param error - Optional error if job failed
   */
  completeJob(jobId: string, status: JobStatus, error?: Error): void {
    const record = this.jobs.get(jobId);
    if (!record) {
      return;
    }

    record.status = status;
    record.completedAt = new Date();
    if (error) {
      record.error = error;
    }

    // Decrement active count if job was running
    if (record.startedAt !== null) {
      this.activeCount--;
    }

    // Process queue to start next job
    this.processQueue();
  }

  /**
   * Process the queue and start next job if capacity available
   */
  private processQueue(): void {
    if (this.paused) {
      return;
    }

    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const nextJobId = this.queue.shift();
      if (nextJobId) {
        this.startJob(nextJobId);
      }
    }
  }

  /**
   * Cancel a job
   * @param jobId - The job identifier
   * @returns true if job was cancelled, false if not found or already completed
   */
  cancelJob(jobId: string): boolean {
    const record = this.jobs.get(jobId);
    if (!record) {
      return false;
    }

    if (record.status === "running") {
      // Mark as cancelled
      record.status = "cancelled";
      record.completedAt = new Date();
      this.activeCount--;
      this.processQueue();
      return true;
    }

    if (record.status === "pending") {
      // Remove from queue
      const queueIndex = this.queue.indexOf(jobId);
      if (queueIndex !== -1) {
        this.queue.splice(queueIndex, 1);
      }
      record.status = "cancelled";
      record.completedAt = new Date();
      return true;
    }

    // Already completed/failed/cancelled
    return false;
  }

  /**
   * Get the status of a job
   * @param jobId - The job identifier
   * @returns Job status or null if not found
   */
  getJobStatus(jobId: string): JobStatus | null {
    const record = this.jobs.get(jobId);
    return record?.status ?? null;
  }

  /**
   * Get the progress of a job
   * @param jobId - The job identifier
   * @returns Progress information or null if not available
   */
  getJobProgress(jobId: string): Progress | null {
    const record = this.jobs.get(jobId);
    return record?.progress ?? null;
  }

  /**
   * Update the progress of a running job
   * @param jobId - The job identifier
   * @param progress - Progress information
   */
  updateProgress(jobId: string, progress: Progress): void {
    const record = this.jobs.get(jobId);
    if (record && record.status === "running") {
      record.progress = progress;
    }
  }

  /**
   * Set the PID for a running job
   * @param jobId - The job identifier
   * @param pid - Process ID
   */
  setJobPid(jobId: string, pid: number): void {
    const record = this.jobs.get(jobId);
    if (record) {
      record.pid = pid;
    }
  }

  /**
   * Get the PID of a running job
   * @param jobId - The job identifier
   * @returns Process ID or null
   */
  getJobPid(jobId: string): number | null {
    const record = this.jobs.get(jobId);
    return record?.pid ?? null;
  }

  /**
   * Pause the job queue
   * Currently running jobs continue, but no new jobs are started
   */
  pauseQueue(): void {
    this.paused = true;
  }

  /**
   * Resume the job queue
   * Processes pending jobs up to maxConcurrent limit
   */
  resumeQueue(): void {
    this.paused = false;
    this.processQueue();
  }

  /**
   * Kill all running jobs and clear queue
   * @returns Promise that resolves when all jobs are terminated
   */
  async killAll(): Promise<void> {
    // Cancel all pending jobs
    for (const jobId of this.queue) {
      this.cancelJob(jobId);
    }
    this.queue = [];

    // Mark all running jobs as cancelled
    for (const [_jobId, record] of this.jobs.entries()) {
      if (record.status === "running") {
        record.status = "cancelled";
        record.completedAt = new Date();
      }
    }

    this.activeCount = 0;
  }

  /**
   * Get current queue size
   * @returns Number of pending jobs in queue
   */
  get queueSize(): number {
    return this.queue.length;
  }

  /**
   * Get number of active jobs
   * @returns Number of currently running jobs
   */
  get activeJobCount(): number {
    return this.activeCount;
  }

  /**
   * Get job manager metrics
   * @returns Metrics object with job statistics
   */
  getMetrics(): JobManagerMetrics {
    let completedCount = 0;
    let failedCount = 0;

    for (const record of this.jobs.values()) {
      if (record.status === "completed") {
        completedCount++;
      } else if (record.status === "failed") {
        failedCount++;
      }
    }

    return {
      activeJobs: this.activeCount,
      queueDepth: this.queue.length,
      totalJobs: this.jobs.size,
      completedJobs: completedCount,
      failedJobs: failedCount,
    };
  }

  /**
   * Get a job record
   * @param jobId - The job identifier
   * @returns Job record or undefined
   */
  getJob(jobId: string): JobRecord | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs with a specific status
   * @param status - The job status to filter by
   * @returns Array of job records
   */
  getJobsByStatus(status: JobStatus): JobRecord[] {
    const results: JobRecord[] = [];
    for (const record of this.jobs.values()) {
      if (record.status === status) {
        results.push(record);
      }
    }
    return results;
  }

  /**
   * Clear completed and failed jobs from memory
   * @param olderThanMs - Optional: only clear jobs older than this many milliseconds
   * @returns Number of jobs cleared
   */
  clearFinishedJobs(olderThanMs?: number): number {
    let cleared = 0;
    const now = Date.now();

    for (const [jobId, record] of this.jobs.entries()) {
      const isFinished = ["completed", "failed", "cancelled"].includes(record.status);
      if (!isFinished) {
        continue;
      }

      if (olderThanMs !== undefined && record.completedAt) {
        const age = now - record.completedAt.getTime();
        if (age < olderThanMs) {
          continue;
        }
      }

      this.jobs.delete(jobId);
      cleared++;
    }

    return cleared;
  }
}
