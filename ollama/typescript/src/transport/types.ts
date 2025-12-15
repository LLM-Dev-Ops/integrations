/**
 * Transport Layer Types
 *
 * Defines the HTTP transport abstraction for Ollama client.
 * Based on SPARC specification Section 4.1.
 */

/**
 * HTTP response structure
 */
export interface HttpResponse {
  /** HTTP status code */
  status: number;
  /** Response body (JSON-parsed or raw) */
  body: unknown;
  /** Response headers */
  headers?: Headers;
}

/**
 * HTTP transport abstraction
 *
 * Provides a clean interface for HTTP operations with streaming support.
 * Implementations should handle errors, timeouts, and authentication.
 */
export interface HttpTransport {
  /**
   * Send GET request
   *
   * @param path - API path (e.g., "/api/tags")
   * @returns Promise resolving to HTTP response
   */
  get(path: string): Promise<HttpResponse>;

  /**
   * Send POST request with JSON body
   *
   * @param path - API path (e.g., "/api/chat")
   * @param body - Request body (will be JSON-serialized)
   * @returns Promise resolving to HTTP response
   */
  post<T>(path: string, body: T): Promise<HttpResponse>;

  /**
   * Send POST request and receive streaming response
   *
   * @param path - API path (e.g., "/api/generate")
   * @param body - Request body (will be JSON-serialized)
   * @returns Async iterable of raw bytes
   */
  postStreaming<T>(path: string, body: T): AsyncIterable<Uint8Array>;

  /**
   * Check if server is reachable
   *
   * @returns Promise resolving to true if server responds
   */
  isReachable(): Promise<boolean>;
}
