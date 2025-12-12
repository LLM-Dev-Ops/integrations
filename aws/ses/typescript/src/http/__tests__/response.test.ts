/**
 * Tests for response parsing utilities
 */

import { describe, it, expect } from 'vitest';
import {
  parseResponse,
  extractNextToken,
  parsePaginatedResponse,
  isSuccessResponse,
  isErrorResponse,
  parseAwsError,
  extractResponseMetadata,
} from '../response.js';
import type { HttpResponse } from '../types.js';

describe('Response Parsing', () => {
  describe('parseResponse', () => {
    it('should parse valid JSON', () => {
      const body = '{"MessageId":"msg-123","success":true}';
      const result = parseResponse<{ MessageId: string; success: boolean }>(body);

      expect(result.MessageId).toBe('msg-123');
      expect(result.success).toBe(true);
    });

    it('should throw on empty body', () => {
      expect(() => parseResponse('')).toThrow('Response body is empty');
    });

    it('should throw on invalid JSON', () => {
      expect(() => parseResponse('not json')).toThrow('Failed to parse JSON response');
    });
  });

  describe('extractNextToken', () => {
    it('should extract NextToken field', () => {
      const response = {
        Identities: [],
        NextToken: 'abc123',
      };

      const token = extractNextToken(response);
      expect(token).toBe('abc123');
    });

    it('should extract nextToken field (lowercase)', () => {
      const response = {
        items: [],
        nextToken: 'xyz789',
      };

      const token = extractNextToken(response);
      expect(token).toBe('xyz789');
    });

    it('should return undefined when no token present', () => {
      const response = {
        Identities: [],
      };

      const token = extractNextToken(response);
      expect(token).toBeUndefined();
    });

    it('should return undefined for non-object input', () => {
      expect(extractNextToken(null)).toBeUndefined();
      expect(extractNextToken('string')).toBeUndefined();
      expect(extractNextToken(123)).toBeUndefined();
    });
  });

  describe('parsePaginatedResponse', () => {
    it('should parse paginated response with default items key', () => {
      const body = JSON.stringify({
        Items: [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
        ],
        NextToken: 'abc123',
      });

      const result = parsePaginatedResponse<{ id: number; name: string }>(body);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe(1);
      expect(result.nextToken).toBe('abc123');
    });

    it('should parse paginated response with custom items key', () => {
      const body = JSON.stringify({
        Identities: [
          { IdentityName: 'example.com' },
        ],
        NextToken: 'xyz789',
      });

      const result = parsePaginatedResponse<{ IdentityName: string }>(body, 'Identities');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].IdentityName).toBe('example.com');
      expect(result.nextToken).toBe('xyz789');
    });

    it('should handle response without next token', () => {
      const body = JSON.stringify({
        Items: [{ id: 1 }],
      });

      const result = parsePaginatedResponse<{ id: number }>(body);

      expect(result.items).toHaveLength(1);
      expect(result.nextToken).toBeUndefined();
    });

    it('should throw if items key is not an array', () => {
      const body = JSON.stringify({
        Items: 'not an array',
      });

      expect(() => parsePaginatedResponse(body)).toThrow("does not contain a valid 'Items' array");
    });
  });

  describe('isSuccessResponse', () => {
    it('should return true for 2xx status codes', () => {
      expect(isSuccessResponse({ status: 200, headers: {}, body: '' })).toBe(true);
      expect(isSuccessResponse({ status: 201, headers: {}, body: '' })).toBe(true);
      expect(isSuccessResponse({ status: 204, headers: {}, body: '' })).toBe(true);
    });

    it('should return false for non-2xx status codes', () => {
      expect(isSuccessResponse({ status: 400, headers: {}, body: '' })).toBe(false);
      expect(isSuccessResponse({ status: 500, headers: {}, body: '' })).toBe(false);
    });
  });

  describe('isErrorResponse', () => {
    it('should return true for 4xx and 5xx status codes', () => {
      expect(isErrorResponse({ status: 400, headers: {}, body: '' })).toBe(true);
      expect(isErrorResponse({ status: 404, headers: {}, body: '' })).toBe(true);
      expect(isErrorResponse({ status: 500, headers: {}, body: '' })).toBe(true);
    });

    it('should return false for 2xx and 3xx status codes', () => {
      expect(isErrorResponse({ status: 200, headers: {}, body: '' })).toBe(false);
      expect(isErrorResponse({ status: 301, headers: {}, body: '' })).toBe(false);
    });
  });

  describe('parseAwsError', () => {
    it('should parse AWS error response with JSON body', () => {
      const response: HttpResponse = {
        status: 400,
        headers: { 'x-amzn-requestid': 'req-123' },
        body: JSON.stringify({
          __type: 'MessageRejected',
          message: 'Email address is not verified',
        }),
      };

      const error = parseAwsError(response);

      expect(error.type).toBe('MessageRejected');
      expect(error.message).toBe('Email address is not verified');
      expect(error.statusCode).toBe(400);
      expect(error.requestId).toBe('req-123');
      expect(error.retryable).toBe(false);
    });

    it('should parse error without JSON body', () => {
      const response: HttpResponse = {
        status: 500,
        headers: {},
        body: 'Internal Server Error',
      };

      const error = parseAwsError(response);

      expect(error.type).toBe('HTTP500');
      expect(error.message).toBe('Internal Server Error');
      expect(error.retryable).toBe(true);
    });

    it('should mark 5xx errors as retryable', () => {
      const response: HttpResponse = {
        status: 503,
        headers: {},
        body: '{}',
      };

      const error = parseAwsError(response);
      expect(error.retryable).toBe(true);
    });

    it('should mark 429 errors as retryable', () => {
      const response: HttpResponse = {
        status: 429,
        headers: {},
        body: '{}',
      };

      const error = parseAwsError(response);
      expect(error.retryable).toBe(true);
    });

    it('should mark throttling errors as retryable', () => {
      const response: HttpResponse = {
        status: 400,
        headers: {},
        body: JSON.stringify({
          __type: 'ThrottlingException',
          message: 'Rate exceeded',
        }),
      };

      const error = parseAwsError(response);
      expect(error.retryable).toBe(true);
    });

    it('should extract request ID from various headers', () => {
      const testCases = [
        { header: 'x-amzn-requestid', value: 'req-1' },
        { header: 'x-amzn-request-id', value: 'req-2' },
        { header: 'x-amz-request-id', value: 'req-3' },
      ];

      for (const { header, value } of testCases) {
        const response: HttpResponse = {
          status: 400,
          headers: { [header]: value },
          body: '{}',
        };

        const error = parseAwsError(response);
        expect(error.requestId).toBe(value);
      }
    });
  });

  describe('extractResponseMetadata', () => {
    it('should extract all metadata fields', () => {
      const headers = {
        'x-amzn-requestid': 'req-123',
        'x-amzn-ratelimit-limit': '100',
        'x-amzn-ratelimit-remaining': '95',
        'retry-after': '30',
      };

      const metadata = extractResponseMetadata(headers);

      expect(metadata.requestId).toBe('req-123');
      expect(metadata.rateLimit).toBe(100);
      expect(metadata.rateLimitRemaining).toBe(95);
      expect(metadata.retryAfter).toBe(30);
    });

    it('should handle missing metadata fields', () => {
      const headers = {};

      const metadata = extractResponseMetadata(headers);

      expect(metadata.requestId).toBeUndefined();
      expect(metadata.rateLimit).toBeUndefined();
      expect(metadata.rateLimitRemaining).toBeUndefined();
      expect(metadata.retryAfter).toBeUndefined();
    });

    it('should parse numeric headers correctly', () => {
      const headers = {
        'x-amzn-ratelimit-limit': '50',
        'x-amzn-ratelimit-remaining': '10',
      };

      const metadata = extractResponseMetadata(headers);

      expect(typeof metadata.rateLimit).toBe('number');
      expect(typeof metadata.rateLimitRemaining).toBe('number');
    });
  });
});
