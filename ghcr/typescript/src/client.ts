/**
 * Main GHCR client implementation.
 * @module client
 */

import { createHash } from 'crypto';
import type { GhcrConfig } from './config.js';
import { GhcrError, GhcrErrorKind, errorKindFromStatus } from './errors.js';
import type { CredentialProvider, GhcrCredentials } from './auth/providers.js';
import { TokenManager, SecretString, buildScope, ScopeActions } from './auth/token-manager.js';
import { ResilienceOrchestrator } from './rate-limit.js';
import type { ImageRef, Manifest, RateLimitInfo } from './types/mod.js';
import { ImageRef as ImageRefUtils, getManifestAcceptHeader } from './types/mod.js';

/**
 * HTTP method types.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

/**
 * Request options.
 */
export interface RequestOptions {
  /** Additional headers */
  headers?: Record<string, string>;
  /** Request timeout override */
  timeout?: number;
  /** Skip authentication */
  skipAuth?: boolean;
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
 * GHCR client interface.
 */
export interface GhcrClient {
  /**
   * Gets the client configuration.
   */
  getConfig(): Readonly<GhcrConfig>;

  /**
   * Gets current rate limit information.
   */
  getRateLimitInfo(): RateLimitInfo;

  /**
   * Makes a GET request to the registry.
   */
  registryGet<T = unknown>(
    path: string,
    options?: RequestOptions
  ): Promise<HttpResponse<T>>;

  /**
   * Makes a HEAD request to the registry.
   */
  registryHead(
    path: string,
    options?: RequestOptions
  ): Promise<HttpResponse<void>>;

  /**
   * Makes a PUT request to the registry.
   */
  registryPut<T = unknown>(
    path: string,
    body: BodyInit,
    options?: RequestOptions
  ): Promise<HttpResponse<T>>;

  /**
   * Makes a POST request to the registry.
   */
  registryPost<T = unknown>(
    path: string,
    body?: BodyInit,
    options?: RequestOptions
  ): Promise<HttpResponse<T>>;

  /**
   * Makes a PATCH request to the registry.
   */
  registryPatch<T = unknown>(
    path: string,
    body: BodyInit,
    options?: RequestOptions
  ): Promise<HttpResponse<T>>;

  /**
   * Makes a DELETE request to the registry.
   */
  registryDelete<T = unknown>(
    path: string,
    options?: RequestOptions
  ): Promise<HttpResponse<T>>;

  /**
   * Makes a GET request to the GitHub API.
   */
  apiGet<T = unknown>(
    path: string,
    options?: RequestOptions
  ): Promise<HttpResponse<T>>;

  /**
   * Makes a DELETE request to the GitHub API.
   */
  apiDelete<T = unknown>(
    path: string,
    options?: RequestOptions
  ): Promise<HttpResponse<T>>;
}

/**
 * GHCR client implementation.
 */
export class GhcrClientImpl implements GhcrClient {
  private readonly config: GhcrConfig;
  private readonly credentialProvider: CredentialProvider;
  private readonly tokenManager: TokenManager;
  private readonly orchestrator: ResilienceOrchestrator;

  constructor(config: GhcrConfig, credentialProvider: CredentialProvider) {
    this.config = config;
    this.credentialProvider = credentialProvider;
    this.tokenManager = new TokenManager();
    this.orchestrator = new ResilienceOrchestrator({
      maxRetries: config.maxRetries,
      retry: config.retry,
      rateLimit: config.rateLimit,
    });
  }

  getConfig(): Readonly<GhcrConfig> {
    return this.config;
  }

  getRateLimitInfo(): RateLimitInfo {
    return this.orchestrator.getRateLimiter().getInfo();
  }

  async registryGet<T = unknown>(
    path: string,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.registryRequest<T>('GET', path, undefined, options);
  }

  async registryHead(
    path: string,
    options?: RequestOptions
  ): Promise<HttpResponse<void>> {
    return this.registryRequest<void>('HEAD', path, undefined, options);
  }

  async registryPut<T = unknown>(
    path: string,
    body: BodyInit,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.registryRequest<T>('PUT', path, body, options);
  }

  async registryPost<T = unknown>(
    path: string,
    body?: BodyInit,
    options?: RequestOptions
  ): Promise<HttpResponse<T>>;
  async registryPost<T = unknown>(
    path: string,
    body: BodyInit | undefined,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.registryRequest<T>('POST', path, body, options);
  }

  async registryPatch<T = unknown>(
    path: string,
    body: BodyInit,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.registryRequest<T>('PATCH', path, body, options);
  }

  async registryDelete<T = unknown>(
    path: string,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.registryRequest<T>('DELETE', path, undefined, options);
  }

  async apiGet<T = unknown>(
    path: string,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.apiRequest<T>('GET', path, undefined, options);
  }

  async apiDelete<T = unknown>(
    path: string,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    return this.apiRequest<T>('DELETE', path, undefined, options);
  }

  /**
   * Makes a request to the registry with resilience.
   */
  private async registryRequest<T>(
    method: HttpMethod,
    path: string,
    body?: BodyInit,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    const url = `https://${this.config.registry}${path}`;

    return this.orchestrator.execute(async () => {
      const headers = await this.buildRegistryHeaders(path, method, options);
      return this.performRequest<T>(method, url, headers, body, options);
    });
  }

  /**
   * Makes a request to the GitHub API with resilience.
   */
  private async apiRequest<T>(
    method: HttpMethod,
    path: string,
    body?: BodyInit,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    const url = `${this.config.apiBase}${path}`;

    return this.orchestrator.execute(async () => {
      const headers = await this.buildApiHeaders(options);
      return this.performRequest<T>(method, url, headers, body, options);
    });
  }

