/**
 * Chat Request Types
 *
 * @module services/chat/request
 */

import type { GrokModel } from '../../models/types.js';
import type { ChatMessage } from '../../types/message.js';
import type { Tool, ToolChoice, ResponseFormat } from '../../types/tool.js';

/**
 * Chat completion request.
 */
export interface GrokChatRequest {
  /** Model to use */
  readonly model: GrokModel;

  /** Messages in the conversation */
  readonly messages: ChatMessage[];

  /** Temperature (0-2) */
  readonly temperature?: number;

  /** Top-p sampling (0-1) */
  readonly top_p?: number;

  /** Maximum tokens to generate */
  readonly max_tokens?: number;

  /** Number of completions to generate */
  readonly n?: number;

  /** Stop sequences */
  readonly stop?: string | string[];

  /** Frequency penalty (-2 to 2) */
  readonly frequency_penalty?: number;

  /** Presence penalty (-2 to 2) */
  readonly presence_penalty?: number;

  /** Response format */
  readonly response_format?: ResponseFormat;

  /** Seed for deterministic sampling */
  readonly seed?: number;

  /** Tools available for the model */
  readonly tools?: Tool[];

  /** Tool choice behavior */
  readonly tool_choice?: ToolChoice;

  /** Whether to parallelize tool calls */
  readonly parallel_tool_calls?: boolean;

  /** User identifier for abuse detection */
  readonly user?: string;

  /** Whether to stream the response */
  readonly stream?: boolean;

  /** Stream options */
  readonly stream_options?: {
    /** Include usage in stream */
    readonly include_usage?: boolean;
  };

  /** Log probabilities */
  readonly logprobs?: boolean;

  /** Top log probs */
  readonly top_logprobs?: number;
}

/**
 * Default values for chat request.
 */
export const DEFAULT_CHAT_REQUEST: Partial<GrokChatRequest> = {
  temperature: 1,
  top_p: 1,
  n: 1,
  frequency_penalty: 0,
  presence_penalty: 0,
};

/**
 * Build chat request body for API.
 *
 * @param request - Chat request
 * @returns Request body object
 */
export function buildChatRequestBody(
  request: GrokChatRequest
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    messages: request.messages,
  };

  // Optional parameters
  if (request.temperature !== undefined) {
    body.temperature = request.temperature;
  }
  if (request.top_p !== undefined) {
    body.top_p = request.top_p;
  }
  if (request.max_tokens !== undefined) {
    body.max_tokens = request.max_tokens;
  }
  if (request.n !== undefined) {
    body.n = request.n;
  }
  if (request.stop !== undefined) {
    body.stop = request.stop;
  }
  if (request.frequency_penalty !== undefined) {
    body.frequency_penalty = request.frequency_penalty;
  }
  if (request.presence_penalty !== undefined) {
    body.presence_penalty = request.presence_penalty;
  }
  if (request.response_format !== undefined) {
    body.response_format = request.response_format;
  }
  if (request.seed !== undefined) {
    body.seed = request.seed;
  }
  if (request.tools !== undefined) {
    body.tools = request.tools;
  }
  if (request.tool_choice !== undefined) {
    body.tool_choice = request.tool_choice;
  }
  if (request.parallel_tool_calls !== undefined) {
    body.parallel_tool_calls = request.parallel_tool_calls;
  }
  if (request.user !== undefined) {
    body.user = request.user;
  }
  if (request.stream !== undefined) {
    body.stream = request.stream;
  }
  if (request.stream_options !== undefined) {
    body.stream_options = request.stream_options;
  }
  if (request.logprobs !== undefined) {
    body.logprobs = request.logprobs;
  }
  if (request.top_logprobs !== undefined) {
    body.top_logprobs = request.top_logprobs;
  }

  return body;
}
