/**
 * HTTP Transport Layer
 *
 * Provides HTTP request/response handling for S3 operations.
 */

import { NetworkError } from "../error";

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
 * Get ETag from response.
 */
export function getETag(response: HttpResponse): string | undefined {
  return getHeader(response, "etag");
}

/**
 * Get request ID from response.
 */
export function getRequestId(response: HttpResponse): string | undefined {
  return getHeader(response, "x-amz-request-id");
}

/**
 * Get content length from response.
 */
export function getContentLength(response: HttpResponse): number | undefined {
  const value = getHeader(response, "content-length");
  return value ? parseInt(value, 10) : undefined;
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
          throw new NetworkError(`DNS resolution failed: ${error.message}`, "DnsResolutionFailed");
        }
        if (error.message.includes("ECONNREFUSED") || error.message.includes("ECONNRESET")) {
          throw new NetworkError(`Connection failed: ${error.message}`, "ConnectionFailed");
        }
        throw new NetworkError(error.message, "ConnectionFailed");
      }
      throw new NetworkError(String(error), "ConnectionFailed");
    }
  }
}

/**
 * Create a new HTTP request.
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
