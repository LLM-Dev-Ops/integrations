/**
 * Platform Model Adapter
 *
 * Adapts Azure OpenAI to the platform's unified model interface.
 */

import type { AzureOpenAIClient } from '../client/index.js';
import type { DeploymentRegistry } from '../deployment/index.js';
import type { ModelCapability, TokenUsage } from '../types/index.js';
import type { ChatCompletionRequest, ChatCompletionResponse } from '../services/chat/index.js';
import type { EmbeddingRequest, EmbeddingResponse } from '../services/embedding/index.js';
import { toTokenUsage as chatToTokenUsage } from '../services/chat/index.js';
import { toTokenUsage as embeddingToTokenUsage, normalizeEmbeddings } from '../services/embedding/index.js';

/** Unified model request */
export interface UnifiedModelRequest {
  /** Model hint for routing */
  modelHint: string;
  /** Operation type */
  operation: 'chat' | 'embedding';
  /** Chat-specific parameters */
  chat?: {
    messages: ChatCompletionRequest['messages'];
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    tools?: ChatCompletionRequest['tools'];
    toolChoice?: ChatCompletionRequest['tool_choice'];
  };
  /** Embedding-specific parameters */
  embedding?: {
    input: string | string[];
    dimensions?: number;
  };
  /** Additional options */
  options?: {
    timeout?: number;
    user?: string;
  };
}

/** Unified model response */
export interface UnifiedModelResponse {
  /** Provider identifier */
  provider: 'azure-openai';
  /** Model used */
  model: string;
  /** Response content */
  content?: string;
  /** Tool calls if any */
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  /** Embeddings if embedding operation */
  embeddings?: number[][];
  /** Token usage */
  usage?: TokenUsage;
  /** Finish reason */
  finishReason?: string;
  /** Raw response for advanced use */
  raw: unknown;
}

/** Model adapter interface */
export interface ModelAdapter {
  providerId: string;
  supportedCapabilities(): ModelCapability[];
  invoke(request: UnifiedModelRequest): Promise<UnifiedModelResponse>;
  invokeStream?(request: UnifiedModelRequest): AsyncIterable<UnifiedModelResponse>;
}

/**
 * Azure OpenAI model adapter implementation
 */
export class AzureOpenAIAdapter implements ModelAdapter {
  public readonly providerId = 'azure-openai';
  private readonly client: AzureOpenAIClient;
  private readonly deploymentRegistry: DeploymentRegistry;

  constructor(client: AzureOpenAIClient) {
    this.client = client;
    this.deploymentRegistry = client.deployments;
  }

  supportedCapabilities(): ModelCapability[] {
    const capabilities = new Set<ModelCapability>();
    for (const deployment of this.deploymentRegistry.list()) {
      for (const cap of deployment.capabilities) {
        capabilities.add(cap);
      }
    }
    return Array.from(capabilities);
  }

  async invoke(request: UnifiedModelRequest): Promise<UnifiedModelResponse> {
    switch (request.operation) {
      case 'chat':
        return this.invokeChat(request);
      case 'embedding':
        return this.invokeEmbedding(request);
      default:
        throw new Error(`Unsupported operation: ${request.operation}`);
    }
  }

  async *invokeStream(request: UnifiedModelRequest): AsyncIterable<UnifiedModelResponse> {
    if (request.operation !== 'chat') {
      throw new Error('Streaming only supported for chat operations');
    }

    const deployment = this.resolveDeployment(request.modelHint, ['chat', 'streaming']);

    const chatRequest: ChatCompletionRequest = {
      deploymentId: deployment.deploymentId,
      messages: request.chat!.messages,
      temperature: request.chat?.temperature,
      max_tokens: request.chat?.maxTokens,
      tools: request.chat?.tools,
      tool_choice: request.chat?.toolChoice,
      user: request.options?.user,
      stream: true,
    };

    for await (const chunk of this.client.chat.stream(chatRequest)) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      yield {
        provider: 'azure-openai',
        model: chunk.model,
        content: choice.delta.content,
        finishReason: choice.finish_reason ?? undefined,
        raw: chunk,
      };
    }
  }

  private async invokeChat(request: UnifiedModelRequest): Promise<UnifiedModelResponse> {
    if (!request.chat) {
      throw new Error('Chat parameters required for chat operation');
    }

    const deployment = this.resolveDeployment(request.modelHint, ['chat']);

    const chatRequest: ChatCompletionRequest = {
      deploymentId: deployment.deploymentId,
      messages: request.chat.messages,
      temperature: request.chat.temperature,
      max_tokens: request.chat.maxTokens,
      tools: request.chat.tools,
      tool_choice: request.chat.toolChoice,
      user: request.options?.user,
    };

    const response = await this.client.chat.create(chatRequest, {
      timeout: request.options?.timeout,
    });

    return this.toChatResponse(response);
  }

  private async invokeEmbedding(request: UnifiedModelRequest): Promise<UnifiedModelResponse> {
    if (!request.embedding) {
      throw new Error('Embedding parameters required for embedding operation');
    }

    const deployment = this.resolveDeployment(request.modelHint, ['embedding']);

    const embeddingRequest: EmbeddingRequest = {
      deploymentId: deployment.deploymentId,
      input: request.embedding.input,
      dimensions: request.embedding.dimensions,
      user: request.options?.user,
    };

    const response = await this.client.embeddings.create(embeddingRequest, {
      timeout: request.options?.timeout,
    });

    return this.toEmbeddingResponse(response);
  }

  private resolveDeployment(modelHint: string, requiredCapabilities: ModelCapability[]) {
    const resolution = this.deploymentRegistry.resolveByModel(modelHint, {
      requiredCapabilities,
    });

    if (!resolution) {
      throw new Error(
        `No deployment found for model "${modelHint}" with capabilities: ${requiredCapabilities.join(', ')}`
      );
    }

    return resolution.deployment;
  }

  private toChatResponse(response: ChatCompletionResponse): UnifiedModelResponse {
    const choice = response.choices[0];
    const message = choice?.message;

    return {
      provider: 'azure-openai',
      model: response.model,
      content: message?.content ?? undefined,
      toolCalls: message?.tool_calls?.map(tc => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
      usage: chatToTokenUsage(response.usage),
      finishReason: choice?.finish_reason ?? undefined,
      raw: response,
    };
  }

  private toEmbeddingResponse(response: EmbeddingResponse): UnifiedModelResponse {
    return {
      provider: 'azure-openai',
      model: response.model,
      embeddings: normalizeEmbeddings(response),
      usage: embeddingToTokenUsage(response.usage),
      raw: response,
    };
  }
}

/**
 * Creates a model adapter from a client
 */
export function createAdapter(client: AzureOpenAIClient): ModelAdapter {
  return new AzureOpenAIAdapter(client);
}
