/**
 * HTTP transport type definitions for Cloudflare R2
 */

/**
 * HTTP request
 */
export interface HttpRequest {
  /** HTTP method (GET, PUT, POST, DELETE, HEAD) */
  method: string;
  /** Full URL including protocol, host, path, and query string */
  url: string;
  /** HTTP headers */
  headers: Record<string, string>;
  /** Request body (optional) */
  body?: Uint8Array | ReadableStream<Uint8Array>;
}

/**
 * HTTP response with buffered body
 */
export interface HttpResponse {
  /** HTTP status code */
  status: number;
  /** HTTP headers */
  headers: Record<string, string>;
  /** Response body as buffer */
  body: Uint8Array;
}

/**
 * HTTP response with streaming body
 */
export interface StreamingHttpResponse {
  /** HTTP status code */
  status: number;
  /** HTTP headers */
  headers: Record<string, string>;
  /** Response body as stream */
  body: ReadableStream<Uint8Array>;
}

/**
 * HTTP transport interface
 */
export interface HttpTransport {
  /**
   * Sends an HTTP request and returns buffered response
   *
   * Use for requests where the entire response body needs to be in memory.
   * Suitable for small responses (metadata, lists, etc.).
   */
  send(request: HttpRequest): Promise<HttpResponse>;

  /**
   * Sends an HTTP request and returns streaming response
   *
   * Use for requests with large response bodies (object downloads).
   * The response body is a stream that can be consumed progressively.
   */
  sendStreaming(request: HttpRequest): Promise<StreamingHttpResponse>;

  /**
   * Closes the transport and releases resources
   */
  close(): Promise<void>;
}

/**
 * Helper to get header value (case-insensitive)
 */
export function getHeader(
  headers: Record<string, string>,
  name: string
): string | undefined {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }
  return undefined;
}

/**
 * Helper to check if response is successful (2xx status)
 */
export function isSuccessResponse(response: HttpResponse | StreamingHttpResponse): boolean {
  return response.status >= 200 && response.status < 300;
}

/**
 * Helper to extract ETag from response headers
 */
export function getETag(headers: Record<string, string>): string | undefined {
  return getHeader(headers, 'etag')?.replace(/^"|"$/g, ''); // Remove quotes
}

/**
 * Helper to extract Content-Length from response headers
 */
export function getContentLength(headers: Record<string, string>): number | undefined {
  const value = getHeader(headers, 'content-length');
  return value ? parseInt(value, 10) : undefined;
}

/**
 * Helper to extract Content-Type from response headers
 */
export function getContentType(headers: Record<string, string>): string | undefined {
  return getHeader(headers, 'content-type');
}

/**
 * Helper to extract request ID from response headers
 */
export function getRequestId(headers: Record<string, string>): string | undefined {
  return getHeader(headers, 'x-amz-request-id') ?? getHeader(headers, 'cf-ray');
}

/**
 * Helper to extract Retry-After from response headers
 */
export function getRetryAfter(headers: Record<string, string>): number | undefined {
  const value = getHeader(headers, 'retry-after');
  if (!value) return undefined;

  // Retry-After can be either seconds or HTTP date
  const seconds = parseInt(value, 10);
  if (!isNaN(seconds)) {
    return seconds;
  }

  // Try parsing as HTTP date
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    return Math.max(0, Math.floor((date.getTime() - Date.now()) / 1000));
  }

  return undefined;
}
