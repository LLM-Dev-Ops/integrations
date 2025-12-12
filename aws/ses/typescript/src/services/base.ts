/**
 * Base Service Class
 *
 * Abstract base class for all SES service implementations.
 * Provides common HTTP methods that wrap the SES HTTP client.
 *
 * @module services/base
 */

import type { SesHttpClient } from '../http/client.js';

/**
 * Base service class for SES operations.
 *
 * All SES service classes extend this base class to inherit
 * common HTTP request methods.
 *
 * @example
 * ```typescript
 * class EmailService extends BaseService {
 *   async sendEmail(request: SendEmailRequest): Promise<SendEmailResponse> {
 *     return this.post<SendEmailResponse>('/v2/email/outbound-emails', request);
 *   }
 * }
 * ```
 */
export abstract class BaseService {
  /**
   * SES HTTP client for making API requests.
   */
  protected readonly client: SesHttpClient;

  /**
   * Create a new service instance.
   *
   * @param client - SES HTTP client
   */
  constructor(client: SesHttpClient) {
    this.client = client;
  }

  /**
   * Make a POST request.
   *
   * @template T - Response type
   * @param path - API path
   * @param body - Request body
   * @returns Promise resolving to the response
   * @protected
   */
  protected async post<T>(path: string, body?: unknown): Promise<T> {
    return this.client.post<T>(path, body);
  }

  /**
   * Make a GET request.
   *
   * @template T - Response type
   * @param path - API path
   * @param query - Query parameters
   * @returns Promise resolving to the response
   * @protected
   */
  protected async get<T>(path: string, query?: Record<string, string>): Promise<T> {
    return this.client.get<T>(path, query);
  }

  /**
   * Make a PUT request.
   *
   * @template T - Response type
   * @param path - API path
   * @param body - Request body
   * @returns Promise resolving to the response
   * @protected
   */
  protected async put<T>(path: string, body?: unknown): Promise<T> {
    return this.client.put<T>(path, body);
  }

  /**
   * Make a DELETE request.
   *
   * @param path - API path
   * @returns Promise resolving when delete completes
   * @protected
   */
  protected async delete(path: string): Promise<void> {
    return this.client.delete(path);
  }

  /**
   * Make a PATCH request.
   *
   * @template T - Response type
   * @param path - API path
   * @param body - Request body
   * @returns Promise resolving to the response
   * @protected
   */
  protected async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.client.patch<T>(path, body);
  }

  /**
   * Build a query string from parameters.
   *
   * Filters out undefined values and properly encodes parameters.
   *
   * @param params - Query parameters
   * @returns Query parameter object with undefined values removed
   * @protected
   */
  protected buildQuery(params: Record<string, string | number | boolean | undefined>): Record<string, string> {
    const query: Record<string, string> = {};

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        query[key] = String(value);
      }
    }

    return query;
  }
}
