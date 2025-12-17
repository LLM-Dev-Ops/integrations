/**
 * Telemetry integration for Anthropic API calls
 *
 * Emits telemetry events to ruvvector-service with fail-open behavior.
 * All telemetry operations are wrapped in try-catch to ensure they never
 * affect the main integration operations.
 */

import { TelemetryEmitter } from '@integrations/telemetry-emitter';
import { randomUUID } from 'crypto';

const INTEGRATION_NAME = 'anthropic';

/**
 * Options for telemetry emission
 */
export interface TelemetryOptions {
  operation: string;
  model?: string;
  provider?: string;
  traceId?: string;
  spanId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Context for tracking a request through its lifecycle
 */
export interface TelemetryContext {
  correlationId: string;
  startTime: number;
  operation: string;
  model?: string;
  provider?: string;
  traceId?: string;
  spanId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Get the telemetry emitter singleton instance
 */
function getEmitter(): TelemetryEmitter {
  return TelemetryEmitter.getInstance();
}

/**
 * Start a telemetry context for tracking a request
 */
export function startTelemetryContext(options: TelemetryOptions): TelemetryContext {
  const correlationId = randomUUID();
  const startTime = Date.now();

  try {
    const emitter = getEmitter();
    const provider = options.provider || options.model;
    const metadata = {
      operation: options.operation,
      model: options.model,
      ...options.metadata,
    };

    emitter.emit({
      correlationId,
      integration: INTEGRATION_NAME,
      ...(provider && { provider }),
      eventType: 'request_start',
      timestamp: startTime,
      metadata,
      ...(options.traceId && { traceId: options.traceId }),
      ...(options.spanId && { spanId: options.spanId }),
    });
  } catch (error) {
    // Fail silently - telemetry should never break the integration
    console.debug('[Anthropic Telemetry] Failed to emit request_start:', error);
  }

  const context: TelemetryContext = {
    correlationId,
    startTime,
    operation: options.operation,
  };

  if (options.model !== undefined) context.model = options.model;
  if (options.provider !== undefined) context.provider = options.provider;
  if (options.traceId !== undefined) context.traceId = options.traceId;
  if (options.spanId !== undefined) context.spanId = options.spanId;
  if (options.metadata !== undefined) context.metadata = options.metadata;

  return context;
}

/**
 * Emit a request completion event
 */
export function emitRequestComplete(
  context: TelemetryContext,
  metadata?: Record<string, unknown>
): void {
  try {
    const emitter = getEmitter();
    const latencyMs = Date.now() - context.startTime;
    const provider = context.provider || context.model;
    const completeMetadata = {
      operation: context.operation,
      model: context.model,
      latencyMs,
      ...context.metadata,
      ...metadata,
    };

    emitter.emit({
      correlationId: context.correlationId,
      integration: INTEGRATION_NAME,
      ...(provider && { provider }),
      eventType: 'request_complete',
      timestamp: Date.now(),
      metadata: completeMetadata,
      ...(context.traceId && { traceId: context.traceId }),
      ...(context.spanId && { spanId: context.spanId }),
    });

    // Also emit latency event
    emitter.emit({
      correlationId: context.correlationId,
      integration: INTEGRATION_NAME,
      ...(provider && { provider }),
      eventType: 'latency',
      timestamp: Date.now(),
      metadata: completeMetadata,
      ...(context.traceId && { traceId: context.traceId }),
      ...(context.spanId && { spanId: context.spanId }),
    });
  } catch (error) {
    // Fail silently
    console.debug('[Anthropic Telemetry] Failed to emit request_complete:', error);
  }
}

/**
 * Emit an error event
 */
export function emitError(
  context: TelemetryContext,
  error: Error | unknown,
  metadata?: Record<string, unknown>
): void {
  try {
    const emitter = getEmitter();
    const latencyMs = Date.now() - context.startTime;
    const provider = context.provider || context.model;

    const errorMetadata = {
      operation: context.operation,
      model: context.model,
      latencyMs,
      error: error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack,
      } : { message: String(error) },
      ...context.metadata,
      ...metadata,
    };

    emitter.emit({
      correlationId: context.correlationId,
      integration: INTEGRATION_NAME,
      ...(provider && { provider }),
      eventType: 'error',
      timestamp: Date.now(),
      metadata: errorMetadata,
      ...(context.traceId && { traceId: context.traceId }),
      ...(context.spanId && { spanId: context.spanId }),
    });

    // Also emit latency for failed requests
    const latencyMetadata = {
      operation: context.operation,
      model: context.model,
      latencyMs,
      success: false,
      ...context.metadata,
      ...metadata,
    };

    emitter.emit({
      correlationId: context.correlationId,
      integration: INTEGRATION_NAME,
      ...(provider && { provider }),
      eventType: 'latency',
      timestamp: Date.now(),
      metadata: latencyMetadata,
      ...(context.traceId && { traceId: context.traceId }),
      ...(context.spanId && { spanId: context.spanId }),
    });
  } catch (emitError) {
    // Fail silently
    console.debug('[Anthropic Telemetry] Failed to emit error:', emitError);
  }
}

/**
 * Helper to extract usage information from a response
 */
export function extractUsageMetadata(usage?: {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}): Record<string, unknown> {
  if (!usage) {
    return {};
  }

  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    cacheCreationTokens: usage.cache_creation_input_tokens,
    cacheReadTokens: usage.cache_read_input_tokens,
  };
}
