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
export declare class MockHttpClient {
    private responses;
    private streamChunks;
    private requests;
    /**
     * Enqueue a raw response to be returned by the next request.
     */
    enqueueResponse(response: MockResponse): void;
    /**
     * Enqueue a JSON response with the given status code and body.
     *
     * @example
     * ```typescript
     * mockClient.enqueueJsonResponse(200, { id: 1, name: 'test' });
     * ```
     */
    enqueueJsonResponse(status: number, body: unknown): void;
    /**
     * Enqueue an error response.
     *
     * @example
     * ```typescript
     * mockClient.enqueueErrorResponse(404, 'Not Found');
     * ```
     */
    enqueueErrorResponse(status: number, message: string): void;
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
    enqueueStreamingResponse(chunks: MockStreamChunk[]): void;
    /**
     * Get all requests that were made.
     */
    getRequests(): Array<{
        url: string;
        options: RequestInit;
    }>;
    /**
     * Get the last request that was made.
     */
    getLastRequest(): {
        url: string;
        options: RequestInit;
    } | undefined;
    /**
     * Verify that exactly the expected number of requests were made.
     *
     * @throws {Error} If the actual count doesn't match expected
     */
    verifyRequestCount(expected: number): void;
    /**
     * Verify that a request was made with the expected method and URL pattern.
     *
     * @throws {Error} If the request doesn't match expectations
     */
    verifyRequest(index: number, method: string, urlContains: string): void;
    /**
     * Verify that a request contains a specific header.
     *
     * @throws {Error} If the header doesn't match expectations
     */
    verifyHeader(index: number, headerName: string, headerValue: string): void;
    /**
     * Clear all recorded requests.
     */
    clearRequests(): void;
    /**
     * Make a fetch request (mock implementation).
     */
    request(url: string, options?: RequestInit): Promise<Response>;
    /**
     * Make a streaming fetch request (mock implementation).
     */
    requestStream(url: string, options?: RequestInit): Promise<Response>;
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
export declare function createMockFetch(mockClient: MockHttpClient): (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
//# sourceMappingURL=http-client.d.ts.map