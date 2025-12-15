/**
 * Grok Model Types
 *
 * Defines all supported Grok model variants and their identifiers.
 *
 * @module models/types
 */

/**
 * Grok model identifiers as specified by xAI API.
 */
export type GrokModel =
  | 'grok-4'
  | 'grok-4.1'
  | 'grok-3-beta'
  | 'grok-3-mini-beta'
  | 'grok-vision-beta'
  | 'grok-2-image-1212'
  | 'grok-2-1212';

/**
 * Model capability flags.
 */
export interface GrokCapabilities {
  /** Maximum context window in tokens */
  readonly contextWindow: number;

  /** Whether the model supports vision/image inputs */
  readonly supportsVision: boolean;

  /** Whether the model supports reasoning content (Grok-3) */
  readonly supportsReasoning: boolean;

  /** Whether the model supports Live Search tool */
  readonly supportsLiveSearch: boolean;

  /** Whether the model supports function calling/tools */
  readonly supportsTools: boolean;

  /** Whether the model supports streaming responses */
  readonly supportsStreaming: boolean;

  /** Whether the model supports embeddings generation */
  readonly supportsEmbeddings: boolean;

  /** Whether the model supports image generation */
  readonly supportsImageGeneration: boolean;
}

/**
 * Model information with metadata.
 */
export interface ModelInfo {
  /** Model identifier */
  readonly id: GrokModel;

  /** Display name */
  readonly displayName: string;

  /** Model capabilities */
  readonly capabilities: GrokCapabilities;

  /** Aliases for model resolution */
  readonly aliases: readonly string[];

  /** Pricing per million tokens (input) */
  readonly inputPricePerMillion: number;

  /** Pricing per million tokens (output) */
  readonly outputPricePerMillion: number;

  /** Whether the model is deprecated */
  readonly deprecated: boolean;
}

/**
 * Token usage information from API response.
 */
export interface TokenUsage {
  /** Number of tokens in the prompt */
  readonly promptTokens: number;

  /** Number of tokens in the completion */
  readonly completionTokens: number;

  /** Total tokens used */
  readonly totalTokens: number;

  /** Reasoning tokens (Grok-3 models only) */
  readonly reasoningTokens?: number;
}

/**
 * Reasoning content from Grok-3 models.
 */
export interface ReasoningContent {
  /** The reasoning/thinking content */
  readonly content: string;

  /** Number of tokens used for reasoning */
  readonly tokens?: number;
}
