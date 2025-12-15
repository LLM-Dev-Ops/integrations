/**
 * Cold Start Handler
 * Manages model loading and cold start scenarios as specified in SPARC documentation
 */

import {
  createColdStartTimeoutError,
  HfError,
  HfErrorCode,
} from '../types/errors.js';

export interface ColdStartOptions {
  /** Maximum time to wait for model to load (ms) */
  timeout: number;
  /** Initial delay between retries (ms) */
  initialDelay: number;
  /** Maximum delay between retries (ms) */
  maxDelay: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Callback for progress updates */
  onProgress?: (elapsed: number, attempt: number) => void;
}

const DEFAULT_OPTIONS: ColdStartOptions = {
  timeout: 300000, // 5 minutes
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
};

export interface ModelLoadingInfo {
  isLoading: boolean;
  estimatedTime?: number;
  message?: string;
}

/**
 * Detects if an error indicates the model is loading
 */
export function isModelLoadingError(error: unknown): boolean {
  if (error instanceof HfError) {
    return error.code === HfErrorCode.ModelLoading;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('loading') ||
      message.includes('initializing') ||
      message.includes('model is being loaded') ||
      message.includes('currently loading') ||
      message.includes('503')
    );
  }

  return false;
}

/**
 * Parses model loading information from response headers or body
 */
export function parseLoadingInfo(headers?: Headers, body?: string): ModelLoadingInfo {
  let estimatedTime: number | undefined;
  let message: string | undefined;

  // Check X-Wait-For-Model header
  if (headers?.has('x-wait-for-model')) {
    const waitTime = headers.get('x-wait-for-model');
    if (waitTime) {
      estimatedTime = parseInt(waitTime, 10) * 1000;
    }
  }

  // Check response body
  if (body) {
    try {
      const json = JSON.parse(body);
      message = json.error || json.message;
      if (json.estimated_time) {
        estimatedTime = json.estimated_time * 1000;
      }
    } catch {
      message = body;
    }
  }

  return {
    isLoading: true,
    estimatedTime,
    message,
  };
}

/**
 * Cold Start Handler class
 * Implements exponential backoff with progress tracking
 */
export class ColdStartHandler {
  private options: ColdStartOptions;

  constructor(options?: Partial<ColdStartOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Execute a request with cold start handling
   * Will automatically retry if model is loading
   */
  async execute<T>(
    requestFn: () => Promise<T>,
    options?: Partial<ColdStartOptions>
  ): Promise<T> {
    const opts = { ...this.options, ...options };
    const startTime = Date.now();
    let attempt = 0;
    let currentDelay = opts.initialDelay;

    while (true) {
      attempt++;
      const elapsed = Date.now() - startTime;

      // Check timeout
      if (elapsed >= opts.timeout) {
        throw createColdStartTimeoutError('model', elapsed);
      }

      try {
        return await requestFn();
      } catch (error) {
        // Check if this is a loading error
        if (!isModelLoadingError(error)) {
          throw error;
        }

        // Report progress
        if (opts.onProgress) {
          opts.onProgress(elapsed, attempt);
        }

        // Calculate remaining time
        const remaining = opts.timeout - elapsed;
        if (remaining <= 0) {
          throw createColdStartTimeoutError('model', elapsed);
        }

        // Wait before retry with exponential backoff
        const waitTime = Math.min(currentDelay, remaining, opts.maxDelay);
        await this.sleep(waitTime);

        // Update delay for next attempt
        currentDelay = Math.min(currentDelay * opts.backoffMultiplier, opts.maxDelay);
      }
    }
  }

  /**
   * Check if model is ready without making a full request
   * Uses a lightweight HEAD request or model info endpoint
   */
  async waitForModel(
    checkFn: () => Promise<boolean>,
    model: string,
    options?: Partial<ColdStartOptions>
  ): Promise<void> {
    const opts = { ...this.options, ...options };
    const startTime = Date.now();
    let attempt = 0;
    let currentDelay = opts.initialDelay;

    while (true) {
      attempt++;
      const elapsed = Date.now() - startTime;

      // Check timeout
      if (elapsed >= opts.timeout) {
        throw createColdStartTimeoutError(model, elapsed);
      }

      try {
        const isReady = await checkFn();
        if (isReady) {
          return;
        }
      } catch (error) {
        // Ignore errors during checking, just retry
        if (!isModelLoadingError(error) && !(error instanceof Error)) {
          throw error;
        }
      }

      // Report progress
      if (opts.onProgress) {
        opts.onProgress(elapsed, attempt);
      }

      // Calculate remaining time
      const remaining = opts.timeout - elapsed;
      if (remaining <= 0) {
        throw createColdStartTimeoutError(model, elapsed);
      }

      // Wait before retry
      const waitTime = Math.min(currentDelay, remaining, opts.maxDelay);
      await this.sleep(waitTime);

      // Update delay for next attempt
      currentDelay = Math.min(currentDelay * opts.backoffMultiplier, opts.maxDelay);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a request headers object that enables wait-for-model
 */
export function createWaitForModelHeaders(wait: boolean = true): Record<string, string> {
  return {
    'x-wait-for-model': wait ? 'true' : 'false',
  };
}

/**
 * Default cold start handler instance
 */
export const defaultColdStartHandler = new ColdStartHandler();
