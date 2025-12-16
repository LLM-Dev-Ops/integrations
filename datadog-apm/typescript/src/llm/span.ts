/**
 * LLM span implementation for Datadog APM
 * Following the SPARC pseudocode specification
 */

import type { Span, TagValue } from '../types/index.js';
import type { LLMSpan, LLMSpanOptions } from './interface.js';
import { LLM_TAGS, LLM_METRICS } from './tags.js';
import { CostTracker } from './cost.js';

/**
 * Interface for Datadog APM client (minimal needed for LLM span)
 */
export interface DatadogAPMClient {
  histogram(name: string, value: number, tags?: Record<string, TagValue>): void;
  increment(name: string, value?: number, tags?: Record<string, TagValue>): void;
}

/**
 * LLM span implementation
 */
export class LLMSpanImpl implements LLMSpan {
  private inputTokens: number = 0;
  private outputTokens: number = 0;
  private streamChunks: number = 0;
  private _tags: Record<string, TagValue> = {};
  private finished: boolean = false;

  constructor(
    private baseSpan: Span,
    private client: DatadogAPMClient,
    private provider: string,
    private model: string
  ) {}

  /**
   * Record token usage
   */
  recordTokens(input: number, output: number): LLMSpan {
    this.inputTokens = input;
    this.outputTokens = output;

    this.setTag(LLM_TAGS.INPUT_TOKENS, input);
    this.setTag(LLM_TAGS.OUTPUT_TOKENS, output);
    this.setTag(LLM_TAGS.TOTAL_TOKENS, input + output);

    // Emit metrics
    this.client.histogram(LLM_METRICS.TOKENS_INPUT, input, {
      model: this.model,
      provider: this.provider,
    });

    this.client.histogram(LLM_METRICS.TOKENS_OUTPUT, output, {
      model: this.model,
      provider: this.provider,
    });

    // Calculate and record cost if available
    if (CostTracker.hasPricing(this.model)) {
      const cost = CostTracker.calculateCost(this.model, input, output);
      this.setTag(LLM_TAGS.COST, cost);
      this.client.histogram(LLM_METRICS.COST, cost, {
        model: this.model,
        provider: this.provider,
      });
    }

    return this;
  }

  /**
   * Set finish reason
   */
  setFinishReason(reason: string): LLMSpan {
    this.setTag(LLM_TAGS.FINISH_REASON, reason);
    return this;
  }

  /**
   * Record streaming chunk
   */
  recordStreamChunk(): LLMSpan {
    this.streamChunks++;
    return this;
  }

  /**
   * Get tag value
   */
  getTag(key: string): string | number | boolean | undefined {
    return this._tags[key];
  }

  // Span interface implementation - delegate to base span
  get traceId(): string {
    return this.baseSpan.traceId;
  }

  get spanId(): string {
    return this.baseSpan.spanId;
  }

  get parentId(): string | undefined {
    return this.baseSpan.parentId;
  }

  get name(): string {
    return this.baseSpan.name;
  }

  get service(): string {
    return this.baseSpan.service;
  }

  get resource(): string {
    return this.baseSpan.resource;
  }

  get startTime(): number {
    return this.baseSpan.startTime;
  }

  get duration(): number | undefined {
    return this.baseSpan.duration;
  }

  get tags(): Record<string, TagValue> {
    return this._tags;
  }

  get error(): boolean {
    return this.baseSpan.error;
  }

  get metrics(): Record<string, number> {
    return this.baseSpan.metrics;
  }

  setTag(key: string, value: TagValue): Span {
    this._tags[key] = value;
    this.baseSpan.setTag(key, value);
    return this;
  }

  setError(error: Error): Span {
    this.baseSpan.setError(error);
    return this;
  }

  addEvent(name: string, attributes?: Record<string, TagValue>): Span {
    this.baseSpan.addEvent(name, attributes);
    return this;
  }

  finish(endTime?: number): void {
    if (this.finished) {
      return;
    }

    // Record stream chunks if streaming
    if (this.streamChunks > 0) {
      this.setTag(LLM_TAGS.STREAM_CHUNKS, this.streamChunks);
    }

    this.finished = true;
    this.baseSpan.finish(endTime);
  }

  context(): import('../types/index.js').SpanContext {
    return this.baseSpan.context();
  }
}