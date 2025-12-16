/**
 * HTTP Transport Implementation
 *
 * Base HTTP transport class with common functionality for making API requests.
 * @module @llmdevops/weaviate-integration/transport/http
 */

import type { AuthProvider } from '../auth/types';
import { NetworkError, TimeoutError } from '../errors';
import type {
  HttpTransport,
  HttpRequest,
  HttpResponse,
  HttpMethod,
  TransportOptions,
} from './types';
import { buildUrl } from './types';
import type { RequestInterceptor, ResponseInterceptor } from './interceptors';

// ============================================================================
// Base HTTP Transport
// ============================================================================

/**
 * Abstract base class for HTTP transport implementations.
 *
 * Provides common functionality for:
 * - URL construction
 * - Header management
 * - Authentication injection
 * - Request/response interceptors
 * - Timeout handling
 */
export abstract class BaseHttpTransport implements HttpTransport {
  protected readonly baseUrl: string;
  protected readonly authProvider: AuthProvider;
  protected readonly timeout: number;
  protected readonly maxRetries: number;
  protected readonly defaultHeaders: Record<string, string>;
  protected readonly enableLogging: boolean;

  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];

  constructor(options: TransportOptions) {
    this.baseUrl = options.baseUrl;
    this.authProvider = options.authProvider;
    this.timeout = options.timeout ?? 30000;
    this.maxRetries = options.maxRetries ?? 3;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.enableLogging = options.enableLogging ?? false;
  }

  // ============================================================================
  // Abstract Methods (must be implemented by subclasses)
  // ============================================================================

  /**
   * Execute an HTTP request.
   * Subclasses must implement the actual HTTP call mechanism.
   *
   * @param url - Complete URL
   * @param method - HTTP method
   * @param headers - Request headers
   * @param body - Optional request body
   * @param timeout - Request timeout in milliseconds
   * @returns Promise resolving to HTTP response
   */
  protected abstract executeRequest<T>(
    url: string,
    method: HttpMethod,
    headers: Record<string, string>,
    body?: unknown,
    timeout?: number
  ): Promise<HttpResponse<T>>;

  // ============================================================================
  // Public API Methods
  // ============================================================================

  /**
   * Send a generic HTTP request.
   */
  async request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>> {
    // Build complete URL
    const url = buildUrl(this.baseUrl, request.path, request.query);

    // Merge headers
    let headers = await this.buildHeaders(request.headers);

    // Apply request interceptors
    let modifiedRequest: HttpRequest = { ...request, headers };
    for (const interceptor of this.requestInterceptors) {
      modifiedRequest = await interceptor.intercept(modifiedRequest);
      headers = modifiedRequest.headers ?? headers;
    }

    // Log request if enabled
    if (this.enableLogging) {
      this.logRequest(request.method, url, headers, request.body);
    }

    // Execute request
    const timeout = request.timeout ?? this.timeout;
    let response = await this.executeRequest<T>(
      url,
      request.method,
      headers,
      request.body,
      timeout
    );

    // Apply response interceptors
    for (const interceptor of this.responseInterceptors) {
      response = await interceptor.intercept(response);
    }

    // Log response if enabled
    if (this.enableLogging) {
      this.logResponse(response.status, response.headers);
    }

    return response;
  }

  /**
   * Send a GET request.
   */
  async get<T = unknown>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({
      method: 'GET',
      path,
      query,
      headers,
    });
  }

  /**
   * Send a POST request.
   */
  async post<T = unknown>(
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({
      method: 'POST',
      path,
      query,
      headers,
      body,
    });
  }

  /**
   * Send a PUT request.
   */
  async put<T = unknown>(
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({
      method: 'PUT',
      path,
      query,
      headers,
      body,
    });
  }

  /**
   * Send a PATCH request.
   */
  async patch<T = unknown>(
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({
      method: 'PATCH',
      path,
      query,
      headers,
      body,
    });
  }

  /**
   * Send a DELETE request.
   */
  async delete<T = unknown>(
    path: string,
    body?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
    headers?: Record<string, string>
  ): Promise<HttpResponse<T>> {
    return this.request<T>({
      method: 'DELETE',
      path,
      query,
      headers,
      body,
    });
  }

  /**
   * Send a HEAD request.
   */
  async head(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
    headers?: Record<string, string>
  ): Promise<HttpResponse<void>> {
    return this.request<void>({
      method: 'HEAD',
      path,
      query,
      headers,
    });
  }

  // ============================================================================
  // Interceptor Management
  // ============================================================================

  /**
   * Add a request interceptor.
   *
   * @param interceptor - Request interceptor to add
   */
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Add a response interceptor.
   *
   * @param interceptor - Response interceptor to add
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * Clear all request interceptors.
   */
  clearRequestInterceptors(): void {
    this.requestInterceptors = [];
  }

  /**
   * Clear all response interceptors.
   */
  clearResponseInterceptors(): void {
    this.responseInterceptors = [];
  }

  // ============================================================================
  // Protected Helper Methods
  // ============================================================================

  /**
   * Build request headers by merging defaults, auth headers, and custom headers.
   *
   * @param customHeaders - Optional custom headers
   * @returns Complete headers object
   */
  protected async buildHeaders(
    customHeaders?: Record<string, string>
  ): Promise<Record<string, string>> {
    // Get auth headers from provider
    const authHeaders = await this.authProvider.getAuthHeaders();

    // Merge headers (later entries override earlier ones)
    return {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...authHeaders,
      ...customHeaders,
    };
  }

  /**
   * Serialize request body to JSON string.
   *
   * @param body - Request body
   * @returns JSON string or undefined
   */
  protected serializeBody(body?: unknown): string | undefined {
    if (body === undefined || body === null) {
      return undefined;
    }

    return JSON.stringify(body);
  }

  /**
   * Parse response body as JSON.
   *
   * @param text - Response body text
   * @returns Parsed JSON object
   */
  protected parseJson<T>(text: string): T {
    if (!text || text.trim().length === 0) {
      return {} as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch (error) {
      throw new NetworkError(
        `Failed to parse JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Create an AbortSignal with timeout.
   *
   * @param timeoutMs - Timeout in milliseconds
   * @returns AbortController
   */
  protected createAbortController(timeoutMs: number): AbortController {
    const controller = new AbortController();

    setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    return controller;
  }

  /**
   * Handle fetch abort error.
   *
   * @param error - Error object
   * @param timeout - Timeout value
   */
  protected handleAbortError(error: unknown, timeout: number): never {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError(`Request timed out after ${timeout}ms`);
    }
    throw error;
  }

  // ============================================================================
  // Logging Helpers
  // ============================================================================

  /**
   * Log outgoing request.
   */
  private logRequest(
    method: HttpMethod,
    url: string,
    headers: Record<string, string>,
    body?: unknown
  ): void {
    console.log('[HTTP Request]', {
      method,
      url,
      headers: this.sanitizeHeaders(headers),
      body: body ? this.sanitizeBody(body) : undefined,
    });
  }

  /**
   * Log incoming response.
   */
  private logResponse(status: number, headers: Headers): void {
    const headersObj: Record<string, string> = {};
    headers.forEach((value, key) => {
      headersObj[key] = value;
    });
    console.log('[HTTP Response]', {
      status,
      headers: headersObj,
    });
  }

  /**
   * Sanitize headers for logging (remove sensitive values).
   */
  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized = { ...headers };

    // Mask sensitive headers
    const sensitiveHeaders = ['authorization', 'x-api-key', 'cookie'];
    for (const key of sensitiveHeaders) {
      if (sanitized[key.toLowerCase()]) {
        sanitized[key.toLowerCase()] = '***REDACTED***';
      }
    }

    return sanitized;
  }

  /**
   * Sanitize request body for logging (remove sensitive data).
   */
  private sanitizeBody(body: unknown): unknown {
    // For now, just return the body as-is
    // In production, you'd want to redact sensitive fields
    return body;
  }
}
