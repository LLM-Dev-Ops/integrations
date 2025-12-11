/**
 * Agent types for Mistral API.
 */

import type { FinishReason, Usage } from './common';
import type { AssistantMessage, Message } from './chat';
import type { Tool, ToolCall, ToolChoice } from './tools';

/**
 * Agent completion request.
 */
export interface AgentCompletionRequest {
  /** Agent ID to use. */
  agent_id: string;
  /** Messages in the conversation. */
  messages: Message[];
  /** Maximum tokens to generate. */
  max_tokens?: number;
  /** Minimum tokens to generate. */
  min_tokens?: number;
  /** Whether to stream the response. */
  stream?: boolean;
  /** Stop sequences. */
  stop?: string[];
  /** Random seed. */
  random_seed?: number;
  /** Additional tools. */
  tools?: Tool[];
  /** Tool choice. */
  tool_choice?: ToolChoice;
}

/**
 * Agent completion response.
 */
export interface AgentCompletionResponse {
  /** Response ID. */
  id: string;
  /** Object type. */
  object: string;
  /** Agent ID. */
  agent_id: string;
  /** Creation timestamp. */
  created: number;
  /** Completion choices. */
  choices: AgentChoice[];
  /** Token usage. */
  usage: Usage;
}

/**
 * An agent completion choice.
 */
export interface AgentChoice {
  /** Choice index. */
  index: number;
  /** The assistant's message. */
  message: AssistantMessage;
  /** Reason for stopping. */
  finish_reason: FinishReason | null;
}

/**
 * Streaming chunk for agent completions.
 */
export interface AgentCompletionChunk {
  /** Chunk ID. */
  id: string;
  /** Object type. */
  object: string;
  /** Agent ID. */
  agent_id: string;
  /** Creation timestamp. */
  created: number;
  /** Streaming choices. */
  choices: AgentStreamChoice[];
  /** Usage (only in final chunk). */
  usage?: Usage;
}

/**
 * A streaming agent choice.
 */
export interface AgentStreamChoice {
  /** Choice index. */
  index: number;
  /** Content delta. */
  delta: AgentDelta;
  /** Finish reason (in final chunk). */
  finish_reason: FinishReason | null;
}

/**
 * Content delta in agent streaming.
 */
export interface AgentDelta {
  /** Content text. */
  content?: string;
  /** Tool calls. */
  tool_calls?: ToolCall[];
}

/**
 * Builder for agent completion requests.
 */
export class AgentCompletionRequestBuilder {
  private request: Partial<AgentCompletionRequest> = {};

  agentId(id: string): this {
    this.request.agent_id = id;
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

  tools(tools: Tool[]): this {
    this.request.tools = tools;
    return this;
  }

  toolChoice(choice: ToolChoice): this {
    this.request.tool_choice = choice;
    return this;
  }

  build(): AgentCompletionRequest {
    if (!this.request.agent_id) {
      throw new Error('Agent ID is required');
    }
    if (!this.request.messages) {
      this.request.messages = [];
    }
    return this.request as AgentCompletionRequest;
  }
}

/**
 * Creates an agent completion request builder.
 */
export function agentCompletion(): AgentCompletionRequestBuilder {
  return new AgentCompletionRequestBuilder();
}
