/**
 * Mock HTTP client for testing.
 *
 * This mock allows tests to enqueue responses and verify requests in a controlled manner.
 * Supports both regular and streaming responses following the AAA (Arrange-Act-Assert) pattern.
 */

export interface MockResponse {
  status: number;
  body: string;
  headers?: Record<string, string>;
}

export interface MockStreamChunk {
  value: string;
  done: boolean;
}

/**
 * Mock HTTP client implementation for testing.
 *
 * @example
 * ```typescript
 * // Arrange
 * const mockClient = new MockHttpClient();
 * mockClient.enqueueJsonResponse(200, { status: 'ok' });
 *
 * // Act
 * const response = await mockClient.request('https://api.example.com/test', { method: 'GET' });
 * const data = await response.json();
 *
 * // Assert
 * expect(data).toEqual({ status: 'ok' });
 * mockClient.verifyRequestCount(1);
 * ```
 */
export class MockHttpClient {
  private responses: MockResponse[] = [];
  private streamChunks: MockStreamChunk[][] = [];
  private requests: Array<{ url: string; options: RequestInit }> = [];

  /**
   * Enqueue a raw response to be returned by the next request.
   */
  enqueueResponse(response: MockResponse): void {
    this.responses.push(response);
  }

  /**
   * Enqueue a JSON response with the given status code and body.
   *
   * @example
   * ```typescript
   * mockClient.enqueueJsonResponse(200, { id: 1, name: 'test' });
   * ```
   */
  enqueueJsonResponse(status: number, body: unknown): void {
    this.enqueueResponse({
      status,
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });
  }

  /**
   * Enqueue an error response.
   *
   * @example
   * ```typescript
   * mockClient.enqueueErrorResponse(404, 'Not Found');
   * ```
   */
  enqueueErrorResponse(status: number, message: string): void {
    this.enqueueResponse({
      status,
      body: JSON.stringify({ error: { message } }),
      headers: { 'content-type': 'application/json' },
    });
  }

  /**
   * Enqueue a streaming response with multiple chunks.
   *
   * @example
   * ```typescript
   * mockClient.enqueueStreamingResponse([
   *   { value: 'chunk1', done: false },
   *   { value: 'chunk2', done: false },
   *   { value: '', done: true },
   * ]);
   * ```
   */
  enqueueStreamingResponse(chunks: MockStreamChunk[]): void {
    this.streamChunks.push(chunks);
  }

  /**
   * Get all requests that were made.
   */
  getRequests(): Array<{ url: string; options: RequestInit }> {
    return [...this.requests];
  }

  /**
   * Get the last request that was made.
   */
  getLastRequest(): { url: string; options: RequestInit } | undefined {
    return this.requests[this.requests.length - 1];
  }

  /**
   * Verify that exactly the expected number of requests were made.
   *
   * @throws {Error} If the actual count doesn't match expected
   */
  verifyRequestCount(expected: number): void {
    if (this.requests.length !== expected) {
      throw new Error(`Expected ${expected} requests, got ${this.requests.length}`);
    }
  }

  /**
   * Verify that a request was made with the expected method and URL pattern.
   *
   * @throws {Error} If the request doesn't match expectations
   */
  verifyRequest(index: number, method: string, urlContains: string): void {
    if (index >= this.requests.length) {
      throw new Error(`No request at index ${index}`);
    }

    const request = this.requests[index];
    const actualMethod = request.options.method || 'GET';

    if (actualMethod !== method) {
      throw new Error(`Expected method ${method}, got ${actualMethod}`);
    }

    if (!request.url.includes(urlContains)) {
      throw new Error(`Expected URL to contain '${urlContains}', got '${request.url}'`);
    }
  }

  /**
   * Verify that a request contains a specific header.
   *
   * @throws {Error} If the header doesn't match expectations
   */
  verifyHeader(index: number, headerName: string, headerValue: string): void {
    if (index >= this.requests.length) {
      throw new Error(`No request at index ${index}`);
    }

    const request = this.requests[index];
    const headers = request.options.headers as Record<string, string> | undefined;
    const actualValue = headers?.[headerName];

    if (actualValue !== headerValue) {
      throw new Error(
        `Expected header '${headerName}' to be '${headerValue}', got '${actualValue}'`
      );
    }
  }

  /**
   * Clear all recorded requests.
   */
  clearRequests(): void {
    this.requests = [];
  }

  /**
   * Make a fetch request (mock implementation).
   */
  async request(url: string, options: RequestInit = {}): Promise<Response> {
    this.requests.push({ url, options });

    const response = this.responses.shift();
    if (!response) {
      throw new Error('No response configured in MockHttpClient');
    }

    // Create a mock Response object
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  }

  /**
   * Make a streaming fetch request (mock implementation).
   */
  async requestStream(url: string, options: RequestInit = {}): Promise<Response> {
    this.requests.push({ url, options });

    const chunks = this.streamChunks.shift();
    if (!chunks) {
      throw new Error('No streaming response configured in MockHttpClient');
    }

    // Create a readable stream from the chunks
    const stream = new ReadableStream({
      async start(controller) {
        for (const chunk of chunks) {
          if (!chunk.done) {
            controller.enqueue(new TextEncoder().encode(chunk.value));
          }
        }
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }
}

/**
 * Create a mock fetch function for use in tests.
 *
 * @example
 * ```typescript
 * const mockClient = new MockHttpClient();
 * const mockFetch = createMockFetch(mockClient);
 *
 * // Use in place of global fetch
 * global.fetch = mockFetch;
 * ```
 */
export function createMockFetch(
  mockClient: MockHttpClient
): (url: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (url: string | URL | Request, init?: RequestInit) => {
    const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    return mockClient.request(urlString, init);
  };
}
