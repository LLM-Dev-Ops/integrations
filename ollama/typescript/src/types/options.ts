/**
 * Ollama Integration - Model Options
 *
 * Configuration options for model inference.
 * Based on SPARC specification for Ollama model parameters.
 */

/**
 * Model inference options
 *
 * Controls various aspects of text generation including sampling,
 * performance, and memory management.
 */
export interface ModelOptions {
  /**
   * Temperature for sampling (0.0-2.0)
   *
   * Higher values make output more random, lower values more deterministic.
   * Default: 0.8
   */
  temperature?: number;

  /**
   * Top-p sampling (0.0-1.0)
   *
   * Nucleus sampling - consider tokens with cumulative probability up to top_p.
   * Default: 0.9
   */
  top_p?: number;

  /**
   * Top-k sampling
   *
   * Only sample from top k most likely tokens.
   * Default: 40
   */
  top_k?: number;

  /**
   * Maximum number of tokens to predict
   *
   * -1 for infinite generation (limited by context).
   * Default: 128
   */
  num_predict?: number;

  /**
   * Stop sequences
   *
   * Generation stops when any of these sequences are encountered.
   */
  stop?: string[];

  /**
   * Context window size
   *
   * Number of tokens in the context window.
   * Default: 2048
   */
  num_ctx?: number;

  /**
   * Batch size for prompt processing
   *
   * Number of tokens to process in parallel.
   * Default: 512
   */
  num_batch?: number;

  /**
   * Number of GPU layers
   *
   * Number of layers to offload to GPU.
   * -1 for automatic detection.
   * Default: -1
   */
  num_gpu?: number;

  /**
   * Main GPU index
   *
   * Which GPU to use for computation.
   * Default: 0
   */
  main_gpu?: number;

  /**
   * Repeat penalty (1.0+)
   *
   * Penalty for repeating tokens.
   * Default: 1.1
   */
  repeat_penalty?: number;

  /**
   * Presence penalty (-2.0 to 2.0)
   *
   * Penalty for tokens that have already appeared.
   * Default: 0.0
   */
  presence_penalty?: number;

  /**
   * Frequency penalty (-2.0 to 2.0)
   *
   * Penalty proportional to token frequency.
   * Default: 0.0
   */
  frequency_penalty?: number;

  /**
   * Random seed
   *
   * For reproducible generation.
   */
  seed?: number;

  /**
   * Number of tokens to keep from prompt
   *
   * Tokens to preserve when context is full.
   * Default: 0
   */
  num_keep?: number;

  /**
   * Mirostat sampling mode
   *
   * 0 = disabled, 1 = Mirostat 1.0, 2 = Mirostat 2.0
   * Default: 0
   */
  mirostat?: number;

  /**
   * Mirostat learning rate
   *
   * Controls how quickly the algorithm responds.
   * Default: 0.1
   */
  mirostat_eta?: number;

  /**
   * Mirostat target entropy
   *
   * Target perplexity value.
   * Default: 5.0
   */
  mirostat_tau?: number;
}
