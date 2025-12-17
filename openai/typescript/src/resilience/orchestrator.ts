import type { HttpTransport, HttpRequest } from '../transport/http-transport.js';
import { RateLimitError, APIConnectionError, InternalServerError, APIError } from '../errors/categories.js';
import type { RequestHook, ResponseHook, ErrorHook, RetryHook } from './hooks.js';

export interface ResilienceConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: boolean;
  circuitBreaker: {
    enabled: boolean;
    threshold: number;
    timeoutMs: number;
  };
}

export const DEFAULT_RESILIENCE_CONFIG: ResilienceConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  jitter: true,
  circuitBreaker: {
    enabled: true,
    threshold: 5,
    timeoutMs: 30000,
  },
};

export type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly threshold: number,
    private readonly timeoutMs: number
  ) {}

  canExecute(): boolean {
    switch (this.state) {
      case 'closed':
        return true;
      case 'open':
        if (Date.now() - this.lastFailureTime > this.timeoutMs) {
          this.state = 'half-open';
          return true;
        }
        return false;
      case 'half-open':
        return true;
    }
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = 'open';
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}

export interface ResilienceOrchestrator {
  request<T>(request: HttpRequest): Promise<T>;
  stream<T>(request: HttpRequest): AsyncIterable<T>;
}

export class DefaultResilienceOrchestrator implements ResilienceOrchestrator {
  private readonly circuitBreaker?: CircuitBreaker;
  private readonly hooks: {
    request?: RequestHook[];
    response?: ResponseHook[];
    error?: ErrorHook[];
    retry?: RetryHook[];
  } = {};

  constructor(
    private readonly transport: HttpTransport,
    private readonly config: ResilienceConfig = DEFAULT_RESILIENCE_CONFIG
  ) {
    if (config.circuitBreaker.enabled) {
      this.circuitBreaker = new CircuitBreaker(
        config.circuitBreaker.threshold,
        config.circuitBreaker.timeoutMs
      );
    }
  }

  addRequestHook(hook: RequestHook): this {
    (this.hooks.request ??= []).push(hook);
    return this;
  }

  addResponseHook(hook: ResponseHook): this {
    (this.hooks.response ??= []).push(hook);
    return this;
  }

  addErrorHook(hook: ErrorHook): this {
    (this.hooks.error ??= []).push(hook);
    return this;
  }

  addRetryHook(hook: RetryHook): this {
    (this.hooks.retry ??= []).push(hook);
    return this;
  }

  async request<T>(request: HttpRequest): Promise<T> {
    this.checkCircuitBreaker();

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.runRequestHooks(request, attempt);

        const startTime = Date.now();
        const result = await this.transport.request<T>(request);
        const duration = Date.now() - startTime;

        await this.runResponseHooks(request, result, duration, attempt);
        this.circuitBreaker?.recordSuccess();

        return result;
      } catch (error) {
        this.circuitBreaker?.recordFailure();
        await this.runErrorHooks(request, error as Error, attempt);

        if (!this.isRetryable(error) || attempt >= this.config.maxRetries) {
          throw error;
        }

        const delay = this.calculateDelay(attempt, error);
        await this.runRetryHooks(request, delay, attempt);
        await this.sleep(delay);

        lastError = error as Error;
      }
    }

    throw lastError ?? new Error('Retry loop exited unexpectedly');
  }

  async *stream<T>(request: HttpRequest): AsyncIterable<T> {
    this.checkCircuitBreaker();

    const startTime = Date.now();
    let hasError = false;
    let streamError: Error | undefined;

    try {
      // Run request hooks for stream start
      await this.runRequestHooks(request, 0);

      for await (const chunk of this.transport.stream<T>(request)) {
        yield chunk;
      }

      // Record success and run response hooks
      this.circuitBreaker?.recordSuccess();
      const duration = Date.now() - startTime;
      await this.runResponseHooks(request, {} as T, duration, 0);
    } catch (error) {
      hasError = true;
      streamError = error as Error;
      this.circuitBreaker?.recordFailure();

      // Run error hooks
      await this.runErrorHooks(request, streamError, 0);

      throw error;
    }
  }

  private checkCircuitBreaker(): void {
    if (this.circuitBreaker && !this.circuitBreaker.canExecute()) {
      throw new APIError('Circuit breaker is open', 503);
    }
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof RateLimitError) return true;
    if (error instanceof APIConnectionError) return true;
    if (error instanceof InternalServerError) return true;
    if (error instanceof APIError) {
      return error.statusCode !== undefined && error.statusCode >= 500;
    }
    return false;
  }

  private calculateDelay(attempt: number, error: unknown): number {
    // Check for retry-after header in rate limit errors
    if (error instanceof RateLimitError && error.retryAfter) {
      return error.retryAfter * 1000;
    }

    const baseDelay = this.config.initialDelayMs * Math.pow(this.config.multiplier, attempt);
    const cappedDelay = Math.min(baseDelay, this.config.maxDelayMs);

    if (this.config.jitter) {
      const jitter = cappedDelay * 0.5 * (Math.random() - 0.5);
      return Math.round(cappedDelay + jitter);
    }

    return Math.round(cappedDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async runRequestHooks(request: HttpRequest, attempt: number): Promise<void> {
    for (const hook of this.hooks.request ?? []) {
      await hook(request, attempt);
    }
  }

  private async runResponseHooks<T>(
    request: HttpRequest,
    response: T,
    duration: number,
    attempt: number
  ): Promise<void> {
    for (const hook of this.hooks.response ?? []) {
      await hook(request, response, duration, attempt);
    }
  }

  private async runErrorHooks(request: HttpRequest, error: Error, attempt: number): Promise<void> {
    for (const hook of this.hooks.error ?? []) {
      await hook(request, error, attempt);
    }
  }

  private async runRetryHooks(request: HttpRequest, delayMs: number, attempt: number): Promise<void> {
    for (const hook of this.hooks.retry ?? []) {
      await hook(request, delayMs, attempt);
    }
  }
}

// Factory function
export function createResilienceOrchestrator(
  transport: HttpTransport,
  config?: Partial<ResilienceConfig>
): ResilienceOrchestrator {
  return new DefaultResilienceOrchestrator(transport, {
    ...DEFAULT_RESILIENCE_CONFIG,
    ...config,
  });
}
