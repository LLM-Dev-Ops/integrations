/**
 * Buildkite Build Poller
 *
 * Polls build status with adaptive intervals based on build state.
 * @module monitoring/BuildPoller
 */

import type { Build, BuildState } from '../types/build.js';

export interface BuildPollerConfig {
  /** Initial poll interval in milliseconds */
  initialIntervalMs: number;
  /** Maximum poll interval in milliseconds */
  maxIntervalMs: number;
  /** Interval multiplier when build is waiting */
  waitingMultiplier: number;
  /** Timeout in milliseconds */
  timeoutMs: number;
}

export const DEFAULT_POLLER_CONFIG: BuildPollerConfig = {
  initialIntervalMs: 5000,
  maxIntervalMs: 30000,
  waitingMultiplier: 1.5,
  timeoutMs: 3600000, // 1 hour
};

export type BuildFetcher = () => Promise<Build>;
export type BuildCallback = (build: Build) => void | Promise<void>;

const TERMINAL_STATES: BuildState[] = ['passed', 'failed', 'canceled', 'skipped', 'not_run'] as BuildState[];

function isTerminalState(state: BuildState): boolean {
  return TERMINAL_STATES.includes(state);
}

export class BuildPoller {
  private readonly config: BuildPollerConfig;
  private currentInterval: number;
  private isRunning: boolean = false;
  private abortController: AbortController | null = null;

  constructor(config: Partial<BuildPollerConfig> = {}) {
    this.config = { ...DEFAULT_POLLER_CONFIG, ...config };
    this.currentInterval = this.config.initialIntervalMs;
  }

  /**
   * Poll until build reaches terminal state
   */
  async poll(
    fetcher: BuildFetcher,
    onUpdate?: BuildCallback
  ): Promise<Build> {
    this.isRunning = true;
    this.abortController = new AbortController();
    const startTime = Date.now();

    try {
      while (this.isRunning) {
        // Check timeout
        if (Date.now() - startTime > this.config.timeoutMs) {
          throw new Error(`Build polling timed out after ${this.config.timeoutMs}ms`);
        }

        // Check if aborted
        if (this.abortController.signal.aborted) {
          throw new Error('Build polling was aborted');
        }

        // Fetch current build state
        const build = await fetcher();

        // Notify callback
        if (onUpdate) {
          await onUpdate(build);
        }

        // Check if terminal state
        if (isTerminalState(build.state)) {
          return build;
        }

        // Adapt interval based on state
        this.adaptInterval(build.state);

        // Wait for next poll
        await this.sleep(this.currentInterval);
      }

      throw new Error('Build polling was stopped');
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
  }

  /**
   * Stop polling
   */
  stop(): void {
    this.isRunning = false;
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Check if currently polling
   */
  isPolling(): boolean {
    return this.isRunning;
  }

  /**
   * Get current polling interval
   */
  getCurrentInterval(): number {
    return this.currentInterval;
  }

  /**
   * Adapt polling interval based on build state
   */
  private adaptInterval(state: BuildState): void {
    switch (state) {
      case 'running':
        // Running builds change frequently - use initial interval
        this.currentInterval = this.config.initialIntervalMs;
        break;
      case 'scheduled':
      case 'waiting':
      case 'blocked':
        // Waiting states - increase interval
        this.currentInterval = Math.min(
          this.currentInterval * this.config.waitingMultiplier,
          this.config.maxIntervalMs
        );
        break;
      default:
        // Other states - use moderate interval
        this.currentInterval = Math.min(
          this.currentInterval * 1.2,
          this.config.maxIntervalMs
        );
    }
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
