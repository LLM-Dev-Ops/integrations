/**
 * TelemetryEmitter - Singleton telemetry event emitter
 *
 * Provides a non-blocking, fire-and-forget HTTP client for sending
 * telemetry events to the ruvvector-service /ingest endpoint.
 *
 * Key features:
 * - Singleton pattern for shared usage across integrations
 * - Non-blocking fire-and-forget pattern (fails open)
 * - Exponential backoff retry with max 2 retries
 * - Never throws exceptions that could affect integrations
 * - Configurable endpoint via RUVVECTOR_INGEST_URL environment variable
 */

import { request } from 'undici';
import type { TelemetryEvent, TelemetryEmitterConfig, EventType } from './types.js';

export class TelemetryEmitter {
  private static instance: TelemetryEmitter | null = null;
  private readonly ingestUrl: string;
  private readonly maxRetries: number;
  private readonly initialRetryDelay: number;
  private readonly timeout: number;

  /**
   * Private constructor for singleton pattern
   */
  private constructor(config: TelemetryEmitterConfig = {}) {
    this.ingestUrl = config.ingestUrl
      || process.env.RUVVECTOR_INGEST_URL
      || 'http://localhost:3100/ingest';
    this.maxRetries = config.maxRetries ?? 2;
    this.initialRetryDelay = config.initialRetryDelay ?? 100;
    this.timeout = config.timeout ?? 5000;
  }

  /**
   * Get the singleton instance of TelemetryEmitter
   */
  public static getInstance(config?: TelemetryEmitterConfig): TelemetryEmitter {
    if (!TelemetryEmitter.instance) {
      TelemetryEmitter.instance = new TelemetryEmitter(config);
    }
    return TelemetryEmitter.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  public static resetInstance(): void {
    TelemetryEmitter.instance = null;
  }

  /**
   * Emit a telemetry event with fire-and-forget pattern
   * Never blocks the caller and never throws exceptions
   */
  public emit(event: TelemetryEvent): void {
    // Fire and forget - don't await
    this.sendWithRetry(event).catch((error) => {
      // Silent failure with debug logging only
      console.debug('[TelemetryEmitter] Failed to send event:', {
        error: error instanceof Error ? error.message : String(error),
        event: {
          integration: event.integration,
          eventType: event.eventType,
          correlationId: event.correlationId,
        },
      });
    });
  }

  /**
   * Send event with exponential backoff retry
   */
  private async sendWithRetry(event: TelemetryEvent): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        await this.sendEvent(event);
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // If we've exhausted retries, throw the error
        if (attempt === this.maxRetries) {
          throw lastError;
        }

        // Calculate exponential backoff delay: 100ms, 200ms
        const delay = this.initialRetryDelay * Math.pow(2, attempt);

        console.debug(`[TelemetryEmitter] Retry ${attempt + 1}/${this.maxRetries} after ${delay}ms:`, {
          error: lastError.message,
          integration: event.integration,
          eventType: event.eventType,
        });

        // Wait before retrying
        await this.sleep(delay);
      }
    }
  }

  /**
   * Send a single event to the ingest endpoint
   */
  private async sendEvent(event: TelemetryEvent): Promise<void> {
    try {
      const response = await request(this.ingestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
        bodyTimeout: this.timeout,
        headersTimeout: this.timeout,
      });

      // Consume the response body to free resources
      await response.body.text();

      // Check for HTTP errors
      if (response.statusCode >= 400) {
        throw new Error(`HTTP ${response.statusCode}: ${response.statusCode >= 500 ? 'Server Error' : 'Client Error'}`);
      }
    } catch (error) {
      // Re-throw for retry logic
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Convenience method: Emit a request_start event
   */
  public emitRequestStart(
    integration: string,
    correlationId: string,
    metadata: Record<string, unknown> = {},
    options?: { provider?: string; traceId?: string; spanId?: string }
  ): void {
    this.emit({
      correlationId,
      integration,
      provider: options?.provider,
      eventType: 'request_start',
      timestamp: Date.now(),
      metadata,
      traceId: options?.traceId,
      spanId: options?.spanId,
    });
  }

  /**
   * Convenience method: Emit a request_complete event
   */
  public emitRequestComplete(
    integration: string,
    correlationId: string,
    metadata: Record<string, unknown> = {},
    options?: { provider?: string; traceId?: string; spanId?: string }
  ): void {
    this.emit({
      correlationId,
      integration,
      provider: options?.provider,
      eventType: 'request_complete',
      timestamp: Date.now(),
      metadata,
      traceId: options?.traceId,
      spanId: options?.spanId,
    });
  }

  /**
   * Convenience method: Emit an error event
   */
  public emitError(
    integration: string,
    correlationId: string,
    error: Error | string,
    metadata: Record<string, unknown> = {},
    options?: { provider?: string; traceId?: string; spanId?: string }
  ): void {
    const errorMetadata = {
      ...metadata,
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack,
      } : { message: String(error) },
    };

    this.emit({
      correlationId,
      integration,
      provider: options?.provider,
      eventType: 'error',
      timestamp: Date.now(),
      metadata: errorMetadata,
      traceId: options?.traceId,
      spanId: options?.spanId,
    });
  }

  /**
   * Convenience method: Emit a latency event
   */
  public emitLatency(
    integration: string,
    correlationId: string,
    latencyMs: number,
    metadata: Record<string, unknown> = {},
    options?: { provider?: string; traceId?: string; spanId?: string }
  ): void {
    const latencyMetadata = {
      ...metadata,
      latencyMs,
    };

    this.emit({
      correlationId,
      integration,
      provider: options?.provider,
      eventType: 'latency',
      timestamp: Date.now(),
      metadata: latencyMetadata,
      traceId: options?.traceId,
      spanId: options?.spanId,
    });
  }

  /**
   * Get the current configuration (useful for debugging)
   */
  public getConfig(): Readonly<{
    ingestUrl: string;
    maxRetries: number;
    initialRetryDelay: number;
    timeout: number;
  }> {
    return {
      ingestUrl: this.ingestUrl,
      maxRetries: this.maxRetries,
      initialRetryDelay: this.initialRetryDelay,
      timeout: this.timeout,
    };
  }
}
