/**
 * Chat Response Types
 *
 * @module services/chat/response
 */

import type { ChatChoice } from '../../types/message.js';
import type { Usage } from '../../types/usage.js';

/**
 * Chat completion response.
 */
export interface GrokChatResponse {
  /** Response ID */
  readonly id: string;

  /** Object type */
  readonly object: 'chat.completion';

  /** Creation timestamp */
  readonly created: number;

  /** Model used */
  readonly model: string;

  /** Completion choices */
  readonly choices: ChatChoice[];

  /** Token usage */
  readonly usage: Usage;

  /** System fingerprint */
  readonly system_fingerprint?: string;
}

/**
 * Extract content from response.
 *
 * @param response - Chat response
 * @returns Content string or null
 */
export function extractContent(response: GrokChatResponse): string | null {
  if (response.choices.length === 0) {
    return null;
  }
  const message = response.choices[0].message;
  if (typeof message.content === 'string') {
    return message.content;
  }
  return null;
}

/**
 * Extract reasoning content from response.
 *
 * @param response - Chat response
 * @returns Reasoning content or null
 */
export function extractReasoning(response: GrokChatResponse): string | null {
  if (response.choices.length === 0) {
    return null;
  }
  return response.choices[0].message.reasoning_content ?? null;
}

/**
 * Check if response has tool calls.
 *
 * @param response - Chat response
 * @returns True if response contains tool calls
 */
export function hasToolCalls(response: GrokChatResponse): boolean {
  if (response.choices.length === 0) {
    return false;
  }
  const toolCalls = response.choices[0].message.tool_calls;
  return toolCalls !== undefined && toolCalls.length > 0;
}
