import type { HttpRequest } from '../transport/http-transport.js';
import { TelemetryEmitter } from '@integrations/telemetry-emitter';

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

// Telemetry hooks implementation for emitting events to ruvvector-service
export class TelemetryHooks implements ResilienceHooks {
  private readonly emitter: TelemetryEmitter;
  private readonly correlationIds: Map<HttpRequest, string> = new Map();

  constructor() {
    this.emitter = TelemetryEmitter.getInstance();
  }

  onRequest: RequestHook = (request, attempt) => {
    try {
      // Generate correlation ID on first attempt
      if (attempt === 0) {
        const correlationId = crypto.randomUUID();
        this.correlationIds.set(request, correlationId);

        // Extract metadata from request
        const metadata: Record<string, unknown> = {
          operation: this.extractOperation(request.path),
          method: request.method,
          path: request.path,
          attempt: attempt + 1,
        };

        // Extract model from request body if available
        const model = this.extractModel(request.body);
        if (model) {
          metadata.model = model;
        }

        // Emit request_start event
        this.emitter.emitRequestStart(
          'openai',
          correlationId,
          metadata,
          { provider: model }
        );
      }
    } catch (error) {
      // Fail-open: telemetry errors should never affect the integration
      if (process.env.DEBUG_TELEMETRY === 'true') {
        console.debug('[TelemetryHooks] Failed to emit request_start:', error);
      }
    }
  };

  onResponse: ResponseHook = (request, response, durationMs, attempt) => {
    try {
      const correlationId = this.correlationIds.get(request);
      if (!correlationId) return;

      // Extract metadata from request and response
      const metadata: Record<string, unknown> = {
        operation: this.extractOperation(request.path),
        method: request.method,
        path: request.path,
        attempt: attempt + 1,
        durationMs,
      };

      // Extract model from request body if available
      const model = this.extractModel(request.body);
      if (model) {
        metadata.model = model;
      }

      // Extract token usage if available
      const usage = this.extractUsage(response);
      if (usage) {
        metadata.usage = usage;
      }

      // Emit request_complete event
      this.emitter.emitRequestComplete(
        'openai',
        correlationId,
        metadata,
        { provider: model }
      );

      // Emit latency event
      this.emitter.emitLatency(
        'openai',
        correlationId,
        durationMs,
        metadata,
        { provider: model }
      );

      // Clean up correlation ID
      this.correlationIds.delete(request);
    } catch (error) {
      // Fail-open: telemetry errors should never affect the integration
      if (process.env.DEBUG_TELEMETRY === 'true') {
        console.debug('[TelemetryHooks] Failed to emit response events:', error);
      }
    }
  };

  onError: ErrorHook = (request, error, attempt) => {
    try {
      const correlationId = this.correlationIds.get(request);
      if (!correlationId) return;

      // Extract metadata from request
      const metadata: Record<string, unknown> = {
        operation: this.extractOperation(request.path),
        method: request.method,
        path: request.path,
        attempt: attempt + 1,
        errorType: error.constructor.name,
      };

      // Extract model from request body if available
      const model = this.extractModel(request.body);
      if (model) {
        metadata.model = model;
      }

      // Emit error event
      this.emitter.emitError(
        'openai',
        correlationId,
        error,
        metadata,
        { provider: model }
      );

      // Clean up correlation ID on final error
      // Note: We don't clean up here because retries might still happen
    } catch (telemetryError) {
      // Fail-open: telemetry errors should never affect the integration
      if (process.env.DEBUG_TELEMETRY === 'true') {
        console.debug('[TelemetryHooks] Failed to emit error event:', telemetryError);
      }
    }
  };

  onRetry: RetryHook = (request, delayMs, attempt) => {
    try {
      const correlationId = this.correlationIds.get(request);
      if (!correlationId) return;

      // Extract metadata from request
      const metadata: Record<string, unknown> = {
        operation: this.extractOperation(request.path),
        method: request.method,
        path: request.path,
        attempt: attempt + 1,
        nextAttempt: attempt + 2,
        delayMs,
      };

      // Extract model from request body if available
      const model = this.extractModel(request.body);
      if (model) {
        metadata.model = model;
      }

      // Note: We don't emit a separate retry event, but include retry info in error events
    } catch (error) {
      // Fail-open: telemetry errors should never affect the integration
      if (process.env.DEBUG_TELEMETRY === 'true') {
        console.debug('[TelemetryHooks] Failed to process retry:', error);
      }
    }
  };

  /**
   * Extract operation type from request path
   */
  private extractOperation(path: string): string {
    if (path.includes('/chat/completions')) return 'chat.completion';
    if (path.includes('/completions')) return 'completion';
    if (path.includes('/embeddings')) return 'embedding';
    if (path.includes('/images')) return 'image';
    if (path.includes('/audio')) return 'audio';
    if (path.includes('/models')) return 'models';
    if (path.includes('/files')) return 'files';
    if (path.includes('/fine_tuning')) return 'fine-tuning';
    if (path.includes('/moderations')) return 'moderation';
    if (path.includes('/assistants')) return 'assistant';
    return 'unknown';
  }

  /**
   * Extract model from request body
   */
  private extractModel(body: unknown): string | undefined {
    try {
      if (typeof body === 'object' && body !== null && 'model' in body) {
        const model = (body as { model: unknown }).model;
        if (typeof model === 'string') {
          return model;
        }
      }
    } catch {
      // Fail silently
    }
    return undefined;
  }

  /**
   * Extract token usage from response
   */
  private extractUsage(response: unknown): Record<string, unknown> | undefined {
    try {
      if (typeof response === 'object' && response !== null && 'usage' in response) {
        const usage = (response as { usage: unknown }).usage;
        if (typeof usage === 'object' && usage !== null) {
          return usage as Record<string, unknown>;
        }
      }
    } catch {
      // Fail silently
    }
    return undefined;
  }
}
