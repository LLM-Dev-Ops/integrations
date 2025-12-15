/**
 * Reasoning Accumulator
 *
 * Efficiently accumulates reasoning content from streaming responses.
 *
 * @module reasoning/accumulator
 */

import type { ReasoningContent } from '../models/types.js';

/**
 * Reasoning accumulator for streaming responses.
 *
 * Uses O(1) append operations for efficient accumulation.
 */
export class ReasoningAccumulator {
  private parts: string[] = [];
  private _tokens?: number;

  /**
   * Append reasoning content.
   *
   * @param content - Content to append
   */
  append(content: string): void {
    if (content.length > 0) {
      this.parts.push(content);
    }
  }

  /**
   * Set the reasoning token count.
   *
   * @param tokens - Token count
   */
  setTokens(tokens: number): void {
    this._tokens = tokens;
  }

  /**
   * Check if any content has been accumulated.
   *
   * @returns True if content exists
   */
  hasContent(): boolean {
    return this.parts.length > 0;
  }

  /**
   * Get the accumulated content.
   *
   * @returns Accumulated content string
   */
  getContent(): string {
    return this.parts.join('');
  }

  /**
   * Get the token count.
   *
   * @returns Token count or undefined
   */
  getTokens(): number | undefined {
    return this._tokens;
  }

  /**
   * Finalize and get the complete reasoning content.
   *
   * @returns Reasoning content or null if empty
   */
  finalize(): ReasoningContent | null {
    if (!this.hasContent()) {
      return null;
    }

    return {
      content: this.getContent(),
      tokens: this._tokens,
    };
  }

  /**
   * Reset the accumulator.
   */
  reset(): void {
    this.parts = [];
    this._tokens = undefined;
  }
}
