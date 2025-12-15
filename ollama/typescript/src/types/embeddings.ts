/**
 * Ollama Integration - Embeddings Types
 *
 * Types for embeddings generation API.
 * Based on SPARC specification for Ollama embeddings endpoints.
 */

import { ModelOptions } from './options.js';

/**
 * Embeddings request
 *
 * Supports both Ollama native format (prompt) and OpenAI-compatible format (input).
 */
export interface EmbeddingsRequest {
  /**
   * Model name to use for embedding generation
   *
   * Example: "llama2", "nomic-embed-text"
   */
  model: string;

  /**
   * Text to embed (Ollama native format)
   *
   * Either prompt or input must be provided.
   */
  prompt?: string;

  /**
   * Text to embed (OpenAI-compatible format)
   *
   * Either prompt or input must be provided.
   * Can be a single string or array of strings for batch processing.
   */
  input?: string | string[];

  /**
   * Model inference options
   */
  options?: ModelOptions;

  /**
   * Model keep-alive duration
   *
   * Duration to keep model loaded in memory (e.g., "5m", "1h").
   * Set to "0" to unload immediately, "-1" to keep indefinitely.
   */
  keep_alive?: string;
}

/**
 * Embeddings response
 */
export interface EmbeddingsResponse {
  /**
   * Model name used
   */
  model: string;

  /**
   * Generated embedding vectors
   *
   * Array of embedding vectors. Each vector is an array of floats.
   * For single text input, returns one vector.
   * For batch input, returns multiple vectors.
   */
  embeddings: number[][];
}
