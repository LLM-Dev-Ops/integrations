/**
 * LLM span interfaces for Datadog APM
 * Following the SPARC specification
 */

import type { Span } from '../types/index.js';

/**
 * LLM request types
 */
export enum LLMRequestType {
  CHAT = 'chat',
  COMPLETION = 'completion',
  EMBED = 'embed',
  FUNCTION_CALL = 'function_call',
}

/**
 * Options for creating an LLM span
 */
export interface LLMSpanOptions {
  provider: string; // "anthropic", "openai", etc.
  model: string; // "claude-3-opus", "gpt-4"
  requestType: LLMRequestType;
  streaming?: boolean;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  parentSpan?: Span;
}

/**
 * LLM span interface extending base Span
 */
export interface LLMSpan extends Span {
  /**
   * Record token usage for the LLM call
   * @param input - Number of input tokens
   * @param output - Number of output tokens
   */
  recordTokens(input: number, output: number): LLMSpan;

  /**
   * Set the finish reason for the LLM call
   * @param reason - Reason the model stopped generating (e.g., "stop", "length", "tool_use")
   */
  setFinishReason(reason: string): LLMSpan;

  /**
   * Record a streaming chunk received
   */
  recordStreamChunk(): LLMSpan;

  /**
   * Get the tag value for a given key
   * @param key - Tag key to retrieve
   */
  getTag(key: string): string | number | boolean | undefined;
}