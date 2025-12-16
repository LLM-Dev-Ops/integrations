/**
 * Request and Response Interceptors
 *
 * Implements the chain of responsibility pattern for intercepting and modifying
 * HTTP requests and responses.
 * @module @llmdevops/weaviate-integration/transport/interceptors
 */

import type { HttpRequest, HttpResponse } from './types';
import type { AuthProvider } from '../auth/types';

// ============================================================================
// Interceptor Interfaces
// ============================================================================

/**
 * Request interceptor interface.
 *
 * Interceptors can modify requests before they are sent.
 */
export interface RequestInterceptor {
  /**
   * Intercept and potentially modify a request.
   *
   * @param request - Original request
   * @returns Modified request (or original if no changes)
   */
  intercept(request: HttpRequest): Promise<HttpRequest> | HttpRequest;
}

/**
 * Response interceptor interface.
 *
 * Interceptors can modify responses after they are received.
 */
export interface ResponseInterceptor {
  /**
   * Intercept and potentially modify a response.
   *
   * @param response - Original response
   * @returns Modified response (or original if no changes)
   */
  intercept<T>(response: HttpResponse<T>): Promise<HttpResponse<T>> | HttpResponse<T>;
}

// ============================================================================
// Built-in Request Interceptors
// ============================================================================

/**
 * Logging request interceptor.
 *
 * Logs all outgoing requests for debugging purposes.
 */
export class LoggingRequestInterceptor implements RequestInterceptor {
  private readonly logger: (message: string, data: unknown) => void;
  private readonly logHeaders: boolean;
  private readonly logBody: boolean;

  constructor(options?: {
    logger?: (message: string, data: unknown) => void;
    logHeaders?: boolean;
    logBody?: boolean;
  }) {
    this.logger = options?.logger ?? ((msg, data) => console.log(msg, data));
    this.logHeaders = options?.logHeaders ?? true;
    this.logBody = options?.logBody ?? false;
  }

  intercept(request: HttpRequest): HttpRequest {
    const logData: Record<string, unknown> = {
      method: request.method,
      path: request.path,
    };

    if (request.query && Object.keys(request.query).length > 0) {
      logData.query = request.query;
    }

    if (this.logHeaders && request.headers) {
      logData.headers = this.sanitizeHeaders(request.headers);
    }

    if (this.logBody && request.body) {
      logData.body = request.body;
    }

    this.logger('[Request]', logData);

    return request;
  }

  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized = { ...headers };
    const sensitiveKeys = ['authorization', 'x-api-key', 'cookie'];

    for (const key of sensitiveKeys) {
      const lowerKey = key.toLowerCase();
      if (sanitized[lowerKey]) {
        sanitized[lowerKey] = '***REDACTED***';
      }
    }

    return sanitized;
  }
}

/**
 * User-Agent header injection interceptor.
 *
 * Adds or modifies the User-Agent header for all requests.
 */
export class UserAgentInterceptor implements RequestInterceptor {
  constructor(private readonly userAgent: string) {}

  intercept(request: HttpRequest): HttpRequest {
    return {
      ...request,
      headers: {
        ...request.headers,
        'User-Agent': this.userAgent,
      },
    };
  }
}

/**
 * Auth token refresh interceptor.
 *
 * Refreshes authentication tokens before sending requests if they are expired.
 */
export class AuthRefreshInterceptor implements RequestInterceptor {
  constructor(private readonly authProvider: AuthProvider) {}

  async intercept(request: HttpRequest): Promise<HttpRequest> {
    // Check if auth provider supports refresh and token is expired
    if (this.authProvider.refresh && this.authProvider.isExpired()) {
      await this.authProvider.refresh();
    }

    // Get fresh auth headers
    const authHeaders = await this.authProvider.getAuthHeaders();

    return {
      ...request,
      headers: {
        ...request.headers,
        ...authHeaders,
      },
    };
  }
}

/**
 * Request timeout interceptor.
 *
 * Sets a default timeout for all requests if not specified.
 */
export class TimeoutInterceptor implements RequestInterceptor {
  constructor(private readonly defaultTimeout: number) {}

  intercept(request: HttpRequest): HttpRequest {
    if (request.timeout === undefined) {
      return {
        ...request,
        timeout: this.defaultTimeout,
      };
    }
    return request;
  }
}

/**
 * Custom headers interceptor.
 *
 * Adds custom headers to all requests.
 */
export class CustomHeadersInterceptor implements RequestInterceptor {
  constructor(private readonly headers: Record<string, string>) {}

  intercept(request: HttpRequest): HttpRequest {
    return {
      ...request,
      headers: {
        ...this.headers,
        ...request.headers, // Request headers take precedence
      },
    };
  }
}

// ============================================================================
// Built-in Response Interceptors
// ============================================================================

/**
 * Logging response interceptor.
 *
 * Logs all incoming responses for debugging purposes.
 */
export class LoggingResponseInterceptor implements ResponseInterceptor {
  private readonly logger: (message: string, data: unknown) => void;
  private readonly logHeaders: boolean;
  private readonly logBody: boolean;

  constructor(options?: {
    logger?: (message: string, data: unknown) => void;
    logHeaders?: boolean;
    logBody?: boolean;
  }) {
    this.logger = options?.logger ?? ((msg, data) => console.log(msg, data));
    this.logHeaders = options?.logHeaders ?? true;
    this.logBody = options?.logBody ?? false;
  }

  intercept<T>(response: HttpResponse<T>): HttpResponse<T> {
    const logData: Record<string, unknown> = {
      status: response.status,
    };

    if (this.logHeaders && response.headers) {
      const headersObj: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headersObj[key] = value;
      });
      logData.headers = headersObj;
    }

    if (this.logBody && response.body) {
      logData.body = response.body;
    }

    this.logger('[Response]', logData);

    return response;
  }
}

