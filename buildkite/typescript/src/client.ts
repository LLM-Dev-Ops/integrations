/**
 * Buildkite API Client
 * @module client
 */

import type { BuildkiteConfig } from './config.js';
import { resolveConfig } from './config.js';
import { BuildkiteError, BuildkiteErrorKind } from './errors.js';
import { parseLinkHeader, createPage, type Page, type PaginationParams } from './pagination.js';
import { ResilienceOrchestrator } from './resilience.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  timeout?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Headers;
  data: T;
}

export interface BuildkiteClient {
  get<T = unknown>(path: string, options?: RequestOptions): Promise<HttpResponse<T>>;
  post<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse<T>>;
  put<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse<T>>;
  delete<T = unknown>(path: string, options?: RequestOptions): Promise<HttpResponse<T>>;
  getPaginated<T = unknown>(path: string, params?: PaginationParams, options?: RequestOptions): Promise<Page<T>>;
  getOrganizationSlug(): string;
  getConfig(): BuildkiteConfig;
}

export class BuildkiteClientImpl implements BuildkiteClient {
  private readonly config: ReturnType<typeof resolveConfig>;
  private readonly orchestrator: ResilienceOrchestrator;
  private readonly baseUrl: string;

  constructor(config: BuildkiteConfig) {
    this.config = resolveConfig(config);
    this.baseUrl = this.config.baseUrl;
    this.orchestrator = new ResilienceOrchestrator({
      maxAttempts: this.config.retry.maxAttempts,
      initialDelayMs: this.config.retry.initialDelayMs,
      maxDelayMs: this.config.retry.maxDelayMs,
      multiplier: this.config.retry.multiplier,
      jitter: this.config.retry.jitter,
      circuitBreaker: {
        enabled: this.config.circuitBreaker.enabled,
        threshold: this.config.circuitBreaker.threshold,
        resetTimeoutMs: this.config.circuitBreaker.resetTimeoutMs,
      },
    });
  }

  async get<T = unknown>(path: string, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  async put<T = unknown>(path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('PUT', path, body, options);
  }

  async delete<T = unknown>(path: string, options?: RequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  async getPaginated<T = unknown>(path: string, params?: PaginationParams, options?: RequestOptions): Promise<Page<T>> {
    const queryParams = {
      ...options?.query,
      per_page: params?.perPage?.toString(),
      page: params?.page?.toString(),
    };
    const response = await this.request<T[]>('GET', path, undefined, { ...options, query: queryParams });
    const linkHeader = response.headers.get('Link');
    const links = linkHeader ? parseLinkHeader(linkHeader) : {};
    return createPage(response.data, links, (url: string) => this.fetchPageByUrl<T>(url));
  }

  getOrganizationSlug(): string {
    return this.config.organizationSlug;
  }

  getConfig(): BuildkiteConfig {
    return this.config;
  }

  private async request<T>(method: HttpMethod, path: string, body?: unknown, options?: RequestOptions): Promise<HttpResponse<T>> {
    const url = this.buildUrl(path, options?.query);
    const headers = this.buildHeaders(options?.headers);

    try {
      const response = await this.orchestrator.execute(async () => {
        return this.performRequest<T>(method, url, headers, body, options?.timeout);
      });
      return response;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private async performRequest<T>(method: HttpMethod, url: string, headers: Record<string, string>, body?: unknown, timeout?: number): Promise<HttpResponse<T>> {
    const requestTimeout = timeout ?? this.config.timeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      this.updateRateLimitInfo(response.headers);

      if (!response.ok) {
        throw await this.parseErrorResponse(response);
      }

      const data = await this.parseResponseBody<T>(response);
      return { status: response.status, headers: response.headers, data };
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        throw BuildkiteError.timeout(`Request timeout after ${requestTimeout}ms`);
      }
      throw error;
    }
  }

  private buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(normalizedPath, this.baseUrl);
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) url.searchParams.append(key, String(value));
      });
    }
    return url.toString();
  }

  private buildHeaders(customHeaders?: Record<string, string>): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.auth.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': this.config.userAgent,
      ...customHeaders,
    };
  }

  private updateRateLimitInfo(headers: Headers): void {
    const limit = headers.get('RateLimit-Limit');
    const remaining = headers.get('RateLimit-Remaining');
    const reset = headers.get('RateLimit-Reset');
    if (limit && remaining && reset) {
      const resetTimestamp = parseInt(reset, 10);
      this.orchestrator.updateRateLimitInfo({
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        resetAt: new Date(resetTimestamp * 1000), // Convert Unix timestamp to Date
      });
    }
  }

  private async parseResponseBody<T>(response: Response): Promise<T> {
    if (response.status === 204 || response.headers.get('Content-Length') === '0') {
      return undefined as T;
    }
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      return (await response.json()) as T;
    }
    return await response.text() as T;
  }

  private async parseErrorResponse(response: Response): Promise<BuildkiteError> {
    let errorBody: any;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = { message: await response.text() };
    }
    const message = errorBody.message || `HTTP ${response.status} error`;
    return BuildkiteError.fromResponse(response.status, message, errorBody);
  }

  private handleError(error: unknown): BuildkiteError {
    if (error instanceof BuildkiteError) return error;
    if (error instanceof Error) {
      return new BuildkiteError(BuildkiteErrorKind.Unknown, error.message, { cause: error });
    }
    return new BuildkiteError(BuildkiteErrorKind.Unknown, 'Unknown error occurred');
  }

  private async fetchPageByUrl<T>(url: string): Promise<Page<T>> {
    const response = await fetch(url, { headers: this.buildHeaders() });
    if (!response.ok) throw await this.parseErrorResponse(response);
    this.updateRateLimitInfo(response.headers);
    const data = await this.parseResponseBody<T[]>(response);
    const linkHeader = response.headers.get('Link');
    const links = linkHeader ? parseLinkHeader(linkHeader) : {};
    return createPage(data, links, (nextUrl: string) => this.fetchPageByUrl<T>(nextUrl));
  }
}

export function createClient(config: BuildkiteConfig): BuildkiteClient {
  return new BuildkiteClientImpl(config);
}

export function createClientFromEnv(): BuildkiteClient {
  const token = process.env.BUILDKITE_API_TOKEN || process.env.BUILDKITE_TOKEN;
  const orgSlug = process.env.BUILDKITE_ORGANIZATION_SLUG || process.env.BUILDKITE_ORG;

  if (!token) throw new Error('No Buildkite API token found in environment');
  if (!orgSlug) throw new Error('No Buildkite organization slug found in environment');

  return createClient({
    organizationSlug: orgSlug,
    auth: { type: 'api_token', token },
    baseUrl: process.env.BUILDKITE_API_URL,
  });
}
