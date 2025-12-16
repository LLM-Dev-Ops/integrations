/**
 * Datadog propagation - Datadog-specific header constants and functions
 */

import { SpanContext } from '../types';
import { Carrier } from './header-carrier';

/**
 * Datadog header constants
 */
export const DD_TRACE_ID = 'x-datadog-trace-id';
export const DD_PARENT_ID = 'x-datadog-parent-id';
export const DD_SAMPLING_PRIORITY = 'x-datadog-sampling-priority';
export const DD_ORIGIN = 'x-datadog-origin';
export const DD_TAGS = 'x-datadog-tags';

/**
 * Inject Datadog context into carrier
 */
export function injectDatadogContext(carrier: Carrier, context: SpanContext): void {
  carrier.set(DD_TRACE_ID, context.traceId);
  carrier.set(DD_PARENT_ID, context.spanId);

  if (context.samplingPriority !== undefined) {
    carrier.set(DD_SAMPLING_PRIORITY, String(context.samplingPriority));
  }

  if (context.origin) {
    carrier.set(DD_ORIGIN, context.origin);
  }
}

/**
 * Extract Datadog context from carrier
 */
export function extractDatadogContext(carrier: Carrier): SpanContext | null {
  const traceId = carrier.get(DD_TRACE_ID);
  const parentId = carrier.get(DD_PARENT_ID);

  if (!traceId || !parentId) {
    return null;
  }

  const samplingPriority = carrier.get(DD_SAMPLING_PRIORITY);
  const origin = carrier.get(DD_ORIGIN);

  return {
    traceId,
    spanId: parentId,
    samplingPriority: samplingPriority ? parseInt(samplingPriority, 10) : undefined,
    origin: origin ?? undefined,
  };
}