  /**
   * Performs the actual HTTP request.
   */
  private async performRequest<T>(
    method: HttpMethod,
    url: string,
    headers: Record<string, string>,
    body?: BodyInit,
    options?: RequestOptions
  ): Promise<HttpResponse<T>> {
    const timeout = options?.timeout ?? this.config.timeout;
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

      // Update rate limit info
      this.orchestrator.updateRateLimitInfo(response.headers);

      // Handle error responses
      if (!response.ok) {
        throw await this.parseErrorResponse(response);
      }

      // Parse response body
      const data = await this.parseResponseBody<T>(response);

      return {
        status: response.status,
        headers: response.headers,
        data,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if ((error as Error).name === 'AbortError') {
        throw GhcrError.timeout('request', timeout);
      }

      if (error instanceof GhcrError) {
        throw error;
      }

      throw new GhcrError(
        GhcrErrorKind.ConnectionFailed,
        `Request failed: ${(error as Error).message}`,
        { cause: error as Error }
      );
    }
  }

  /**
   * Builds headers for registry requests.
   */
  private async buildRegistryHeaders(
    path: string,
    method: HttpMethod,
    options?: RequestOptions
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'User-Agent': this.config.userAgent,
      ...options?.headers,
    };

    // Add accept header for manifest requests
    if (path.includes('/manifests/')) {
      headers['Accept'] = getManifestAcceptHeader();
    }

    // Skip auth if requested
    if (options?.skipAuth) {
      return headers;
    }

    // Get bearer token
    const token = await this.getRegistryToken(path, method);
    if (token) {
      headers['Authorization'] = `Bearer ${token.expose()}`;
    }

    return headers;
  }

  /**
   * Builds headers for API requests.
   */
  private async buildApiHeaders(
    options?: RequestOptions
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': this.config.userAgent,
      ...options?.headers,
    };

    // Skip auth if requested
    if (options?.skipAuth) {
      return headers;
    }

    // Get credentials and use PAT directly
    const credentials = await this.credentialProvider.getCredentials();
    headers['Authorization'] = `Bearer ${credentials.token.expose()}`;

    return headers;
  }

  /**
   * Gets a bearer token for registry access.
   */
  private async getRegistryToken(
    path: string,
    method: HttpMethod
  ): Promise<SecretString | null> {
    // Extract repository from path (e.g., /v2/owner/image/manifests/tag)
    const match = path.match(/^\/v2\/([^/]+\/[^/]+)/);
    if (!match) {
      return null;
    }

    const repository = match[1] as string;
    const actions = this.getActionsForMethod(method);
    const scope = buildScope(repository, [...actions]);

    // Check token cache
    const cached = this.tokenManager.getToken(scope);
    if (cached) {
      return cached;
    }

    // Get new token
    const token = await this.fetchRegistryToken(repository, scope);
    return token;
  }

  /**
   * Fetches a new token from the registry.
   */
  private async fetchRegistryToken(
    repository: string,
    scope: string
  ): Promise<SecretString> {
    const credentials = await this.credentialProvider.getCredentials();

    // Build token URL
    const tokenUrl = new URL('https://ghcr.io/token');
    tokenUrl.searchParams.set('service', 'ghcr.io');
    tokenUrl.searchParams.set('scope', scope);

    // Create basic auth header
    const basicAuth = Buffer.from(
      `${credentials.username}:${credentials.token.expose()}`
    ).toString('base64');

    const response = await fetch(tokenUrl.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'User-Agent': this.config.userAgent,
      },
    });

    if (!response.ok) {
      throw GhcrError.authFailed(
        `Failed to get registry token: ${response.status}`,
        response.status
      );
    }

    const json = await response.json() as {
      token?: string;
      access_token?: string;
      expires_in?: number;
    };

    const tokenValue = json.token || json.access_token;
    if (!tokenValue) {
      throw GhcrError.authFailed('Token response missing token field');
    }

    const token = new SecretString(tokenValue);
    this.tokenManager.setToken(scope, token, json.expires_in);

    return token;
  }

  /**
   * Gets the required actions for an HTTP method.
   */
  private getActionsForMethod(method: HttpMethod): readonly string[] {
    switch (method) {
      case 'GET':
      case 'HEAD':
        return ScopeActions.pull;
      case 'PUT':
      case 'POST':
      case 'PATCH':
        return ScopeActions.push;
      case 'DELETE':
        return ScopeActions.delete;
    }
  }

  /**
   * Parses error response from the registry or API.
   */
  private async parseErrorResponse(response: Response): Promise<GhcrError> {
    const status = response.status;
    let message = `HTTP ${status}`;

    try {
      const json = await response.json() as {
        message?: string;
        errors?: Array<{ message?: string }>;
      };

      if (json.message) {
        message = json.message;
      } else if (json.errors && json.errors.length > 0) {
        message = json.errors.map(e => e.message).join(', ');
      }
    } catch {
      // Ignore parse errors
    }

    return GhcrError.fromResponse(status, message, response.headers);
  }

  /**
   * Parses response body based on content type.
   */
  private async parseResponseBody<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('Content-Type') ?? '';

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
      contentType.includes('application/vnd.') ||
      contentType.includes('+json')
    ) {
      try {
        return await response.json() as T;
      } catch (error) {
        throw GhcrError.invalidManifest(
          `Failed to parse JSON: ${(error as Error).message}`
        );
      }
    }

    // Return raw text for other content types
    const text = await response.text();
    return text as T;
  }
}

/**
 * Creates a new GHCR client.
 */
export function createClient(
  config: GhcrConfig,
  credentialProvider: CredentialProvider
): GhcrClient {
  return new GhcrClientImpl(config, credentialProvider);
}
