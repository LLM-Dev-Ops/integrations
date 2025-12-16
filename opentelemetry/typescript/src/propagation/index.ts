/**
 * OpenTelemetry Context Propagation Implementation
 * Provides W3C TraceContext, Baggage, and TraceState propagation
 */

import type { Span, SpanContext } from '../types/index.js';

/**
 * Extended Span Context with validation
 */
export interface ExtendedSpanContext extends SpanContext {
  sampled?: boolean;
  isValid?: boolean;
}

/**
 * W3C TraceContext Implementation
 * Format: 00-{traceId}-{spanId}-{flags}
 */

export function parseTraceparent(header: string): SpanContext | null {
  if (!header || typeof header !== 'string') {
    return null;
  }

  const parts = header.trim().split('-');

  // W3C TraceContext format: version-traceId-spanId-flags
  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, spanId, flags] = parts;

  // Validate version (currently only 00 is supported)
  if (version !== '00') {
    return null;
  }

  // Validate traceId (32 hex characters)
  if (!/^[0-9a-f]{32}$/.test(traceId) || traceId === '00000000000000000000000000000000') {
    return null;
  }

  // Validate spanId (16 hex characters)
  if (!/^[0-9a-f]{16}$/.test(spanId) || spanId === '0000000000000000') {
    return null;
  }

  // Validate flags (2 hex characters)
  if (!/^[0-9a-f]{2}$/.test(flags)) {
    return null;
  }

  const flagByte = parseInt(flags, 16);

  return {
    traceId,
    spanId,
    traceFlags: flagByte,
  };
}

export function formatTraceparent(context: SpanContext): string {
  if (!context) {
    throw new Error('Invalid span context');
  }

  const version = '00';
  const traceId = context.traceId.padStart(32, '0');
  const spanId = context.spanId.padStart(16, '0');
  const flags = (context.traceFlags ?? 0x01)
    .toString(16)
    .padStart(2, '0');

  return `${version}-${traceId}-${spanId}-${flags}`;
}

/**
 * W3C Baggage Implementation
 * Key-value pairs propagated across service boundaries
 */

export class Baggage {
  private items: Map<string, string>;

  constructor(items?: Map<string, string>) {
    this.items = items ? new Map(items) : new Map();
  }

  set(key: string, value: string): Baggage {
    const newItems = new Map(this.items);
    newItems.set(key, value);
    return new Baggage(newItems);
  }

  get(key: string): string | undefined {
    return this.items.get(key);
  }

  remove(key: string): Baggage {
    const newItems = new Map(this.items);
    newItems.delete(key);
    return new Baggage(newItems);
  }

  entries(): [string, string][] {
    return Array.from(this.items.entries());
  }

  isEmpty(): boolean {
    return this.items.size === 0;
  }

  size(): number {
    return this.items.size;
  }
}

export function parseBaggage(header: string): Baggage {
  const baggage = new Baggage();

  if (!header || typeof header !== 'string') {
    return baggage;
  }

  // W3C Baggage format: key1=value1,key2=value2;metadata
  const members = header.split(',').map(m => m.trim());

  for (const member of members) {
    if (!member) continue;

    // Split on first semicolon to separate key-value from metadata
    const [keyValuePart] = member.split(';');
    if (!keyValuePart) continue;

    // Split on first equals sign
    const equalsIndex = keyValuePart.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = keyValuePart.substring(0, equalsIndex).trim();
    const value = keyValuePart.substring(equalsIndex + 1).trim();

    if (key && value) {
      try {
        // Decode URI components
        const decodedKey = decodeURIComponent(key);
        const decodedValue = decodeURIComponent(value);
        baggage.set(decodedKey, decodedValue);
      } catch {
        // Skip invalid encoded values
        continue;
      }
    }
  }

  return baggage;
}

export function formatBaggage(baggage: Baggage): string {
  const entries = baggage.entries();

  if (entries.length === 0) {
    return '';
  }

  return entries
    .map(([key, value]) => {
      // Encode key and value for safe transport
      const encodedKey = encodeURIComponent(key);
      const encodedValue = encodeURIComponent(value);
      return `${encodedKey}=${encodedValue}`;
    })
    .join(',');
}

/**
 * W3C TraceState Implementation
 * Vendor-specific trace context
 */

