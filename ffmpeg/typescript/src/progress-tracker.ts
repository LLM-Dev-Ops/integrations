/**
 * FFmpeg Integration - Progress Tracker
 * Parses FFmpeg stderr output and emits progress events
 */

import { Progress, ProgressListener } from "./types";

/**
 * ProgressTracker parses FFmpeg's stderr output and emits progress events.
 *
 * FFmpeg outputs progress in the format:
 * frame=  300 fps=30.0 q=28.0 size=3702kB time=00:00:10.00 bitrate=3033.0kbits/s speed=2.50x
 *
 * The tracker extracts:
 * - time: Current position in HH:MM:SS.ss format (converted to seconds)
 * - frame: Current frame number
 * - fps: Processing frames per second
 * - bitrate: Current bitrate in kbits/s
 * - speed: Processing speed multiplier (e.g., 2.5x means processing 2.5x faster than realtime)
 * - percent: Completion percentage (if total duration is known)
 */
export class ProgressTracker {
  private totalDuration: number | null = null;
  private listeners: Set<ProgressListener> = new Set();

  /**
   * Set the total duration of the media being processed.
   * This enables percentage calculation in progress events.
   *
   * @param duration - Total duration in seconds
   */
  setTotalDuration(duration: number): void {
    this.totalDuration = duration;
  }

  /**
   * Parse FFmpeg stderr output and emit progress events.
   * This method can be called with each chunk of stderr data.
   *
   * @param stderr - Raw stderr output from FFmpeg
   */
  parseAndEmit(stderr: string): void {
    const lines = stderr.split("\n");

    for (const line of lines) {
      const progress = this.parseLine(line);
      if (progress) {
        // Calculate percentage if total duration is known
        if (this.totalDuration && progress.time) {
          progress.percent = (progress.time / this.totalDuration) * 100;
        }

        this.emit(progress);
      }
    }
  }

  /**
   * Register a progress listener.
   *
   * @param listener - Callback function to receive progress events
   * @returns Unsubscribe function to remove the listener
   */
  onProgress(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Parse a single line of FFmpeg output.
   *
   * @param line - Single line from stderr
   * @returns Progress object if the line contains progress info, null otherwise
   */
  private parseLine(line: string): Progress | null {
    // FFmpeg progress lines always contain "time="
    if (!line.includes("time=")) {
      return null;
    }

    const progress: Partial<Progress> = {};

    // Parse time in HH:MM:SS.ss format
    // Example: time=00:01:23.45
    const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const seconds = parseInt(timeMatch[3], 10);
      const centiseconds = parseInt(timeMatch[4], 10);

      progress.time = hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
    }

    // Parse frame number
    // Example: frame=  300 or frame=300
    const frameMatch = line.match(/frame=\s*(\d+)/);
    if (frameMatch) {
      progress.frame = parseInt(frameMatch[1], 10);
    }

    // Parse FPS (frames per second)
    // Example: fps=30.0 or fps=30
    const fpsMatch = line.match(/fps=\s*([\d.]+)/);
    if (fpsMatch) {
      progress.fps = parseFloat(fpsMatch[1]);
    }

    // Parse bitrate
    // Example: bitrate=3033.0kbits/s or bitrate=3033kbits/s
    const bitrateMatch = line.match(/bitrate=\s*([\d.]+)kbits/);
    if (bitrateMatch) {
      progress.bitrate = parseFloat(bitrateMatch[1]);
    }

    // Parse speed multiplier
    // Example: speed=2.50x or speed=2.5x
    const speedMatch = line.match(/speed=\s*([\d.]+)x/);
    if (speedMatch) {
      progress.speed = parseFloat(speedMatch[1]);
    }

    return progress as Progress;
  }

  /**
   * Emit a progress event to all registered listeners.
   * Errors in listeners are caught and logged to prevent breaking progress tracking.
   *
   * @param progress - Progress data to emit
   */
  private emit(progress: Progress): void {
    for (const listener of this.listeners) {
      try {
        listener(progress);
      } catch (error) {
        // Don't let listener errors break progress tracking
        console.error("Progress listener error:", error);
      }
    }
  }
}
