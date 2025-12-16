/**
 * HTTP client utilities for Artifact Registry.
 * @module client/http
 */

import { ArtifactRegistryError, ArtifactRegistryErrorKind, type RegistryErrorResponse } from '../errors.js';

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
  /** Request body */
  body?: unknown;
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
 * HTTP methods.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

/**
 * Builds a URL with query parameters.
 */
export function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(normalizedPath, baseUrl);

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
 * Performs an HTTP request.
 */
export async function httpRequest<T>(
  method: HttpMethod,
  url: string,
  options: {
    headers?: Record<string, string>;
    body?: unknown;
    timeout?: number;
  } = {}
): Promise<HttpResponse<T>> {
  const { headers = {}, body, timeout = 30000 } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw await parseErrorResponse(response);
    }

    const data = await parseResponseBody<T>(response);

    return {
      status: response.status,
      headers: response.headers,
      data,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if ((error as Error).name === 'AbortError') {
      throw ArtifactRegistryError.timeout(`Request timeout after ${timeout}ms`);
    }

    if (error instanceof ArtifactRegistryError) {
      throw error;
    }

    throw new ArtifactRegistryError(
      ArtifactRegistryErrorKind.ConnectionFailed,
      `Request failed: ${(error as Error).message}`,
      { cause: error instanceof Error ? error : undefined }
    );
  }
}

/**
 * Parses the response body based on content type.
 */
async function parseResponseBody<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('Content-Type') || '';

  if (response.status === 204 || response.headers.get('Content-Length') === '0') {
    return undefined as T;
  }

  if (contentType.includes('application/json')) {
    return response.json() as Promise<T>;
  }

  const text = await response.text();
  return text as unknown as T;
}

/**
 * Parses an error response.
 */
async function parseErrorResponse(response: Response): Promise<ArtifactRegistryError> {
  const status = response.status;
  const requestId = response.headers.get('x-guploader-uploadid') || undefined;
  const retryAfter = response.headers.get('Retry-After');

  let message = `HTTP ${status}`;
  let errorBody: unknown;

  try {
    errorBody = await response.json();
    if (typeof errorBody === 'object' && errorBody !== null) {
      const body = errorBody as Record<string, unknown>;

      // GCP API error format
      if (body['error'] && typeof body['error'] === 'object') {
        const gcpError = body['error'] as { message?: string; code?: number };
        message = gcpError.message || message;
      }

      // Docker registry error format
      if (body['errors'] && Array.isArray(body['errors'])) {
        return ArtifactRegistryError.fromRegistryError(
          body['errors'] as RegistryErrorResponse[]
        );
      }

      // Simple message format
      if (typeof body['message'] === 'string') {
        message = body['message'];
      }
    }
  } catch {
    // Ignore JSON parse errors, use default message
  }

  return ArtifactRegistryError.fromHttpStatus(status, message, {
    requestId,
    retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
  });
}

/**
 * Performs a raw HTTP request without JSON parsing.
 */
export async function httpRequestRaw(
  method: HttpMethod,
  url: string,
  options: {
    headers?: Record<string, string>;
    body?: Uint8Array | string;
    timeout?: number;
  } = {}
): Promise<Response> {
  const { headers = {}, body, timeout = 30000 } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    if ((error as Error).name === 'AbortError') {
      throw ArtifactRegistryError.timeout(`Request timeout after ${timeout}ms`);
    }

    throw new ArtifactRegistryError(
      ArtifactRegistryErrorKind.ConnectionFailed,
      `Request failed: ${(error as Error).message}`,
      { cause: error instanceof Error ? error : undefined }
    );
  }
}
