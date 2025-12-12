/**
 * SES HTTP Client
 *
 * Provides a high-level HTTP client for AWS SES v2 REST API.
 * Handles request signing, error mapping, and response parsing.
 *
 * @module http/client
 */

import type { HttpRequest, HttpResponse, HttpMethod } from './types.js';
import { Transport, FetchTransport } from './transport.js';
import { SesConfig, resolveEndpoint, buildUserAgent } from '../config/index.js';
import { signRequest, type AwsCredentials, type SignedRequest } from '../signing/index.js';
import { mapAwsError, mapHttpError, transportError, type SesError } from '../error/index.js';

/**
 * SES HTTP Client for making authenticated API requests.
 *
 * This client handles:
 * - AWS Signature V4 request signing
 * - JSON request/response serialization
 * - Error parsing and mapping
 * - Request headers management
 *
 * @example
 * ```typescript
 * const client = new SesHttpClient(config, transport, credentials);
 *
 * // POST request
 * const response = await client.post<SendEmailResponse>(
 *   '/v2/email/outbound-emails',
 *   { FromEmailAddress: 'sender@example.com', ... }
 * );
 *
 * // GET request
 * const identity = await client.get<GetEmailIdentityResponse>(
 *   '/v2/email/identities/example.com'
 * );
 * ```
 */
export class SesHttpClient {
  private readonly config: SesConfig;
  private readonly transport: Transport;
  private credentials: AwsCredentials;
  private readonly baseUrl: string;
  private readonly userAgent: string;

  /**
   * Create a new SES HTTP client.
   *
   * @param config - SES configuration
   * @param transport - HTTP transport implementation
   * @param credentials - AWS credentials for signing
   */
  constructor(config: SesConfig, transport: Transport, credentials: AwsCredentials) {
    this.config = config;
    this.transport = transport;
    this.credentials = credentials;
    this.baseUrl = resolveEndpoint(config);
    this.userAgent = buildUserAgent(config);
  }

  /**
   * Update credentials (e.g., after refresh).
   *
   * @param credentials - New AWS credentials
   */
  updateCredentials(credentials: AwsCredentials): void {
    this.credentials = credentials;
  }

  /**
   * Make a POST request.
   *
   * @template T - Response type
   * @param path - API path (e.g., '/v2/email/outbound-emails')
   * @param body - Request body object
   * @returns Promise resolving to the response
   */
  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  /**
   * Make a GET request.
   *
   * @template T - Response type
   * @param path - API path
   * @param query - Query parameters
   * @returns Promise resolving to the response
   */
  async get<T>(path: string, query?: Record<string, string>): Promise<T> {
    let url = path;
    if (query && Object.keys(query).length > 0) {
      const params = new URLSearchParams(query);
      url = `${path}?${params.toString()}`;
    }
    return this.request<T>('GET', url);
  }

  /**
   * Make a PUT request.
   *
   * @template T - Response type
   * @param path - API path
   * @param body - Request body object
   * @returns Promise resolving to the response
   */
  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  /**
   * Make a DELETE request.
   *
   * @param path - API path
   * @returns Promise resolving when delete completes
   */
  async delete(path: string): Promise<void> {
    await this.request<void>('DELETE', path);
  }

  /**
   * Make a PATCH request.
   *
   * @template T - Response type
   * @param path - API path
   * @param body - Request body object
   * @returns Promise resolving to the response
   */
  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  /**
   * Make an HTTP request to the SES API.
   *
   * @template T - Response type
   * @param method - HTTP method
   * @param path - API path
   * @param body - Optional request body
   * @returns Promise resolving to the parsed response
   * @throws {SesError} On API or network errors
   */
  private async request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);

    // Prepare headers
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': this.userAgent,
      'host': url.host,
    };

    // Serialize body
    let bodyString: string | undefined;
    if (body !== undefined) {
      bodyString = JSON.stringify(body);
      headers['content-length'] = String(Buffer.byteLength(bodyString, 'utf8'));
    }

    // Create a Request object for signing
    const request = new Request(url.toString(), {
      method,
      headers,
      body: bodyString,
    });

    // Sign the request
    let signedResult: SignedRequest;
    try {
      signedResult = await signRequest(request, {
        region: this.config.region,
        service: 'ses',
        credentials: this.credentials,
      });
    } catch (error) {
      throw transportError(`Failed to sign request: ${error}`);
    }

    // Convert SignedRequest to HttpRequest format
    const httpRequest: HttpRequest = {
      method,
      url: signedResult.url,
      headers: signedResult.headers,
      body: signedResult.body,
    };

    // Send the request
    let response: HttpResponse;
    try {
      response = await this.transport.send(httpRequest);
    } catch (error) {
      if (error instanceof Error) {
        throw transportError(error.message, true);
      }
      throw transportError(String(error), true);
    }

    // Extract request ID from headers
    const requestId = response.headers['x-amzn-requestid'] || response.headers['x-amz-request-id'];

    // Handle error responses
    if (response.status >= 400) {
      throw mapHttpError(response.status, response.body, requestId);
    }

    // Handle empty responses (e.g., DELETE operations)
    if (!response.body || response.body.trim() === '') {
      return {} as T;
    }

    // Parse JSON response
    try {
      return JSON.parse(response.body) as T;
    } catch (error) {
      throw transportError(`Failed to parse response: ${error}`, false);
    }
  }
}

/**
 * Create a default SES HTTP client.
 *
 * @param config - SES configuration
 * @param credentials - AWS credentials
 * @returns New SES HTTP client instance
 */
export function createSesHttpClient(
  config: SesConfig,
  credentials: AwsCredentials
): SesHttpClient {
  const transport = new FetchTransport({
    timeout: config.timeout,
    connectTimeout: config.connectTimeout,
  });

  return new SesHttpClient(config, transport, credentials);
}
