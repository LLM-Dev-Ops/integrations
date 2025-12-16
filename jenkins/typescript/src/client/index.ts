/**
 * Jenkins HTTP Client
 *
 * Main client implementation for Jenkins REST API with support for:
 * - Basic authentication with API tokens
 * - CSRF/crumb handling with automatic refresh
 * - Retry with exponential backoff
 * - Comprehensive error handling
 *
 * @module client
 */

import type { JenkinsConfig } from '../types/config.js';
import { DEFAULT_RETRY_CONFIG, DEFAULT_CRUMB_CONFIG } from '../types/config.js';
import {
  JenkinsError,
  JenkinsErrorKind,
  isJenkinsError,
} from '../types/errors.js';
import { CrumbManager } from './crumb.js';
import { RetryExecutor } from './resilience.js';
import { fetch } from 'undici';

/**
 * HTTP method types.
 */
export type HttpMethod = 'GET' | 'POST' | 'DELETE';

/**
 * HTTP request options.
 */
export interface RequestOptions {
  /** Request headers */
  headers?: Record<string, string>;
  /** Query parameters */
  query?: Record<string, string | number | boolean | undefined>;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * HTTP response structure.
 */
export interface HttpResponse<T = unknown> {
  /** Response status code */
  status: number;
  /** Response headers */
  headers: Headers;
  /** Parsed response body */
  data: T;
}

/**
 * Main Jenkins API client.
 */
export class JenkinsClient {
  private readonly config: JenkinsConfig;
  private readonly baseUrl: string;
  private readonly retryExecutor: RetryExecutor;
  private readonly crumbManager: CrumbManager;
  private readonly userAgent: string;

  constructor(config: JenkinsConfig) {
    this.config = { ...config };
    this.baseUrl = this.normalizeBaseUrl(config.baseUrl);
    this.userAgent = config.userAgent || 'jenkins-integration-ts/1.0.0';

    // Initialize retry executor
    const retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...config.retryConfig,
      maxRetries: config.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries,
    };
    this.retryExecutor = new RetryExecutor(retryConfig);

    // Initialize crumb manager
    const crumbConfig = {
      ...DEFAULT_CRUMB_CONFIG,
      ...config.crumbConfig,
    };
    this.crumbManager = new CrumbManager(
      this.baseUrl,
      () => this.getAuthHeader(),
      crumbConfig.enabled,
      crumbConfig.ttlMs
    );
  }

  /**
   * Make a GET request.
   */
  async get<T = unknown>(
    path: string,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.request<T>('GET', path, undefined, options);
  }

  /**
   * Make a POST request.
   */
  async post<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  /**
   * Make a POST request with form data.
   * Used for triggering builds with parameters.
   */
  async postForm(
    path: string,
    formData: Record<string, string>,
    options?: RequestOptions
  ): Promise<HttpResponse<void>> {
    const urlParams = new URLSearchParams(formData);
    const headers = {
      ...options?.headers,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    return this.request<void>('POST', path, urlParams.toString(), {
      ...options,
      headers,
    });
  }

  /**
   * Make a DELETE request.
   */
  async delete(
    path: string,
    options?: RequestOptions
  ): Promise<HttpResponse<void>> {
    return this.request<void>('DELETE', path, undefined, options);
  }

  /**
   * Core HTTP request method with crumb handling and retry.
   */
  private async request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    // Build full URL
    const url = this.buildUrl(path, options?.query);

    // Execute request with retry logic
    return this.retryExecutor.execute(async () => {
      return this.performRequest<T>(method, url, body, options);
    });
  }

