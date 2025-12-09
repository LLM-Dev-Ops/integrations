import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModelsServiceImpl } from '../service.js';
import type { ModelInfo, ModelListResponse } from '../types.js';
import { createMockHttpTransport, mockHttpTransportResponse, mockHttpTransportError } from '../../../__mocks__/http-transport.mock.js';
import { createMockAuthManager } from '../../../__mocks__/auth-manager.mock.js';
import { createMockResilienceOrchestrator, mockResilienceOrchestratorError } from '../../../__mocks__/resilience.mock.js';
import { ServerError } from '../../../errors/categories.js';

describe('ModelsServiceImpl', () => {
  let service: ModelsServiceImpl;
  let mockTransport: ReturnType<typeof createMockHttpTransport>;
  let mockAuth: ReturnType<typeof createMockAuthManager>;
  let mockResilience: ReturnType<typeof createMockResilienceOrchestrator>;

  beforeEach(() => {
    mockTransport = createMockHttpTransport();
    mockAuth = createMockAuthManager();
    mockResilience = createMockResilienceOrchestrator();
    service = new ModelsServiceImpl(mockTransport, mockAuth, mockResilience);
  });

  describe('list', () => {
    it('should list models successfully', async () => {
      const expectedResponse: ModelListResponse = {
        data: [
          {
            id: 'claude-3-5-sonnet-20241022',
            display_name: 'Claude 3.5 Sonnet',
            created_at: '2024-10-22T00:00:00Z',
            type: 'model',
          },
          {
            id: 'claude-3-5-haiku-20241022',
            display_name: 'Claude 3.5 Haiku',
            created_at: '2024-10-22T00:00:00Z',
            type: 'model',
          },
        ],
        has_more: false,
        first_id: 'claude-3-5-sonnet-20241022',
        last_id: 'claude-3-5-haiku-20241022',
      };

      mockTransport.request.mockResolvedValue(expectedResponse);

      const result = await service.list();

      expect(result).toEqual(expectedResponse);
      expect(mockAuth.getHeaders).toHaveBeenCalled();
      expect(mockResilience.execute).toHaveBeenCalled();
      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/models',
        undefined,
        {
          headers: {
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
        }
      );
    });

    it('should pass request options to transport', async () => {
      const options = {
        headers: { 'custom-header': 'value' },
        timeout: 30000,
        signal: new AbortController().signal,
      };

      mockTransport.request.mockResolvedValue({ data: [], has_more: false });

      await service.list(options);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/models',
        undefined,
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'custom-header': 'value',
          }),
          timeout: 30000,
          signal: options.signal,
        })
      );
    });

    it('should handle API errors through resilience orchestrator', async () => {
      const apiError = new ServerError('Server error', 500);
      mockResilienceOrchestratorError(mockResilience, apiError);

      await expect(service.list()).rejects.toThrow(apiError);
    });

    it('should return empty list when no models available', async () => {
      const expectedResponse: ModelListResponse = {
        data: [],
        has_more: false,
      };

      mockTransport.request.mockResolvedValue(expectedResponse);

      const result = await service.list();

      expect(result).toEqual(expectedResponse);
      expect(result.data).toHaveLength(0);
    });

    it('should support pagination with has_more flag', async () => {
      const expectedResponse: ModelListResponse = {
        data: [
          {
            id: 'claude-3-5-sonnet-20241022',
            display_name: 'Claude 3.5 Sonnet',
            type: 'model',
          },
        ],
        has_more: true,
        first_id: 'claude-3-5-sonnet-20241022',
        last_id: 'claude-3-5-sonnet-20241022',
      };

      mockTransport.request.mockResolvedValue(expectedResponse);

      const result = await service.list();

      expect(result.has_more).toBe(true);
      expect(result.first_id).toBe('claude-3-5-sonnet-20241022');
      expect(result.last_id).toBe('claude-3-5-sonnet-20241022');
    });
  });

  describe('retrieve', () => {
    it('should retrieve a model successfully', async () => {
      const expectedResponse: ModelInfo = {
        id: 'claude-3-5-sonnet-20241022',
        display_name: 'Claude 3.5 Sonnet',
        created_at: '2024-10-22T00:00:00Z',
        type: 'model',
      };

      mockTransport.request.mockResolvedValue(expectedResponse);

      const result = await service.retrieve('claude-3-5-sonnet-20241022');

      expect(result).toEqual(expectedResponse);
      expect(mockAuth.getHeaders).toHaveBeenCalled();
      expect(mockResilience.execute).toHaveBeenCalled();
      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/models/claude-3-5-sonnet-20241022',
        undefined,
        {
          headers: {
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
        }
      );
    });

    it('should pass request options to transport', async () => {
      const options = {
        headers: { 'custom-header': 'value' },
        timeout: 10000,
      };

      mockTransport.request.mockResolvedValue({
        id: 'claude-3-5-sonnet-20241022',
        display_name: 'Claude 3.5 Sonnet',
        type: 'model',
      });

      await service.retrieve('claude-3-5-sonnet-20241022', options);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/models/claude-3-5-sonnet-20241022',
        undefined,
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'custom-header': 'value',
          }),
          timeout: 10000,
        })
      );
    });

    it('should throw error for missing model ID', async () => {
      await expect(service.retrieve('')).rejects.toThrow('Model ID is required and must be a non-empty string');
    });

    it('should throw error for whitespace-only model ID', async () => {
      await expect(service.retrieve('   ')).rejects.toThrow('Model ID is required and must be a non-empty string');
    });

    it('should throw error for null model ID', async () => {
      await expect(service.retrieve(null as any)).rejects.toThrow('Model ID is required and must be a non-empty string');
    });

    it('should throw error for undefined model ID', async () => {
      await expect(service.retrieve(undefined as any)).rejects.toThrow('Model ID is required and must be a non-empty string');
    });

    it('should handle API errors through resilience orchestrator', async () => {
      const apiError = new ServerError('Server error', 500);
      mockResilienceOrchestratorError(mockResilience, apiError);

      await expect(service.retrieve('claude-3-5-sonnet-20241022')).rejects.toThrow(apiError);
    });

    it('should retrieve model without created_at field', async () => {
      const expectedResponse: ModelInfo = {
        id: 'claude-3-opus-20240229',
        display_name: 'Claude 3 Opus',
        type: 'model',
      };

      mockTransport.request.mockResolvedValue(expectedResponse);

      const result = await service.retrieve('claude-3-opus-20240229');

      expect(result).toEqual(expectedResponse);
      expect(result.created_at).toBeUndefined();
    });

    it('should handle different model ID formats', async () => {
      const modelIds = [
        'claude-3-5-sonnet-20241022',
        'claude-3-opus-20240229',
        'claude-instant-1.2',
      ];

      for (const modelId of modelIds) {
        mockTransport.request.mockResolvedValue({
          id: modelId,
          display_name: 'Test Model',
          type: 'model',
        });

        await service.retrieve(modelId);

        expect(mockTransport.request).toHaveBeenCalledWith(
          'GET',
          `/v1/models/${modelId}`,
          undefined,
          expect.anything()
        );
      }
    });
  });
});
