/**
 * Ollama Integration - Generate Types
 *
 * Types for text generation API.
 * Based on SPARC specification for Ollama generate endpoints.
 */

import { ModelOptions } from './options.js';

/**
 * Text generation request
 */
export interface GenerateRequest {
  /**
   * Model name to use for generation
   *
   * Example: "llama2", "mistral", "codellama"
   */
  model: string;

  /**
   * Input prompt
   */
  prompt: string;

  /**
   * System prompt
   *
   * Sets the system message for the model.
   */
  system?: string;

  /**
   * Custom prompt template
   *
   * Overrides the model's default template.
   */
  template?: string;

  /**
   * Context from previous generation
   *
   * Enables continuation of previous generation.
   * Obtained from the `context` field in GenerateResponse.
   */
  context?: number[];

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
   * Raw mode
   *
   * If true, skips prompt templating.
   * Default: false
   */
  raw?: boolean;

  /**
   * Model keep-alive duration
   *
   * Duration to keep model loaded in memory (e.g., "5m", "1h").
   * Set to "0" to unload immediately, "-1" to keep indefinitely.
   */
  keep_alive?: string;

  /**
   * Base64-encoded images
   *
   * For multimodal models that support vision capabilities.
   */
  images?: string[];
}

/**
 * Text generation response
 */
export interface GenerateResponse {
  /**
   * Model name used
   */
  model: string;

  /**
   * Creation timestamp (ISO 8601)
   */
  created_at: string;

  /**
   * Generated text
   */
  response: string;

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
   * Context for continuation
   *
   * Can be passed to subsequent requests for continued generation.
   */
  context?: number[];

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
 * Generation streaming chunk
 *
 * Received during streaming responses.
 * Final chunk includes all timing metrics and context.
 */
export interface GenerateChunk {
  /**
   * Model name used
   */
  model: string;

  /**
   * Creation timestamp (ISO 8601)
   */
  created_at: string;

  /**
   * Partial generated text
   *
   * Contains incremental content in streaming mode.
   */
  response: string;

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
   * Context for continuation (final chunk only)
   *
   * Can be passed to subsequent requests for continued generation.
   */
  context?: number[];

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
