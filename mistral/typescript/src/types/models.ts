/**
 * Model types.
 */

/**
 * Model information.
 */
export interface Model {
  /** Model ID. */
  id: string;
  /** Object type. */
  object: string;
  /** Creation timestamp. */
  created: number;
  /** Owner of the model. */
  owned_by: string;
  /** Model capabilities. */
  capabilities: ModelCapabilities;
  /** Model name (display name). */
  name?: string;
  /** Model description. */
  description?: string;
  /** Maximum context length. */
  max_context_length?: number;
  /** Model aliases. */
  aliases?: string[];
  /** Deprecation information. */
  deprecation?: string;
  /** Default model temperature. */
  default_model_temperature?: number;
  /** Model type. */
  type?: string;
}

/**
 * Model capabilities.
 */
export interface ModelCapabilities {
  /** Can generate completions. */
  completion_chat: boolean;
  /** Can generate FIM completions. */
  completion_fim: boolean;
  /** Can be fine-tuned. */
  fine_tuning: boolean;
  /** Can be used for function calling. */
  function_calling: boolean;
  /** Supports vision. */
  vision: boolean;
}

/**
 * Response from listing models.
 */
export interface ModelListResponse {
  /** Object type. */
  object: string;
  /** List of models. */
  data: Model[];
}

/**
 * Model update request.
 */
export interface UpdateModelRequest {
  /** New name for the model. */
  name?: string;
  /** New description for the model. */
  description?: string;
}

/**
 * Model archive response.
 */
export interface ArchiveModelResponse {
  /** Model ID. */
  id: string;
  /** Object type. */
  object: string;
  /** Whether the model was archived. */
  archived: boolean;
}

/**
 * Model unarchive response.
 */
export interface UnarchiveModelResponse {
  /** Model ID. */
  id: string;
  /** Object type. */
  object: string;
  /** Whether the model was unarchived. */
  archived: boolean;
}

/**
 * Model deletion response.
 */
export interface DeleteModelResponse {
  /** Model ID. */
  id: string;
  /** Object type. */
  object: string;
  /** Whether the model was deleted. */
  deleted: boolean;
}
