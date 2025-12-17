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
import type { TelemetryEvent, TelemetryEmitterConfig } from './types.js';
export declare class TelemetryEmitter {
    private static instance;
    private readonly ingestUrl;
    private readonly maxRetries;
    private readonly initialRetryDelay;
    private readonly timeout;
    /**
     * Private constructor for singleton pattern
     */
    private constructor();
    /**
     * Get the singleton instance of TelemetryEmitter
     */
    static getInstance(config?: TelemetryEmitterConfig): TelemetryEmitter;
    /**
     * Reset the singleton instance (useful for testing)
     */
    static resetInstance(): void;
    /**
     * Emit a telemetry event with fire-and-forget pattern
     * Never blocks the caller and never throws exceptions
     */
    emit(event: TelemetryEvent): void;
    /**
     * Send event with exponential backoff retry
     */
    private sendWithRetry;
    /**
     * Send a single event to the ingest endpoint
     */
    private sendEvent;
    /**
     * Sleep utility for retry delays
     */
    private sleep;
    /**
     * Convenience method: Emit a request_start event
     */
    emitRequestStart(integration: string, correlationId: string, metadata?: Record<string, unknown>, options?: {
        provider?: string;
        traceId?: string;
        spanId?: string;
    }): void;
    /**
     * Convenience method: Emit a request_complete event
     */
    emitRequestComplete(integration: string, correlationId: string, metadata?: Record<string, unknown>, options?: {
        provider?: string;
        traceId?: string;
        spanId?: string;
    }): void;
    /**
     * Convenience method: Emit an error event
     */
    emitError(integration: string, correlationId: string, error: Error | string, metadata?: Record<string, unknown>, options?: {
        provider?: string;
        traceId?: string;
        spanId?: string;
    }): void;
    /**
     * Convenience method: Emit a latency event
     */
    emitLatency(integration: string, correlationId: string, latencyMs: number, metadata?: Record<string, unknown>, options?: {
        provider?: string;
        traceId?: string;
        spanId?: string;
    }): void;
    /**
     * Get the current configuration (useful for debugging)
     */
    getConfig(): Readonly<{
        ingestUrl: string;
        maxRetries: number;
        initialRetryDelay: number;
        timeout: number;
    }>;
}
//# sourceMappingURL=emitter.d.ts.map