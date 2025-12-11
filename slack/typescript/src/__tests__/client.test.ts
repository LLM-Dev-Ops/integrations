/**
 * Tests for Slack client.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SlackClient, createClient } from '../client';
import { SlackConfig } from '../config';
import { MockHttpTransport } from '../mocks';
import { SlackError, RateLimitError } from '../errors';

describe('SlackClient', () => {
  let client: SlackClient;
  let mockTransport: MockHttpTransport;

  beforeEach(() => {
    mockTransport = new MockHttpTransport();
    client = new SlackClient({
      config: {
        token: 'xoxb-test-token',
        baseUrl: 'https://slack.com/api',
      },
      transport: mockTransport,
    });
  });

  describe('GET requests', () => {
    it('should make GET request to endpoint', async () => {
      mockTransport.mock('conversations.list', {
        data: { ok: true, channels: [] },
      });

      const response = await client.get('conversations.list');

      expect(response.ok).toBe(true);
      const calls = mockTransport.getCalls();
      expect(calls).toHaveLength(1);
      expect(calls[0].options.method).toBe('GET');
    });

    it('should include query parameters', async () => {
      mockTransport.mock('conversations.list', {
        data: { ok: true, channels: [] },
      });

      await client.get('conversations.list', { limit: 100, exclude_archived: true });

      const calls = mockTransport.getCalls();
      expect(calls[0].url).toContain('limit=100');
      expect(calls[0].url).toContain('exclude_archived=true');
    });
  });

  describe('POST requests', () => {
    it('should make POST request with body', async () => {
      mockTransport.mock('chat.postMessage', {
        data: { ok: true, channel: 'C123', ts: '1234.5678' },
      });

      const response = await client.post('chat.postMessage', {
        channel: 'C123',
        text: 'Hello',
      });

      expect(response.ok).toBe(true);
      const calls = mockTransport.getCalls();
      expect(calls[0].options.method).toBe('POST');
      expect(calls[0].options.body).toEqual({ channel: 'C123', text: 'Hello' });
    });
  });

  describe('pagination', () => {
    it('should paginate through results', async () => {
      mockTransport
        .mock({ url: 'users.list', body: {} }, {
          data: {
            ok: true,
            members: [{ id: 'U1' }, { id: 'U2' }],
            response_metadata: { next_cursor: 'cursor1' },
          },
        })
        .mock({ url: 'users.list' }, {
          data: {
            ok: true,
            members: [{ id: 'U3' }],
            response_metadata: { next_cursor: '' },
          },
        });

      const result = await client.paginate(
        'users.list',
        {},
        (r: any) => r.members
      );

      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('cursor1');
    });

    it('should get all pages', async () => {
      mockTransport
        .mock('users.list', {
          data: {
            ok: true,
            members: [{ id: 'U1' }],
            response_metadata: { next_cursor: '' },
          },
        });

      const items = await client.getAllPages(
        'users.list',
        {},
        (r: any) => r.members
      );

      expect(items).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('should throw SlackError for API errors', async () => {
      mockTransport.mock('conversations.info', {
        data: { ok: false, error: 'channel_not_found' },
      });

      await expect(client.get('conversations.info', { channel: 'C000' }))
        .rejects.toThrow(SlackError);
    });

    it('should throw RateLimitError for 429 responses', async () => {
      mockTransport.mock('chat.postMessage', {
        data: { ok: false, error: 'rate_limited' },
        status: 429,
        headers: { 'retry-after': '30' },
      });

      try {
        await client.post('chat.postMessage', { channel: 'C123', text: 'test' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).retryAfter).toBe(30);
      }
    });
  });
});

describe('createClient', () => {
  it('should create client from token', () => {
    const client = createClient('xoxb-test-token');
    expect(client).toBeInstanceOf(SlackClient);
  });
});
