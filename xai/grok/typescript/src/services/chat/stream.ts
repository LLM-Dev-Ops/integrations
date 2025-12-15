/**
 * Chat Stream
 *
 * @module services/chat/stream
 */

import type { ChatStreamChunk } from '../../infra/sse-parser.js';
import type { Usage } from '../../types/usage.js';

/**
 * Accumulated stream content.
 */
export interface StreamAccumulation {
  /** Accumulated content */
  content: string;

  /** Accumulated reasoning content (Grok-3) */
  reasoningContent: string;

  /** Final usage (from last chunk) */
  usage?: Usage;

  /** Finish reason */
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

/**
 * Stream accumulator for efficiently collecting stream chunks.
 */
export class StreamAccumulator {
  private contentParts: string[] = [];
  private reasoningParts: string[] = [];
  private _usage?: Usage;
  private _finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null = null;
  private _model?: string;
  private _id?: string;

  /**
   * Append a chunk to the accumulator.
   *
   * @param chunk - Stream chunk
   */
  append(chunk: ChatStreamChunk): void {
    this._id = chunk.id;
    this._model = chunk.model;

    if (chunk.usage) {
      this._usage = chunk.usage;
    }

    for (const choice of chunk.choices) {
      if (choice.delta.content) {
        this.contentParts.push(choice.delta.content);
      }
      if (choice.delta.reasoning_content) {
        this.reasoningParts.push(choice.delta.reasoning_content);
      }
      if (choice.finish_reason) {
        this._finishReason = choice.finish_reason;
      }
    }
  }

  /**
   * Get accumulated content.
   *
   * @returns Accumulated content string
   */
  get content(): string {
    return this.contentParts.join('');
  }

  /**
   * Get accumulated reasoning content.
   *
   * @returns Accumulated reasoning content string
   */
  get reasoningContent(): string {
    return this.reasoningParts.join('');
  }

  /**
   * Get final usage.
   *
   * @returns Usage or undefined
   */
  get usage(): Usage | undefined {
    return this._usage;
  }

  /**
   * Get finish reason.
   *
   * @returns Finish reason
   */
  get finishReason(): 'stop' | 'length' | 'tool_calls' | 'content_filter' | null {
    return this._finishReason;
  }

  /**
   * Get model ID.
   *
   * @returns Model ID
   */
  get model(): string | undefined {
    return this._model;
  }

  /**
   * Get response ID.
   *
   * @returns Response ID
   */
  get id(): string | undefined {
    return this._id;
  }

  /**
   * Finalize and get the complete accumulation.
   *
   * @returns Stream accumulation
   */
  finalize(): StreamAccumulation {
    return {
      content: this.content,
      reasoningContent: this.reasoningContent,
      usage: this._usage,
      finishReason: this._finishReason,
    };
  }

  /**
   * Reset the accumulator.
   */
  reset(): void {
    this.contentParts = [];
    this.reasoningParts = [];
    this._usage = undefined;
    this._finishReason = null;
    this._model = undefined;
    this._id = undefined;
  }
}

/**
 * Chat stream event.
 */
export interface ChatStreamEvent {
  /** Event type */
  readonly type: 'chunk' | 'done' | 'error';

  /** Stream chunk (for 'chunk' type) */
  readonly chunk?: ChatStreamChunk;

  /** Accumulated content (for 'done' type) */
  readonly accumulation?: StreamAccumulation;

  /** Error (for 'error' type) */
  readonly error?: Error;
}
