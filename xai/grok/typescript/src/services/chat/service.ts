/**
 * Chat Service Implementation
 *
 * @module services/chat/service
 */

import type { GrokConfig } from '../../config.js';
import type { CredentialProvider } from '../../auth/provider.js';
import { buildRequest } from '../../infra/request-builder.js';
import { parseJsonResponse } from '../../infra/response-parser.js';
import { streamChunks, type ChatStreamChunk } from '../../infra/sse-parser.js';
import { validationError, timeoutError, networkError } from '../../error.js';
import { getCapabilities } from '../../models/index.js';
import type { GrokChatRequest } from './request.js';
import { buildChatRequestBody } from './request.js';
import type { GrokChatResponse } from './response.js';
import { StreamAccumulator, type StreamAccumulation } from './stream.js';
import type { ContentPart } from '../../types/message.js';

/**
 * Chat service for xAI Grok API.
 */
export class ChatService {
  private readonly config: GrokConfig;
  private readonly credentialProvider: CredentialProvider;

  constructor(config: GrokConfig, credentialProvider: CredentialProvider) {
    this.config = config;
    this.credentialProvider = credentialProvider;
  }

  /**
   * Validate chat request.
   *
   * @param request - Chat request
   * @throws {GrokError} If request is invalid
   */
  private validateRequest(request: GrokChatRequest): void {
    const capabilities = getCapabilities(request.model);

    // Check vision support
    if (!capabilities.supportsVision) {
      for (const message of request.messages) {
        if (Array.isArray(message.content)) {
          const hasImage = (message.content as ContentPart[]).some(
            (part) => part.type === 'image_url'
          );
          if (hasImage) {
            throw validationError(
              `Model ${request.model} does not support vision/image inputs`,
              'messages'
            );
          }
        }
      }
    }

    // Check streaming support
    if (request.stream && !capabilities.supportsStreaming) {
      throw validationError(
        `Model ${request.model} does not support streaming`,
        'stream'
      );
    }

    // Check tools support
    if (request.tools && request.tools.length > 0 && !capabilities.supportsTools) {
      throw validationError(
        `Model ${request.model} does not support tools/function calling`,
        'tools'
      );
    }

    // Validate temperature
    if (request.temperature !== undefined) {
      if (request.temperature < 0 || request.temperature > 2) {
        throw validationError(
          'Temperature must be between 0 and 2',
          'temperature'
        );
      }
    }

    // Validate top_p
    if (request.top_p !== undefined) {
      if (request.top_p < 0 || request.top_p > 1) {
        throw validationError(
          'top_p must be between 0 and 1',
          'top_p'
        );
      }
    }

    // Validate max_tokens
    if (request.max_tokens !== undefined) {
      if (request.max_tokens < 1) {
        throw validationError(
          'max_tokens must be at least 1',
          'max_tokens'
        );
      }
      if (request.max_tokens > capabilities.contextWindow) {
        throw validationError(
          `max_tokens exceeds model context window (${capabilities.contextWindow})`,
          'max_tokens'
        );
      }
    }
  }

  /**
   * Execute a chat completion request.
   *
   * @param request - Chat request
   * @returns Chat response
   */
  async complete(request: GrokChatRequest): Promise<GrokChatResponse> {
    this.validateRequest(request);

    const authHeader = await this.credentialProvider.getAuthHeader();
    const body = buildChatRequestBody({ ...request, stream: false });

    const builtRequest = buildRequest(this.config, authHeader, {
      method: 'POST',
      path: '/chat/completions',
      body,
      stream: false,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      builtRequest.timeout
    );

    try {
      const response = await fetch(builtRequest.url, {
        ...builtRequest.init,
        signal: controller.signal,
      });

      return await parseJsonResponse<GrokChatResponse>(response);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw timeoutError(`Request timed out after ${builtRequest.timeout}ms`);
      }
      if (error instanceof Error && error.message.includes('fetch')) {
        throw networkError('Network error during request', error);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Execute a streaming chat completion request.
   *
   * @param request - Chat request
   * @returns Async generator of stream chunks
   */
  async *stream(
    request: GrokChatRequest
  ): AsyncGenerator<ChatStreamChunk, StreamAccumulation, unknown> {
    this.validateRequest({ ...request, stream: true });

    const authHeader = await this.credentialProvider.getAuthHeader();
    const body = buildChatRequestBody({
      ...request,
      stream: true,
      stream_options: { include_usage: true },
    });

    const builtRequest = buildRequest(this.config, authHeader, {
      method: 'POST',
      path: '/chat/completions',
      body,
      stream: true,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      builtRequest.timeout
    );

    try {
      const response = await fetch(builtRequest.url, {
        ...builtRequest.init,
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorBody: unknown;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text().catch(() => undefined);
        }
        const { parseErrorResponse } = await import('../../error.js');
        throw parseErrorResponse(response.status, errorBody, response.headers);
      }

      const accumulator = new StreamAccumulator();

      for await (const chunk of streamChunks(response)) {
        accumulator.append(chunk);
        yield chunk;
      }

      return accumulator.finalize();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw timeoutError(`Stream timed out after ${builtRequest.timeout}ms`);
      }
      if (error instanceof Error && error.message.includes('fetch')) {
        throw networkError('Network error during streaming', error);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
