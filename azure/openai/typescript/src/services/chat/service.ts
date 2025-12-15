/**
 * Chat Completion Service
 *
 * Implements chat completions for Azure OpenAI with streaming support.
 */

import type { RequestOptions, AzureDeployment } from '../../types/index.js';
import type { AuthProvider } from '../../auth/index.js';
import type { DeploymentRegistry } from '../../deployment/index.js';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
} from './types.js';
import { buildChatCompletionsUrl } from '../../infra/url-builder.js';
import { parseSSEStream } from '../../infra/sse-parser.js';
import { mapResponseToError, mapFetchError } from '../../errors/index.js';
import { extractContentFilterResults, extractPromptFilterResults } from '../../content-filter/index.js';

/** Chat completion service interface */
export interface ChatCompletionService {
  /**
   * Creates a chat completion
   */
  create(request: ChatCompletionRequest, options?: RequestOptions): Promise<ChatCompletionResponse>;

  /**
   * Creates a streaming chat completion
   */
  stream(request: ChatCompletionRequest, options?: RequestOptions): AsyncIterable<ChatCompletionChunk>;
}

/** Service dependencies */
export interface ChatServiceDependencies {
  authProvider: AuthProvider;
  deploymentRegistry: DeploymentRegistry;
  defaultTimeout: number;
}

/**
 * Chat completion service implementation
 */
export class ChatCompletionServiceImpl implements ChatCompletionService {
  private readonly authProvider: AuthProvider;
  private readonly deploymentRegistry: DeploymentRegistry;
  private readonly defaultTimeout: number;

  constructor(deps: ChatServiceDependencies) {
    this.authProvider = deps.authProvider;
    this.deploymentRegistry = deps.deploymentRegistry;
    this.defaultTimeout = deps.defaultTimeout;
  }

  async create(
    request: ChatCompletionRequest,
    options?: RequestOptions
  ): Promise<ChatCompletionResponse> {
    const deployment = this.resolveDeployment(request.deploymentId);
    const url = buildChatCompletionsUrl(deployment);

    const response = await this.executeRequest(url, deployment, request, false, options);

    if (!response.ok) {
      throw await mapResponseToError(response, request.deploymentId);
    }

    const data = await response.json() as ChatCompletionResponse;

    // Enrich with content filter data if present
    const promptFilters = extractPromptFilterResults(data);
    if (promptFilters) {
      data.prompt_filter_results = promptFilters;
    }

    for (const choice of data.choices) {
      const filters = extractContentFilterResults(choice);
      if (filters) {
        choice.content_filter_results = filters;
      }
    }

    return data;
  }

  async *stream(
    request: ChatCompletionRequest,
    options?: RequestOptions
  ): AsyncIterable<ChatCompletionChunk> {
    const deployment = this.resolveDeployment(request.deploymentId);
    const url = buildChatCompletionsUrl(deployment);

    const response = await this.executeRequest(url, deployment, request, true, options);

    if (!response.ok) {
      throw await mapResponseToError(response, request.deploymentId);
    }

    yield* parseSSEStream<ChatCompletionChunk>(response);
  }

  /**
   * Resolves deployment from registry
   */
  private resolveDeployment(deploymentId: string): AzureDeployment {
    const deployment = this.deploymentRegistry.resolve(deploymentId);
    if (!deployment) {
      // Try to resolve by model hint
      const resolution = this.deploymentRegistry.resolveByModel(deploymentId);
      if (resolution) {
        return resolution.deployment;
      }
      throw new Error(`Deployment not found: ${deploymentId}`);
    }
    return deployment;
  }

  /**
   * Executes HTTP request with auth
   */
  private async executeRequest(
    url: string,
    _deployment: AzureDeployment,
    request: ChatCompletionRequest,
    stream: boolean,
    options?: RequestOptions
  ): Promise<Response> {
    const [authHeader, authValue] = await this.authProvider.getAuthHeader();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      [authHeader]: authValue,
      ...options?.headers,
    };

    // Build request body (remove deploymentId as it's in URL)
    const { deploymentId: _, ...body } = request;
    const requestBody = {
      ...body,
      stream,
    };

    const timeout = options?.timeout ?? this.defaultTimeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      return await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: options?.signal ?? controller.signal,
      });
    } catch (error) {
      throw mapFetchError(error, request.deploymentId);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Stream accumulator for collecting streamed responses
 */
export class ChatStreamAccumulator {
  private content = '';
  private role: string | undefined;
  private toolCalls: Map<number, { id: string; type: string; function: { name: string; arguments: string } }> = new Map();
  private usage: ChatCompletionResponse['usage'] | undefined;
  private id = '';
  private model = '';
  private created = 0;

  /**
   * Adds a chunk to the accumulator
   */
  add(chunk: ChatCompletionChunk): void {
    this.id = chunk.id;
    this.model = chunk.model;
    this.created = chunk.created;

    for (const choice of chunk.choices) {
      if (choice.delta.role) {
        this.role = choice.delta.role;
      }
      if (choice.delta.content) {
        this.content += choice.delta.content;
      }
      if (choice.delta.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const existing = this.toolCalls.get(tc.index);
          if (existing) {
            if (tc.function?.arguments) {
              existing.function.arguments += tc.function.arguments;
            }
          } else if (tc.id) {
            this.toolCalls.set(tc.index, {
              id: tc.id,
              type: tc.type ?? 'function',
              function: {
                name: tc.function?.name ?? '',
                arguments: tc.function?.arguments ?? '',
              },
            });
          }
        }
      }
    }

    if (chunk.usage) {
      this.usage = chunk.usage;
    }
  }

  /**
   * Gets the accumulated response
   */
  getResponse(): ChatCompletionResponse {
    const toolCallsArray = this.toolCalls.size > 0
      ? Array.from(this.toolCalls.values()).map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: tc.function,
        }))
      : undefined;

    return {
      id: this.id,
      object: 'chat.completion',
      created: this.created,
      model: this.model,
      choices: [{
        index: 0,
        message: {
          role: (this.role as 'assistant') ?? 'assistant',
          content: this.content || null,
          tool_calls: toolCallsArray,
        },
        finish_reason: 'stop',
      }],
      usage: this.usage,
    };
  }

  /**
   * Gets the accumulated content
   */
  getContent(): string {
    return this.content;
  }
}
