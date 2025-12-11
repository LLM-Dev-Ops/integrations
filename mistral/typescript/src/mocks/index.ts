/**
 * Mock implementations for testing.
 */

import type { HttpTransport } from '../transport';

/**
 * A recorded request for verification.
 */
export interface RecordedRequest {
  method: string;
  path: string;
  body?: unknown;
}

/**
 * A mock response to return.
 */
export interface MockResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/**
 * Creates a JSON response.
 */
export function jsonResponse(body: unknown, status = 200): MockResponse {
  return {
    status,
    body,
    headers: { 'content-type': 'application/json' },
  };
}

/**
 * Creates an error response.
 */
export function errorResponse(status: number, message: string): MockResponse {
  return {
    status,
    body: { error: { message, type: 'error' } },
    headers: { 'content-type': 'application/json' },
  };
}

/**
 * Mock transport for testing.
 */
export class MockTransport implements HttpTransport {
  private responses: MockResponse[] = [];
  private requests: RecordedRequest[] = [];
  private defaultResponse?: MockResponse;

  /**
   * Adds a response to the queue.
   */
  enqueue(response: MockResponse): void {
    this.responses.push(response);
  }

  /**
   * Sets the default response.
   */
  setDefault(response: MockResponse): void {
    this.defaultResponse = response;
  }

  /**
   * Gets all recorded requests.
   */
  getRequests(): RecordedRequest[] {
    return [...this.requests];
  }

  /**
   * Gets the last recorded request.
   */
  lastRequest(): RecordedRequest | undefined {
    return this.requests[this.requests.length - 1];
  }

  /**
   * Clears all recorded requests.
   */
  clearRequests(): void {
    this.requests = [];
  }

  /**
   * Returns the number of requests made.
   */
  requestCount(): number {
    return this.requests.length;
  }

  private getResponse(): MockResponse {
    return (
      this.responses.shift() ??
      this.defaultResponse ?? {
        status: 500,
        body: { error: { message: 'No mock response configured' } },
      }
    );
  }

  private recordRequest(method: string, path: string, body?: unknown): void {
    this.requests.push({ method, path, body });
  }

  async get(path: string): Promise<string> {
    this.recordRequest('GET', path);
    const response = this.getResponse();
    if (response.status >= 400) {
      throw new Error(JSON.stringify(response.body));
    }
    return JSON.stringify(response.body);
  }

  async post(path: string, body: unknown): Promise<string> {
    this.recordRequest('POST', path, body);
    const response = this.getResponse();
    if (response.status >= 400) {
      throw new Error(JSON.stringify(response.body));
    }
    return JSON.stringify(response.body);
  }

  async *postStream(path: string, body: unknown): AsyncIterable<string> {
    this.recordRequest('POST', path, body);
    const response = this.getResponse();
    if (response.status >= 400) {
      throw new Error(JSON.stringify(response.body));
    }
    yield JSON.stringify(response.body);
  }

  async patch(path: string, body: unknown): Promise<string> {
    this.recordRequest('PATCH', path, body);
    const response = this.getResponse();
    if (response.status >= 400) {
      throw new Error(JSON.stringify(response.body));
    }
    return JSON.stringify(response.body);
  }

  async delete(path: string): Promise<string> {
    this.recordRequest('DELETE', path);
    const response = this.getResponse();
    if (response.status >= 400) {
      throw new Error(JSON.stringify(response.body));
    }
    return JSON.stringify(response.body);
  }

  async uploadFile(
    path: string,
    _file: Buffer | Blob,
    filename: string,
    purpose: string
  ): Promise<string> {
    this.recordRequest('POST', path, { filename, purpose });
    const response = this.getResponse();
    if (response.status >= 400) {
      throw new Error(JSON.stringify(response.body));
    }
    return JSON.stringify(response.body);
  }
}

/**
 * Creates a mock transport.
 */
export function createMockTransport(): MockTransport {
  return new MockTransport();
}
