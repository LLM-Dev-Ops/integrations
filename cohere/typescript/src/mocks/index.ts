/**
 * Mock implementations for testing.
 *
 * Provides mock implementations of all service interfaces
 * for use in unit and integration tests following London-School TDD.
 */

import type { HttpTransport, TransportResponse, ServerSentEvent } from '../transport';

/**
 * Mock response to return
 */
export interface MockResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/**
 * Recorded mock request
 */
export interface MockRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

/**
 * Mock HTTP transport for testing
 */
export class MockHttpTransport implements HttpTransport {
  private responses: MockResponse[] = [];
  private streamResponses: ServerSentEvent[][] = [];
  private requests: MockRequest[] = [];

  /**
   * Add a response to return
   */
  addResponse(response: MockResponse): this {
    this.responses.push(response);
    return this;
  }

  /**
   * Add a JSON response
   */
  addJsonResponse<T>(data: T, status = 200): this {
    return this.addResponse({ status, body: data });
  }

  /**
   * Add an error response
   */
  addErrorResponse(status: number, message: string): this {
    return this.addResponse({
      status,
      body: { message },
    });
  }

  /**
   * Add SSE stream data
   */
  addStreamResponse(events: ServerSentEvent[]): this {
    this.streamResponses.push(events);
    return this;
  }

  /**
   * Get recorded requests
   */
  getRequests(): MockRequest[] {
    return [...this.requests];
  }

  /**
   * Get the last request
   */
  getLastRequest(): MockRequest | undefined {
    return this.requests[this.requests.length - 1];
  }

  /**
   * Clear recorded requests
   */
  clearRequests(): void {
    this.requests = [];
  }

  /**
   * Clear all responses
   */
  clearResponses(): void {
    this.responses = [];
    this.streamResponses = [];
  }

  /**
   * Reset the mock
   */
  reset(): void {
    this.clearRequests();
    this.clearResponses();
  }

  /**
   * Send an HTTP request
   */
  async send(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: unknown
  ): Promise<TransportResponse> {
    this.requests.push({ method, url, headers, body });

    const response = this.responses.shift();
    if (!response) {
      return {
        status: 500,
        headers: new Headers(),
        body: { message: 'No mock response configured' },
      };
    }

    return {
      status: response.status,
      headers: new Headers(response.headers),
      body: response.body,
    };
  }

  /**
   * Send a streaming HTTP request
   */
  async *sendStreaming(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: unknown
  ): AsyncIterable<ServerSentEvent> {
    this.requests.push({ method, url, headers, body });

    const events = this.streamResponses.shift();
    if (!events) {
      return;
    }

    for (const event of events) {
      yield event;
    }
  }
}

/**
 * Create a mock transport with a JSON response
 */
export function createMockTransport<T>(response: T, status = 200): MockHttpTransport {
  return new MockHttpTransport().addJsonResponse(response, status);
}

/**
 * Create a mock transport with multiple responses
 */
export function createMockTransportWithResponses(
  responses: MockResponse[]
): MockHttpTransport {
  const transport = new MockHttpTransport();
  for (const response of responses) {
    transport.addResponse(response);
  }
  return transport;
}

/**
 * Create a mock transport with stream responses
 */
export function createMockStreamTransport(
  events: ServerSentEvent[]
): MockHttpTransport {
  return new MockHttpTransport().addStreamResponse(events);
}

/**
 * Request matcher for assertions
 */
export interface RequestMatcher {
  method?: string;
  url?: string | RegExp;
  bodyContains?: Record<string, unknown>;
}

/**
 * Assert that a request was made matching the criteria
 */
export function assertRequestMade(
  transport: MockHttpTransport,
  matcher: RequestMatcher
): void {
  const requests = transport.getRequests();

  const found = requests.some((req) => {
    if (matcher.method && req.method !== matcher.method) {
      return false;
    }

    if (matcher.url) {
      if (typeof matcher.url === 'string') {
        if (!req.url.includes(matcher.url)) {
          return false;
        }
      } else if (!matcher.url.test(req.url)) {
        return false;
      }
    }

    if (matcher.bodyContains && req.body) {
      const body = req.body as Record<string, unknown>;
      for (const [key, value] of Object.entries(matcher.bodyContains)) {
        if (body[key] !== value) {
          return false;
        }
      }
    }

    return true;
  });

  if (!found) {
    throw new Error(
      `Expected request matching ${JSON.stringify(matcher)} but got: ${JSON.stringify(requests)}`
    );
  }
}
