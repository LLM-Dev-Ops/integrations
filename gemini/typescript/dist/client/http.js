/**
 * HTTP client for making requests to Gemini API.
 */
import { GeminiError } from '../error/index.js';
/**
 * HTTP client for making requests to Gemini API.
 */
export class HttpClient {
    config;
    constructor(config) {
        this.config = config;
    }
    /**
     * Build the full URL for an endpoint.
     */
    buildUrl(endpoint, queryParams) {
        const url = new URL(`${this.config.baseUrl}/${this.config.apiVersion}/${endpoint.replace(/^\//, '')}`);
        // Add API key based on auth method
        if (this.config.authMethod === 'queryParam') {
            url.searchParams.set('key', this.config.apiKey);
        }
        // Add additional query params
        if (queryParams) {
            for (const [key, value] of Object.entries(queryParams)) {
                if (value !== undefined && value !== null) {
                    url.searchParams.set(key, value);
                }
            }
        }
        return url.toString();
    }
    /**
     * Get headers for a request.
     */
    getHeaders(contentType) {
        const headers = {};
        if (this.config.authMethod === 'header') {
            headers['x-goog-api-key'] = this.config.apiKey;
        }
        if (contentType) {
            headers['Content-Type'] = contentType;
        }
        return headers;
    }
    /**
     * Make a fetch request with error handling.
     */
    async fetch(url, init) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
        try {
            const response = await fetch(url, {
                ...init,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                await this.handleErrorResponse(response);
            }
            return response;
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof GeminiError) {
                throw error;
            }
            if (error.name === 'AbortError') {
                throw new GeminiError({
                    type: 'network_error',
                    message: `Request timed out after ${this.config.timeout}ms`,
                    isRetryable: true,
                });
            }
            throw new GeminiError({
                type: 'network_error',
                message: `Network error: ${error.message}`,
                isRetryable: true,
            });
        }
    }
    /**
     * Handle error responses from the API.
     */
    async handleErrorResponse(response) {
        let errorBody;
        try {
            errorBody = await response.json();
        }
        catch {
            errorBody = { error: { message: response.statusText } };
        }
        const errorMessage = errorBody?.error?.message || response.statusText;
        const status = response.status;
        // Parse retry-after header
        const retryAfter = response.headers.get('retry-after');
        const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
        // Map status codes to specific errors
        throw new GeminiError({
            type: this.mapStatusToType(status),
            message: errorMessage,
            status,
            retryAfter: retryAfterSeconds,
            isRetryable: this.isRetryableStatus(status),
            details: errorBody,
        });
    }
    /**
     * Map HTTP status to error type.
     */
    mapStatusToType(status) {
        if (status === 400)
            return 'validation_error';
        if (status === 401)
            return 'authentication_error';
        if (status === 403)
            return 'authentication_error';
        if (status === 404)
            return 'resource_error';
        if (status === 413)
            return 'payload_too_large';
        if (status === 429)
            return 'rate_limit_error';
        if (status >= 500)
            return 'server_error';
        return 'api_error';
    }
    /**
     * Check if status is retryable.
     */
    isRetryableStatus(status) {
        return status === 429 || status === 503 || status >= 500;
    }
}
//# sourceMappingURL=http.js.map