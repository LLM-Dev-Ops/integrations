/**
 * Content generation service for Gemini API.
 */
import { GeminiError } from '../error/index.js';
import { BaseService } from './base.js';
import { ChunkedJsonParser } from '../streaming/index.js';
import { validateGenerateContentRequest, validateModelName, } from '../validation/index.js';
import { checkSafetyBlocks } from './safety.js';
/**
 * Implementation of ContentService.
 */
export class ContentServiceImpl extends BaseService {
    constructor(httpClient) {
        super(httpClient);
    }
    async generate(model, request) {
        // Validate inputs at service boundary
        validateModelName(model);
        validateGenerateContentRequest(request);
        const url = this.buildUrl(`models/${model}:generateContent`);
        const headers = this.getHeaders('application/json');
        const response = await this.fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(request),
        });
        const data = await response.json();
        // Check for safety blocks before returning
        checkSafetyBlocks(data);
        return data;
    }
    async *generateStream(model, request) {
        // Validate inputs at service boundary
        validateModelName(model);
        validateGenerateContentRequest(request);
        const url = this.buildUrl(`models/${model}:streamGenerateContent`, { alt: 'sse' });
        const headers = this.getHeaders('application/json');
        const response = await this.fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(request),
        });
        if (!response.body) {
            throw new GeminiError({
                type: 'response_error',
                message: 'No response body in streaming response',
                isRetryable: false,
            });
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parser = new ChunkedJsonParser();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                const chunk = decoder.decode(value, { stream: true });
                const responses = parser.feed(chunk);
                for (const responseChunk of responses) {
                    // Check each chunk for safety blocks
                    checkSafetyBlocks(responseChunk);
                    yield responseChunk;
                }
            }
            // Process any remaining buffered data
            const finalResponse = parser.flush();
            if (finalResponse) {
                checkSafetyBlocks(finalResponse);
                yield finalResponse;
            }
        }
        catch (error) {
            // Re-throw safety errors without wrapping
            if (error instanceof GeminiError) {
                throw error;
            }
            throw new GeminiError({
                type: 'response_error',
                message: `Stream error: ${error.message}`,
                isRetryable: true,
            });
        }
        finally {
            reader.releaseLock();
        }
    }
    async countTokens(model, request) {
        // Validate inputs at service boundary
        validateModelName(model);
        if (request.generateContentRequest) {
            validateGenerateContentRequest(request.generateContentRequest);
        }
        if (!request.contents && !request.generateContentRequest) {
            throw new GeminiError({
                type: 'validation_error',
                message: 'CountTokensRequest must have either contents or generateContentRequest',
                isRetryable: false,
            });
        }
        const url = this.buildUrl(`models/${model}:countTokens`);
        const headers = this.getHeaders('application/json');
        const response = await this.fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(request),
        });
        const data = await response.json();
        return data;
    }
}
//# sourceMappingURL=content.js.map