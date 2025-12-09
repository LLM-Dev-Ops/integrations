import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '../../client/factory.js';
import type { OpenAIClient } from '../../client/index.js';
import {
  mockEmbeddings,
  mockUnauthorizedError,
  mockRateLimitError,
  mockServerError,
} from './setup.js';
import {
  createEmbeddingResponse,
  createMultipleEmbeddingsResponse,
} from '../../__fixtures__/index.js';

describe('Embeddings Integration Tests', () => {
  let client: OpenAIClient;

  beforeEach(() => {
    client = createClient({
      apiKey: 'sk-test-key',
      baseURL: 'https://api.openai.com',
    });
  });

  describe('create', () => {
    it('should create embeddings successfully', async () => {
      const response = createEmbeddingResponse();
      mockEmbeddings(response);

      const result = await client.embeddings.create({
        model: 'text-embedding-ada-002',
        input: 'The quick brown fox jumps over the lazy dog',
      });

      expect(result.object).toBe('list');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].embedding).toHaveLength(1536);
      expect(result.usage).toBeDefined();
    });

    it('should handle single text input', async () => {
      const response = createEmbeddingResponse();
      mockEmbeddings(response);

      const result = await client.embeddings.create({
        model: 'text-embedding-ada-002',
        input: 'Test input',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].index).toBe(0);
    });

    it('should handle batch text inputs', async () => {
      const response = createMultipleEmbeddingsResponse(3);
      mockEmbeddings(response);

      const result = await client.embeddings.create({
        model: 'text-embedding-ada-002',
        input: ['Text 1', 'Text 2', 'Text 3'],
      });

      expect(result.data).toHaveLength(3);
      expect(result.data[0].index).toBe(0);
      expect(result.data[1].index).toBe(1);
      expect(result.data[2].index).toBe(2);
    });

    it('should handle dimensions parameter', async () => {
      const response = createEmbeddingResponse();
      mockEmbeddings(response);

      const result = await client.embeddings.create({
        model: 'text-embedding-3-small',
        input: 'Test input',
        dimensions: 512,
      });

      expect(result.data).toHaveLength(1);
    });

    it('should handle encoding_format parameter', async () => {
      const response = createEmbeddingResponse();
      mockEmbeddings(response);

      const result = await client.embeddings.create({
        model: 'text-embedding-ada-002',
        input: 'Test input',
        encoding_format: 'float',
      });

      expect(result.data[0].embedding).toBeDefined();
      expect(Array.isArray(result.data[0].embedding)).toBe(true);
    });

    it('should return usage information', async () => {
      const response = createEmbeddingResponse();
      mockEmbeddings(response);

      const result = await client.embeddings.create({
        model: 'text-embedding-ada-002',
        input: 'Test input',
      });

      expect(result.usage).toBeDefined();
      expect(result.usage.prompt_tokens).toBeGreaterThan(0);
      expect(result.usage.total_tokens).toBeGreaterThan(0);
    });

    it('should handle 401 unauthorized errors', async () => {
      mockUnauthorizedError();

      await expect(
        client.embeddings.create({
          model: 'text-embedding-ada-002',
          input: 'Test input',
        })
      ).rejects.toThrow();
    });

    it('should handle 429 rate limit errors', async () => {
      mockRateLimitError();

      await expect(
        client.embeddings.create({
          model: 'text-embedding-ada-002',
          input: 'Test input',
        })
      ).rejects.toThrow();
    });

    it('should handle 500 server errors', async () => {
      mockServerError();

      await expect(
        client.embeddings.create({
          model: 'text-embedding-ada-002',
          input: 'Test input',
        })
      ).rejects.toThrow();
    });
  });
});
