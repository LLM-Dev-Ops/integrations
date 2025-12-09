// Message types
export interface Message {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ContentBlock[];
  model: string;
  stop_reason: StopReason | null;
  stop_sequence: string | null;
  usage: Usage;
}

// Content blocks
export type ContentBlock =
  | TextBlock
  | ImageBlock
  | ToolUseBlock
  | ToolResultBlock
  | DocumentBlock
  | ThinkingBlock;

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ImageBlock {
  type: 'image';
  source: ImageSource;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

export interface DocumentBlock {
  type: 'document';
  source: DocumentSource;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
}

export interface ImageSource {
  type: 'base64';
  media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  data: string;
}

export interface DocumentSource {
  type: 'base64';
  media_type: 'application/pdf';
  data: string;
}

// Tool definitions
export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  cache_control?: CacheControl;
}

export interface CacheControl {
  type: 'ephemeral';
}

// Request types
export interface CreateMessageRequest {
  model: string;
  max_tokens: number;
  messages: MessageParam[];
  system?: string | SystemBlock[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  tools?: Tool[];
  tool_choice?: ToolChoice;
  metadata?: Metadata;
  stream?: boolean;
  thinking?: ThinkingConfig;
}

export interface MessageParam {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export type SystemBlock = TextBlock & { cache_control?: CacheControl };

export interface ThinkingConfig {
  type: 'enabled' | 'disabled';
  budget_tokens?: number;
}

export type ToolChoice =
  | { type: 'auto' }
  | { type: 'any' }
  | { type: 'tool'; name: string };

export interface Metadata {
  user_id?: string;
}

// Token counting
export interface CountTokensRequest {
  model: string;
  messages: MessageParam[];
  system?: string | SystemBlock[];
  tools?: Tool[];
}

export interface TokenCount {
  input_tokens: number;
}

// Usage
export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export type StopReason = 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';

// Helper functions
export function createUserMessage(content: string | ContentBlock[]): MessageParam {
  return {
    role: 'user',
    content,
  };
}

export function createAssistantMessage(content: string | ContentBlock[]): MessageParam {
  return {
    role: 'assistant',
    content,
  };
}

export function createTextBlock(text: string): TextBlock {
  return {
    type: 'text',
    text,
  };
}

export function createToolUseBlock(id: string, name: string, input: Record<string, unknown>): ToolUseBlock {
  return {
    type: 'tool_use',
    id,
    name,
    input,
  };
}

export function createToolResultBlock(
  tool_use_id: string,
  content: string | ContentBlock[],
  is_error?: boolean
): ToolResultBlock {
  return {
    type: 'tool_result',
    tool_use_id,
    content,
    is_error,
  };
}

export function createImageBlock(
  data: string,
  media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
): ImageBlock {
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type,
      data,
    },
  };
}

export function createDocumentBlock(data: string): DocumentBlock {
  return {
    type: 'document',
    source: {
      type: 'base64',
      media_type: 'application/pdf',
      data,
    },
  };
}
