export type ChatRole = 'system' | 'user' | 'assistant' | 'tool' | 'function';

export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  name?: string;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
}

export interface ChatToolCall {
  id: string;
  type: 'function';
  function: ChatFunctionCall;
}

export interface ChatFunctionCall {
  name: string;
  arguments: string;
}

export interface ChatTool {
  type: 'function';
  function: ChatFunctionDefinition;
}

export interface ChatFunctionDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export type ResponseFormat = { type: 'text' } | { type: 'json_object' };

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
  tools?: ChatTool[];
  tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
  response_format?: ResponseFormat;
  seed?: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatChoice[];
  usage?: ChatUsage;
  system_fingerprint?: string;
}

export interface ChatChoice {
  index: number;
  message: ChatMessage;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  logprobs?: unknown;
}

export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// Streaming types
export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: ChatChunkChoice[];
  system_fingerprint?: string;
}

export interface ChatChunkChoice {
  index: number;
  delta: ChatDelta;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

export interface ChatDelta {
  role?: ChatRole;
  content?: string;
  tool_calls?: ChatToolCallDelta[];
}

export interface ChatToolCallDelta {
  index: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
}

// Helper functions
export function createUserMessage(content: string): ChatMessage {
  return { role: 'user', content };
}

export function createSystemMessage(content: string): ChatMessage {
  return { role: 'system', content };
}

export function createAssistantMessage(content: string): ChatMessage {
  return { role: 'assistant', content };
}
