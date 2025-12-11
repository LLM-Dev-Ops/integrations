/**
 * HTTP Transport
 *
 * HTTP client interface and implementations for OAuth2 requests.
 */

import { NetworkError, ProtocolError } from "../error";

/**
 * HTTP request definition.
 */
export interface HttpRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeout?: number;
}

/**
 * HTTP response definition.
 */
export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * HTTP transport interface (for dependency injection).
 */
export interface HttpTransport {
  /**
   * Send an HTTP request.
   */
  send(request: HttpRequest): Promise<HttpResponse>;
}

/**
 * Default fetch-based HTTP transport.
 */
export class FetchHttpTransport implements HttpTransport {
  private defaultTimeout: number;
  private maxResponseSize: number;

  constructor(options?: { timeout?: number; maxResponseSize?: number }) {
    this.defaultTimeout = options?.timeout ?? 30000;
    this.maxResponseSize = options?.maxResponseSize ?? 1048576; // 1MB
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    const timeout = request.timeout ?? this.defaultTimeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
        redirect: "manual", // Don't follow redirects for OAuth2
      });

      clearTimeout(timeoutId);

      // Check for unexpected redirect
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        throw new ProtocolError(
          `Unexpected redirect to ${location}`,
          "UnexpectedRedirect"
        );
      }

      // Read body with size limit
      const body = await this.readBody(response);

      // Convert headers to plain object
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      return {
        status: response.status,
        statusText: response.statusText,
        headers,
        body,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ProtocolError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new NetworkError(
            `Request timeout after ${timeout}ms`,
            "Timeout"
          );
        }

        const message = error.message.toLowerCase();
        if (message.includes("enotfound") || message.includes("dns")) {
          throw new NetworkError(
            `DNS resolution failed: ${error.message}`,
            "DnsResolutionFailed"
          );
        }
        if (
          message.includes("econnrefused") ||
          message.includes("econnreset")
        ) {
          throw new NetworkError(
            `Connection failed: ${error.message}`,
            "ConnectionFailed"
          );
        }
        if (message.includes("certificate") || message.includes("ssl")) {
          throw new NetworkError(`TLS error: ${error.message}`, "TlsError", {
            retryable: false,
          });
        }

        throw new NetworkError(error.message, "ConnectionFailed");
      }

      throw new NetworkError(String(error), "ConnectionFailed");
    }
  }

  private async readBody(response: Response): Promise<string> {
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > this.maxResponseSize) {
      throw new ProtocolError(
        `Response too large: ${contentLength} bytes`,
        "ResponseTooLarge"
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return "";
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;
      if (totalSize > this.maxResponseSize) {
        reader.cancel();
        throw new ProtocolError(
          `Response too large: ${totalSize} bytes`,
          "ResponseTooLarge"
        );
      }

      chunks.push(value);
    }

    const allChunks = new Uint8Array(totalSize);
    let position = 0;
    for (const chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }

    return new TextDecoder().decode(allChunks);
  }
}

/**
 * Mock HTTP transport for testing.
 */
export class MockHttpTransport implements HttpTransport {
  private responses: HttpResponse[] = [];
  private requestHistory: HttpRequest[] = [];
  private defaultResponse?: HttpResponse;

  /**
   * Queue a response to return.
   */
  queueResponse(response: HttpResponse): this {
    this.responses.push(response);
    return this;
  }

  /**
   * Set default response when queue is empty.
   */
  setDefaultResponse(response: HttpResponse): this {
    this.defaultResponse = response;
    return this;
  }

  /**
   * Queue a successful JSON response.
   */
  queueJsonResponse(status: number, body: unknown): this {
    return this.queueResponse({
      status,
      statusText: status === 200 ? "OK" : "Error",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  /**
   * Queue an error response.
   */
  queueErrorResponse(
    status: number,
    error: string,
    description?: string
  ): this {
    return this.queueJsonResponse(status, {
      error,
      error_description: description,
    });
  }

  /**
   * Get request history.
   */
  getRequests(): HttpRequest[] {
    return [...this.requestHistory];
  }

  /**
   * Get last request.
   */
  getLastRequest(): HttpRequest | undefined {
    return this.requestHistory[this.requestHistory.length - 1];
  }

  /**
   * Clear request history.
   */
  clearHistory(): void {
    this.requestHistory = [];
  }

  /**
   * Assert a request was made.
   */
  assertCalled(): void {
    if (this.requestHistory.length === 0) {
      throw new Error("Expected at least one request");
    }
  }

  /**
   * Assert exact number of requests.
   */
  assertCalledTimes(count: number): void {
    if (this.requestHistory.length !== count) {
      throw new Error(
        `Expected ${count} requests, got ${this.requestHistory.length}`
      );
    }
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.requestHistory.push(request);

    const response = this.responses.shift() ?? this.defaultResponse;
    if (!response) {
      throw new Error("No mock response available");
    }

    return response;
  }
}

/**
 * Create production HTTP transport.
 */
export function createTransport(timeout?: number): HttpTransport {
  return new FetchHttpTransport({ timeout });
}

/**
 * Create mock HTTP transport for testing.
 */
export function createMockTransport(): MockHttpTransport {
  return new MockHttpTransport();
}
