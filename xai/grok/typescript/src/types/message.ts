/**
 * Message Types
 *
 * @module types/message
 */

/**
 * Message role.
 */
export type Role = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Text content part.
 */
export interface TextContent {
  readonly type: 'text';
  readonly text: string;
}

/**
 * Image URL content part.
 */
export interface ImageUrlContent {
  readonly type: 'image_url';
  readonly image_url: {
    readonly url: string;
    readonly detail?: 'auto' | 'low' | 'high';
  };
}

/**
 * Content part (text or image).
 */
export type ContentPart = TextContent | ImageUrlContent;

/**
 * Message content (string or array of content parts).
 */
export type MessageContent = string | ContentPart[];

/**
 * Tool call in assistant message.
 */
export interface ToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly arguments: string;
  };
}

/**
 * Chat message.
 */
export interface ChatMessage {
  /** Message role */
  readonly role: Role;

  /** Message content */
  readonly content?: MessageContent;

  /** Name of the author (for multi-participant) */
  readonly name?: string;

  /** Tool calls (assistant messages only) */
  readonly tool_calls?: ToolCall[];

  /** Tool call ID (tool messages only) */
  readonly tool_call_id?: string;
}

/**
 * Assistant message with potential reasoning content.
 */
export interface AssistantMessage extends ChatMessage {
  readonly role: 'assistant';

  /** Reasoning content (Grok-3 models) */
  readonly reasoning_content?: string;
}

/**
 * Chat choice in response.
 */
export interface ChatChoice {
  /** Choice index */
  readonly index: number;

  /** Response message */
  readonly message: AssistantMessage;

  /** Finish reason */
  readonly finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;

  /** Log probabilities (if requested) */
  readonly logprobs?: unknown;
}

/**
 * Streaming delta for content.
 */
export interface ChatDelta {
  /** Role (only on first chunk) */
  readonly role?: Role;

  /** Content delta */
  readonly content?: string;

  /** Reasoning content delta (Grok-3) */
  readonly reasoning_content?: string;

  /** Tool calls delta */
  readonly tool_calls?: ToolCall[];
}

/**
 * Streaming choice.
 */
export interface StreamChoice {
  /** Choice index */
  readonly index: number;

  /** Content delta */
  readonly delta: ChatDelta;

  /** Finish reason (only on final chunk) */
  readonly finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;

  /** Log probabilities */
  readonly logprobs?: unknown;
}