export function parseTraceState(header: string): Map<string, string> {
  const state = new Map<string, string>();

  if (!header || typeof header !== 'string') {
    return state;
  }

  // TraceState format: vendor1=value1,vendor2=value2
  const entries = header.split(',').map(e => e.trim());

  for (const entry of entries) {
    if (!entry) continue;

    const equalsIndex = entry.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = entry.substring(0, equalsIndex).trim();
    const value = entry.substring(equalsIndex + 1).trim();

    if (key && value) {
      // TraceState has max 32 entries, stop if we reach the limit
      if (state.size >= 32) break;
      state.set(key, value);
    }
  }

  return state;
}

export function formatTraceState(state: Map<string, string>): string {
  if (state.size === 0) {
    return '';
  }

  // TraceState has a maximum of 32 entries
  const entries = Array.from(state.entries()).slice(0, 32);

  return entries
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
}

/**
 * Context Management
 */

// Context storage using async local storage simulation
let activeContext: PropagationContext | null = null;

export class PropagationContext {
  private _spanContext: SpanContext | null;
  private _baggage: Baggage;
  private _traceState: Map<string, string>;
  private _parent: PropagationContext | null;

  constructor(
    spanContext: SpanContext | null = null,
    baggage: Baggage = new Baggage(),
    traceState: Map<string, string> = new Map(),
    parent: PropagationContext | null = null
  ) {
    this._spanContext = spanContext;
    this._baggage = baggage;
    this._traceState = traceState;
    this._parent = parent;
  }

  static current(): PropagationContext {
    return activeContext || new PropagationContext();
  }

  static root(): PropagationContext {
    return new PropagationContext();
  }

  span(): Span | null {
    // This returns null as we only store SpanContext for propagation
    return null;
  }

  getSpanContext(): SpanContext | null {
    return this._spanContext;
  }

  withSpan(span: Span): PropagationContext {
    const spanContext = span.spanContext();
    return new PropagationContext(spanContext, this._baggage, this._traceState, this);
  }

  withSpanContext(spanContext: SpanContext): PropagationContext {
    return new PropagationContext(spanContext, this._baggage, this._traceState, this);
  }

  withBaggage(baggage: Baggage): PropagationContext {
    return new PropagationContext(this._spanContext, baggage, this._traceState, this);
  }

  withTraceState(traceState: Map<string, string>): PropagationContext {
    return new PropagationContext(this._spanContext, this._baggage, traceState, this);
  }

  getBaggage(): Baggage {
    return this._baggage;
  }

  getTraceState(): Map<string, string> {
    return this._traceState;
  }

  getParent(): PropagationContext | null {
    return this._parent;
  }

  attach(): () => void {
    const previousContext = activeContext;
    activeContext = this;

    // Return detach function
    return () => {
      activeContext = previousContext;
    };
  }
}

// Export as Context for convenience
export { PropagationContext as Context };

/**
 * HTTP Header Injection and Extraction
 */

const TRACEPARENT_HEADER = 'traceparent';
const TRACESTATE_HEADER = 'tracestate';
const BAGGAGE_HEADER = 'baggage';

export function injectHttpHeaders(context: PropagationContext): Record<string, string> {
  const headers: Record<string, string> = {};

  // Inject traceparent
  const spanContext = context.getSpanContext();
  if (spanContext) {
    headers[TRACEPARENT_HEADER] = formatTraceparent(spanContext);
  }

  // Inject tracestate
  const traceState = context.getTraceState();
  if (traceState.size > 0) {
    headers[TRACESTATE_HEADER] = formatTraceState(traceState);
  }

  // Inject baggage
  const baggage = context.getBaggage();
  if (!baggage.isEmpty()) {
    headers[BAGGAGE_HEADER] = formatBaggage(baggage);
  }

  return headers;
}

export function extractHttpHeaders(headers: Record<string, string>): PropagationContext {
  let context = PropagationContext.root();

  // Normalize header keys to lowercase for case-insensitive lookup
  const normalizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalizedHeaders[key.toLowerCase()] = value;
  }

  // Extract traceparent
  const traceparentHeader = normalizedHeaders[TRACEPARENT_HEADER];
  if (traceparentHeader) {
    const spanContext = parseTraceparent(traceparentHeader);
    if (spanContext) {
      context = context.withSpanContext(spanContext);
    }
  }

  // Extract tracestate
  const tracestateHeader = normalizedHeaders[TRACESTATE_HEADER];
  if (tracestateHeader) {
    const traceState = parseTraceState(tracestateHeader);
    context = context.withTraceState(traceState);
  }

  // Extract baggage
  const baggageHeader = normalizedHeaders[BAGGAGE_HEADER];
  if (baggageHeader) {
    const baggage = parseBaggage(baggageHeader);
    context = context.withBaggage(baggage);
  }

  return context;
}

