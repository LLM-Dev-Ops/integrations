/**
 * Options for HTTP requests
 */
export interface RequestOptions {
    /**
     * Request timeout in milliseconds
     */
    timeout?: number;
    /**
     * Additional headers to include in the request
     */
    headers?: Record<string, string>;
    /**
     * Signal for request cancellation
     */
    signal?: AbortSignal;
}
/**
 * Interface for HTTP transport layer
 */
export interface HttpTransport {
    /**
     * Makes a standard HTTP request
     */
    request<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<T>;
    /**
     * Makes a streaming HTTP request
     */
    requestStream(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<ReadableStream<Uint8Array>>;
}
/**
 * Server-Sent Events (SSE) line parser
 */
interface SSEMessage {
    event?: string;
    data?: string;
    id?: string;
    retry?: number;
}
/**
 * Implementation of HttpTransport using the Fetch API
 */
export declare class FetchHttpTransport implements HttpTransport {
    private readonly baseUrl;
    private readonly defaultHeaders;
    private readonly defaultTimeout;
    private readonly fetchImpl;
    constructor(baseUrl: string, defaultHeaders: Record<string, string>, defaultTimeout: number, fetchImpl?: typeof fetch);
    /**
     * Makes a standard HTTP request
     */
    request<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<T>;
    /**
     * Makes a streaming HTTP request
     */
    requestStream(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<ReadableStream<Uint8Array>>;
    /**
     * Handles error responses from the API
     */
    private handleErrorResponse;
}
/**
 * Creates a Server-Sent Events (SSE) stream reader
 */
export declare function readSSEStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<SSEMessage, void, unknown>;
/**
 * Creates an HTTP transport instance
 */
export declare function createHttpTransport(baseUrl: string, defaultHeaders: Record<string, string>, defaultTimeout: number, fetchImpl?: typeof fetch): HttpTransport;
export {};
//# sourceMappingURL=http-transport.d.ts.map