/**
 * Retry-After header parser interceptor.
 *
 * Parses Retry-After headers from 429 and 503 responses.
 */
export class RetryAfterInterceptor implements ResponseInterceptor {
  private retryAfterSeconds?: number;

  intercept<T>(response: HttpResponse<T>): HttpResponse<T> {
    // Parse Retry-After header for rate limit and service unavailable responses
    if (response.status === 429 || response.status === 503) {
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) {
        // Retry-After can be either seconds or HTTP date
        const seconds = parseInt(retryAfter, 10);
        if (!isNaN(seconds)) {
          this.retryAfterSeconds = seconds;
        } else {
          // Parse as HTTP date
          const retryDate = new Date(retryAfter);
          if (!isNaN(retryDate.getTime())) {
            this.retryAfterSeconds = Math.ceil((retryDate.getTime() - Date.now()) / 1000);
          }
        }
      }
    }

    return response;
  }

  /**
   * Get the last parsed retry-after value in seconds.
   *
   * @returns Retry-after value in seconds, or undefined if not available
   */
  getRetryAfterSeconds(): number | undefined {
    return this.retryAfterSeconds;
  }

  /**
   * Clear the stored retry-after value.
   */
  clearRetryAfter(): void {
    this.retryAfterSeconds = undefined;
  }
}

/**
 * Response time tracking interceptor.
 *
 * Tracks response times for performance monitoring.
 */
export class ResponseTimeInterceptor implements ResponseInterceptor {
  private readonly onResponseTime?: (duration: number, status: number) => void;
  private requestStartTime: number = 0;

  constructor(onResponseTime?: (duration: number, status: number) => void) {
    this.onResponseTime = onResponseTime;
  }

  /**
   * Mark the start of a request.
   * Call this before sending the request.
   */
  markRequestStart(): void {
    this.requestStartTime = Date.now();
  }

  intercept<T>(response: HttpResponse<T>): HttpResponse<T> {
    if (this.requestStartTime > 0) {
      const duration = Date.now() - this.requestStartTime;
      if (this.onResponseTime) {
        this.onResponseTime(duration, response.status);
      }
      this.requestStartTime = 0; // Reset for next request
    }

    return response;
  }
}

/**
 * Cache control interceptor.
 *
 * Adds cache-related headers to responses based on Cache-Control header.
 */
export class CacheControlInterceptor implements ResponseInterceptor {
  intercept<T>(response: HttpResponse<T>): HttpResponse<T> {
    const cacheControl = response.headers.get('cache-control');

    if (cacheControl) {
      // Parse Cache-Control directives
      const directives = this.parseCacheControl(cacheControl);

      // Add parsed directives to response metadata
      return {
        ...response,
        body: response.body,
        // Could add cache metadata here if needed
      };
    }

    return response;
  }

  private parseCacheControl(header: string): Record<string, string | boolean> {
    const directives: Record<string, string | boolean> = {};

    for (const directive of header.split(',')) {
      const [key, value] = directive.trim().split('=');
      directives[key] = value ?? true;
    }

    return directives;
  }
}

// ============================================================================
// Interceptor Chain
// ============================================================================

/**
 * Interceptor chain for composing multiple interceptors.
 */
export class InterceptorChain<T extends RequestInterceptor | ResponseInterceptor> {
  private interceptors: T[] = [];

  /**
   * Add an interceptor to the chain.
   *
   * @param interceptor - Interceptor to add
   */
  add(interceptor: T): this {
    this.interceptors.push(interceptor);
    return this;
  }

  /**
   * Remove an interceptor from the chain.
   *
   * @param interceptor - Interceptor to remove
   */
  remove(interceptor: T): this {
    const index = this.interceptors.indexOf(interceptor);
    if (index !== -1) {
      this.interceptors.splice(index, 1);
    }
    return this;
  }

  /**
   * Clear all interceptors from the chain.
   */
  clear(): void {
    this.interceptors = [];
  }

  /**
   * Get all interceptors in the chain.
   *
   * @returns Array of interceptors
   */
  getAll(): T[] {
    return [...this.interceptors];
  }

  /**
   * Get the number of interceptors in the chain.
   *
   * @returns Number of interceptors
   */
  size(): number {
    return this.interceptors.length;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a logging request interceptor.
 *
 * @param options - Logging options
 * @returns LoggingRequestInterceptor instance
 */
export function createLoggingRequestInterceptor(options?: {
  logger?: (message: string, data: unknown) => void;
  logHeaders?: boolean;
  logBody?: boolean;
}): LoggingRequestInterceptor {
  return new LoggingRequestInterceptor(options);
}

/**
 * Create a logging response interceptor.
 *
 * @param options - Logging options
 * @returns LoggingResponseInterceptor instance
 */
export function createLoggingResponseInterceptor(options?: {
  logger?: (message: string, data: unknown) => void;
  logHeaders?: boolean;
  logBody?: boolean;
}): LoggingResponseInterceptor {
  return new LoggingResponseInterceptor(options);
}

/**
 * Create a user agent interceptor.
 *
 * @param userAgent - User agent string
 * @returns UserAgentInterceptor instance
 */
export function createUserAgentInterceptor(userAgent: string): UserAgentInterceptor {
  return new UserAgentInterceptor(userAgent);
}

/**
 * Create an auth refresh interceptor.
 *
 * @param authProvider - Auth provider instance
 * @returns AuthRefreshInterceptor instance
 */
export function createAuthRefreshInterceptor(
  authProvider: AuthProvider
): AuthRefreshInterceptor {
  return new AuthRefreshInterceptor(authProvider);
}
