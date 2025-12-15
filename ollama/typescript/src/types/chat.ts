/**
 * Ollama Integration - Chat Types
 *
 * Types for chat completion API.
 * Based on SPARC specification for Ollama chat endpoints.
 */

import { Message } from './message.js';
import { ModelOptions } from './options.js';

/**
 * Chat completion request
 */
export interface ChatRequest {
  /**
   * Model name to use for generation
   *
   * Example: "llama2", "mistral", "codellama"
   */
  model: string;

  /**
   * Conversation messages
   *
   * Must contain at least one message.
   */
  messages: Message[];

  /**
   * Response format
   *
   * Set to "json" to enable JSON mode.
   */
  format?: string;

  /**
   * Model inference options
   */
  options?: ModelOptions;

  /**
   * Enable streaming
   *
   * When true, responses are streamed as they're generated.
   * Default: false
   */
  stream?: boolean;

  /**
   * Model keep-alive duration
   *
   * Duration to keep model loaded in memory (e.g., "5m", "1h").
   * Set to "0" to unload immediately, "-1" to keep indefinitely.
   */
  keep_alive?: string;
}

/**
 * Chat completion response
 */
export interface ChatResponse {
  /**
   * Model name used
   */
  model: string;

  /**
   * Creation timestamp (ISO 8601)
   */
  created_at: string;

  /**
   * Generated message
   */
  message: Message;

  /**
   * Completion flag
   */
  done: boolean;

  /**
   * Reason for completion
   *
   * Values: "stop", "length", "load"
   */
  done_reason?: string;

  /**
   * Total duration in nanoseconds
   */
  total_duration?: number;

  /**
   * Model load duration in nanoseconds
   */
  load_duration?: number;

  /**
   * Number of prompt tokens evaluated
   */
  prompt_eval_count?: number;

  /**
   * Prompt evaluation duration in nanoseconds
   */
  prompt_eval_duration?: number;

  /**
   * Number of tokens generated
   */
  eval_count?: number;

  /**
   * Generation duration in nanoseconds
   */
  eval_duration?: number;
}

/**
 * Chat streaming chunk
 *
 * Received during streaming responses.
 * Final chunk includes all timing metrics.
 */
export interface ChatChunk {
  /**
   * Model name used
   */
  model: string;

  /**
   * Creation timestamp (ISO 8601)
   */
  created_at: string;

  /**
   * Partial message
   *
   * Contains incremental content in streaming mode.
   */
  message: Message;

  /**
   * Stream completion flag
   *
   * True on the final chunk.
   */
  done: boolean;

  /**
   * Reason for completion (final chunk only)
   *
   * Values: "stop", "length", "load"
   */
  done_reason?: string;

  /**
   * Total duration in nanoseconds (final chunk only)
   */
  total_duration?: number;

  /**
   * Model load duration in nanoseconds (final chunk only)
   */
  load_duration?: number;

  /**
   * Number of prompt tokens evaluated (final chunk only)
   */
  prompt_eval_count?: number;

  /**
   * Prompt evaluation duration in nanoseconds (final chunk only)
   */
  prompt_eval_duration?: number;

  /**
   * Number of tokens generated (final chunk only)
   */
  eval_count?: number;

  /**
   * Generation duration in nanoseconds (final chunk only)
   */
  eval_duration?: number;
}
