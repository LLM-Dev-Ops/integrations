/**
 * Retry executor with exponential backoff and jitter.
 *
 * Implements configurable retry logic with per-error-type configuration,
 * respect for Retry-After headers, and comprehensive hooks for monitoring.
 */

import {
  isRetryableError,
  getRetryAfter,
  isWeaviateError,
} from '../errors/base.js';
import {
  RetryConfig,
  RetryPolicyConfig,
  RetryContext,
  RetryHook,
  ErrorRetryConfig,
} from './types.js';

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  backoffStrategy: 'exponential',
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  multiplier: 2.0,
  jitter: true,
};

/**
 * Per-error-type retry configurations as specified in the SPARC plan
 */
export const ERROR_RETRY_CONFIGS: ErrorRetryConfig = {
  RateLimited: {
    maxAttempts: 5,
    backoffStrategy: 'exponential',
    baseDelayMs: 1000,
    maxDelayMs: 60000,
    multiplier: 2.0,
    jitter: true,
  },
  ServiceUnavailable: {
    maxAttempts: 3,
    backoffStrategy: 'exponential',
    baseDelayMs: 500,
    maxDelayMs: 10000,
    multiplier: 2.0,
    jitter: false,
  },
  InternalError: {
    maxAttempts: 3,
    backoffStrategy: 'exponential',
    baseDelayMs: 500,
    maxDelayMs: 10000,
    multiplier: 2.0,
    jitter: false,
  },
  Timeout: {
    maxAttempts: 2,
    backoffStrategy: 'linear',
    baseDelayMs: 1000,
    maxDelayMs: 5000,
    jitter: false,
  },
  ConnectionError: {
    maxAttempts: 3,
    backoffStrategy: 'exponential',
    baseDelayMs: 1000,
    maxDelayMs: 15000,
    multiplier: 2.0,
    jitter: true,
  },
};

/**
 * Non-retryable error types
 */
export const NON_RETRYABLE_ERRORS = [
  'InvalidObjectError',
  'InvalidFilterError',
  'InvalidVectorError',
  'UnauthorizedError',
  'AuthenticationError',
  'ForbiddenError',
  'ObjectNotFoundError',
  'ClassNotFoundError',
  'TenantNotFoundError',
  'ConfigurationError',
  'GraphQLError',
];

/**
 * Default retry policy configuration
 */
export const DEFAULT_RETRY_POLICY_CONFIG: RetryPolicyConfig = {
  defaultConfig: DEFAULT_RETRY_CONFIG,
  errorConfigs: ERROR_RETRY_CONFIGS,
  nonRetryableErrors: NON_RETRYABLE_ERRORS,
};

// ============================================================================
// Retry Executor
// ============================================================================

/**
 * Executes operations with configurable retry logic
 */
export class RetryExecutor {
  private readonly config: RetryPolicyConfig;
  private readonly hooks: RetryHook[] = [];

  constructor(config?: Partial<RetryPolicyConfig>) {
    this.config = {
      ...DEFAULT_RETRY_POLICY_CONFIG,
      ...config,
      defaultConfig: {
        ...DEFAULT_RETRY_POLICY_CONFIG.defaultConfig,
        ...config?.defaultConfig,
      },
      errorConfigs: {
        ...DEFAULT_RETRY_POLICY_CONFIG.errorConfigs,
        ...config?.errorConfigs,
      },
    };
  }

  /**
   * Add a retry hook
   */
  addHook(hook: RetryHook): this {
    this.hooks.push(hook);
    return this;
  }

  /**
   * Execute a function with retry logic
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    let lastError: unknown;
    let retryConfig = this.config.defaultConfig;

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Check if we should retry
        if (!this.shouldRetry(error)) {
          throw error;
        }

        // Get error-specific configuration
        retryConfig = this.getRetryConfigForError(error);

        // Check if we've exhausted attempts
        if (attempt >= retryConfig.maxAttempts) {
          throw error;
        }

        // Calculate delay
        const delayMs = this.calculateDelay(error, attempt, retryConfig);

        // Create retry context
        const context: RetryContext = {
          attempt,
          maxAttempts: retryConfig.maxAttempts,
          error,
          delayMs,
          startTime,
          elapsedMs: Date.now() - startTime,
        };

        // Call hooks
        for (const hook of this.hooks) {
          await hook(context);
        }

        // Wait before retry
        await this.delay(delayMs);
      }
    }

    throw lastError;
  }

  /**
   * Determine if an error should be retried
   */
  shouldRetry(error: unknown): boolean {
    // Check if error is in non-retryable list
    if (this.isNonRetryableError(error)) {
      return false;
    }

    // Check if error is retryable based on WeaviateError flag
    if (isWeaviateError(error)) {
      return error.isRetryable;
    }

    // Default to not retrying unknown errors
    return false;
  }

  /**
   * Check if error is in non-retryable list
   */
  private isNonRetryableError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return true;
    }

    const errorName = (error as Error).name;
    return this.config.nonRetryableErrors?.includes(errorName) ?? false;
  }

  /**
   * Get retry configuration for a specific error
   */
  private getRetryConfigForError(error: unknown): RetryConfig {
    if (!isWeaviateError(error)) {
      return this.config.defaultConfig;
    }

    // Map error names to config keys
    const errorName = error.name;
    const configKey = errorName.replace('Error', '') as keyof ErrorRetryConfig;

    // Return error-specific config if available
    if (this.config.errorConfigs?.[configKey]) {
      return this.config.errorConfigs[configKey];
    }

    return this.config.defaultConfig;
  }

  /**
   * Calculate delay before next retry
   */
  calculateDelay(error: unknown, attempt: number, config: RetryConfig): number {
    // Check for Retry-After header
    const retryAfter = getRetryAfter(error);
    if (retryAfter !== undefined) {
      // Retry-After is in seconds, convert to milliseconds
      return Math.min(retryAfter * 1000, config.maxDelayMs);
    }

    // Calculate delay based on strategy
    let delayMs: number;

    switch (config.backoffStrategy) {
      case 'exponential': {
        const multiplier = config.multiplier ?? 2.0;
        delayMs = config.baseDelayMs * Math.pow(multiplier, attempt - 1);
        break;
      }
      case 'linear': {
        delayMs = config.baseDelayMs * attempt;
        break;
      }
      case 'constant': {
        delayMs = config.baseDelayMs;
        break;
      }
      default: {
        delayMs = config.baseDelayMs;
      }
    }

    // Apply maximum delay cap
    delayMs = Math.min(delayMs, config.maxDelayMs);

    // Add jitter if enabled
    if (config.jitter) {
      // Add random jitter ±30%
      const jitterFactor = 0.7 + Math.random() * 0.6;
      delayMs = Math.floor(delayMs * jitterFactor);
    }

    return delayMs;
  }

  /**
   * Delay for a specified time
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current configuration
   */
  getConfig(): RetryPolicyConfig {
    return { ...this.config };
  }
}
