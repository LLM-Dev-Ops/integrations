/**
 * Base service class with common functionality for all Gemini services.
 */
/**
 * Abstract base class for all service implementations.
 * Provides common functionality like HTTP client access.
 */
export class BaseService {
    httpClient;
    constructor(httpClient) {
        this.httpClient = httpClient;
    }
    /**
     * Build a URL for an API endpoint.
     * @param endpoint - The API endpoint
     * @param queryParams - Optional query parameters
     * @returns The complete URL
     */
    buildUrl(endpoint, queryParams) {
        return this.httpClient.buildUrl(endpoint, queryParams);
    }
    /**
     * Get headers for a request.
     * @param contentType - Optional content type header
     * @returns Headers object
     */
    getHeaders(contentType) {
        return this.httpClient.getHeaders(contentType);
    }
    /**
     * Make a fetch request with error handling.
     * @param url - The URL to fetch
     * @param init - Fetch initialization options
     * @returns The response
     */
    async fetch(url, init) {
        return this.httpClient.fetch(url, init);
    }
}
/**
 * Extended base service with config access (for services that need it).
 */
export class BaseServiceWithConfig extends BaseService {
    config;
    constructor(httpClient, config) {
        super(httpClient);
        this.config = config;
    }
}
//# sourceMappingURL=base.js.map