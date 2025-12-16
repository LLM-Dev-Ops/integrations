/**
 * Span implementation for Datadog APM tracing.
 *
 * Wraps dd-trace spans and provides:
 * - Automatic redaction of sensitive data
 * - Structured error handling
 * - Event tracking via timestamped tags
 */

import type { Span } from './interface';
import type { Tags, TagValue } from '../types';
import type { SpanContext } from '../types';
import type { RedactionRule } from '../types';

/**
 * Datadog span wrapper (represents dd-trace span interface)
 */
interface DatadogSpanWrapper {
  context(): {
    toTraceId(): string;
    toSpanId(): string;
    _parentId?: string;
    _sampling?: {
      priority?: number;
    };
  };
  setTag(key: string, value: TagValue): DatadogSpanWrapper;
  addTags(tags: Tags): DatadogSpanWrapper;
  finish(finishTime?: number): void;
  tracer(): {
    _service?: string;
  };
  _isFinished?: boolean;
  _startTime?: number;
  _name?: string;
  _resource?: string;
}

/**
 * Implementation of the Span interface that wraps dd-trace spans.
 *
 * This class provides:
 * - Redaction of sensitive data in tags
 * - Structured error handling
 * - Event tracking (implemented as timestamped tags)
 * - Immutable access to span properties
 */
export class SpanImpl implements Span {
  private readonly ddSpan: DatadogSpanWrapper;
  private readonly redactionRules: RedactionRule[];
  private readonly spanTags: Tags = {};
  private readonly spanMetrics: Record<string, number> = {};
  private isFinished = false;
  private spanError?: number;
  private spanDuration?: number;

  constructor(ddSpan: DatadogSpanWrapper, redactionRules: RedactionRule[] = []) {
    this.ddSpan = ddSpan;
    this.redactionRules = redactionRules;
  }

  get traceId(): string {
    return this.ddSpan.context().toTraceId();
  }

  get spanId(): string {
    return this.ddSpan.context().toSpanId();
  }

  get parentId(): string | undefined {
    return this.ddSpan.context()._parentId;
  }

  get name(): string {
    return this.ddSpan._name || 'unknown';
  }

  get service(): string {
    return this.ddSpan.tracer()._service || 'unknown';
  }

  get resource(): string {
    return this.ddSpan._resource || this.name;
  }

  get startTime(): number {
    return this.ddSpan._startTime || Date.now();
  }

  get duration(): number | undefined {
    return this.spanDuration;
  }

  get tags(): Readonly<Tags> {
    return Object.freeze({ ...this.spanTags });
  }

  get error(): number | undefined {
    return this.spanError;
  }

  get metrics(): Readonly<Record<string, number>> {
    return Object.freeze({ ...this.spanMetrics });
  }

  setTag(key: string, value: TagValue): Span {
    if (this.isFinished) {
      throw new Error('Cannot set tag on finished span');
    }

    // Apply redaction rules to tag key and value
    const redactedKey = this.applyRedactionToTagKey(key);
    const redactedValue = this.applyRedactionToTagValue(key, value);

    // Store in local tags
    this.spanTags[redactedKey] = redactedValue;

    // Set on underlying dd-trace span
    this.ddSpan.setTag(redactedKey, redactedValue);

    // Track numeric values as metrics
    if (typeof redactedValue === 'number') {
      this.spanMetrics[redactedKey] = redactedValue;
    }

    return this;
  }

  setError(error: Error | string): Span {
    if (this.isFinished) {
      throw new Error('Cannot set error on finished span');
    }

    this.spanError = 1;

    // Set error tag
    this.ddSpan.setTag('error', 1);

    if (typeof error === 'string') {
      // String error message
      this.ddSpan.setTag('error.message', error);
      this.spanTags['error'] = 1;
      this.spanTags['error.message'] = error;
    } else {
      // Error object
      this.ddSpan.setTag('error.type', error.name || 'Error');
      this.ddSpan.setTag('error.message', error.message);

      if (error.stack) {
        this.ddSpan.setTag('error.stack', error.stack);
        this.spanTags['error.stack'] = error.stack;
      }

      this.spanTags['error'] = 1;
      this.spanTags['error.type'] = error.name || 'Error';
      this.spanTags['error.message'] = error.message;
    }

    return this;
  }

  addEvent(name: string, attributes?: Tags): Span {
    if (this.isFinished) {
      throw new Error('Cannot add event to finished span');
    }

    // Datadog doesn't have native span events, so we implement them as timestamped tags
    const timestamp = new Date().toISOString();
    const eventPrefix = `event.${name}`;

    // Set timestamp tag
    this.setTag(`${eventPrefix}.timestamp`, timestamp);

    // Set attribute tags
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        this.setTag(`${eventPrefix}.${key}`, value);
      }
    }

    return this;
  }

  finish(endTime?: number): void {
    if (this.isFinished) {
      return; // Idempotent
    }

    this.isFinished = true;

    // Calculate duration
    const finishTime = endTime || Date.now();
    this.spanDuration = finishTime - this.startTime;

    // Finish underlying span
    this.ddSpan.finish(endTime);
  }

  context(): SpanContext {
    const ctx = this.ddSpan.context();
    return {
      traceId: ctx.toTraceId(),
      spanId: ctx.toSpanId(),
      parentId: ctx._parentId,
      samplingPriority: ctx._sampling?.priority,
    };
  }

  /**
   * Apply redaction rules to a tag key.
   */
  private applyRedactionToTagKey(key: string): string {
    for (const rule of this.redactionRules) {
      if (!rule.applyToTagKeys) {
        continue;
      }

      const pattern = typeof rule.pattern === 'string'
        ? new RegExp(rule.pattern)
        : rule.pattern;

      if (pattern.test(key)) {
        return key.replace(pattern, rule.replacement || '[REDACTED]');
      }
    }
    return key;
  }

  /**
   * Apply redaction rules to a tag value.
   */
  private applyRedactionToTagValue(key: string, value: TagValue): TagValue {
    // Only apply redaction to string values
    if (typeof value !== 'string') {
      return value;
    }

    let redactedValue = value;

    for (const rule of this.redactionRules) {
      if (!rule.applyToTagValues) {
        continue;
      }

      const pattern = typeof rule.pattern === 'string'
        ? new RegExp(rule.pattern, 'g')
        : rule.pattern;

      redactedValue = redactedValue.replace(pattern, rule.replacement || '[REDACTED]');
    }

    return redactedValue;
  }
}
