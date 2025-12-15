import { KeyVaultCredential, KEY_VAULT_SCOPE } from './auth.js';

export interface HttpTransportConfig {
  baseUrl: string;
  apiVersion: string; // Default: "7.4"
  timeout: number;    // Default: 30000
  credential: KeyVaultCredential;
}

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export class HttpTransport {
  private config: HttpTransportConfig;
  private currentToken?: { token: string; expiresOn: Date };

  constructor(config: HttpTransportConfig) {
    this.config = {
      ...config,
      apiVersion: config.apiVersion || '7.4',
      timeout: config.timeout || 30000,
    };
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    const url = this.buildUrl(req.path, req.query);
    const token = await this.ensureToken();

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      ...req.headers,
    };

    // Add Content-Type for POST/PUT requests
    if ((req.method === 'POST' || req.method === 'PUT') && req.body !== undefined) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    // Use provided signal or our timeout signal
    const signal = req.signal || controller.signal;

    try {
      const response = await fetch(url, {
        method: req.method,
        headers,
        body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
        signal,
      });

      clearTimeout(timeoutId);

      // Handle 401 - try refreshing token and retry once
      if (response.status === 401) {
        // Force token refresh
        this.currentToken = undefined;
        const newToken = await this.ensureToken();

        headers['Authorization'] = `Bearer ${newToken}`;

        const retryResponse = await fetch(url, {
          method: req.method,
          headers,
          body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
          signal,
        });

        return await this.parseResponse(retryResponse);
      }

      return await this.parseResponse(response);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.config.timeout}ms`);
      }
      throw error;
    }
  }

  private async parseResponse(response: Response): Promise<HttpResponse> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let body: unknown;
    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/json')) {
      const text = await response.text();
      body = text ? JSON.parse(text) : null;
    } else {
      body = await response.text();
    }

    return {
      status: response.status,
      headers,
      body,
    };
  }

  async get(path: string, query?: Record<string, string>): Promise<HttpResponse> {
    return this.request({
      method: 'GET',
      path,
      query,
    });
  }

  async post(path: string, body: unknown): Promise<HttpResponse> {
    return this.request({
      method: 'POST',
      path,
      body,
    });
  }

  async put(path: string, body: unknown): Promise<HttpResponse> {
    return this.request({
      method: 'PUT',
      path,
      body,
    });
  }

  async delete(path: string): Promise<HttpResponse> {
    return this.request({
      method: 'DELETE',
      path,
    });
  }

  private async ensureToken(): Promise<string> {
    const now = Date.now();

    // Check if we have a valid token that won't expire soon
    if (this.currentToken) {
      const expiresAt = this.currentToken.expiresOn.getTime();
      const timeUntilExpiry = expiresAt - now;

      // If token is still valid with buffer, use it
      if (timeUntilExpiry > TOKEN_REFRESH_BUFFER_MS) {
        return this.currentToken.token;
      }
    }

    // Need to refresh token
    this.currentToken = await this.config.credential.getToken(KEY_VAULT_SCOPE);
    return this.currentToken.token;
  }

  private buildUrl(path: string, query?: Record<string, string>): string {
    // Ensure baseUrl doesn't end with slash and path starts with slash
    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    const url = new URL(`${baseUrl}${normalizedPath}`);

    // Add api-version parameter
    url.searchParams.set('api-version', this.config.apiVersion);

    // Add any additional query parameters
    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    return url.toString();
  }
}
