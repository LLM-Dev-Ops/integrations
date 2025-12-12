/**
 * HTTP transport layer for Google Drive integration.
 *
 * Provides abstraction over HTTP requests with interceptor support.
 *
 * @packageDocumentation
 */

import {
  createNetworkError,
  createResponseError,
  NetworkErrorType,
  ResponseErrorType,
  GoogleDriveError,
} from "../errors";

/**
 * HTTP methods supported by the transport.
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Request body types.
 */
export type BodyInit = string | ArrayBuffer | Blob | FormData | URLSearchParams | ReadableStream<Uint8Array>;

/**
 * HTTP request representation.
 */
export interface HttpRequest {
  /** HTTP method */
  method: HttpMethod;

  /** Request URL */
  url: string;

  /** Request headers */
  headers?: Record<string, string>;

  /** Request body */
  body?: BodyInit;

  /** Request timeout in milliseconds */
  timeout?: number;

  /** Signal for aborting the request */
  signal?: AbortSignal;
}

/**
 * HTTP response representation.
 */
export interface HttpResponse<T = unknown> {
  /** HTTP status code */
  status: number;

  /** Status text */
  statusText: string;

  /** Response headers */
  headers: Record<string, string>;

  /** Parsed response body */
  data: T;

  /** Raw response body */
  raw: ArrayBuffer;
}

/**
 * Request interceptor function.
 */
export type RequestInterceptor = (request: HttpRequest) => HttpRequest | Promise<HttpRequest>;

/**
 * Response interceptor function.
 */
export type ResponseInterceptor = <T>(response: HttpResponse<T>) => HttpResponse<T> | Promise<HttpResponse<T>>;

/**
 * HTTP transport interface.
 */
export interface HttpTransport {
  /**
   * Send an HTTP request.
   *
   * @param request - HTTP request
   * @returns HTTP response
   */
  send<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>>;

  /**
   * Send an HTTP request and get raw bytes.
   *
   * @param request - HTTP request
   * @returns Raw response body
   */
  sendRaw(request: HttpRequest): Promise<ArrayBuffer>;

  /**
   * Send an HTTP request and get a streaming response.
   *
   * @param request - HTTP request
   * @returns ReadableStream of response chunks
   */
  sendStreaming(request: HttpRequest): Promise<ReadableStream<Uint8Array>>;

  /**
   * Add a request interceptor.
   *
   * @param interceptor - Request interceptor function
   */
  addRequestInterceptor(interceptor: RequestInterceptor): void;

  /**
   * Add a response interceptor.
   *
   * @param interceptor - Response interceptor function
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): void;
}

/**
 * Options for configuring the FetchTransport.
 */
export interface FetchTransportOptions {
  /** Base headers to include in all requests */
  baseHeaders?: Record<string, string>;

  /** Default timeout in milliseconds */
  timeout?: number;
}

/**
 * Fetch-based HTTP transport implementation.
 */
export class FetchTransport implements HttpTransport {
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private baseHeaders: Record<string, string>;
  private timeout: number;

  /**
   * Create a new FetchTransport.
   *
   * @param options - Configuration options
   */
  constructor(options?: FetchTransportOptions) {
    this.baseHeaders = options?.baseHeaders ?? {};
    this.timeout = options?.timeout ?? 300000; // 5 minutes default
  }

