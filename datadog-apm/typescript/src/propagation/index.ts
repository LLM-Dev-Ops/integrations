/**
 * Propagation module exports
 */

// Carrier interface and implementation
export { Carrier } from './carrier';
export { HeaderCarrier } from './header-carrier';

// Datadog propagation
export {
  DD_TRACE_ID,
  DD_PARENT_ID,
  DD_SAMPLING_PRIORITY,
  DD_ORIGIN,
  DD_TAGS,
  injectDatadogContext,
  extractDatadogContext,
} from './datadog';

// W3C TraceContext propagation
export {
  W3C_TRACEPARENT,
  W3C_TRACESTATE,
  injectW3CContext,
  extractW3CContext,
  formatTraceparent,
  parseTraceparent,
  formatTracestate,
} from './w3c';

// Composite propagator
export { CompositePropagator } from './composite';

// Trace ID converter
export { TraceIdConverter } from './trace-id';