  /**
   * Perform the actual HTTP request with crumb handling.
   */
  private async performRequest<T>(
    method: HttpMethod,
    url: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    const requestTimeout = options?.timeout ?? this.config.timeout ?? 30000;

    // Build headers
    const headers = await this.buildHeaders(method, options?.headers);

    // Setup abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: this.buildBody(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle 403 - might be expired crumb
      if (response.status === 403 && this.needsCrumb(method)) {
        const autoRetry =
          this.config.crumbConfig?.autoRetryOnExpired ??
          DEFAULT_CRUMB_CONFIG.autoRetryOnExpired;

        if (autoRetry) {
          // Invalidate crumb and retry once
          this.crumbManager.invalidate();
          return this.performRequestWithFreshCrumb<T>(
            method,
            url,
            body,
            options
          );
        }
      }

      // Handle error responses
      if (!response.ok) {
        throw await this.parseErrorResponse(response as Response);
      }

      // Parse response body
      const data = await this.parseResponseBody<T>(response as Response);

      return {
        status: response.status,
        headers: response.headers,
        data,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        throw JenkinsError.timeout(`Request timeout after ${requestTimeout}ms`);
      }
      throw this.handleError(error);
    }
  }

  /**
   * Retry request with fresh crumb (for 403 errors).
   */
  private async performRequestWithFreshCrumb<T>(
    method: HttpMethod,
    url: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    const requestTimeout = options?.timeout ?? this.config.timeout ?? 30000;

    // Build headers with fresh crumb
    const headers = await this.buildHeaders(method, options?.headers);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: this.buildBody(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw await this.parseErrorResponse(response as Response);
      }

      const data = await this.parseResponseBody<T>(response as Response);

      return {
        status: response.status,
        headers: response.headers,
        data,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        throw JenkinsError.timeout(`Request timeout after ${requestTimeout}ms`);
      }
      throw this.handleError(error);
    }
  }

  /**
   * Build full URL with query parameters.
   */
  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): string {
    // Ensure path starts with /
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(normalizedPath, this.baseUrl);

    // Add query parameters
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  /**
   * Build request headers with authentication and crumb.
   */
  private async buildHeaders(
    method: HttpMethod,
    customHeaders?: Record<string, string>
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': this.userAgent,
      ...customHeaders,
    };

    // Add authentication header
    const authHeader = await this.getAuthHeader();
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    // Add crumb header for POST and DELETE requests
    if (this.needsCrumb(method)) {
      const crumb = await this.crumbManager.getOrFetch();
      if (crumb) {
        headers[crumb.field] = crumb.value;
      }
    }

    return headers;
  }

  /**
   * Build request body based on content type.
   */
  private buildBody(body: unknown): string | undefined {
    if (!body) {
      return undefined;
    }

    if (typeof body === 'string') {
      return body;
    }

    // Default to JSON for objects
    return JSON.stringify(body);
  }

  /**
   * Get authentication header value.
   */
  private async getAuthHeader(): Promise<string | null> {
    try {
      const credentials = await this.config.credentialProvider.getCredentials();
      const encoded = Buffer.from(
        `${credentials.username}:${credentials.token}`
      ).toString('base64');
      return `Basic ${encoded}`;
    } catch (error) {
      throw JenkinsError.authentication(
        `Failed to get credentials: ${(error as Error).message}`
      );
    }
  }

  /**
   * Check if request method needs a crumb.
   */
  private needsCrumb(method: HttpMethod): boolean {
    return method === 'POST' || method === 'DELETE';
  }

  /**
   * Parse response body based on content type.
   */
  private async parseResponseBody<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('Content-Type') || '';

    // Handle empty responses
    if (
      response.status === 204 ||
      response.headers.get('Content-Length') === '0'
    ) {
      return undefined as T;
    }

    // Parse JSON responses
    if (
      contentType.includes('application/json') ||
      contentType.includes('application/xml')
    ) {
      try {
        return await response.json() as T;
      } catch (error) {
        throw JenkinsError.deserialization(
          `Failed to parse JSON response: ${(error as Error).message}`
        );
      }
    }

    // Return text for other content types
    const text = await response.text();
    return text as T;
  }

  /**
   * Parse error response from Jenkins API.
   */
  private async parseErrorResponse(response: Response): Promise<JenkinsError> {
    const status = response.status;
    let errorBody: any;

    try {
      errorBody = await response.json();
    } catch {
      try {
        errorBody = { message: await response.text() };
      } catch {
        errorBody = { message: response.statusText };
      }
    }

    const message = errorBody.message || `HTTP ${status} error`;

    // Map status codes to specific error types
    switch (status) {
      case 400:
        return new JenkinsError(
          JenkinsErrorKind.ValidationError,
          message,
          { statusCode: status }
        );

      case 401:
        return JenkinsError.authentication(message).withStatus(status);

      case 403:
        // Could be expired crumb or authorization issue
        if (message.toLowerCase().includes('crumb')) {
          return new JenkinsError(
            JenkinsErrorKind.CrumbExpired,
            message,
            { statusCode: status }
          );
        }
        return new JenkinsError(
          JenkinsErrorKind.Forbidden,
          message,
          { statusCode: status }
        );

      case 404:
        return JenkinsError.notFound(message);

      case 409:
        return new JenkinsError(
          JenkinsErrorKind.Conflict,
          message,
          { statusCode: status }
        );

      case 500:
      case 502:
      case 503:
      case 504:
        return JenkinsError.fromResponse(status, message);

      default:
        return JenkinsError.fromResponse(status, message);
    }
  }

  /**
   * Handle errors from the request execution.
   */
  private handleError(error: unknown): JenkinsError {
    if (isJenkinsError(error)) {
      return error;
    }

    if (error instanceof Error) {
      // Network errors
      if (
        error.message.includes('fetch') ||
        error.message.includes('network')
      ) {
        return new JenkinsError(
          JenkinsErrorKind.NetworkError,
          error.message,
          { cause: error }
        );
      }

      return new JenkinsError(
        JenkinsErrorKind.Unknown,
        error.message,
        { cause: error }
      );
    }

    return new JenkinsError(
      JenkinsErrorKind.Unknown,
      'Unknown error occurred'
    );
  }

  /**
   * Normalize base URL by removing trailing slashes.
   */
  private normalizeBaseUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }

  /**
   * Get the client configuration.
   */
  getConfig(): Readonly<JenkinsConfig> {
    return { ...this.config };
  }
}

