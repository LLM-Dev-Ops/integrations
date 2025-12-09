/**
 * Token usage information for API requests
 */
export interface Usage {
  /**
   * Number of input tokens consumed
   */
  input_tokens: number;

  /**
   * Number of output tokens generated
   */
  output_tokens: number;

  /**
   * Number of tokens read from cache (prompt caching)
   */
  cache_creation_input_tokens?: number;

  /**
   * Number of tokens written to cache (prompt caching)
   */
  cache_read_input_tokens?: number;
}

/**
 * Reasons why the model stopped generating
 */
export type StopReason =
  | 'end_turn'           // Natural end of turn
  | 'max_tokens'         // Maximum token limit reached
  | 'stop_sequence'      // Custom stop sequence encountered
  | 'tool_use';          // Model wants to use a tool

/**
 * Role in a conversation
 */
export type Role = 'user' | 'assistant';

/**
 * Content block types
 */
export type ContentBlockType = 'text' | 'image' | 'tool_use' | 'tool_result';

/**
 * Base interface for content blocks
 */
export interface ContentBlock {
  type: ContentBlockType;
}

/**
 * Text content block
 */
export interface TextBlock extends ContentBlock {
  type: 'text';
  text: string;
}

/**
 * Image source for image content blocks
 */
export interface ImageSource {
  type: 'base64' | 'url';
  media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  data: string;
}

/**
 * Image content block
 */
export interface ImageBlock extends ContentBlock {
  type: 'image';
  source: ImageSource;
}

/**
 * Tool use content block
 */
export interface ToolUseBlock extends ContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Tool result content block
 */
export interface ToolResultBlock extends ContentBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<TextBlock | ImageBlock>;
  is_error?: boolean;
}

/**
 * Union type for all content blocks
 */
export type ContentBlockUnion = TextBlock | ImageBlock | ToolUseBlock | ToolResultBlock;

/**
 * Message content - can be a string or array of content blocks
 */
export type MessageContent = string | ContentBlockUnion[];

/**
 * Message in a conversation
 */
export interface Message {
  role: Role;
  content: MessageContent;
}

/**
 * Tool definition
 */
export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * Metadata for messages
 */
export interface Metadata {
  user_id?: string;
  [key: string]: unknown;
}

/**
 * Options that can be passed to API requests
 */
export interface RequestOptions {
  /**
   * Request timeout in milliseconds
   */
  timeout?: number;

  /**
   * Additional headers to include in the request
   */
  headers?: Record<string, string>;

  /**
   * Signal for request cancellation
   */
  signal?: AbortSignal;

  /**
   * Maximum number of retry attempts
   */
  maxRetries?: number;
}

/**
 * Model identifiers
 */
export type ModelId =
  | 'claude-3-5-sonnet-20241022'
  | 'claude-3-5-sonnet-20240620'
  | 'claude-3-5-haiku-20241022'
  | 'claude-3-opus-20240229'
  | 'claude-3-sonnet-20240229'
  | 'claude-3-haiku-20240307'
  | 'claude-2.1'
  | 'claude-2.0'
  | 'claude-instant-1.2'
  | string; // Allow custom model IDs

/**
 * Information about an available model
 */
export interface ModelInfo {
  id: ModelId;
  display_name: string;
  created_at: string;
  type: 'model';
}

/**
 * Streaming event types
 */
export type StreamEventType =
  | 'message_start'
  | 'content_block_start'
  | 'content_block_delta'
  | 'content_block_stop'
  | 'message_delta'
  | 'message_stop'
  | 'ping'
  | 'error';

/**
 * Base streaming event
 */
export interface StreamEvent {
  type: StreamEventType;
}

/**
 * Delta types for streaming updates
 */
export interface TextDelta {
  type: 'text_delta';
  text: string;
}

export interface ToolUseDelta {
  type: 'input_json_delta';
  partial_json: string;
}

/**
 * System prompt content
 */
export type SystemPrompt = string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
