/**
 * Chat completion types.
 */

import type { FinishReason, ResponseFormat, Role, SafePrompt, Usage } from './common';
import type { Tool, ToolCall, ToolChoice } from './tools';

/**
 * Chat completion request.
 */
export interface ChatCompletionRequest {
  /** Model ID to use. */
  model: string;
  /** Messages in the conversation. */
  messages: Message[];
  /** Sampling temperature (0.0 to 1.0). */
  temperature?: number;
  /** Top-p (nucleus) sampling. */
  top_p?: number;
  /** Maximum tokens to generate. */
  max_tokens?: number;
  /** Minimum tokens to generate. */
  min_tokens?: number;
  /** Whether to stream the response. */
  stream?: boolean;
  /** Stop sequences. */
  stop?: string[];
  /** Random seed for reproducibility. */
  random_seed?: number;
  /** Response format. */
  response_format?: ResponseFormat;
  /** Available tools. */
  tools?: Tool[];
  /** Tool choice. */
  tool_choice?: ToolChoice;
  /** Safe prompt setting. */
  safe_prompt?: SafePrompt;
  /** Presence penalty. */
  presence_penalty?: number;
  /** Frequency penalty. */
  frequency_penalty?: number;
  /** Number of completions to generate. */
  n?: number;
}

/**
 * A message in the conversation.
 */
export type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

/**
 * System message.
 */
export interface SystemMessage {
  role: 'system';
  content: string;
}

/**
 * User message.
 */
export interface UserMessage {
  role: 'user';
  content: MessageContent;
}

/**
 * Assistant message.
 */
export interface AssistantMessage {
  role: 'assistant';
  content?: string;
  tool_calls?: ToolCall[];
  prefix?: boolean;
}

/**
 * Tool message.
 */
export interface ToolMessage {
  role: 'tool';
  tool_call_id: string;
  content: string;
  name?: string;
}

/**
 * Message content (text or multimodal).
 */
export type MessageContent = string | ContentPart[];

/**
 * A part of multimodal content.
 */
export type ContentPart = TextContentPart | ImageContentPart;

/**
 * Text content part.
 */
export interface TextContentPart {
  type: 'text';
  text: string;
}

/**
 * Image content part.
 */
export interface ImageContentPart {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: string;
  };
}

/**
 * Chat completion response.
 */
export interface ChatCompletionResponse {
  /** Response ID. */
  id: string;
  /** Object type. */
  object: string;
  /** Model used. */
  model: string;
  /** Creation timestamp. */
  created: number;
  /** Completion choices. */
  choices: ChatChoice[];
  /** Token usage. */
  usage: Usage;
}

/**
 * A completion choice.
 */
export interface ChatChoice {
  /** Choice index. */
  index: number;
  /** The assistant's message. */
  message: AssistantMessage;
  /** Reason for stopping. */
  finish_reason: FinishReason | null;
}

/**
 * Streaming chunk for chat completions.
 */
export interface ChatCompletionChunk {
  /** Chunk ID. */
  id: string;
  /** Object type. */
  object: string;
  /** Model used. */
  model: string;
  /** Creation timestamp. */
  created: number;
  /** Streaming choices. */
  choices: StreamChoice[];
  /** Usage (only in final chunk). */
  usage?: Usage;
}

/**
 * A streaming choice.
 */
export interface StreamChoice {
  /** Choice index. */
  index: number;
  /** Content delta. */
  delta: ContentDelta;
  /** Finish reason (in final chunk). */
  finish_reason: FinishReason | null;
}

/**
 * Content delta in streaming.
 */
export interface ContentDelta {
  /** Role (in first chunk). */
  role?: Role;
  /** Content text. */
  content?: string;
  /** Tool calls. */
  tool_calls?: ToolCall[];
}

// Message factory functions

/**
 * Creates a system message.
 */
export function systemMessage(content: string): SystemMessage {
  return { role: 'system', content };
}

/**
 * Creates a user message.
 */
export function userMessage(content: MessageContent): UserMessage {
  return { role: 'user', content };
}

/**
 * Creates an assistant message.
 */
export function assistantMessage(content: string): AssistantMessage {
  return { role: 'assistant', content };
}

/**
 * Creates a tool message.
 */
export function toolMessage(toolCallId: string, content: string, name?: string): ToolMessage {
  return { role: 'tool', tool_call_id: toolCallId, content, name };
}

/**
 * Builder for chat completion requests.
 */
export class ChatCompletionRequestBuilder {
  private request: Partial<ChatCompletionRequest> = {};

  model(model: string): this {
    this.request.model = model;
    return this;
  }

  messages(messages: Message[]): this {
    this.request.messages = messages;
    return this;
  }

  message(message: Message): this {
    this.request.messages = [...(this.request.messages ?? []), message];
    return this;
  }

  temperature(temp: number): this {
    this.request.temperature = temp;
    return this;
  }

  topP(topP: number): this {
    this.request.top_p = topP;
    return this;
  }

  maxTokens(max: number): this {
    this.request.max_tokens = max;
    return this;
  }

  minTokens(min: number): this {
    this.request.min_tokens = min;
    return this;
  }

  stream(stream = true): this {
    this.request.stream = stream;
    return this;
  }

  stop(sequences: string[]): this {
    this.request.stop = sequences;
    return this;
  }

  randomSeed(seed: number): this {
    this.request.random_seed = seed;
    return this;
  }

  responseFormat(format: ResponseFormat): this {
    this.request.response_format = format;
    return this;
  }

  tools(tools: Tool[]): this {
    this.request.tools = tools;
    return this;
  }

  toolChoice(choice: ToolChoice): this {
    this.request.tool_choice = choice;
    return this;
  }

  safePrompt(safe: boolean): this {
    this.request.safe_prompt = safe ? 'on' : 'off';
    return this;
  }

  presencePenalty(penalty: number): this {
    this.request.presence_penalty = penalty;
    return this;
  }

  frequencyPenalty(penalty: number): this {
    this.request.frequency_penalty = penalty;
    return this;
  }

  n(count: number): this {
    this.request.n = count;
    return this;
  }

  build(): ChatCompletionRequest {
    if (!this.request.model) {
      this.request.model = 'mistral-large-latest';
    }
    if (!this.request.messages) {
      this.request.messages = [];
    }
    return this.request as ChatCompletionRequest;
  }
}

/**
 * Creates a chat completion request builder.
 */
export function chatCompletion(): ChatCompletionRequestBuilder {
  return new ChatCompletionRequestBuilder();
}
