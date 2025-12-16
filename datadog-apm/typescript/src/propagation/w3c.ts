/**
 * W3C TraceContext propagation
 */

import { SpanContext } from '../types';
import { Carrier } from './header-carrier';
import { TraceIdConverter } from './trace-id';

/**
 * W3C header constants
 */
export const W3C_TRACEPARENT = 'traceparent';
export const W3C_TRACESTATE = 'tracestate';

/**
 * Inject W3C TraceContext into carrier
 */
export function injectW3CContext(
  carrier: Carrier,
  context: SpanContext,
  service?: string
): void {
  const traceparent = formatTraceparent(context);
  carrier.set(W3C_TRACEPARENT, traceparent);

  const tracestate = formatTracestate(context, service);
  if (tracestate) {
    carrier.set(W3C_TRACESTATE, tracestate);
  }
}

/**
 * Extract W3C TraceContext from carrier
 */
export function extractW3CContext(carrier: Carrier): SpanContext | null {
  const traceparent = carrier.get(W3C_TRACEPARENT);

  if (!traceparent) {
    return null;
  }

  return parseTraceparent(traceparent);
}

/**
 * Format traceparent header: {version}-{trace-id}-{parent-id}-{flags}
 */
export function formatTraceparent(context: SpanContext): string {
  const version = '00';
  const traceId = TraceIdConverter.toW3C(context.traceId);
  const parentId = padTraceId(context.spanId, 16);
  const flags = (context.samplingPriority ?? 0) > 0 ? '01' : '00';

  return `${version}-${traceId}-${parentId}-${flags}`;
}

/**
 * Parse traceparent header
 */
export function parseTraceparent(traceparent: string): SpanContext | null {
  const parts = traceparent.split('-');

  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, parentId, flags] = parts;

  if (version !== '00') {
    // Unknown version, but we can still try to parse
    console.warn(`Unknown traceparent version: ${version}`);
  }

  // Convert W3C 128-bit trace ID to Datadog 64-bit
  const ddTraceId = TraceIdConverter.toDatadog(traceId);

  return {
    traceId: ddTraceId,
    spanId: parentId,
    samplingPriority: flags === '01' ? 1 : 0,
  };
}

/**
 * Format tracestate header
 */
export function formatTracestate(context: SpanContext, service?: string): string {
  const samplingPriority = context.samplingPriority ?? 1;
  const origin = context.origin ?? '';

  let ddState = `dd=s:${samplingPriority}`;

  if (origin) {
    ddState += `;o:${origin}`;
  }

  return ddState;
}

/**
 * Pad trace ID to specified length with leading zeros
 */
function padTraceId(id: string, length: number): string {
  return id.padStart(length, '0');
}
