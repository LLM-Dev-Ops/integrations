/**
 * Embeddings service for Gemini API.
 */
import type { EmbedContentRequest, EmbedContentResponse, BatchEmbedContentsResponse } from '../types/index.js';
import type { HttpClient } from '../client/index.js';
import { BaseService } from './base.js';
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
export declare class EmbeddingsServiceImpl extends BaseService implements EmbeddingsService {
    private static readonly MAX_BATCH_SIZE;
    constructor(httpClient: HttpClient);
    embed(model: string, request: EmbedContentRequest): Promise<EmbedContentResponse>;
    batchEmbed(model: string, requests: EmbedContentRequest[]): Promise<BatchEmbedContentsResponse>;
}
//# sourceMappingURL=embeddings.d.ts.map