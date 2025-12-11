/**
 * Embeddings service tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockHttpClient } from '../src/__mocks__/index.js';
import { EmbeddingsServiceImpl } from '../src/services/embeddings.js';
import type { EmbedContentRequest } from '../src/types/index.js';
import { ValidationError } from '../src/error/index.js';

describe('EmbeddingsService', () => {
  let mockClient: MockHttpClient;
  let service: EmbeddingsServiceImpl;

  beforeEach(() => {
    mockClient = new MockHttpClient();
    const httpClient = {
      buildUrl: (endpoint: string) => `https://generativelanguage.googleapis.com/v1/${endpoint}?key=test-key`,
      getHeaders: () => ({ 'Content-Type': 'application/json' }),
      fetch: (url: string, init?: RequestInit) => mockClient.request(url, init),
    };
    service = new EmbeddingsServiceImpl(httpClient as any);
  });

  describe('embed', () => {
    it('should generate single embedding successfully', async () => {
      const request: EmbedContentRequest = {
        content: { parts: [{ text: 'Embed this text' }] },
      };

      const mockResponse = {
        embedding: {
          values: [0.1, 0.2, 0.3, 0.4, 0.5],
        },
      };

      mockClient.enqueueJsonResponse(200, mockResponse);

      const response = await service.embed('text-embedding-004', request);

      expect(response.embedding.values).toHaveLength(5);
      expect(response.embedding.values[0]).toBe(0.1);
      mockClient.verifyRequestCount(1);
    });

    it('should include task type when specified', async () => {
      const request: EmbedContentRequest = {
        content: { parts: [{ text: 'Search query' }] },
        taskType: 'RETRIEVAL_QUERY',
      };

      mockClient.enqueueJsonResponse(200, {
        embedding: { values: [0.1, 0.2] },
      });

      await service.embed('text-embedding-004', request);

      const lastRequest = mockClient.getLastRequest();
      const body = JSON.parse(lastRequest!.options.body as string);
      expect(body.taskType).toBe('RETRIEVAL_QUERY');
    });

    it('should include title for document embeddings', async () => {
      const request: EmbedContentRequest = {
        content: { parts: [{ text: 'Document content' }] },
        taskType: 'RETRIEVAL_DOCUMENT',
        title: 'My Document',
      };

      mockClient.enqueueJsonResponse(200, {
        embedding: { values: [0.1] },
      });

      await service.embed('text-embedding-004', request);

      const lastRequest = mockClient.getLastRequest();
      const body = JSON.parse(lastRequest!.options.body as string);
      expect(body.title).toBe('My Document');
    });

    it('should throw validation error for empty model', async () => {
      const request: EmbedContentRequest = {
        content: { parts: [{ text: 'test' }] },
      };

      await expect(service.embed('', request)).rejects.toThrow(ValidationError);
    });

    it('should throw validation error for empty content', async () => {
      const request: EmbedContentRequest = {
        content: { parts: [] },
      };

      await expect(service.embed('text-embedding-004', request)).rejects.toThrow(ValidationError);
    });

    it('should throw validation error for missing content', async () => {
      const request = {} as EmbedContentRequest;

      await expect(service.embed('text-embedding-004', request)).rejects.toThrow(ValidationError);
    });
  });

  describe('batchEmbed', () => {
    it('should generate batch embeddings successfully', async () => {
      const requests: EmbedContentRequest[] = [
        { content: { parts: [{ text: 'First text' }] } },
        { content: { parts: [{ text: 'Second text' }] } },
        { content: { parts: [{ text: 'Third text' }] } },
      ];

      const mockResponse = {
        embeddings: [
          { values: [0.1, 0.2, 0.3] },
          { values: [0.4, 0.5, 0.6] },
          { values: [0.7, 0.8, 0.9] },
        ],
      };

      mockClient.enqueueJsonResponse(200, mockResponse);

      const response = await service.batchEmbed('text-embedding-004', requests);

      expect(response.embeddings).toHaveLength(3);
      expect(response.embeddings[0].values[0]).toBe(0.1);
      expect(response.embeddings[1].values[0]).toBe(0.4);
      expect(response.embeddings[2].values[0]).toBe(0.7);
      mockClient.verifyRequestCount(1);
    });

    it('should handle single item batch', async () => {
      const requests: EmbedContentRequest[] = [
        { content: { parts: [{ text: 'Single item' }] } },
      ];

      mockClient.enqueueJsonResponse(200, {
        embeddings: [{ values: [0.5] }],
      });

      const response = await service.batchEmbed('text-embedding-004', requests);

      expect(response.embeddings).toHaveLength(1);
    });

    it('should throw error for empty batch', async () => {
      await expect(service.batchEmbed('text-embedding-004', [])).rejects.toThrow(ValidationError);
    });

    it('should throw error for batch exceeding max size', async () => {
      const requests = Array.from({ length: 101 }, () => ({
        content: { parts: [{ text: 'text' }] },
      }));

      await expect(service.batchEmbed('text-embedding-004', requests)).rejects.toThrow(
        'Batch size exceeds maximum'
      );
    });

    it('should validate each request in batch', async () => {
      const requests: EmbedContentRequest[] = [
        { content: { parts: [{ text: 'Valid' }] } },
        { content: { parts: [] } }, // Invalid
      ];

      await expect(service.batchEmbed('text-embedding-004', requests)).rejects.toThrow(
        'Validation failed for request at index 1'
      );
    });

    it('should validate model name for batch', async () => {
      const requests: EmbedContentRequest[] = [
        { content: { parts: [{ text: 'test' }] } },
      ];

      await expect(service.batchEmbed('', requests)).rejects.toThrow(ValidationError);
    });

    it('should handle mixed task types in batch', async () => {
      const requests: EmbedContentRequest[] = [
        { content: { parts: [{ text: 'Query' }] }, taskType: 'RETRIEVAL_QUERY' },
        { content: { parts: [{ text: 'Document' }] }, taskType: 'RETRIEVAL_DOCUMENT' },
      ];

      mockClient.enqueueJsonResponse(200, {
        embeddings: [{ values: [0.1] }, { values: [0.2] }],
      });

      const response = await service.batchEmbed('text-embedding-004', requests);

      expect(response.embeddings).toHaveLength(2);
      const lastRequest = mockClient.getLastRequest();
      const body = JSON.parse(lastRequest!.options.body as string);
      expect(body.requests).toHaveLength(2);
      expect(body.requests[0].taskType).toBe('RETRIEVAL_QUERY');
      expect(body.requests[1].taskType).toBe('RETRIEVAL_DOCUMENT');
    });
  });
});
