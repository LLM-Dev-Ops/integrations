/**
 * Embeddings service for Gemini API.
 */
import { BaseService } from './base.js';
import { validateEmbedContentRequest, validateBatchSize, validateModelName, } from '../validation/index.js';
/**
 * Implementation of EmbeddingsService.
 */
export class EmbeddingsServiceImpl extends BaseService {
    static MAX_BATCH_SIZE = 100;
    constructor(httpClient) {
        super(httpClient);
    }
    async embed(model, request) {
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
        return data;
    }
    async batchEmbed(model, requests) {
        // Validate inputs at service boundary
        validateModelName(model);
        validateBatchSize(requests, EmbeddingsServiceImpl.MAX_BATCH_SIZE, 'requests');
        // Validate each request
        for (let i = 0; i < requests.length; i++) {
            try {
                validateEmbedContentRequest(requests[i]);
            }
            catch (error) {
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
        return data;
    }
}
//# sourceMappingURL=embeddings.js.map