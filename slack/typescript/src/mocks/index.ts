/**
 * Mocks for testing Slack API integrations.
 */

import { HttpTransport, RequestOptions, HttpResponse, SlackApiResponse } from '../transport';
import { Channel, Message, User, Timestamp, ChannelId, UserId, UserProfile } from '../types';

/**
 * Mock response configuration
 */
export interface MockResponse<T = unknown> {
  data: T;
  status?: number;
  headers?: Record<string, string>;
  delay?: number;
}

/**
 * Mock request matcher
 */
export interface MockMatcher {
  url?: string | RegExp;
  method?: string;
  body?: Record<string, unknown>;
}

/**
 * Mock HTTP transport for testing
 */
export class MockHttpTransport implements HttpTransport {
  private mocks: Array<{ matcher: MockMatcher; response: MockResponse }> = [];
  private calls: Array<{ url: string; options: RequestOptions }> = [];
  private defaultResponse: MockResponse = {
    data: { ok: true },
    status: 200,
    headers: {},
  };

  /**
   * Add mock response
   */
  mock(matcher: MockMatcher | string, response: MockResponse | SlackApiResponse): this {
    const normalizedMatcher = typeof matcher === 'string' ? { url: matcher } : matcher;
    const normalizedResponse = 'data' in response ? response : { data: response };
    this.mocks.push({ matcher: normalizedMatcher, response: normalizedResponse as MockResponse });
    return this;
  }

  /**
   * Set default response
   */
  setDefaultResponse(response: MockResponse): this {
    this.defaultResponse = response;
    return this;
  }

  /**
   * Get all calls made
   */
  getCalls(): Array<{ url: string; options: RequestOptions }> {
    return this.calls;
  }

  /**
   * Get calls matching a URL
   */
  getCallsTo(url: string | RegExp): Array<{ url: string; options: RequestOptions }> {
    return this.calls.filter((call) => {
      if (typeof url === 'string') {
        return call.url.includes(url);
      }
      return url.test(call.url);
    });
  }

  /**
   * Clear all mocks and calls
   */
  reset(): this {
    this.mocks = [];
    this.calls = [];
    return this;
  }

  /**
   * Make request
   */
  async request<T>(url: string, options: RequestOptions): Promise<HttpResponse<T>> {
    this.calls.push({ url, options });

    // Find matching mock
    const mock = this.findMock(url, options);
    const response = mock?.response ?? this.defaultResponse;

    // Apply delay if configured
    if (response.delay) {
      await new Promise((resolve) => setTimeout(resolve, response.delay));
    }

    return {
      status: response.status ?? 200,
      headers: response.headers ?? {},
      data: response.data as T,
    };
  }

  private findMock(url: string, options: RequestOptions): { matcher: MockMatcher; response: MockResponse } | undefined {
    return this.mocks.find(({ matcher }) => {
      // Check URL
      if (matcher.url) {
        if (typeof matcher.url === 'string') {
          if (!url.includes(matcher.url)) return false;
        } else {
          if (!matcher.url.test(url)) return false;
        }
      }

      // Check method
      if (matcher.method && options.method !== matcher.method) {
        return false;
      }

      // Check body
      if (matcher.body && options.body) {
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
        for (const [key, value] of Object.entries(matcher.body)) {
          if ((body as Record<string, unknown>)[key] !== value) return false;
        }
      }

      return true;
    });
  }
}

/**
 * Mock Slack client for testing
 */
export class MockSlackClient {
  private transport: MockHttpTransport;

  constructor() {
    this.transport = new MockHttpTransport();
  }

  /**
   * Get underlying transport
   */
  getTransport(): MockHttpTransport {
    return this.transport;
  }

  /**
   * Mock a response
   */
  mock(matcher: MockMatcher | string, response: MockResponse | SlackApiResponse): this {
    this.transport.mock(matcher, response);
    return this;
  }

  /**
   * Get calls
   */
  getCalls(): Array<{ url: string; options: RequestOptions }> {
    return this.transport.getCalls();
  }

  /**
   * Reset
   */
  reset(): this {
    this.transport.reset();
    return this;
  }

  // Mock service methods

  /**
   * Mock conversations.list
   */
  mockConversationsList(channels: Channel[]): this {
    return this.mock('conversations.list', {
      ok: true,
      channels,
      response_metadata: { next_cursor: '' },
    });
  }

  /**
   * Mock conversations.info
   */
  mockConversationsInfo(channel: Channel): this {
    return this.mock('conversations.info', { ok: true, channel });
  }

  /**
   * Mock conversations.history
   */
  mockConversationsHistory(messages: Message[]): this {
    return this.mock('conversations.history', {
      ok: true,
      messages,
      has_more: false,
    });
  }

  /**
   * Mock chat.postMessage
   */
  mockPostMessage(channel: ChannelId, ts: Timestamp): this {
    return this.mock('chat.postMessage', {
      ok: true,
      channel,
      ts,
      message: { type: 'message', ts },
    });
  }

  /**
   * Mock users.list
   */
  mockUsersList(members: User[]): this {
    return this.mock('users.list', {
      ok: true,
      members,
      cache_ts: Date.now(),
      response_metadata: { next_cursor: '' },
    });
  }

  /**
   * Mock users.info
   */
  mockUsersInfo(user: User): this {
    return this.mock('users.info', { ok: true, user });
  }

  /**
   * Mock an error response
   */
  mockError(endpoint: string, error: string): this {
    return this.mock(endpoint, { ok: false, error });
  }

  /**
   * Mock rate limit
   */
  mockRateLimit(endpoint: string, retryAfter = 60): this {
    this.transport.mock(endpoint, {
      data: { ok: false, error: 'rate_limited' },
      status: 429,
      headers: { 'retry-after': String(retryAfter) },
    });
    return this;
  }
}

/**
 * Create mock transport
 */
export function createMockTransport(): MockHttpTransport {
  return new MockHttpTransport();
}

/**
 * Create mock client
 */
export function createMockClient(): MockSlackClient {
  return new MockSlackClient();
}
