/**
 * Firestore Listener Reconnection Logic
 *
 * Handles automatic reconnection with exponential backoff
 * and resume token usage for real-time listeners.
 */

import type { FirestoreConfig } from "../config/index.js";
import type { FirestoreError } from "../error/index.js";

/**
 * Reconnection state.
 */
export interface ReconnectionState {
  attempts: number;
  lastAttemptAt?: Date;
  nextAttemptAt?: Date;
  backoffMs: number;
}

/**
 * Reconnection strategy configuration.
 */
export interface ReconnectionConfig {
  /** Base delay in milliseconds. */
  baseDelayMs: number;
  /** Maximum delay in milliseconds. */
  maxDelayMs: number;
  /** Backoff multiplier. */
  multiplier: number;
  /** Maximum reconnection attempts (0 = unlimited). */
  maxAttempts: number;
  /** Jitter factor (0-1). */
  jitterFactor: number;
}

/**
 * Default reconnection configuration.
 */
export const DEFAULT_RECONNECTION_CONFIG: ReconnectionConfig = {
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  maxAttempts: 0, // Unlimited
  jitterFactor: 0.2,
};

/**
 * Calculate the next reconnection delay with exponential backoff and jitter.
 */
export function calculateReconnectDelay(
  attempt: number,
  config: ReconnectionConfig = DEFAULT_RECONNECTION_CONFIG
): number {
  // Calculate base delay with exponential backoff
  const exponentialDelay =
    config.baseDelayMs * Math.pow(config.multiplier, attempt - 1);

  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter
  const jitter = cappedDelay * config.jitterFactor * Math.random();

  return Math.floor(cappedDelay + jitter);
}

/**
 * Check if an error is transient and should trigger reconnection.
 */
export function isTransientError(error: FirestoreError): boolean {
  const transientCodes = [
    "UNAVAILABLE",
    "DEADLINE_EXCEEDED",
    "INTERNAL",
    "RESOURCE_EXHAUSTED",
    "ABORTED",
  ];

  // Check error code
  if (error.code && transientCodes.includes(error.code)) {
    return true;
  }

  // Check if explicitly marked as retryable
  if ("retryable" in error && error.retryable === true) {
    return true;
  }

  return false;
}

/**
 * Check if reconnection should be attempted.
 */
export function shouldReconnect(
  attempt: number,
  error: FirestoreError,
  config: ReconnectionConfig = DEFAULT_RECONNECTION_CONFIG
): boolean {
  // Don't reconnect for non-transient errors
  if (!isTransientError(error)) {
    return false;
  }

  // Check max attempts (0 = unlimited)
  if (config.maxAttempts > 0 && attempt >= config.maxAttempts) {
    return false;
  }

  return true;
}

/**
 * Create a reconnection handler.
 */
export function createReconnectionHandler(
  config?: Partial<ReconnectionConfig>
): ReconnectionHandler {
  return new ReconnectionHandler({ ...DEFAULT_RECONNECTION_CONFIG, ...config });
}

/**
 * Reconnection handler class.
 */
export class ReconnectionHandler {
  private readonly _config: ReconnectionConfig;
  private _state: ReconnectionState;
  private _timeoutId?: ReturnType<typeof setTimeout>;

  constructor(config: ReconnectionConfig) {
    this._config = config;
    this._state = {
      attempts: 0,
      backoffMs: config.baseDelayMs,
    };
  }

  /**
   * Get current reconnection state.
   */
  get state(): ReconnectionState {
    return { ...this._state };
  }

  /**
   * Schedule a reconnection attempt.
   * Returns the delay in milliseconds, or null if reconnection should not occur.
   */
  scheduleReconnect(
    error: FirestoreError,
    callback: () => void
  ): number | null {
    this._state.attempts += 1;

    if (!shouldReconnect(this._state.attempts, error, this._config)) {
      return null;
    }

    const delay = calculateReconnectDelay(this._state.attempts, this._config);
    this._state.backoffMs = delay;
    this._state.lastAttemptAt = new Date();
    this._state.nextAttemptAt = new Date(Date.now() + delay);

    this._timeoutId = setTimeout(callback, delay);

    return delay;
  }

  /**
   * Reset reconnection state (call on successful connection).
   */
  reset(): void {
    this._state = {
      attempts: 0,
      backoffMs: this._config.baseDelayMs,
    };
    this.cancel();
  }

  /**
   * Cancel any pending reconnection.
   */
  cancel(): void {
    if (this._timeoutId) {
      clearTimeout(this._timeoutId);
      this._timeoutId = undefined;
    }
  }
}

/**
 * Sleep for a specified duration.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sleep with abort support.
 */
export function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Aborted"));
      return;
    }

    const timeoutId = setTimeout(resolve, ms);

    signal?.addEventListener("abort", () => {
      clearTimeout(timeoutId);
      reject(new Error("Aborted"));
    });
  });
}
