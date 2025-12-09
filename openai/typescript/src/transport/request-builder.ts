import type { HttpRequest, HttpMethod, RequestOptions } from '../types/common.js';

export class RequestBuilder {
  private method: HttpMethod = 'GET';
  private path = '';
  private query?: Record<string, string | number | boolean | undefined>;
  private headers: Record<string, string> = {};
  private body?: unknown;
  private signal?: AbortSignal;

  setMethod(method: HttpMethod): this {
    this.method = method;
    return this;
  }

  setPath(path: string): this {
    this.path = path;
    return this;
  }

  setQuery(query: Record<string, string | number | boolean | undefined>): this {
    this.query = query;
    return this;
  }

  setHeaders(headers: Record<string, string>): this {
    this.headers = { ...this.headers, ...headers };
    return this;
  }

  setBody(body: unknown): this {
    this.body = body;
    return this;
  }

  setOptions(options?: RequestOptions): this {
    if (options?.headers) {
      this.setHeaders(options.headers);
    }
    if (options?.signal) {
      this.signal = options.signal;
    }
    if (options?.idempotencyKey) {
      this.headers['Idempotency-Key'] = options.idempotencyKey;
    }
    return this;
  }

  build(): HttpRequest {
    return {
      method: this.method,
      path: this.path,
      query: this.query,
      headers: this.headers,
      body: this.body,
      signal: this.signal,
    };
  }

  static create(): RequestBuilder {
    return new RequestBuilder();
  }
}
