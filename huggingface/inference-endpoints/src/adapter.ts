/**
 * HuggingFace Inference Adapter
 * Platform ModelAdapter implementation as specified in SPARC documentation
 * Integrates with the existing provider system
 */

import { EventEmitter } from 'events';
import { HfInferenceClient } from './client.js';
import {
  HfInferenceConfig,
  defaultHfInferenceConfig,
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  EmbeddingResponse,
} from './types/index.js';
import { HfError } from './types/errors.js';

// Platform types (matching the existing provider system)
export interface LLMRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'function';
    content: string;
    name?: string;
    functionCall?: {
      name: string;
      arguments: string;
    };
  }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  stream?: boolean;
  functions?: Array<{
    name: string;
    description: string;
    parameters: any;
  }>;
  functionCall?: 'auto' | 'none' | { name: string };
  providerOptions?: Record<string, any>;
}

export interface LLMResponse {
  id: string;
  model: string;
  provider: string;
  content: string;
  functionCall?: {
    name: string;
    arguments: string;
  };
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost?: {
    promptCost: number;
    completionCost: number;
    totalCost: number;
    currency: string;
  };
  latency?: number;
  finishReason?: 'stop' | 'length' | 'function_call' | 'content_filter';
}

export interface LLMStreamEvent {
  type: 'content' | 'function_call' | 'error' | 'done';
  delta?: {
    content?: string;
    functionCall?: {
      name?: string;
      arguments?: string;
    };
  };
  error?: Error;
  usage?: LLMResponse['usage'];
  cost?: LLMResponse['cost'];
}

export interface ProviderCapabilities {
  supportedModels: string[];
  maxContextLength: Record<string, number>;
  maxOutputTokens: Record<string, number>;
  supportsStreaming: boolean;
  supportsFunctionCalling: boolean;
  supportsSystemMessages: boolean;
  supportsVision: boolean;
  supportsAudio: boolean;
  supportsTools: boolean;
  supportsFineTuning: boolean;
  supportsEmbeddings: boolean;
  supportsLogprobs: boolean;
  supportsBatching: boolean;
  rateLimit?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
    concurrentRequests: number;
  };
  pricing?: Record<string, {
    promptCostPer1k: number;
    completionCostPer1k: number;
    currency: string;
  }>;
}

export interface HealthCheckResult {
  healthy: boolean;
  latency?: number;
  error?: string;
  timestamp: Date;
}

export interface ProviderStatus {
  available: boolean;
  currentLoad: number;
  queueLength: number;
  activeRequests: number;
  rateLimitRemaining?: number;
  rateLimitReset?: Date;
}

export interface HfInferenceAdapterOptions {
  config?: Partial<HfInferenceConfig>;
  token?: string;
}

/**
 * HuggingFace Inference Adapter
 * Adapts the HF client to the platform's provider interface
 */
export class HfInferenceAdapter extends EventEmitter {
  readonly name = 'huggingface';
  readonly capabilities: ProviderCapabilities;

  private client: HfInferenceClient;
  private config: HfInferenceConfig;
  private requestCount = 0;
  private activeRequests = 0;
  private lastHealthCheck?: HealthCheckResult;

  constructor(options?: HfInferenceAdapterOptions) {
    super();

    this.config = {
      ...defaultHfInferenceConfig,
      ...options?.config,
    };

    if (options?.token) {
      this.config.token = options.token;
    }

    this.client = new HfInferenceClient({ config: this.config });

    this.capabilities = {
      supportedModels: [
        'meta-llama/Llama-3.2-3B-Instruct',
        'meta-llama/Llama-3.1-8B-Instruct',
        'meta-llama/Llama-3.1-70B-Instruct',
        'mistralai/Mistral-7B-Instruct-v0.3',
        'mistralai/Mixtral-8x7B-Instruct-v0.1',
        'google/gemma-2-9b-it',
        'Qwen/Qwen2.5-72B-Instruct',
      ],
      maxContextLength: {
        'meta-llama/Llama-3.2-3B-Instruct': 128000,
        'meta-llama/Llama-3.1-8B-Instruct': 128000,
        'meta-llama/Llama-3.1-70B-Instruct': 128000,
        'mistralai/Mistral-7B-Instruct-v0.3': 32768,
        'mistralai/Mixtral-8x7B-Instruct-v0.1': 32768,
        'google/gemma-2-9b-it': 8192,
        'Qwen/Qwen2.5-72B-Instruct': 131072,
      },
      maxOutputTokens: {
        'meta-llama/Llama-3.2-3B-Instruct': 4096,
        'meta-llama/Llama-3.1-8B-Instruct': 4096,
        'meta-llama/Llama-3.1-70B-Instruct': 4096,
        'mistralai/Mistral-7B-Instruct-v0.3': 4096,
        'mistralai/Mixtral-8x7B-Instruct-v0.1': 4096,
        'google/gemma-2-9b-it': 4096,
        'Qwen/Qwen2.5-72B-Instruct': 4096,
      },
      supportsStreaming: true,
      supportsFunctionCalling: true,
      supportsSystemMessages: true,
      supportsVision: true,
      supportsAudio: true,
      supportsTools: true,
      supportsFineTuning: false,
      supportsEmbeddings: true,
      supportsLogprobs: true,
      supportsBatching: true,
    };
  }

