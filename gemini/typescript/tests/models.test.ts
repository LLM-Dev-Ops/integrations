/**
 * Models service tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockHttpClient } from '../src/__mocks__/index.js';
import { ModelsServiceImpl } from '../src/services/models.js';
import type { Model, ListModelsResponse } from '../src/types/index.js';
import { ValidationError } from '../src/error/index.js';

describe('ModelsService', () => {
  let mockClient: MockHttpClient;
  let service: ModelsServiceImpl;

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
      getHeaders: () => ({}),
      fetch: (url: string, init?: RequestInit) => mockClient.request(url, init),
    };
    service = new ModelsServiceImpl(httpClient as any);
  });

  describe('list', () => {
    it('should list models successfully', async () => {
      const mockResponse: ListModelsResponse = {
        models: [
          {
            name: 'models/gemini-2.0-flash',
            displayName: 'Gemini 2.0 Flash',
            description: 'Fast and efficient',
            supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
          },
          {
            name: 'models/gemini-1.5-pro',
            displayName: 'Gemini 1.5 Pro',
            description: 'Advanced reasoning',
            supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
          },
        ],
      };

      mockClient.enqueueJsonResponse(200, mockResponse);

      const response = await service.list();

      expect(response.models).toHaveLength(2);
      expect(response.models[0].name).toBe('models/gemini-2.0-flash');
      mockClient.verifyRequestCount(1);
    });

    it('should list models with pagination', async () => {
      const mockResponse: ListModelsResponse = {
        models: [{ name: 'models/model1', supportedGenerationMethods: [] }],
        nextPageToken: 'token123',
      };

      mockClient.enqueueJsonResponse(200, mockResponse);

      const response = await service.list({ pageSize: 10 });

      expect(response.nextPageToken).toBe('token123');
      const lastRequest = mockClient.getLastRequest();
      expect(lastRequest!.url).toContain('pageSize=10');
    });

    it('should handle page token', async () => {
      mockClient.enqueueJsonResponse(200, { models: [] });

      await service.list({ pageToken: 'next-page-token' });

      const lastRequest = mockClient.getLastRequest();
      expect(lastRequest!.url).toContain('pageToken=next-page-token');
    });

    it('should throw error for invalid page size', async () => {
      await expect(service.list({ pageSize: 0 })).rejects.toThrow(ValidationError);
      await expect(service.list({ pageSize: -1 })).rejects.toThrow(ValidationError);
    });
  });

  describe('get', () => {
    it('should get model by name', async () => {
      const mockModel: Model = {
        name: 'models/gemini-2.0-flash',
        displayName: 'Gemini 2.0 Flash',
        description: 'Fast model',
        supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
        inputTokenLimit: 1000000,
        outputTokenLimit: 8192,
      };

      mockClient.enqueueJsonResponse(200, mockModel);

      const model = await service.get('gemini-2.0-flash');

      expect(model.name).toBe('models/gemini-2.0-flash');
      expect(model.displayName).toBe('Gemini 2.0 Flash');
      expect(model.inputTokenLimit).toBe(1000000);
      mockClient.verifyRequestCount(1);
    });

    it('should normalize model name without prefix', async () => {
      const mockModel: Model = {
        name: 'models/gemini-2.0-flash',
        supportedGenerationMethods: [],
      };

      mockClient.enqueueJsonResponse(200, mockModel);

      await service.get('gemini-2.0-flash');

      const lastRequest = mockClient.getLastRequest();
      expect(lastRequest!.url).toContain('models/gemini-2.0-flash');
    });

    it('should handle model name with prefix', async () => {
      const mockModel: Model = {
        name: 'models/gemini-2.0-flash',
        supportedGenerationMethods: [],
      };

      mockClient.enqueueJsonResponse(200, mockModel);

      await service.get('models/gemini-2.0-flash');

      const lastRequest = mockClient.getLastRequest();
      expect(lastRequest!.url).toContain('models/gemini-2.0-flash');
    });

    it('should throw error for empty model name', async () => {
      await expect(service.get('')).rejects.toThrow(ValidationError);
    });

    it('should cache model information', async () => {
      const mockModel: Model = {
        name: 'models/gemini-2.0-flash',
        supportedGenerationMethods: [],
      };

      mockClient.enqueueJsonResponse(200, mockModel);

      // First call - should hit the API
      await service.get('gemini-2.0-flash');
      expect(mockClient.getRequests()).toHaveLength(1);

      // Second call - should use cache (no new request)
      const cached = await service.get('gemini-2.0-flash');
      expect(mockClient.getRequests()).toHaveLength(1);
      expect(cached.name).toBe('models/gemini-2.0-flash');
    });
  });

  describe('listAll', () => {
    it('should list all models across pages', async () => {
      const page1: ListModelsResponse = {
        models: [
          { name: 'models/model1', supportedGenerationMethods: [] },
          { name: 'models/model2', supportedGenerationMethods: [] },
        ],
        nextPageToken: 'token1',
      };

      const page2: ListModelsResponse = {
        models: [
          { name: 'models/model3', supportedGenerationMethods: [] },
          { name: 'models/model4', supportedGenerationMethods: [] },
        ],
        nextPageToken: 'token2',
      };

      const page3: ListModelsResponse = {
        models: [{ name: 'models/model5', supportedGenerationMethods: [] }],
      };

      mockClient.enqueueJsonResponse(200, page1);
      mockClient.enqueueJsonResponse(200, page2);
      mockClient.enqueueJsonResponse(200, page3);

      const allModels = await service.listAll();

      expect(allModels).toHaveLength(5);
      expect(allModels[0].name).toBe('models/model1');
      expect(allModels[4].name).toBe('models/model5');
      mockClient.verifyRequestCount(3);
    });

    it('should handle single page', async () => {
      const response: ListModelsResponse = {
        models: [{ name: 'models/model1', supportedGenerationMethods: [] }],
      };

      mockClient.enqueueJsonResponse(200, response);

      const allModels = await service.listAll();

      expect(allModels).toHaveLength(1);
      mockClient.verifyRequestCount(1);
    });

    it('should handle empty response', async () => {
      mockClient.enqueueJsonResponse(200, { models: [] });

      const allModels = await service.listAll();

      expect(allModels).toHaveLength(0);
    });
  });

  describe('cache management', () => {
    it('should clear cache', async () => {
      const mockModel: Model = {
        name: 'models/test',
        supportedGenerationMethods: [],
      };

      mockClient.enqueueJsonResponse(200, mockModel);
      await service.get('test');

      service.clearCache();

      mockClient.enqueueJsonResponse(200, mockModel);
      await service.get('test');

      // Should make 2 requests since cache was cleared
      expect(mockClient.getRequests()).toHaveLength(2);
    });
  });
});
