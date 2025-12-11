/**
 * Embeddings service for Gemini API.
 */

import type {
  EmbedContentRequest,
  EmbedContentResponse,
  BatchEmbedContentsResponse,
} from '../types/index.js';
import type { HttpClient } from '../client/index.js';
import { BaseService } from './base.js';
import {
  validateEmbedContentRequest,
  validateBatchSize,
  validateModelName,
} from '../validation/index.js';

/**
 * Service for generating embeddings.
 */
export interface EmbeddingsService {
  /**
   * Generate embedding for single content.
   * @param model - The model to use
   * @param request - The embedding request
   * @returns The embedding response
   */
  embed(model: string, request: EmbedContentRequest): Promise<EmbedContentResponse>;

  /**
   * Generate embeddings for multiple contents (batch).
   * @param model - The model to use
   * @param requests - Array of embedding requests
   * @returns The batch embedding response
   */
  batchEmbed(model: string, requests: EmbedContentRequest[]): Promise<BatchEmbedContentsResponse>;
}

/**
 * Implementation of EmbeddingsService.
 */
export class EmbeddingsServiceImpl extends BaseService implements EmbeddingsService {
  private static readonly MAX_BATCH_SIZE = 100;

  constructor(httpClient: HttpClient) {
    super(httpClient);
  }

  async embed(model: string, request: EmbedContentRequest): Promise<EmbedContentResponse> {
    // Validate inputs at service boundary
    validateModelName(model);
    validateEmbedContentRequest(request);

    const url = this.buildUrl(`models/${model}:embedContent`);
    const headers = this.getHeaders('application/json');

    const response = await this.fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    const data = await response.json();
    return data as EmbedContentResponse;
  }

  async batchEmbed(model: string, requests: EmbedContentRequest[]): Promise<BatchEmbedContentsResponse> {
    // Validate inputs at service boundary
    validateModelName(model);
    validateBatchSize(requests, EmbeddingsServiceImpl.MAX_BATCH_SIZE, 'requests');

    // Validate each request
    for (let i = 0; i < requests.length; i++) {
      try {
        validateEmbedContentRequest(requests[i]);
      } catch (error) {
        // Add context about which request failed
        if (error instanceof Error) {
          throw new Error(`Validation failed for request at index ${i}: ${error.message}`);
        }
        throw error;
      }
    }

    const url = this.buildUrl(`models/${model}:batchEmbedContents`);
    const headers = this.getHeaders('application/json');

    const response = await this.fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ requests }),
    });

    const data = await response.json();
    return data as BatchEmbedContentsResponse;
  }
}
