/**
 * HTTP Transport Layer for BigQuery
 *
 * Provides HTTP request/response handling for BigQuery operations.
 */

import { NetworkError } from "../error/index.js";

/**
 * HTTP request.
 */
export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Buffer | string;
  timeout?: number;
}

/**
 * HTTP response.
 */
export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: Buffer;
}

/**
 * Transport interface.
 */
export interface HttpTransport {
  /**
   * Send an HTTP request.
   */
  send(request: HttpRequest): Promise<HttpResponse>;
}

/**
 * Check if response indicates success.
 */
export function isSuccess(response: HttpResponse): boolean {
  return response.status >= 200 && response.status < 300;
}

/**
 * Get a header value (case-insensitive).
 */
export function getHeader(
  response: HttpResponse,
  name: string
): string | undefined {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(response.headers)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }
  return undefined;
}

/**
 * Get request ID from response.
 */
export function getRequestId(response: HttpResponse): string | undefined {
  return getHeader(response, "x-goog-request-id");
}

/**
 * Fetch-based HTTP transport.
 */
export class FetchTransport implements HttpTransport {
  private defaultTimeout: number;

  constructor(defaultTimeout: number = 30000) {
    this.defaultTimeout = defaultTimeout;
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    const timeout = request.timeout ?? this.defaultTimeout;

    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(timeout),
      });

      // Convert headers to plain object
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      // Read body as buffer
      const arrayBuffer = await response.arrayBuffer();
      const body = Buffer.from(arrayBuffer);

      return {
        status: response.status,
        statusText: response.statusText,
        headers,
        body,
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError" || error.name === "TimeoutError") {
          throw new NetworkError(`Request timeout after ${timeout}ms`, "Timeout");
        }
        if (error.message.includes("ENOTFOUND") || error.message.includes("DNS")) {
          throw new NetworkError(
            `DNS resolution failed: ${error.message}`,
            "DnsResolutionFailed"
          );
        }
        if (error.message.includes("ECONNREFUSED") || error.message.includes("ECONNRESET")) {
          throw new NetworkError(`Connection failed: ${error.message}`, "ConnectionFailed");
        }
        if (error.message.includes("TLS") || error.message.includes("SSL")) {
          throw new NetworkError(`TLS error: ${error.message}`, "TlsError");
        }
        throw new NetworkError(error.message, "ConnectionFailed");
      }
      throw new NetworkError(String(error), "ConnectionFailed");
    }
  }
}

/**
 * Create an HTTP request.
 */
export function createRequest(
  method: string,
  url: string,
  headers?: Record<string, string>,
  body?: Buffer | string
): HttpRequest {
  return {
    method,
    url,
    headers: headers ?? {},
    body,
  };
}

/**
 * Create a fetch-based transport.
 */
export function createTransport(timeout?: number): HttpTransport {
  return new FetchTransport(timeout);
}

/**
 * Authentication provider interface for injecting OAuth2 tokens.
 */
export interface AuthProvider {
  /**
   * Get an OAuth2 access token.
   */
  getAccessToken(): Promise<string>;
}

/**
 * BigQuery REST API transport.
 *
 * Provides higher-level transport for BigQuery REST API operations.
 * Handles automatic token injection, JSON encoding/decoding, and request ID extraction.
 */
export class BigQueryRestTransport {
  private static readonly BASE_URL = "https://bigquery.googleapis.com/bigquery/v2";

  private readonly transport: HttpTransport;
  private readonly authProvider: AuthProvider;

  /**
   * Create a new BigQuery REST transport.
   *
   * @param authProvider - Authentication provider for OAuth2 tokens
   * @param timeout - Optional default timeout in milliseconds (default: 30000)
   */
  constructor(authProvider: AuthProvider, timeout?: number) {
    this.transport = new FetchTransport(timeout ?? 30000);
    this.authProvider = authProvider;
  }

  /**
   * Perform a GET request.
   *
   * @param path - API path (e.g., "/projects/my-project/datasets")
   * @param headers - Optional additional headers
   * @returns HTTP response
   */
  async get(
    path: string,
    headers?: Record<string, string>
  ): Promise<HttpResponse> {
    const token = await this.authProvider.getAccessToken();
    const url = `${BigQueryRestTransport.BASE_URL}${path}`;

    const requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...headers,
    };

    return this.transport.send(createRequest("GET", url, requestHeaders));
  }

  /**
   * Perform a POST request with JSON body.
   *
   * @param path - API path
   * @param body - Request body (will be JSON-encoded)
   * @param headers - Optional additional headers
   * @returns HTTP response
   */
  async post(
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<HttpResponse> {
    const token = await this.authProvider.getAccessToken();
    const url = `${BigQueryRestTransport.BASE_URL}${path}`;

    const requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...headers,
    };

    const requestBody = body ? JSON.stringify(body) : undefined;

    return this.transport.send(createRequest("POST", url, requestHeaders, requestBody));
  }

  /**
   * Perform a DELETE request.
   *
   * @param path - API path
   * @param headers - Optional additional headers
   * @returns HTTP response
   */
  async delete(
    path: string,
    headers?: Record<string, string>
  ): Promise<HttpResponse> {
    const token = await this.authProvider.getAccessToken();
    const url = `${BigQueryRestTransport.BASE_URL}${path}`;

    const requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...headers,
    };

    return this.transport.send(createRequest("DELETE", url, requestHeaders));
  }

  /**
   * Perform a PATCH request with JSON body.
   *
   * @param path - API path
   * @param body - Request body (will be JSON-encoded)
   * @param headers - Optional additional headers
   * @returns HTTP response
   */
  async patch(
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<HttpResponse> {
    const token = await this.authProvider.getAccessToken();
    const url = `${BigQueryRestTransport.BASE_URL}${path}`;

    const requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...headers,
    };

    const requestBody = body ? JSON.stringify(body) : undefined;

    return this.transport.send(createRequest("PATCH", url, requestHeaders, requestBody));
  }
}