  /**
   * Initialize the adapter
   */
  async initialize(): Promise<void> {
    // Perform initial health check
    await this.healthCheck();
  }

  /**
   * Complete a request
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    this.activeRequests++;
    this.requestCount++;

    try {
      const chatRequest = this.convertToHfRequest(request);
      const response = await this.client.chat().complete(chatRequest);
      const llmResponse = this.convertToLLMResponse(response, startTime);

      this.emit('response', {
        provider: this.name,
        model: llmResponse.model,
        latency: llmResponse.latency,
        tokens: llmResponse.usage.totalTokens,
        cost: llmResponse.cost?.totalCost,
      });

      return llmResponse;
    } catch (error) {
      const transformedError = this.transformError(error);
      this.emit('error', {
        provider: this.name,
        error: transformedError,
        request,
      });
      throw transformedError;
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * Stream complete a request
   */
  async *streamComplete(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    this.activeRequests++;
    this.requestCount++;

    try {
      const chatRequest = this.convertToHfRequest(request);
      const stream = this.client.chat().stream(chatRequest);

      let totalContent = '';
      let promptTokens = 0;
      let completionTokens = 0;

      for await (const chunk of stream) {
        const event = this.convertStreamChunk(chunk);
        if (event) {
          if (event.delta?.content) {
            totalContent += event.delta.content;
            completionTokens++;
          }
          yield event;
        }

        // Check for usage in chunk
        if (chunk.usage) {
          promptTokens = chunk.usage.promptTokens;
          completionTokens = chunk.usage.completionTokens;
        }
      }

      // Estimate tokens if not provided
      if (promptTokens === 0) {
        promptTokens = Math.ceil(JSON.stringify(request.messages).length / 4);
      }
      if (completionTokens === 0) {
        completionTokens = Math.ceil(totalContent.length / 4);
      }

      yield {
        type: 'done',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    } catch (error) {
      const transformedError = this.transformError(error);
      yield {
        type: 'error',
        error: transformedError,
      };
      throw transformedError;
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * Create embeddings
   */
  async createEmbeddings(
    model: string,
    inputs: string | string[]
  ): Promise<EmbeddingResponse> {
    return this.client.embedding().embed({
      model,
      inputs,
    });
  }

  /**
   * List available models
   */
  async listModels(): Promise<string[]> {
    return this.capabilities.supportedModels;
  }

  /**
   * Validate if a model is supported
   */
  validateModel(model: string): boolean {
    // For HF, most models are supported - just check it's a valid format
    return model.includes('/') || this.capabilities.supportedModels.includes(model);
  }

  /**
   * Perform health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const health = await this.client.healthCheck();

      this.lastHealthCheck = {
        healthy: health.healthy,
        latency: Date.now() - startTime,
        timestamp: health.checkedAt,
      };

      this.emit('health_check', this.lastHealthCheck);
      return this.lastHealthCheck;
    } catch (error) {
      this.lastHealthCheck = {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        latency: Date.now() - startTime,
        timestamp: new Date(),
      };

      this.emit('health_check', this.lastHealthCheck);
      return this.lastHealthCheck;
    }
  }

  /**
   * Get provider status
   */
  getStatus(): ProviderStatus {
    return {
      available: this.lastHealthCheck?.healthy ?? false,
      currentLoad: this.activeRequests / 100,
      queueLength: this.activeRequests,
      activeRequests: this.activeRequests,
    };
  }

  /**
   * Estimate cost for a request
   */
  async estimateCost(request: LLMRequest): Promise<{
    estimatedPromptTokens: number;
    estimatedCompletionTokens: number;
    estimatedTotalTokens: number;
    estimatedCost: {
      prompt: number;
      completion: number;
      total: number;
      currency: string;
    };
    confidence: number;
  }> {
    // Estimate tokens
    const promptTokens = Math.ceil(JSON.stringify(request.messages).length / 4);
    const completionTokens = request.maxTokens || 1000;

    // HF serverless is free for most models, so cost is 0
    return {
      estimatedPromptTokens: promptTokens,
      estimatedCompletionTokens: completionTokens,
      estimatedTotalTokens: promptTokens + completionTokens,
      estimatedCost: {
        prompt: 0,
        completion: 0,
        total: 0,
        currency: 'USD',
      },
      confidence: 0.8,
    };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.client.clearCaches();
    this.removeAllListeners();
  }

  /**
   * Convert platform request to HF request
   */
  private convertToHfRequest(request: LLMRequest): ChatRequest {
    const hfRequest: ChatRequest = {
      model: request.model || this.capabilities.supportedModels[0],
      messages: request.messages.map((msg) => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
        name: msg.name,
        toolCalls: msg.functionCall
          ? [
              {
                id: 'call_' + Date.now(),
                type: 'function' as const,
                function: {
                  name: msg.functionCall.name,
                  arguments: msg.functionCall.arguments,
                },
              },
            ]
          : undefined,
      })),
    };

    if (request.temperature !== undefined) {
      hfRequest.temperature = request.temperature;
    }

    if (request.maxTokens !== undefined) {
      hfRequest.maxTokens = request.maxTokens;
    }

    if (request.topP !== undefined) {
      hfRequest.topP = request.topP;
    }

    if (request.topK !== undefined) {
      hfRequest.topK = request.topK;
    }

    if (request.frequencyPenalty !== undefined) {
      hfRequest.frequencyPenalty = request.frequencyPenalty;
    }

    if (request.presencePenalty !== undefined) {
      hfRequest.presencePenalty = request.presencePenalty;
    }

    if (request.stopSequences) {
      hfRequest.stopSequences = request.stopSequences;
    }

    if (request.functions) {
      hfRequest.tools = request.functions.map((fn) => ({
        type: 'function' as const,
        function: {
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters,
        },
      }));

      if (request.functionCall) {
        if (request.functionCall === 'auto') {
          hfRequest.toolChoice = 'auto';
        } else if (request.functionCall === 'none') {
          hfRequest.toolChoice = 'none';
        } else {
          hfRequest.toolChoice = {
            type: 'function',
            function: { name: request.functionCall.name },
          };
        }
      }
    }

    return hfRequest;
  }

  /**
   * Convert HF response to platform response
   */
  private convertToLLMResponse(
    response: ChatResponse,
    startTime: number
  ): LLMResponse {
    const choice = response.choices[0];

    return {
      id: response.id,
      model: response.model,
      provider: this.name,
      content: choice.message.content || '',
      functionCall: choice.message.toolCalls?.[0]
        ? {
            name: choice.message.toolCalls[0].function.name,
            arguments: choice.message.toolCalls[0].function.arguments,
          }
        : undefined,
      usage: response.usage || {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      latency: Date.now() - startTime,
      finishReason: this.mapFinishReason(choice.finishReason),
    };
  }

  /**
   * Convert stream chunk to platform event
   */
  private convertStreamChunk(chunk: ChatStreamChunk): LLMStreamEvent | null {
    const choice = chunk.choices[0];

    if (choice.delta.content) {
      return {
        type: 'content',
        delta: { content: choice.delta.content },
      };
    }

    if (choice.delta.toolCalls) {
      const tc = choice.delta.toolCalls[0];
      return {
        type: 'function_call',
        delta: {
          functionCall: {
            name: tc?.function?.name,
            arguments: tc?.function?.arguments,
          },
        },
      };
    }

    return null;
  }

  /**
   * Map finish reason
   */
  private mapFinishReason(
    reason: string | null
  ): 'stop' | 'length' | 'function_call' | 'content_filter' | undefined {
    if (!reason) return undefined;

    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'function_call';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  /**
   * Transform HF errors to platform errors
   */
  private transformError(error: unknown): Error {
    if (error instanceof HfError) {
      // Transform to a standard Error with additional properties
      const err = new Error(error.message) as any;
      err.code = error.code;
      err.statusCode = error.statusCode;
      err.retryable = error.retryable;
      err.provider = this.name;
      return err;
    }

    return error instanceof Error ? error : new Error(String(error));
  }
}
