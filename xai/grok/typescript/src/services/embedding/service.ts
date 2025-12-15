/**
 * Embedding Service Implementation
 *
 * @module services/embedding/service
 */

import type { GrokConfig } from '../../config.js';
import type { CredentialProvider } from '../../auth/provider.js';
import { buildRequest } from '../../infra/request-builder.js';
import { parseJsonResponse } from '../../infra/response-parser.js';
import { validationError, timeoutError, networkError } from '../../error.js';
import type { GrokEmbeddingRequest, EmbeddingInput } from './request.js';
import { buildEmbeddingRequestBody } from './request.js';
import type { GrokEmbeddingResponse } from './response.js';
import { extractEmbeddings, extractSingleEmbedding } from './response.js';

/**
 * Default embedding model.
 */
export const DEFAULT_EMBEDDING_MODEL = 'grok-2-1212';

/**
 * Embedding service for xAI Grok API.
 */
export class EmbeddingService {
  private readonly config: GrokConfig;
  private readonly credentialProvider: CredentialProvider;

  constructor(config: GrokConfig, credentialProvider: CredentialProvider) {
    this.config = config;
    this.credentialProvider = credentialProvider;
  }

  /**
   * Create embeddings for the given input.
   *
   * @param input - Text or array of texts to embed
   * @param options - Additional options
   * @returns Embedding response
   */
  async create(
    input: EmbeddingInput,
    options: Omit<GrokEmbeddingRequest, 'input' | 'model'> & { model?: string } = {}
  ): Promise<GrokEmbeddingResponse> {
    const request: GrokEmbeddingRequest = {
      input,
      model: options.model ?? DEFAULT_EMBEDDING_MODEL,
      ...options,
    };

    return this.execute(request);
  }

  /**
   * Create a single embedding.
   *
   * @param text - Text to embed
   * @param options - Additional options
   * @returns Embedding vector
   */
  async createSingle(
    text: string,
    options: Omit<GrokEmbeddingRequest, 'input' | 'model'> & { model?: string } = {}
  ): Promise<number[]> {
    const response = await this.create(text, options);
    return extractSingleEmbedding(response);
  }

  /**
   * Create embeddings for multiple texts.
   *
   * @param texts - Array of texts to embed
   * @param options - Additional options
   * @returns Array of embedding vectors
   */
  async createBatch(
    texts: string[],
    options: Omit<GrokEmbeddingRequest, 'input' | 'model'> & { model?: string } = {}
  ): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const response = await this.create(texts, options);
    return extractEmbeddings(response);
  }

  /**
   * Execute an embedding request.
   *
   * @param request - Embedding request
   * @returns Embedding response
   */
  private async execute(request: GrokEmbeddingRequest): Promise<GrokEmbeddingResponse> {
    // Validate input
    if (typeof request.input === 'string' && request.input.trim().length === 0) {
      throw validationError('Input cannot be empty', 'input');
    }
    if (Array.isArray(request.input) && request.input.length === 0) {
      throw validationError('Input array cannot be empty', 'input');
    }

    const authHeader = await this.credentialProvider.getAuthHeader();
    const body = buildEmbeddingRequestBody(request);

    const builtRequest = buildRequest(this.config, authHeader, {
      method: 'POST',
      path: '/embeddings',
      body,
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

      return await parseJsonResponse<GrokEmbeddingResponse>(response);
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
}