  async send<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>> {
    // Merge base headers with request headers
    const mergedHeaders = {
      ...this.baseHeaders,
      ...request.headers,
    };

    // Use request timeout or default timeout
    const timeout = request.timeout ?? this.timeout;

    // Apply request interceptors
    let processedRequest: HttpRequest = {
      ...request,
      headers: mergedHeaders,
      timeout,
    };

    for (const interceptor of this.requestInterceptors) {
      processedRequest = await interceptor(processedRequest);
    }

    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = processedRequest.timeout
        ? setTimeout(() => controller.abort(), processedRequest.timeout)
        : undefined;

      // Combine signals
      const signal = processedRequest.signal
        ? combineAbortSignals([processedRequest.signal, controller.signal])
        : controller.signal;

      // Send request
      const response = await fetch(processedRequest.url, {
        method: processedRequest.method,
        headers: processedRequest.headers,
        body: processedRequest.body as globalThis.BodyInit,
        signal,
      });

      // Clear timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Get response body
      const raw = await response.arrayBuffer();

      // Parse response headers
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      // Parse JSON if content-type is JSON
      let data: T;
      const contentType = headers["content-type"] || "";
      if (contentType.includes("application/json")) {
        try {
          const text = new TextDecoder().decode(raw);
          data = text ? JSON.parse(text) : ({} as T);
        } catch (error) {
          throw createResponseError(
            ResponseErrorType.InvalidJson,
            `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      } else {
        data = raw as T;
      }

      // Create response object
      let httpResponse: HttpResponse<T> = {
        status: response.status,
        statusText: response.statusText,
        headers,
        data,
        raw,
      };

      // Apply response interceptors
      for (const interceptor of this.responseInterceptors) {
        httpResponse = await interceptor(httpResponse);
      }

      // Check for HTTP errors
      if (!response.ok) {
        throw GoogleDriveError.fromResponse(
          {
            status: response.status,
            statusText: response.statusText,
            headers,
          },
          data
        );
      }

      return httpResponse;
    } catch (error) {
      // Handle abort/timeout
      if (error instanceof Error && error.name === "AbortError") {
        throw createNetworkError(
          NetworkErrorType.Timeout,
          `Request timed out after ${processedRequest.timeout}ms`
        );
      }

      // Handle network errors
      if (error instanceof TypeError) {
        throw createNetworkError(
          NetworkErrorType.ConnectionFailed,
          `Network request failed: ${error.message}`,
          error
        );
      }

      // Re-throw GoogleDriveError
      if (error instanceof GoogleDriveError) {
        throw error;
      }

      // Wrap unknown errors
      throw createNetworkError(
        NetworkErrorType.ConnectionFailed,
        `Request failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async sendRaw(request: HttpRequest): Promise<ArrayBuffer> {
    const response = await this.send<ArrayBuffer>(request);
    return response.raw;
  }

  async sendStreaming(request: HttpRequest): Promise<ReadableStream<Uint8Array>> {
    // Merge base headers with request headers
    const mergedHeaders = {
      ...this.baseHeaders,
      ...request.headers,
    };

    // Use request timeout or default timeout
    const timeout = request.timeout ?? this.timeout;

    // Apply request interceptors
    let processedRequest: HttpRequest = {
      ...request,
      headers: mergedHeaders,
      timeout,
    };

    for (const interceptor of this.requestInterceptors) {
      processedRequest = await interceptor(processedRequest);
    }

    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = processedRequest.timeout
        ? setTimeout(() => controller.abort(), processedRequest.timeout)
        : undefined;

      // Combine signals
      const signal = processedRequest.signal
        ? combineAbortSignals([processedRequest.signal, controller.signal])
        : controller.signal;

      // Send request
      const response = await fetch(processedRequest.url, {
        method: processedRequest.method,
        headers: processedRequest.headers,
        body: processedRequest.body as globalThis.BodyInit,
        signal,
      });

      // Clear timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Check for HTTP errors
      if (!response.ok) {
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        // Try to parse error body
        let errorBody: unknown;
        try {
          const text = await response.text();
          errorBody = text ? JSON.parse(text) : {};
        } catch {
          errorBody = {};
        }

        throw GoogleDriveError.fromResponse(
          {
            status: response.status,
            statusText: response.statusText,
            headers,
          },
          errorBody
        );
      }

      if (!response.body) {
        throw createNetworkError(
          NetworkErrorType.ConnectionFailed,
          "Response body is null"
        );
      }

      return response.body;
    } catch (error) {
      // Handle abort/timeout
      if (error instanceof Error && error.name === "AbortError") {
        throw createNetworkError(
          NetworkErrorType.Timeout,
          `Request timed out after ${processedRequest.timeout}ms`
        );
      }

      // Handle network errors
      if (error instanceof TypeError) {
        throw createNetworkError(
          NetworkErrorType.ConnectionFailed,
          `Network request failed: ${error.message}`,
          error
        );
      }

      // Re-throw GoogleDriveError
      if (error instanceof GoogleDriveError) {
        throw error;
      }

      // Wrap unknown errors
      throw createNetworkError(
        NetworkErrorType.ConnectionFailed,
        `Request failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }
}

/**
 * Combine multiple AbortSignals into one.
 *
 * @param signals - Array of AbortSignals
 * @returns Combined AbortSignal
 */
function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  return controller.signal;
}

/**
 * Create a default HTTP transport.
 *
 * @returns FetchTransport instance
 */
export function createHttpTransport(): HttpTransport {
  return new FetchTransport();
}

/**
 * Create an authentication interceptor.
 *
 * @param getToken - Function to get the access token
 * @returns Request interceptor
 */
export function createAuthInterceptor(
  getToken: () => Promise<string>
): RequestInterceptor {
  return async (request: HttpRequest): Promise<HttpRequest> => {
    const token = await getToken();
    return {
      ...request,
      headers: {
        ...request.headers,
        Authorization: `Bearer ${token}`,
      },
    };
  };
}

/**
 * Create a user agent interceptor.
 *
 * @param userAgent - User agent string
 * @returns Request interceptor
 */
export function createUserAgentInterceptor(userAgent: string): RequestInterceptor {
  return (request: HttpRequest): HttpRequest => {
    return {
      ...request,
      headers: {
        ...request.headers,
        "User-Agent": userAgent,
      },
    };
  };
}

/**
 * Create a logging interceptor for debugging.
 *
 * @param logger - Logger function
 * @returns Request and response interceptors
 */
export function createLoggingInterceptors(
  logger: (message: string, data?: unknown) => void
): {
  requestInterceptor: RequestInterceptor;
  responseInterceptor: ResponseInterceptor;
} {
  const requestInterceptor: RequestInterceptor = (request: HttpRequest) => {
    logger("HTTP Request", {
      method: request.method,
      url: request.url,
      headers: request.headers,
    });
    return request;
  };

  const responseInterceptor: ResponseInterceptor = <T>(response: HttpResponse<T>) => {
    logger("HTTP Response", {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    return response;
  };

  return { requestInterceptor, responseInterceptor };
}
