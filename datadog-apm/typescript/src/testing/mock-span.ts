/**
 * Mock span implementation for testing
 *
 * @module testing/mock-span
 */

import type { Tags, TagValue } from '../types/common.js';

/**
 * Captured event structure
 */
export interface CapturedEvent {
  name: string;
  timestamp: number;
  attributes?: Tags;
}

/**
 * Captured span structure for assertions
 */
export interface CapturedSpan {
  name: string;
  traceId: string;
  spanId: string;
  parentId?: string;
  resource?: string;
  type?: string;
  tags: Record<string, TagValue>;
  events: CapturedEvent[];
  error: Error | null;
  startTime: number;
  endTime: number | null;
  duration?: number;
  finished: boolean;
}

/**
 * Mock span context
 */
export interface MockSpanContext {
  traceId: string;
  spanId: string;
  samplingPriority?: number;
  origin?: string;
}

/**
 * Mock span implementation
 */
export class MockSpan {
  private captured: CapturedSpan;
  private _context: MockSpanContext;

  constructor(
    name: string,
    options?: {
      parentId?: string;
      resource?: string;
      type?: string;
      tags?: Record<string, TagValue>;
    }
  ) {
    const traceId = MockSpan.generateId();
    const spanId = MockSpan.generateId();

    this._context = {
      traceId,
      spanId,
      samplingPriority: 1,
    };

    this.captured = {
      name,
      traceId,
      spanId,
      parentId: options?.parentId,
      resource: options?.resource,
      type: options?.type,
      tags: { ...options?.tags },
      events: [],
      error: null,
      startTime: Date.now(),
      endTime: null,
      finished: false,
    };
  }

  /**
   * Generate a mock ID
   */
  static generateId(): string {
    return Math.random().toString(16).slice(2, 18);
  }

  /**
   * Get trace ID
   */
  get traceId(): string {
    return this.captured.traceId;
  }

  /**
   * Get span ID
   */
  get spanId(): string {
    return this.captured.spanId;
  }

  /**
   * Get parent ID
   */
  get parentId(): string | undefined {
    return this.captured.parentId;
  }

  /**
   * Get span name
   */
  get name(): string {
    return this.captured.name;
  }

  /**
   * Set a tag on the span
   */
  setTag(key: string, value: TagValue): MockSpan {
    if (!this.captured.finished) {
      this.captured.tags[key] = value;
    }
    return this;
  }

  /**
   * Get a tag value
   */
  getTag(key: string): TagValue | undefined {
    return this.captured.tags[key];
  }

  /**
   * Set error on the span
   */
  setError(error: Error): MockSpan {
    if (!this.captured.finished) {
      this.captured.error = error;
      this.captured.tags['error'] = true;
      this.captured.tags['error.type'] = error.name;
      this.captured.tags['error.message'] = error.message;
      if (error.stack) {
        this.captured.tags['error.stack'] = error.stack;
      }
    }
    return this;
  }

  /**
   * Add an event to the span
   */
  addEvent(name: string, attributes?: Tags): MockSpan {
    if (!this.captured.finished) {
      this.captured.events.push({
        name,
        timestamp: Date.now(),
        attributes,
      });
    }
    return this;
  }

  /**
   * Finish the span
   */
  finish(endTime?: number): void {
    if (!this.captured.finished) {
      this.captured.finished = true;
      this.captured.endTime = endTime ?? Date.now();
      this.captured.duration = this.captured.endTime - this.captured.startTime;
    }
  }

  /**
   * Get span context
   */
  context(): MockSpanContext {
    return { ...this._context };
  }

  /**
   * Check if span is finished
   */
  isFinished(): boolean {
    return this.captured.finished;
  }

  /**
   * Get the captured span data for assertions
   */
  getCaptured(): CapturedSpan {
    return { ...this.captured, tags: { ...this.captured.tags } };
  }
}
