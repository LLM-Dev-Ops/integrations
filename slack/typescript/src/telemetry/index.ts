/**
 * Telemetry types and emitter for Slack integration
 *
 * This is a lightweight copy of the shared telemetry-emitter
 * to avoid TypeScript module resolution issues.
 */

/**
 * Event type enumeration for telemetry events
 */
export type EventType = 'request_start' | 'request_complete' | 'error' | 'latency';

/**
 * TelemetryEvent interface
 */
export interface TelemetryEvent {
  correlationId: string;
  integration: string;
  provider?: string;
  eventType: EventType;
  timestamp: number;
  metadata: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
}

/**
 * Configuration options for the TelemetryEmitter
 */
export interface TelemetryEmitterConfig {
  ingestUrl?: string;
  maxRetries?: number;
  initialRetryDelay?: number;
  timeout?: number;
}

/**
 * TelemetryEmitter class for sending events to ruvvector-service
 */
export class TelemetryEmitter {
  private readonly ingestUrl: string;
  private readonly maxRetries: number;
  private readonly initialRetryDelay: number;
  private readonly timeout: number;

  constructor(config: TelemetryEmitterConfig = {}) {
    this.ingestUrl = config.ingestUrl || process.env.RUVVECTOR_INGEST_URL || 'http://localhost:3100/ingest';
    this.maxRetries = config.maxRetries ?? 2;
    this.initialRetryDelay = config.initialRetryDelay ?? 100;
    this.timeout = config.timeout ?? 5000;
  }

  /**
   * Emit a telemetry event to ruvvector-service.
   * This method is fail-open - it will never throw errors or block execution.
   *
   * @param event - The telemetry event to emit
   */
  async emit(event: TelemetryEvent): Promise<void> {
    // Fail-open: wrap everything in try-catch
    try {
      await this.emitWithRetry(event, 0);
    } catch (error) {
      // Silently fail - telemetry should never break the application
    }
  }

  /**
   * Internal method to emit with retry logic
   */
  private async emitWithRetry(event: TelemetryEvent, attempt: number): Promise<void> {
    try {
      const response = await fetch(this.ingestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(this.timeout),
      });

      // Check if response is successful (2xx status codes)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Consume the body to prevent memory leaks
      await response.text();
    } catch (error) {
      // Retry logic
      if (attempt < this.maxRetries) {
        const delay = this.initialRetryDelay * Math.pow(2, attempt);
        await this.sleep(delay);
        return this.emitWithRetry(event, attempt + 1);
      }

      // If all retries exhausted, throw error (will be caught by emit())
      throw error;
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a default TelemetryEmitter instance
 */
export function createTelemetryEmitter(config?: TelemetryEmitterConfig): TelemetryEmitter {
  return new TelemetryEmitter(config);
}
