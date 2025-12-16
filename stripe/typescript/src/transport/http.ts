/**
 * HTTP transport layer for Stripe API communication
 */
import {
  NetworkError,
  ServerError,
  RateLimitError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  CardError,
  IdempotencyError,
  TimeoutError,
} from '../errors/categories.js';
import type { AuthManager } from '../auth/auth-manager.js';

/**
 * Request options for HTTP calls
 */
export interface HttpRequestOptions {
  timeout?: number;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  stripeAccount?: string;
  signal?: AbortSignal;
}

/**
 * HTTP transport interface
 */
export interface HttpTransport {
  /**
   * Makes a POST request (used for create operations)
   */
  post<T>(path: string, body?: Record<string, unknown>, options?: HttpRequestOptions): Promise<T>;

  /**
   * Makes a GET request (used for retrieve/list operations)
   */
  get<T>(path: string, params?: Record<string, unknown>, options?: HttpRequestOptions): Promise<T>;

  /**
   * Makes a DELETE request
   */
  delete<T>(path: string, options?: HttpRequestOptions): Promise<T>;
}

/**
 * Response from Stripe API error
 */
interface StripeApiError {
  error: {
    type: string;
    code?: string;
    message: string;
    param?: string;
    decline_code?: string;
  };
}

/**
 * Implementation of HttpTransport using Fetch API
 */
export class FetchHttpTransport implements HttpTransport {
  private readonly baseUrl: string;
  private readonly authManager: AuthManager;
  private readonly defaultTimeout: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    baseUrl: string,
    authManager: AuthManager,
    defaultTimeout: number,
    fetchImpl: typeof fetch = globalThis.fetch
  ) {
    this.baseUrl = baseUrl;
    this.authManager = authManager;
    this.defaultTimeout = defaultTimeout;
    this.fetchImpl = fetchImpl;
  }

  /**
   * Makes a POST request
   */
  async post<T>(
    path: string,
    body?: Record<string, unknown>,
    options?: HttpRequestOptions
  ): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  /**
   * Makes a GET request
   */
  async get<T>(
    path: string,
    params?: Record<string, unknown>,
    options?: HttpRequestOptions
  ): Promise<T> {
    const queryString = params ? this.buildQueryString(params) : '';
    const fullPath = queryString ? `${path}?${queryString}` : path;
    return this.request<T>('GET', fullPath, undefined, options);
  }

  /**
   * Makes a DELETE request
   */
  async delete<T>(path: string, options?: HttpRequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  /**
   * Core request implementation
   */
  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    options?: HttpRequestOptions
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const timeout = options?.timeout ?? this.defaultTimeout;
    const controller = new AbortController();
    const signal = options?.signal ?? controller.signal;

    // Set up timeout
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Build headers
      const headers = this.authManager.getHeadersWithAccount(options?.stripeAccount);

      // Add idempotency key if provided
      if (options?.idempotencyKey) {
        headers['Idempotency-Key'] = options.idempotencyKey;
      }

      // Add custom headers
      if (options?.headers) {
        Object.assign(headers, options.headers);
      }

      // Build request body as form-urlencoded (Stripe API requirement)
      const requestBody = body ? this.buildFormBody(body) : undefined;

      const response = await this.fetchImpl(url, {
        method,
        headers,
        body: requestBody,
        signal,
      });

      clearTimeout(timeoutId);

      // Extract request ID for error reporting
      const requestId = response.headers.get('request-id') ?? undefined;

      if (!response.ok) {
        await this.handleErrorResponse(response, requestId);
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new TimeoutError(`Request timeout after ${timeout}ms`, timeout);
        }

        // Re-throw Stripe errors
        if (error.name.endsWith('Error') && 'type' in error) {
          throw error;
        }

        // Network-level errors
        if (error.message.includes('fetch') || error.message.includes('network')) {
          throw new NetworkError('Network request failed', error);
        }
      }

      throw error;
    }
  }

  /**
   * Builds form-urlencoded body from object
   */
  private buildFormBody(data: Record<string, unknown>, prefix = ''): string {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      const fullKey = prefix ? `${prefix}[${key}]` : key;

      if (value === null || value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === 'object' && item !== null) {
            parts.push(this.buildFormBody(item as Record<string, unknown>, `${fullKey}[${index}]`));
          } else {
            parts.push(`${encodeURIComponent(`${fullKey}[${index}]`)}=${encodeURIComponent(String(item))}`);
          }
        });
      } else if (typeof value === 'object') {
        parts.push(this.buildFormBody(value as Record<string, unknown>, fullKey));
      } else {
        parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`);
      }
    }

    return parts.filter(Boolean).join('&');
  }

  /**
   * Builds query string from params
   */
  private buildQueryString(params: Record<string, unknown>): string {
    return this.buildFormBody(params);
  }

  /**
   * Handles error responses from the API
   */
  private async handleErrorResponse(response: Response, requestId?: string): Promise<never> {
    const status = response.status;
    let errorBody: StripeApiError | undefined;

    try {
      errorBody = await response.json() as StripeApiError;
    } catch {
      throw new ServerError(`HTTP ${status} error`, status, requestId);
    }

    if (!errorBody) {
      throw new ServerError(`HTTP ${status} error`, status, requestId);
    }

    const error = errorBody?.error;
    const errorMessage = error?.message ?? `HTTP ${status} error`;
    const errorType = error?.type;
    const errorCode = error?.code;
    const errorParam = error?.param;
    const declineCode = error?.decline_code;

    // Extract retry-after header if present
    const retryAfterHeader = response.headers.get('retry-after');
    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;

    switch (status) {
      case 400:
        throw new ValidationError(errorMessage, errorParam, status, { code: errorCode });

      case 401:
        throw new AuthenticationError(errorMessage, requestId, { code: errorCode });

      case 402:
        throw new CardError(
          errorMessage,
          errorCode ?? 'card_declined',
          declineCode,
          errorParam,
          requestId,
          { type: errorType }
        );

      case 404:
        throw new NotFoundError(errorMessage, undefined, undefined, requestId, { code: errorCode });

      case 409:
        throw new IdempotencyError(errorMessage, requestId, { code: errorCode });

      case 429:
        throw new RateLimitError(errorMessage, retryAfter, requestId, { code: errorCode });

      case 500:
      case 502:
      case 503:
      case 504:
        throw new ServerError(errorMessage, status, requestId, { code: errorCode });

      default:
        throw new ServerError(`Unexpected error: ${errorMessage}`, status, requestId, {
          type: errorType,
          code: errorCode,
        });
    }
  }
}

/**
 * Creates an HTTP transport instance
 */
export function createHttpTransport(
  baseUrl: string,
  authManager: AuthManager,
  defaultTimeout: number,
  fetchImpl?: typeof fetch
): HttpTransport {
  return new FetchHttpTransport(baseUrl, authManager, defaultTimeout, fetchImpl);
}
