/**
 * Streaming LLM span implementation
 * Tracks time-to-first-token and tokens-per-second
 */

import type { LLMSpan } from './interface.js';
import { LLM_TAGS, LLM_METRICS } from './tags.js';
import type { DatadogAPMClient } from './span.js';

/**
 * Streaming LLM span that extends base LLM span with streaming metrics
 */
export class StreamingLLMSpan {
  private firstTokenTime: number | null = null;
  private lastTokenTime: number | null = null;
  private tokenCount: number = 0;

  constructor(
    private llmSpan: LLMSpan,
    private client: DatadogAPMClient,
    private provider: string,
    private model: string
  ) {}

  /**
   * Record a token being received (for streaming)
   */
  onToken(): void {
    const now = performance.now();

    if (this.firstTokenTime === null) {
      this.firstTokenTime = now;
      this.calculateTTFT();
    }

    this.lastTokenTime = now;
    this.tokenCount++;
    this.llmSpan.recordStreamChunk();
  }

  /**
   * Complete the streaming span
   */
  finish(inputTokens: number, outputTokens: number): void {
    // Record tokens
    this.llmSpan.recordTokens(inputTokens, outputTokens);

    // Calculate tokens per second
    if (this.firstTokenTime && this.lastTokenTime) {
      const durationSeconds = (this.lastTokenTime - this.firstTokenTime) / 1000;
      if (durationSeconds > 0) {
        const tokensPerSecond = this.tokenCount / durationSeconds;
        this.llmSpan.setTag(LLM_TAGS.TOKENS_PER_SECOND, tokensPerSecond);

        this.client.histogram(LLM_METRICS.TOKENS_PER_SECOND, tokensPerSecond, {
          model: this.model,
          provider: this.provider,
        });
      }
    }

    this.llmSpan.finish();
  }

  /**
   * Calculate and record time to first token (TTFT)
   */
  private calculateTTFT(): void {
    if (!this.firstTokenTime) {
      return;
    }

    const ttft = this.firstTokenTime - this.llmSpan.startTime;
    this.llmSpan.setTag(LLM_TAGS.TTFT, ttft);

    this.client.histogram(LLM_METRICS.TTFT, ttft, {
      model: this.model,
      provider: this.provider,
    });
  }

  /**
   * Get the underlying LLM span
   */
  getSpan(): LLMSpan {
    return this.llmSpan;
  }

  /**
   * Set error on the span
   */
  setError(error: Error): void {
    this.llmSpan.setError(error);
  }

  /**
   * Set finish reason
   */
  setFinishReason(reason: string): void {
    this.llmSpan.setFinishReason(reason);
  }
}