/**
 * Content generation service for Gemini API.
 */
import type { GenerateContentRequest, GenerateContentResponse, CountTokensRequest, CountTokensResponse } from '../types/index.js';
import type { HttpClient } from '../client/index.js';
import { BaseService } from './base.js';
/** Async iterable for streaming responses */
export type ContentStream = AsyncIterable<GenerateContentResponse>;
/**
 * Service for content generation with Gemini models.
 */
export interface ContentService {
    /**
     * Generate content (non-streaming).
     * @param model - The model to use
     * @param request - The generation request
     * @returns The generated content response
     */
    generate(model: string, request: GenerateContentRequest): Promise<GenerateContentResponse>;
    /**
     * Generate content with streaming response.
     * @param model - The model to use
     * @param request - The generation request
     * @returns Async iterable of response chunks
     */
    generateStream(model: string, request: GenerateContentRequest): ContentStream;
    /**
     * Count tokens for content.
     * @param model - The model to use
     * @param request - The token counting request
     * @returns The token count response
     */
    countTokens(model: string, request: CountTokensRequest): Promise<CountTokensResponse>;
}
/**
 * Implementation of ContentService.
 */
export declare class ContentServiceImpl extends BaseService implements ContentService {
    constructor(httpClient: HttpClient);
    generate(model: string, request: GenerateContentRequest): Promise<GenerateContentResponse>;
    generateStream(model: string, request: GenerateContentRequest): ContentStream;
    countTokens(model: string, request: CountTokensRequest): Promise<CountTokensResponse>;
}
//# sourceMappingURL=content.d.ts.map