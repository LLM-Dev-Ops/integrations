/**
 * Progress tracking utilities for long-running batch operations.
 */

import type { BatchProgress } from './types.js';

/**
 * Progress callback function type
 */
export type ProgressCallback = (
  current: number,
  total: number,
  successful: number,
  failed: number
) => void;

/**
 * Batch progress tracker class
 *
 * Tracks progress of batch operations and provides callbacks for monitoring.
 *
 * @example
 * ```typescript
 * const tracker = new BatchProgressTracker(1000);
 * tracker.onProgress((current, total, successful, failed) => {
 *   console.log(`Progress: ${current}/${total} (${successful} ok, ${failed} failed)`);
 * });
 *
 * // Update progress as batches complete
 * tracker.updateProgress(100, 95, 5);
 * ```
 */
export class BatchProgressTracker {
  private progress: BatchProgress;
  private startTime: number;
  private callbacks: ProgressCallback[] = [];

  constructor(total: number, totalChunks?: number) {
    if (total < 0) {
      throw new Error('total must be non-negative');
    }

    this.progress = {
      total,
      completed: 0,
      successful: 0,
      failed: 0,
      inProgress: 0,
      currentChunk: 0,
      totalChunks,
    };

    this.startTime = Date.now();
  }

  /**
   * Start tracking progress
   */
  start(): void {
    this.startTime = Date.now();
    this.notifyCallbacks();
  }

  /**
   * Update progress with newly completed objects
   *
   * @param completed - Number of objects completed in this update
   * @param successful - Number of successful objects in this update
   * @param failed - Number of failed objects in this update
   */
  updateProgress(completed: number, successful: number, failed: number): void {
    if (completed < 0 || successful < 0 || failed < 0) {
      throw new Error('Progress values must be non-negative');
    }

    if (successful + failed !== completed) {
      throw new Error('successful + failed must equal completed');
    }

    this.progress.completed += completed;
    this.progress.successful += successful;
    this.progress.failed += failed;

    // Update current chunk if tracking chunks
    if (this.progress.totalChunks !== undefined) {
      this.progress.currentChunk = Math.min(
        (this.progress.currentChunk ?? 0) + 1,
        this.progress.totalChunks
      );
    }

    this.notifyCallbacks();
  }

  /**
   * Set the number of objects currently in progress
   *
   * @param inProgress - Number of objects being processed
   */
  setInProgress(inProgress: number): void {
    if (inProgress < 0) {
      throw new Error('inProgress must be non-negative');
    }

    this.progress.inProgress = inProgress;
    this.notifyCallbacks();
  }

  /**
   * Mark the batch operation as complete
   */
  complete(): void {
    this.progress.inProgress = 0;
    this.notifyCallbacks();
  }

  /**
   * Register a progress callback
   *
   * @param callback - Function to call on progress updates
   */
  onProgress(callback: ProgressCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Get current progress snapshot
   */
  getProgress(): Readonly<BatchProgress> {
    return { ...this.progress };
  }

  /**
   * Get elapsed time in milliseconds
   */
  getElapsedMs(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Calculate completion percentage
   */
  getPercentage(): number {
    if (this.progress.total === 0) {
      return 100;
    }
    return Math.floor((this.progress.completed / this.progress.total) * 100);
  }

  /**
   * Get estimated time remaining in milliseconds
   *
   * Based on average processing time per object.
   */
  getEstimatedTimeRemainingMs(): number {
    if (this.progress.completed === 0) {
      return 0; // Can't estimate without any completed items
    }

    const elapsed = this.getElapsedMs();
    const avgTimePerObject = elapsed / this.progress.completed;
    const remaining = this.progress.total - this.progress.completed;

    return Math.round(remaining * avgTimePerObject);
  }

  /**
   * Get processing rate in objects per second
   */
  getProcessingRate(): number {
    const elapsed = this.getElapsedMs();
    if (elapsed === 0) {
      return 0;
    }

    return (this.progress.completed / elapsed) * 1000; // Convert to per second
  }

  /**
   * Reset the tracker
   */
  reset(): void {
    this.progress = {
      total: this.progress.total,
      completed: 0,
      successful: 0,
      failed: 0,
      inProgress: 0,
      currentChunk: 0,
      totalChunks: this.progress.totalChunks,
    };
    this.startTime = Date.now();
    this.notifyCallbacks();
  }

  /**
   * Notify all registered callbacks
   */
  private notifyCallbacks(): void {
    const { completed, total, successful, failed } = this.progress;
    for (const callback of this.callbacks) {
      try {
        callback(completed, total, successful, failed);
      } catch (error) {
        // Ignore callback errors to prevent disrupting progress tracking
        console.error('Error in progress callback:', error);
      }
    }
  }
}

/**
 * Create a simple progress tracker
 *
 * @param total - Total number of objects
 * @returns New progress tracker
 */
export function createProgressTracker(
  total: number,
  totalChunks?: number
): BatchProgressTracker {
  return new BatchProgressTracker(total, totalChunks);
}
