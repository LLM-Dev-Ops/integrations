/**
 * Usage Types
 *
 * @module types/usage
 */

/**
 * Token usage from API response.
 */
export interface Usage {
  /** Prompt tokens */
  readonly prompt_tokens: number;

  /** Completion tokens */
  readonly completion_tokens: number;

  /** Total tokens */
  readonly total_tokens: number;

  /** Reasoning tokens (Grok-3 models) */
  readonly reasoning_tokens?: number;
}

/**
 * Prompt token details.
 */
export interface PromptTokensDetails {
  /** Cached tokens */
  readonly cached_tokens?: number;
}

/**
 * Completion token details.
 */
export interface CompletionTokensDetails {
  /** Reasoning tokens */
  readonly reasoning_tokens?: number;
}

/**
 * Extended usage with details.
 */
export interface ExtendedUsage extends Usage {
  readonly prompt_tokens_details?: PromptTokensDetails;
  readonly completion_tokens_details?: CompletionTokensDetails;
}
