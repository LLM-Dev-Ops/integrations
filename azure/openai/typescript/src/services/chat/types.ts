/**
 * Chat Completion Types
 *
 * Type definitions for Azure OpenAI chat completions API.
 */

import type { ContentFilterResults, PromptFilterResult, TokenUsage } from '../../types/index.js';

/** Chat message roles */
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool' | 'function';

/** Chat message */
export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  name?: string;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
}

/** Tool call in message */
export interface ChatToolCall {
  id: string;
  type: 'function';
  function: ChatFunctionCall;
}

/** Function call details */
export interface ChatFunctionCall {
  name: string;
  arguments: string;
}

/** Tool definition */
export interface ChatTool {
  type: 'function';
  function: ChatFunctionDefinition;
}

/** Function definition */
export interface ChatFunctionDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

/** Response format */
export type ResponseFormat = { type: 'text' } | { type: 'json_object' };

/** Chat completion request */
export interface ChatCompletionRequest {
  /** Deployment ID (Azure-specific, replaces model) */
  deploymentId: string;
  /** Messages in the conversation */
  messages: ChatMessage[];
  /** Sampling temperature (0-2) */
  temperature?: number;
  /** Nucleus sampling parameter */
  top_p?: number;
  /** Number of completions to generate */
  n?: number;
  /** Enable streaming */
  stream?: boolean;
  /** Stop sequences */
  stop?: string | string[];
  /** Maximum tokens to generate */
  max_tokens?: number;
  /** Presence penalty (-2 to 2) */
  presence_penalty?: number;
  /** Frequency penalty (-2 to 2) */
  frequency_penalty?: number;
  /** Logit bias for token selection */
  logit_bias?: Record<string, number>;
  /** End user identifier */
  user?: string;
  /** Tools available to the model */
  tools?: ChatTool[];
  /** Tool choice strategy */
  tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
  /** Response format */
  response_format?: ResponseFormat;
  /** Random seed for reproducibility */
  seed?: number;
  /** Azure-specific: data sources for Azure OpenAI on Your Data */
  data_sources?: AzureDataSource[];
}

/** Azure data source configuration (On Your Data feature) */
export interface AzureDataSource {
  type: string;
  parameters: Record<string, unknown>;
}

/** Chat completion response */
export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatChoice[];
  usage?: ChatUsage;
  system_fingerprint?: string;
  /** Azure-specific: prompt filter results */
  prompt_filter_results?: PromptFilterResult[];
}

/** Chat response choice */
export interface ChatChoice {
  index: number;
  message: ChatMessage;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  logprobs?: unknown;
  /** Azure-specific: content filter results */
  content_filter_results?: ContentFilterResults;
}

/** Token usage */
export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** Streaming chunk */
export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: ChatChunkChoice[];
  system_fingerprint?: string;
  /** Azure-specific: prompt filter results (first chunk only) */
  prompt_filter_results?: PromptFilterResult[];
  /** Usage info (final chunk only with stream_options) */
  usage?: ChatUsage | null;
}

/** Streaming choice */
export interface ChatChunkChoice {
  index: number;
  delta: ChatDelta;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  /** Azure-specific: content filter results */
  content_filter_results?: ContentFilterResults;
}

/** Streaming delta */
export interface ChatDelta {
  role?: ChatRole;
  content?: string;
  tool_calls?: ChatToolCallDelta[];
}

/** Streaming tool call delta */
export interface ChatToolCallDelta {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

/**
 * Normalizes token usage to common format
 */
export function toTokenUsage(usage: ChatUsage | undefined): TokenUsage | undefined {
  if (!usage) return undefined;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

/**
 * Helper to create a user message
 */
export function createUserMessage(content: string): ChatMessage {
  return { role: 'user', content };
}

/**
 * Helper to create a system message
 */
export function createSystemMessage(content: string): ChatMessage {
  return { role: 'system', content };
}

/**
 * Helper to create an assistant message
 */
export function createAssistantMessage(content: string): ChatMessage {
  return { role: 'assistant', content };
}
