/**
 * Tests for HTTP types
 */

import { describe, it, expect } from 'vitest';
import type {
  HttpMethod,
  HttpRequest,
  HttpResponse,
  HttpClientConfig,
  PoolOptions,
  PoolStats,
  PaginatedResponse,
} from '../types.js';

describe('HTTP Types', () => {
  describe('HttpRequest', () => {
    it('should define a valid HTTP request structure', () => {
      const request: HttpRequest = {
        method: 'POST',
        url: 'https://email.us-east-1.amazonaws.com/v2/email/outbound-emails',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{"test":"data"}',
      };

      expect(request.method).toBe('POST');
      expect(request.url).toContain('amazonaws.com');
      expect(request.headers['Content-Type']).toBe('application/json');
    });

    it('should allow optional body', () => {
      const request: HttpRequest = {
        method: 'GET',
        url: 'https://email.us-east-1.amazonaws.com/v2/email/identities',
        headers: {},
      };

      expect(request.body).toBeUndefined();
    });
  });

  describe('HttpResponse', () => {
    it('should define a valid HTTP response structure', () => {
      const response: HttpResponse = {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
        body: '{"MessageId":"msg-123"}',
      };

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/json');
    });
  });

  describe('HttpClientConfig', () => {
    it('should define client configuration with defaults', () => {
      const config: HttpClientConfig = {
        timeout: 30000,
        connectTimeout: 10000,
        keepAlive: true,
      };

      expect(config.timeout).toBe(30000);
      expect(config.connectTimeout).toBe(10000);
      expect(config.keepAlive).toBe(true);
    });

    it('should allow optional fields', () => {
      const config: HttpClientConfig = {};

      expect(config.timeout).toBeUndefined();
    });
  });

  describe('PoolOptions', () => {
    it('should define pool options', () => {
      const options: PoolOptions = {
        maxIdlePerHost: 10,
        idleTimeout: 90000,
        maxLifetime: 300000,
      };

      expect(options.maxIdlePerHost).toBe(10);
    });
  });

  describe('PaginatedResponse', () => {
    it('should define paginated response structure', () => {
      const response: PaginatedResponse<{ name: string }> = {
        items: [{ name: 'test' }],
        nextToken: 'abc123',
      };

      expect(response.items).toHaveLength(1);
      expect(response.nextToken).toBe('abc123');
    });

    it('should allow undefined nextToken', () => {
      const response: PaginatedResponse<{ name: string }> = {
        items: [{ name: 'test' }],
      };

      expect(response.nextToken).toBeUndefined();
    });
  });
});
