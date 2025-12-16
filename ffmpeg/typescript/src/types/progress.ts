/**
 * Progress tracking types for FFmpeg operations.
 *
 * Defines progress information structure and listener types for monitoring
 * job execution in real-time.
 */

/**
 * Progress information during FFmpeg job execution
 */
export interface Progress {
  /** Current position/time in seconds */
  time: number;

  /** Current frame number being processed */
  frame?: number;

  /** Processing speed in frames per second */
  fps?: number;

  /** Current output bitrate in kbps */
  bitrate?: number;

  /** Processing speed multiplier (e.g., 2.5x realtime) */
  speed?: number;

  /** Completion percentage (0-100, only available if total duration is known) */
  percent?: number;

  /** Total duration in seconds (if known) */
  totalDuration?: number;

  /** Estimated time remaining in seconds (if duration is known) */
  estimatedTimeRemaining?: number;
}

/**
 * Progress listener callback type
 */
export type ProgressListener = (progress: Progress) => void;

/**
 * Progress event emitter interface
 */
export interface ProgressEmitter {
  /** Register a progress listener */
  onProgress(listener: ProgressListener): () => void;

  /** Remove a progress listener */
  removeProgressListener(listener: ProgressListener): void;

  /** Remove all progress listeners */
  removeAllProgressListeners(): void;
}