/**
 * Composite Propagator
 * Combines TraceContext and Baggage propagation
 */

export interface Propagator {
  inject(context: PropagationContext, carrier: Record<string, string>): void;
  extract(carrier: Record<string, string>): PropagationContext;
}

export class TraceContextPropagator implements Propagator {
  inject(context: PropagationContext, carrier: Record<string, string>): void {
    const spanContext = context.getSpanContext();
    if (spanContext) {
      carrier[TRACEPARENT_HEADER] = formatTraceparent(spanContext);

      const traceState = context.getTraceState();
      if (traceState.size > 0) {
        carrier[TRACESTATE_HEADER] = formatTraceState(traceState);
      }
    }
  }

  extract(carrier: Record<string, string>): PropagationContext {
    const normalizedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(carrier)) {
      normalizedHeaders[key.toLowerCase()] = value;
    }

    const traceparentHeader = normalizedHeaders[TRACEPARENT_HEADER];
    let context = PropagationContext.root();

    if (traceparentHeader) {
      const spanContext = parseTraceparent(traceparentHeader);
      if (spanContext) {
        context = context.withSpanContext(spanContext);
      }
    }

    const tracestateHeader = normalizedHeaders[TRACESTATE_HEADER];
    if (tracestateHeader) {
      const traceState = parseTraceState(tracestateHeader);
      context = context.withTraceState(traceState);
    }

    return context;
  }
}

export class BaggagePropagator implements Propagator {
  inject(context: PropagationContext, carrier: Record<string, string>): void {
    const baggage = context.getBaggage();
    if (!baggage.isEmpty()) {
      carrier[BAGGAGE_HEADER] = formatBaggage(baggage);
    }
  }

  extract(carrier: Record<string, string>): PropagationContext {
    const normalizedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(carrier)) {
      normalizedHeaders[key.toLowerCase()] = value;
    }

    const baggageHeader = normalizedHeaders[BAGGAGE_HEADER];
    let context = PropagationContext.root();

    if (baggageHeader) {
      const baggage = parseBaggage(baggageHeader);
      context = context.withBaggage(baggage);
    }

    return context;
  }
}

export class CompositePropagator implements Propagator {
  private propagators: Propagator[];

  constructor(propagators: Propagator[]) {
    this.propagators = propagators;
  }

  inject(context: PropagationContext, carrier: Record<string, string>): void {
    for (const propagator of this.propagators) {
      propagator.inject(context, carrier);
    }
  }

  extract(carrier: Record<string, string>): PropagationContext {
    let context = PropagationContext.root();

    for (const propagator of this.propagators) {
      const extractedContext = propagator.extract(carrier);

      // Merge contexts
      const spanContext = extractedContext.getSpanContext();
      if (spanContext) {
        context = context.withSpanContext(spanContext);
      }

      const baggage = extractedContext.getBaggage();
      if (!baggage.isEmpty()) {
        context = context.withBaggage(baggage);
      }

      const traceState = extractedContext.getTraceState();
      if (traceState.size > 0) {
        context = context.withTraceState(traceState);
      }
    }

    return context;
  }

  static default(): CompositePropagator {
    return new CompositePropagator([
      new TraceContextPropagator(),
      new BaggagePropagator(),
    ]);
  }
}

/**
 * Helper Functions
 */

export function generateTraceId(): string {
  // Generate 16 random bytes (32 hex characters)
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateSpanId(): string {
  // Generate 8 random bytes (16 hex characters)
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < 8; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Global Propagator Instance
 */

let globalPropagator: Propagator = CompositePropagator.default();

export function setGlobalPropagator(propagator: Propagator): void {
  globalPropagator = propagator;
}

export function getGlobalPropagator(): Propagator {
  return globalPropagator;
}

/**
 * Convenience Functions using Global Propagator
 */

export function inject(context: PropagationContext): Record<string, string> {
  const carrier: Record<string, string> = {};
  globalPropagator.inject(context, carrier);
  return carrier;
}

export function extract(headers: Record<string, string>): PropagationContext {
  return globalPropagator.extract(headers);
}
