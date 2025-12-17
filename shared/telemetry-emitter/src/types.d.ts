/**
 * Telemetry Event Types
 *
 * Defines the normalized event shape for telemetry events sent to ruvvector-service.
 */
/**
 * Event type enumeration for telemetry events
 */
export type EventType = 'request_start' | 'request_complete' | 'error' | 'latency';
/**
 * TelemetryEvent interface that follows the normalized event shape
 * from the OpenTelemetry module for consistency across integrations.
 */
export interface TelemetryEvent {
    /**
     * Unique ID for correlating events across the lifecycle of a request
     */
    correlationId: string;
    /**
     * Name of the integration (e.g., "anthropic", "slack", "openai")
     */
    integration: string;
    /**
     * Provider or model identifier when applicable (e.g., "claude-3-5-sonnet-20241022")
     */
    provider?: string;
    /**
     * Type of event being emitted
     */
    eventType: EventType;
    /**
     * Unix timestamp in milliseconds
     */
    timestamp: number;
    /**
     * Additional context from the integration
     */
    metadata: Record<string, unknown>;
    /**
     * Optional trace ID for distributed tracing
     */
    traceId?: string;
    /**
     * Optional span ID for distributed tracing
     */
    spanId?: string;
}
/**
 * Configuration options for the TelemetryEmitter
 */
export interface TelemetryEmitterConfig {
    /**
     * The ingest endpoint URL for the ruvvector-service
     * Defaults to http://localhost:3100/ingest
     */
    ingestUrl?: string;
    /**
     * Maximum number of retry attempts (default: 2)
     */
    maxRetries?: number;
    /**
     * Initial retry delay in milliseconds (default: 100)
     */
    initialRetryDelay?: number;
    /**
     * Request timeout in milliseconds (default: 5000)
     */
    timeout?: number;
}
//# sourceMappingURL=types.d.ts.map