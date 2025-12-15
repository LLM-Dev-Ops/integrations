/**
 * Request Builder
 *
 * Constructs HTTP requests for xAI API.
 *
 * @module infra/request-builder
 */

import type { GrokConfig } from '../config.js';
import type { AuthHeader } from '../auth/provider.js';

/**
 * HTTP request options.
 */
export interface RequestOptions {
  /** HTTP method */
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';

  /** Request path */
  readonly path: string;

  /** Request body */
  readonly body?: unknown;

  /** Whether this is a streaming request */
  readonly stream?: boolean;

  /** Additional headers */
  readonly headers?: Record<string, string>;

  /** Request timeout override */
  readonly timeout?: number;
}

/**
 * Built HTTP request.
 */
export interface BuiltRequest {
  /** Full URL */
  readonly url: string;

  /** Request init for fetch */
  readonly init: RequestInit;

  /** Timeout in milliseconds */
  readonly timeout: number;
}

/**
 * Build user agent string.
 *
 * @param config - Grok configuration
 * @returns User agent string
 */
export function buildUserAgent(config: GrokConfig): string {
  const baseAgent = 'xai-grok-typescript/0.1.0';
  return config.userAgent ? `${baseAgent} ${config.userAgent}` : baseAgent;
}

/**
 * Build an HTTP request.
 *
 * @param config - Grok configuration
 * @param authHeader - Authentication header
 * @param options - Request options
 * @returns Built request
 */
export function buildRequest(
  config: GrokConfig,
  authHeader: AuthHeader,
  options: RequestOptions
): BuiltRequest {
  const url = `${config.baseUrl}${options.path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': buildUserAgent(config),
    [authHeader.name]: authHeader.value,
    ...options.headers,
  };

  if (options.stream) {
    headers['Accept'] = 'text/event-stream';
  }

  const init: RequestInit = {
    method: options.method,
    headers,
  };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  return {
    url,
    init,
    timeout: options.timeout ?? config.timeout,
  };
}
