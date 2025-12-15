/**
 * Ollama Integration - Model Management Types
 *
 * Types for model listing, details, and management.
 * Based on SPARC specification for Ollama model management endpoints.
 */

/**
 * Model details
 *
 * Metadata about model architecture and configuration.
 */
export interface ModelDetails {
  /**
   * Parent model name
   *
   * Model this was derived from, if applicable.
   */
  parent_model?: string;

  /**
   * Model format
   *
   * Example: "gguf"
   */
  format: string;

  /**
   * Model family
   *
   * Example: "llama", "mistral"
   */
  family: string;

  /**
   * All model families
   *
   * For models with multiple family lineages.
   */
  families?: string[];

  /**
   * Parameter size
   *
   * Example: "7B", "13B", "70B"
   */
  parameter_size: string;

  /**
   * Quantization level
   *
   * Example: "Q4_0", "Q5_K_M", "Q8_0"
   */
  quantization_level: string;
}

/**
 * Model summary
 *
 * Basic information about an available model.
 */
export interface ModelSummary {
  /**
   * Model name
   *
   * Short name used for API calls.
   */
  name: string;

  /**
   * Full model identifier
   *
   * Includes version/tag information.
   */
  model: string;

  /**
   * Last modified timestamp (ISO 8601)
   */
  modified_at: string;

  /**
   * Model size in bytes
   */
  size: number;

  /**
   * Model digest
   *
   * SHA256 hash for verification.
   */
  digest: string;

  /**
   * Model details
   */
  details: ModelDetails;
}

/**
 * Model list response
 */
export interface ModelList {
  /**
   * Available models
   */
  models: ModelSummary[];
}

/**
 * Model information
 *
 * Detailed information about a specific model.
 */
export interface ModelInfo {
  /**
   * Model license
   */
  license?: string;

  /**
   * Modelfile contents
   *
   * Configuration file used to create this model.
   */
  modelfile: string;

  /**
   * Model parameters
   *
   * Serialized model parameter configuration.
   */
  parameters: string;

  /**
   * Prompt template
   *
   * Template used for formatting prompts.
   */
  template: string;

  /**
   * System prompt
   *
   * Default system message for this model.
   */
  system?: string;

  /**
   * Model details
   */
  details: ModelDetails;
}

/**
 * Running model
 *
 * Information about a currently loaded model.
 */
export interface RunningModel {
  /**
   * Model name
   */
  name: string;

  /**
   * Full model identifier
   */
  model: string;

  /**
   * Total memory usage in bytes
   */
  size: number;

  /**
   * Model digest
   */
  digest: string;

  /**
   * Model details
   */
  details: ModelDetails;

  /**
   * Expiration timestamp (ISO 8601)
   *
   * When the model will be unloaded from memory.
   */
  expires_at: string;

  /**
   * VRAM usage in bytes
   *
   * Amount of GPU memory used.
   */
  size_vram: number;
}

/**
 * Running models list response
 */
export interface RunningModelList {
  /**
   * Currently loaded models
   */
  models: RunningModel[];
}
