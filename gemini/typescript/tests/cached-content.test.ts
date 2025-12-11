/**
 * Cached content service tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockHttpClient } from '../src/__mocks__/index.js';
import { CachedContentServiceImpl } from '../src/services/cached-content.js';
import type { CreateCachedContentRequest, UpdateCachedContentRequest, CachedContent } from '../src/types/index.js';
import { ValidationError } from '../src/error/index.js';

describe('CachedContentService', () => {
  let mockClient: MockHttpClient;
  let service: CachedContentServiceImpl;

  beforeEach(() => {
    mockClient = new MockHttpClient();
    const httpClient = {
      buildUrl: (endpoint: string, queryParams?: Record<string, string>) => {
        let url = `https://generativelanguage.googleapis.com/v1/${endpoint}?key=test-key`;
        if (queryParams) {
          for (const [key, value] of Object.entries(queryParams)) {
            url += `&${key}=${value}`;
          }
        }
        return url;
      },
      getHeaders: () => ({ 'Content-Type': 'application/json' }),
      fetch: (url: string, init?: RequestInit) => mockClient.request(url, init),
    };
    service = new CachedContentServiceImpl(httpClient as any);
  });

  describe('create', () => {
    it('should create cached content with TTL', async () => {
      const request: CreateCachedContentRequest = {
        model: 'models/gemini-2.0-flash',
        contents: [
          { parts: [{ text: 'This is a long system instruction to be cached' }], role: 'user' },
        ],
        ttl: '3600s',
      };

      const mockResponse: CachedContent = {
        name: 'cachedContents/abc123',
        model: 'models/gemini-2.0-flash',
        createTime: '2024-01-01T00:00:00Z',
        updateTime: '2024-01-01T00:00:00Z',
        expireTime: '2024-01-01T01:00:00Z',
      };

      mockClient.enqueueJsonResponse(200, mockResponse);

      const response = await service.create(request);

      expect(response.name).toBe('cachedContents/abc123');
      expect(response.model).toBe('models/gemini-2.0-flash');
      mockClient.verifyRequestCount(1);
    });

    it('should create cached content with expire time', async () => {
      const request: CreateCachedContentRequest = {
        model: 'models/gemini-2.0-flash',
        contents: [{ parts: [{ text: 'Cached content' }] }],
        expireTime: '2024-12-31T23:59:59Z',
      };

      mockClient.enqueueJsonResponse(200, {
        name: 'cachedContents/xyz789',
        model: 'models/gemini-2.0-flash',
        createTime: '2024-01-01T00:00:00Z',
        updateTime: '2024-01-01T00:00:00Z',
        expireTime: '2024-12-31T23:59:59Z',
      });

      const response = await service.create(request);

      expect(response.name).toBe('cachedContents/xyz789');
      expect(response.expireTime).toBe('2024-12-31T23:59:59Z');
    });

    it('should throw error if both ttl and expireTime specified', async () => {
      const request: CreateCachedContentRequest = {
        model: 'models/gemini-2.0-flash',
        contents: [{ parts: [{ text: 'test' }] }],
        ttl: '3600s',
        expireTime: '2024-12-31T23:59:59Z',
      };

      await expect(service.create(request)).rejects.toThrow(
        'Cannot specify both ttl and expireTime'
      );
    });

    it('should throw error if neither ttl nor expireTime specified', async () => {
      const request: CreateCachedContentRequest = {
        model: 'models/gemini-2.0-flash',
        contents: [{ parts: [{ text: 'test' }] }],
      };

      await expect(service.create(request)).rejects.toThrow(
        'Must specify either ttl or expireTime'
      );
    });

    it('should throw error for missing model', async () => {
      const request = {
        contents: [{ parts: [{ text: 'test' }] }],
        ttl: '3600s',
      } as CreateCachedContentRequest;

      await expect(service.create(request)).rejects.toThrow('Model is required');
    });

    it('should throw error for empty contents', async () => {
      const request: CreateCachedContentRequest = {
        model: 'models/gemini-2.0-flash',
        contents: [],
        ttl: '3600s',
      };

      await expect(service.create(request)).rejects.toThrow(
        'Contents array is required and must not be empty'
      );
    });

    it('should include system instruction when provided', async () => {
      const request: CreateCachedContentRequest = {
        model: 'models/gemini-2.0-flash',
        contents: [{ parts: [{ text: 'User content' }] }],
        systemInstruction: { parts: [{ text: 'You are a helpful assistant' }] },
        ttl: '3600s',
      };

      mockClient.enqueueJsonResponse(200, {
        name: 'cachedContents/test',
        model: 'models/gemini-2.0-flash',
        createTime: '2024-01-01T00:00:00Z',
        updateTime: '2024-01-01T00:00:00Z',
        expireTime: '2024-01-01T01:00:00Z',
      });

      await service.create(request);

      const lastRequest = mockClient.getLastRequest();
      const body = JSON.parse(lastRequest!.options.body as string);
      expect(body.systemInstruction).toBeDefined();
      expect(body.systemInstruction.parts[0].text).toBe('You are a helpful assistant');
    });
  });

  describe('list', () => {
    it('should list cached contents', async () => {
      const mockResponse = {
        cachedContents: [
          {
            name: 'cachedContents/abc123',
            model: 'models/gemini-2.0-flash',
            createTime: '2024-01-01T00:00:00Z',
          },
          {
            name: 'cachedContents/xyz789',
            model: 'models/gemini-1.5-pro',
            createTime: '2024-01-02T00:00:00Z',
          },
        ],
      };

      mockClient.enqueueJsonResponse(200, mockResponse);

      const response = await service.list();

      expect(response.cachedContents).toHaveLength(2);
      expect(response.cachedContents[0].name).toBe('cachedContents/abc123');
      mockClient.verifyRequestCount(1);
    });

    it('should list with pagination', async () => {
      mockClient.enqueueJsonResponse(200, {
        cachedContents: [],
        nextPageToken: 'token123',
      });

      const response = await service.list({ pageSize: 10, pageToken: 'prev-token' });

      expect(response.nextPageToken).toBe('token123');
      const lastRequest = mockClient.getLastRequest();
      expect(lastRequest!.url).toContain('pageSize=10');
      expect(lastRequest!.url).toContain('pageToken=prev-token');
    });

    it('should throw error for invalid page size', async () => {
      await expect(service.list({ pageSize: 0 })).rejects.toThrow(ValidationError);
    });
  });

  describe('get', () => {
    it('should get cached content by name', async () => {
      const mockContent: CachedContent = {
        name: 'cachedContents/abc123',
        model: 'models/gemini-2.0-flash',
        createTime: '2024-01-01T00:00:00Z',
        updateTime: '2024-01-01T00:00:00Z',
        expireTime: '2024-01-01T01:00:00Z',
        usageMetadata: {
          totalTokenCount: 1000,
        },
      };

      mockClient.enqueueJsonResponse(200, mockContent);

      const content = await service.get('abc123');

      expect(content.name).toBe('cachedContents/abc123');
      expect(content.usageMetadata?.totalTokenCount).toBe(1000);
      mockClient.verifyRequestCount(1);
    });

    it('should normalize cached content name', async () => {
      mockClient.enqueueJsonResponse(200, {
        name: 'cachedContents/test',
        model: 'models/test',
      });

      await service.get('cachedContents/test');

      const lastRequest = mockClient.getLastRequest();
      expect(lastRequest!.url).toContain('cachedContents/test');
    });

    it('should throw error for empty name', async () => {
      await expect(service.get('')).rejects.toThrow(ValidationError);
    });
  });

  describe('update', () => {
    it('should update cached content with TTL', async () => {
      const request: UpdateCachedContentRequest = {
        ttl: '7200s',
      };

      const mockResponse: CachedContent = {
        name: 'cachedContents/abc123',
        model: 'models/gemini-2.0-flash',
        createTime: '2024-01-01T00:00:00Z',
        updateTime: '2024-01-01T01:00:00Z',
        expireTime: '2024-01-01T03:00:00Z',
      };

      mockClient.enqueueJsonResponse(200, mockResponse);

      const response = await service.update('abc123', request);

      expect(response.name).toBe('cachedContents/abc123');
      const lastRequest = mockClient.getLastRequest();
      expect(lastRequest!.url).toContain('updateMask=ttl');
      mockClient.verifyRequestCount(1);
    });

    it('should update cached content with expire time', async () => {
      const request: UpdateCachedContentRequest = {
        expireTime: '2024-12-31T23:59:59Z',
      };

      mockClient.enqueueJsonResponse(200, {
        name: 'cachedContents/abc123',
        model: 'models/gemini-2.0-flash',
        expireTime: '2024-12-31T23:59:59Z',
      });

      await service.update('abc123', request);

      const lastRequest = mockClient.getLastRequest();
      expect(lastRequest!.url).toContain('updateMask=expireTime');
    });

    it('should throw error if both ttl and expireTime specified', async () => {
      const request: UpdateCachedContentRequest = {
        ttl: '3600s',
        expireTime: '2024-12-31T23:59:59Z',
      };

      await expect(service.update('abc123', request)).rejects.toThrow(
        'Cannot specify both ttl and expireTime'
      );
    });

    it('should throw error if neither ttl nor expireTime specified', async () => {
      const request: UpdateCachedContentRequest = {};

      await expect(service.update('abc123', request)).rejects.toThrow(
        'Must specify either ttl or expireTime'
      );
    });

    it('should throw error for empty name', async () => {
      const request: UpdateCachedContentRequest = { ttl: '3600s' };

      await expect(service.update('', request)).rejects.toThrow(ValidationError);
    });
  });

  describe('delete', () => {
    it('should delete cached content', async () => {
      mockClient.enqueueJsonResponse(200, {});

      await service.delete('abc123');

      mockClient.verifyRequestCount(1);
      const lastRequest = mockClient.getLastRequest();
      expect(lastRequest!.options.method).toBe('DELETE');
    });

    it('should normalize name for delete', async () => {
      mockClient.enqueueJsonResponse(200, {});

      await service.delete('cachedContents/abc123');

      const lastRequest = mockClient.getLastRequest();
      expect(lastRequest!.url).toContain('cachedContents/abc123');
    });

    it('should throw error for empty name', async () => {
      await expect(service.delete('')).rejects.toThrow(ValidationError);
    });
  });
});
