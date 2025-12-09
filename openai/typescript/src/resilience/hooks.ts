import type { HttpRequest } from '../transport/http-transport.js';

export type RequestHook = (request: HttpRequest, attempt: number) => void | Promise<void>;
export type ResponseHook = <T>(request: HttpRequest, response: T, durationMs: number, attempt: number) => void | Promise<void>;
export type ErrorHook = (request: HttpRequest, error: Error, attempt: number) => void | Promise<void>;
export type RetryHook = (request: HttpRequest, delayMs: number, attempt: number) => void | Promise<void>;

export interface ResilienceHooks {
  onRequest?: RequestHook;
  onResponse?: ResponseHook;
  onError?: ErrorHook;
  onRetry?: RetryHook;
}

// Logging hooks implementation
export class LoggingHooks implements ResilienceHooks {
  constructor(
    private readonly options: {
      logRequests?: boolean;
      logResponses?: boolean;
      logErrors?: boolean;
      logRetries?: boolean;
      logger?: typeof console;
    } = {}
  ) {}

  onRequest: RequestHook = (request, attempt) => {
    if (this.options.logRequests !== false) {
      const logger = this.options.logger ?? console;
      logger.debug(`[OpenAI] ${request.method} ${request.path} (attempt ${attempt + 1})`);
    }
  };

  onResponse: ResponseHook = (request, _response, durationMs, attempt) => {
    if (this.options.logResponses !== false) {
      const logger = this.options.logger ?? console;
      logger.debug(`[OpenAI] ${request.method} ${request.path} completed in ${durationMs}ms (attempt ${attempt + 1})`);
    }
  };

  onError: ErrorHook = (request, error, attempt) => {
    if (this.options.logErrors !== false) {
      const logger = this.options.logger ?? console;
      logger.warn(`[OpenAI] ${request.method} ${request.path} failed (attempt ${attempt + 1}):`, error.message);
    }
  };

  onRetry: RetryHook = (request, delayMs, attempt) => {
    if (this.options.logRetries !== false) {
      const logger = this.options.logger ?? console;
      logger.info(`[OpenAI] Retrying ${request.method} ${request.path} in ${delayMs}ms (attempt ${attempt + 2})`);
    }
  };
}

// Default retry hook that checks for retryable conditions
export class DefaultRetryHook {
  onRetry: RetryHook = (request, delayMs, attempt) => {
    // Can be extended to add metrics, logging, etc.
  };
}
