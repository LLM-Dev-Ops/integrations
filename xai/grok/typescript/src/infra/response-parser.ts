/**
 * Response Parser
 *
 * Parses API responses from xAI.
 *
 * @module infra/response-parser
 */

import { parseErrorResponse, networkError } from '../error.js';
import type { Usage } from '../types/usage.js';
import type { ChatChoice } from '../types/message.js';

/**
 * Chat completion response from xAI API.
 */
export interface ChatCompletionResponse {
  readonly id: string;
  readonly object: 'chat.completion';
  readonly created: number;
  readonly model: string;
  readonly choices: ChatChoice[];
  readonly usage: Usage;
  readonly system_fingerprint?: string;
}

/**
 * Parse JSON response.
 *
 * @param response - Fetch response
 * @returns Parsed JSON
 * @throws {GrokError} If response is an error
 */
export async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => undefined);
    }
    throw parseErrorResponse(response.status, body, response.headers);
  }

  try {
    return await response.json() as T;
  } catch (error) {
    throw networkError(
      'Failed to parse JSON response',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Extract usage from response.
 *
 * @param response - Chat completion response
 * @returns Usage information
 */
export function extractUsage(response: ChatCompletionResponse): Usage {
  return response.usage;
}

/**
 * Extract reasoning content from response.
 *
 * @param response - Chat completion response
 * @returns Reasoning content or undefined
 */
export function extractReasoningContent(
  response: ChatCompletionResponse
): string | undefined {
  if (response.choices.length === 0) {
    return undefined;
  }
  return response.choices[0].message.reasoning_content;
}
