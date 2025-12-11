/**
 * Common types shared across the API.
 */

/**
 * Message role.
 */
export type Role = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Token usage information.
 */
export interface Usage {
  /** Number of tokens in the prompt. */
  prompt_tokens: number;
  /** Number of tokens in the completion. */
  completion_tokens: number;
  /** Total number of tokens. */
  total_tokens: number;
}

/**
 * Reason for completion.
 */
export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'model_length' | 'error';

/**
 * Response format specification.
 */
export interface ResponseFormat {
  /** Format type. */
  type: 'text' | 'json_object';
}

/**
 * Safe prompt setting.
 */
export type SafePrompt = 'on' | 'off';

/**
 * Creates a Usage object.
 */
export function createUsage(promptTokens: number, completionTokens: number): Usage {
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}
