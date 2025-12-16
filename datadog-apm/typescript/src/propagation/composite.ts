/**
 * Composite propagator - Handles both Datadog and W3C TraceContext formats
 */

import { SpanContext } from '../types';
import { Carrier } from './header-carrier';
import { injectDatadogContext, extractDatadogContext } from './datadog';
import { injectW3CContext, extractW3CContext } from './w3c';

/**
 * CompositePropagator handles both Datadog and W3C TraceContext propagation
 */
export class CompositePropagator {
  private service?: string;

  constructor(service?: string) {
    this.service = service;
  }

  /**
   * Inject context into carrier using both Datadog and W3C formats
   */
  inject(carrier: Carrier, context: SpanContext): void {
    // Inject Datadog headers (primary)
    injectDatadogContext(carrier, context);

    // Inject W3C TraceContext headers (for interoperability)
    injectW3CContext(carrier, context, this.service);
  }

  /**
   * Extract context from carrier, trying Datadog first, then W3C
   */
  extract(carrier: Carrier): SpanContext | null {
    // Try Datadog headers first
    const ddContext = extractDatadogContext(carrier);
    if (ddContext) {
      return ddContext;
    }

    // Fall back to W3C TraceContext
    const w3cContext = extractW3CContext(carrier);
    if (w3cContext) {
      return w3cContext;
    }

    return null;
  }
}
