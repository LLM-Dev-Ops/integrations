/**
 * Chat completion types for the Groq API.
 */

import { ToolCall, ToolCallDelta, Tool, ToolChoice } from './tools';

/**
 * Message roles.
 */
export type Role = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Image detail level.
 */
export type ImageDetail = 'auto' | 'low' | 'high';

/**
 * Image URL in a content part.
 */
export interface ImageUrl {
  /** URL of the image (can be data URL). */
  url: string;
  /** Detail level for image processing. */
  detail?: ImageDetail;
}

/**
 * Content part types.
 */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: ImageUrl };

/**
 * Message content (string or array of parts).
 */
export type Content = string | ContentPart[];

/**
 * Chat message.
 */
export interface Message {
  /** Message role. */
  role: Role;
  /** Message content. */
  content?: Content;
  /** Name of the message author. */
  name?: string;
  /** Tool calls made by the assistant. */
  tool_calls?: ToolCall[];
  /** Tool call ID (for tool role). */
  tool_call_id?: string;
}

/**
 * Assistant message with possible tool calls.
 */
export interface AssistantMessage {
  /** Role is always 'assistant'. */
  role: 'assistant';
  /** Message content. */
  content: string | null;
  /** Tool calls made by the assistant. */
  tool_calls?: ToolCall[];
}

/**
 * Response format type.
 */
export type ResponseFormatType = 'text' | 'json_object';

/**
 * Response format specification.
 */
export interface ResponseFormat {
  /** Format type. */
  type: ResponseFormatType;
}

/**
 * Stream options.
 */
export interface StreamOptions {
  /** Include token usage in stream. */
  include_usage?: boolean;
}

/**
 * Chat completion request.
 */
export interface ChatRequest {
  /** Model ID to use. */
  model: string;
  /** Messages to send. */
  messages: Message[];
  /** Maximum tokens to generate. */
  max_tokens?: number;
  /** Temperature for sampling (0-2). */
  temperature?: number;
  /** Top-p sampling parameter. */
  top_p?: number;
  /** Number of completions to generate. */
  n?: number;
  /** Stop sequences. */
  stop?: string | string[];
  /** Whether to stream the response. */
  stream?: boolean;
  /** Stream options. */
  stream_options?: StreamOptions;
  /** Presence penalty (-2 to 2). */
  presence_penalty?: number;
  /** Frequency penalty (-2 to 2). */
  frequency_penalty?: number;
  /** Seed for reproducibility. */
  seed?: number;
  /** User identifier. */
  user?: string;
  /** Response format. */
  response_format?: ResponseFormat;
  /** Tools available for the model. */
  tools?: Tool[];
  /** Tool choice strategy. */
  tool_choice?: ToolChoice;
  /** Whether to parallelize tool calls. */
  parallel_tool_calls?: boolean;
}

/**
 * Finish reason for a completion.
 */
export type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;

/**
 * Token usage in a response.
 */
export interface Usage {
  /** Prompt tokens used. */
  prompt_tokens: number;
  /** Completion tokens used. */
  completion_tokens: number;
  /** Total tokens used. */
  total_tokens: number;
  /** Time to first token in seconds. */
  prompt_time?: number;
  /** Completion generation time in seconds. */
  completion_time?: number;
  /** Total processing time in seconds. */
  total_time?: number;
  /** Queue time in seconds. */
  queue_time?: number;
}

/**
 * Choice in a chat completion response.
 */
export interface Choice {
  /** Index of this choice. */
  index: number;
  /** The generated message. */
  message: AssistantMessage;
  /** Reason for finishing. */
  finish_reason: FinishReason;
  /** Log probabilities (if requested). */
  logprobs?: unknown;
}

/**
 * Chat completion response.
 */
export interface ChatResponse {
  /** Unique ID for this completion. */
  id: string;
  /** Object type (always 'chat.completion'). */
  object: 'chat.completion';
  /** Unix timestamp of creation. */
  created: number;
  /** Model used. */
  model: string;
  /** System fingerprint. */
  system_fingerprint?: string;
  /** Generated choices. */
  choices: Choice[];
  /** Token usage. */
  usage?: Usage;
  /** Groq-specific headers. */
  x_groq?: {
    id?: string;
  };
}

/**
 * Delta in a streaming chunk.
 */
export interface Delta {
  /** Role (only in first chunk). */
  role?: Role;
  /** Content fragment. */
  content?: string | null;
  /** Tool call deltas. */
  tool_calls?: ToolCallDelta[];
}

/**
 * Choice in a streaming chunk.
 */
export interface ChunkChoice {
  /** Index of this choice. */
  index: number;
  /** Delta content. */
  delta: Delta;
  /** Reason for finishing (only in final chunk). */
  finish_reason: FinishReason;
  /** Log probabilities (if requested). */
  logprobs?: unknown;
}

/**
 * Streaming chat completion chunk.
 */
export interface ChatChunk {
  /** Unique ID for this completion. */
  id: string;
  /** Object type (always 'chat.completion.chunk'). */
  object: 'chat.completion.chunk';
  /** Unix timestamp of creation. */
  created: number;
  /** Model used. */
  model: string;
  /** System fingerprint. */
  system_fingerprint?: string;
  /** Chunk choices. */
  choices: ChunkChoice[];
  /** Token usage (if include_usage is set). */
  usage?: Usage;
  /** Groq-specific headers. */
  x_groq?: {
    id?: string;
    usage?: Usage;
  };
}

/**
 * Creates a system message.
 */
export function systemMessage(content: string): Message {
  return { role: 'system', content };
}

/**
 * Creates a user message.
 */
export function userMessage(content: Content): Message {
  return { role: 'user', content };
}

/**
 * Creates an assistant message.
 */
export function assistantMessage(content: string, toolCalls?: ToolCall[]): Message {
  const msg: Message = { role: 'assistant', content };
  if (toolCalls && toolCalls.length > 0) {
    msg.tool_calls = toolCalls;
  }
  return msg;
}

/**
 * Creates a tool result message.
 */
export function toolMessage(toolCallId: string, content: string): Message {
  return { role: 'tool', tool_call_id: toolCallId, content };
}
