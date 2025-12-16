import {
  NetworkError,
  ServerError,
  RateLimitError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  TimeoutError,
  PineconeError,
} from '../errors/index.js';

/**
 * Configuration for HTTP transport
 */
export interface HttpTransportConfig {
  /** Base URL for Pinecone API */
  baseUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Optional custom fetch implementation */
  fetch?: typeof fetch;
}

/**
 * Options for HTTP requests
 */
export interface RequestOptions {
  /** HTTP method */
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  /** URL path (relative to base URL) */
  path: string;
  /** Request body (will be JSON stringified) */
  body?: unknown;
  /** Query parameters */
  queryParams?: Record<string, string | string[]>;
  /** Additional headers */
  headers?: Record<string, string>;
}

/**
 * HTTP response wrapper
 */
export interface HttpResponse<T> {
  /** HTTP status code */
  status: number;
  /** Response data */
  data: T;
  /** Response headers */
  headers: Headers;
}

/**
 * HTTP transport implementation using the Fetch API
 */
export class HttpTransport {
  private readonly config: HttpTransportConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: HttpTransportConfig) {
    this.config = config;
    this.fetchImpl = config.fetch ?? globalThis.fetch;
  }

  /**
   * Makes an HTTP request
   */
  async request<T>(options: RequestOptions): Promise<HttpResponse<T>> {
    const url = this.buildUrl(options.path, options.queryParams);
    const headers = this.buildHeaders(options.headers);
    const controller = new AbortController();

    // Set up timeout
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await this.fetchImpl(url, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.parseErrorResponse(response);
      }

      const data = await response.json();
      return {
        status: response.status,
        data: data as T,
        headers: response.headers,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      // Re-throw if it's already a PineconeError
      if (error instanceof PineconeError) {
        throw error;
      }

      if (error instanceof Error) {
        // Handle timeout
        if (error.name === 'AbortError') {
          throw new TimeoutError(
            `Request timeout after ${this.config.timeout}ms`
          );
        }

        // Handle network errors
        if (
          error.message.includes('fetch') ||
          error.message.includes('network') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ENOTFOUND')
        ) {
          throw new NetworkError('Network request failed', error);
        }
      }

      throw error;
    }
  }

  /**
   * Builds the full URL with query parameters
   */
  private buildUrl(path: string, queryParams?: Record<string, string | string[]>): string {
    const url = new URL(path, this.config.baseUrl);

    if (queryParams) {
      Object.entries(queryParams).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((v) => url.searchParams.append(key, v));
        } else {
          url.searchParams.append(key, value);
        }
      });
    }

    return url.toString();
  }

  /**
   * Builds request headers with authentication
   */
  private buildHeaders(customHeaders?: Record<string, string>): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Api-Key': this.config.apiKey,
      'User-Agent': 'pinecone-typescript-client',
      ...customHeaders,
    };
  }

  /**
   * Parses error responses from the API and throws appropriate error types
   */
  private async parseErrorResponse(response: Response): Promise<never> {
    const status = response.status;
    let errorBody: any;

    try {
      errorBody = await response.json();
    } catch {
      // If response is not JSON, use text
      const text = await response.text();
      errorBody = { error: { message: text || `HTTP ${status} error` } };
    }

    const errorMessage =
      errorBody?.error?.message ??
      errorBody?.message ??
      `HTTP ${status} error`;
    const errorDetails = errorBody?.error ?? errorBody;

    // Extract retry-after header if present
    const retryAfterHeader = response.headers.get('retry-after');
    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

    switch (status) {
      case 401:
      case 403:
        throw new AuthenticationError(errorMessage, status, errorDetails);
      case 400:
        throw new ValidationError(errorMessage, status, errorDetails);
      case 404:
        throw new NotFoundError(errorMessage, errorDetails);
      case 429:
        throw new RateLimitError(errorMessage, retryAfter, errorDetails);
      case 500:
      case 502:
      case 503:
      case 504:
        throw new ServerError(errorMessage, status, errorDetails);
      default:
        if (status >= 400 && status < 500) {
          throw new ValidationError(errorMessage, status, errorDetails);
        }
        throw new ServerError(
          `Unexpected error: ${errorMessage}`,
          status,
          errorDetails
        );
    }
  }
}

/**
 * Creates an HTTP transport instance
 */
export function createHttpTransport(config: HttpTransportConfig): HttpTransport {
  return new HttpTransport(config);
}
