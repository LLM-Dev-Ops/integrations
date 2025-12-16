/**
 * Progress tracking utilities for batch operations.
 */

/**
 * Tracks the progress of a batch operation
 */
export interface BatchProgress {
  /**
   * Total number of items to process
   */
  total: number;

  /**
   * Number of items completed successfully
   */
  completed: number;

  /**
   * Number of items that failed
   */
  failed: number;

  /**
   * Number of items currently being processed
   */
  inProgress: number;
}

/**
 * Create a new progress tracker initialized for the given total
 *
 * @param total - Total number of items to process
 * @returns A new BatchProgress object
 *
 * @example
 * ```typescript
 * const progress = createProgress(100);
 * // Returns { total: 100, completed: 0, failed: 0, inProgress: 0 }
 * ```
 */
export function createProgress(total: number): BatchProgress {
  if (total < 0) {
    throw new Error('total must be non-negative');
  }

  return {
    total,
    completed: 0,
    failed: 0,
    inProgress: 0,
  };
}

/**
 * Update progress with newly completed or failed items
 *
 * @param progress - Current progress state
 * @param completed - Number of items newly completed
 * @param failed - Number of items newly failed (default: 0)
 * @returns A new BatchProgress object with updated counts
 *
 * @example
 * ```typescript
 * const progress = createProgress(100);
 * const updated = updateProgress(progress, 10, 2);
 * // Returns { total: 100, completed: 10, failed: 2, inProgress: 0 }
 * ```
 */
export function updateProgress(
  progress: BatchProgress,
  completed: number,
  failed: number = 0
): BatchProgress {
  if (completed < 0 || failed < 0) {
    throw new Error('completed and failed counts must be non-negative');
  }

  return {
    ...progress,
    completed: progress.completed + completed,
    failed: progress.failed + failed,
  };
}

/**
 * Calculate the completion percentage
 *
 * @param progress - Current progress state
 * @returns Percentage complete (0-100)
 *
 * @example
 * ```typescript
 * const progress = { total: 100, completed: 50, failed: 10, inProgress: 5 };
 * const percentage = getPercentage(progress);
 * // Returns 60 (60% of items are done: completed + failed)
 * ```
 */
export function getPercentage(progress: BatchProgress): number {
  if (progress.total === 0) {
    return 100;
  }

  const done = progress.completed + progress.failed;
  return Math.floor((done / progress.total) * 100);
}
