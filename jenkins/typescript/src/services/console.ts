/**
 * Jenkins Console Service
 * Provides operations for accessing build console output, including full logs,
 * progressive console streaming, and async generator-based streaming with
 * adaptive polling.
 */

import type { JenkinsClient } from '../client/index.js';
import type { JobRef, BuildRef } from '../types/refs.js';
import { jobRefToPath, buildRefToPath } from '../types/refs.js';

/**
 * Progressive console response from Jenkins.
 */
export interface ProgressiveConsoleResponse {
  /** Console content chunk */
  content: string;
  /** New offset for next request */
  offset: number;
  /** Whether more data is available */
  moreData: boolean;
}

/**
 * Console chunk emitted during streaming.
 */
export interface ConsoleChunk {
  /** Console output text */
  text: string;
  /** Current byte offset */
  offset: number;
}

/**
 * Default polling interval for console streaming (1 second).
 */
const DEFAULT_POLL_INTERVAL_MS = 1000;

/**
 * Console service for accessing Jenkins build logs.
 */
export class ConsoleService {
  constructor(private readonly client: JenkinsClient) {}

  /**
   * Gets the complete console output for a build.
   *
   * @param jobRef - Job reference (name or path)
   * @param buildRef - Build reference (number or symbolic)
   * @returns Complete console output as text
   */
  async getConsoleOutput(jobRef: JobRef, buildRef: BuildRef): Promise<string> {
    const jobPath = jobRefToPath(jobRef);
    const buildPath = buildRefToPath(buildRef);

    const response = await this.client.get<string>(
      `/${jobPath}/${buildPath}/consoleText`,
      { headers: { Accept: 'text/plain' } }
    );

    return response.data;
  }

  /**
   * Gets progressive console output starting from a specific offset.
   * Uses the /logText/progressiveText endpoint with X-Text-Size and X-More-Data headers.
   *
   * @param jobRef - Job reference (name or path)
   * @param buildRef - Build reference (number or symbolic)
   * @param start - Starting byte offset (default: 0)
   * @returns Progressive console response with content, offset, and more data flag
   */
  async getProgressiveConsole(
    jobRef: JobRef,
    buildRef: BuildRef,
    start: number = 0
  ): Promise<ProgressiveConsoleResponse> {
    const jobPath = jobRefToPath(jobRef);
    const buildPath = buildRefToPath(buildRef);

    const response = await this.client.get<string>(
      `/${jobPath}/${buildPath}/logText/progressiveText`,
      {
        query: { start },
        headers: { Accept: 'text/plain' },
      }
    );

    // Parse X-Text-Size header for new offset
    const textSizeHeader = response.headers.get('x-text-size');
    const offset = textSizeHeader ? parseInt(textSizeHeader, 10) : start;

    // Parse X-More-Data header to check if build is still running
    const moreDataHeader = response.headers.get('x-more-data');
    const moreData = moreDataHeader === 'true';

    return {
      content: response.data,
      offset,
      moreData,
    };
  }

  /**
   * Streams console output as it's generated, yielding chunks with adaptive polling.
   * Polls with increasing intervals when no new data is available.
   *
   * @param jobRef - Job reference (name or path)
   * @param buildRef - Build reference (number or symbolic)
   * @returns Async generator yielding console chunks
   */
  async *streamConsoleOutput(
    jobRef: JobRef,
    buildRef: BuildRef
  ): AsyncGenerator<ConsoleChunk, void, unknown> {
    let offset = 0;
    let pollInterval = DEFAULT_POLL_INTERVAL_MS;
    const maxPollInterval = 5000; // Max 5 seconds between polls
    let consecutiveEmptyPolls = 0;

    while (true) {
      const response = await this.getProgressiveConsole(jobRef, buildRef, offset);

      // Yield content if any
      if (response.content) {
        yield { text: response.content, offset: response.offset };
        offset = response.offset;
        consecutiveEmptyPolls = 0;
        pollInterval = DEFAULT_POLL_INTERVAL_MS; // Reset to default on new data
      } else {
        consecutiveEmptyPolls++;
      }

      // If no more data, we're done
      if (!response.moreData) {
        break;
      }

      // Adaptive polling: increase interval when no new data
      if (consecutiveEmptyPolls > 0) {
        pollInterval = Math.min(pollInterval * 1.5, maxPollInterval);
      }

      // Wait before next poll
      await this.sleep(pollInterval);
    }
  }

  /**
   * Sleep utility for polling delays.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