/**
 * Create a new Jenkins client instance.
 *
 * @param config - Client configuration
 * @returns JenkinsClient instance
 */
export function createClient(config: JenkinsConfig): JenkinsClient {
  return new JenkinsClient(config);
}

/**
 * Create a Jenkins client from environment variables.
 *
 * Environment variables:
 * - JENKINS_URL or JENKINS_BASE_URL: Jenkins base URL
 * - JENKINS_USERNAME or JENKINS_USER: Username
 * - JENKINS_TOKEN or JENKINS_API_TOKEN: API token
 * - JENKINS_TIMEOUT: Request timeout in milliseconds (optional)
 * - JENKINS_MAX_RETRIES: Maximum retry attempts (optional)
 *
 * @returns JenkinsClient instance
 * @throws JenkinsError if required environment variables are missing
 */
export function createClientFromEnv(): JenkinsClient {
  const baseUrl = process.env.JENKINS_URL || process.env.JENKINS_BASE_URL;

  if (!baseUrl) {
    throw JenkinsError.configuration(
      'Jenkins base URL not found in environment variables (JENKINS_URL or JENKINS_BASE_URL)'
    );
  }

  // Import credential provider
  const { EnvCredentialProvider } = require('../types/config.js');
  const credentialProvider = new EnvCredentialProvider();

  const config: JenkinsConfig = {
    baseUrl,
    credentialProvider,
    timeout: process.env.JENKINS_TIMEOUT
      ? parseInt(process.env.JENKINS_TIMEOUT, 10)
      : undefined,
    maxRetries: process.env.JENKINS_MAX_RETRIES
      ? parseInt(process.env.JENKINS_MAX_RETRIES, 10)
      : undefined,
  };

  return createClient(config);
}

// Re-export types and utilities
export type { JenkinsConfig };
export { JenkinsError, JenkinsErrorKind, isJenkinsError } from '../types/errors.js';
export {
  StaticCredentialProvider,
  EnvCredentialProvider,
  type CredentialProvider,
  type BasicAuthCredentials,
} from '../types/config.js';
