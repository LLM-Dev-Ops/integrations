/**
 * Base service class with common functionality for all Gemini services.
 */

import type { HttpClient } from '../client/index.js';
import type { ResolvedGeminiConfig } from '../config/index.js';

/**
 * Abstract base class for all service implementations.
 * Provides common functionality like HTTP client access.
 */
export abstract class BaseService {
  constructor(protected readonly httpClient: HttpClient) {}

  /**
   * Build a URL for an API endpoint.
   * @param endpoint - The API endpoint
   * @param queryParams - Optional query parameters
   * @returns The complete URL
   */
  protected buildUrl(endpoint: string, queryParams?: Record<string, string>): string {
    return this.httpClient.buildUrl(endpoint, queryParams);
  }

  /**
   * Get headers for a request.
   * @param contentType - Optional content type header
   * @returns Headers object
   */
  protected getHeaders(contentType?: string): Record<string, string> {
    return this.httpClient.getHeaders(contentType);
  }

  /**
   * Make a fetch request with error handling.
   * @param url - The URL to fetch
   * @param init - Fetch initialization options
   * @returns The response
   */
  protected async fetch(url: string, init?: RequestInit): Promise<Response> {
    return this.httpClient.fetch(url, init);
  }
}

/**
 * Extended base service with config access (for services that need it).
 */
export abstract class BaseServiceWithConfig extends BaseService {
  constructor(
    httpClient: HttpClient,
    protected readonly config: ResolvedGeminiConfig
  ) {
    super(httpClient);
  }
}
