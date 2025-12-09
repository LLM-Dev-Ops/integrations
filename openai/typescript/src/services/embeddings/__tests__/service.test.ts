import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingsServiceImpl } from '../service.js';
import {
  createMockResilienceOrchestrator,
  mockResilienceOrchestratorResponse,
  mockResilienceOrchestratorError,
} from '../../../__mocks__/index.js';
import type { MockResilienceOrchestrator } from '../../../__mocks__/index.js';
import {
  createEmbeddingRequest,
  createEmbeddingResponse,
  createMultipleEmbeddingsResponse,
  createBatchEmbeddingRequest,
  create401UnauthorizedError,
  create429RateLimitError,
  create500InternalServerError,
  createTimeoutError,
  createValidationError,
} from '../../../__fixtures__/index.js';
import type { EmbeddingRequest } from '../types.js';

describe('EmbeddingsService', () => {
  let mockOrchestrator: MockResilienceOrchestrator;
  let service: EmbeddingsServiceImpl;

  beforeEach(() => {
    mockOrchestrator = createMockResilienceOrchestrator();
    service = new EmbeddingsServiceImpl(mockOrchestrator);
  });

  describe('create', () => {
    describe('happy path', () => {
      it('should create embeddings successfully', async () => {
        const request = createEmbeddingRequest();
        const response = createEmbeddingResponse();

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.create(request);

        expect(result).toEqual(response);
        expect(result.data).toHaveLength(1);
        expect(result.data[0].embedding).toHaveLength(1536);
        expect(mockOrchestrator.request).toHaveBeenCalledOnce();
      });

      it('should include model in request', async () => {
        const request = createEmbeddingRequest({
          model: 'text-embedding-3-small',
        });
        const response = createEmbeddingResponse({
          model: 'text-embedding-3-small',
        });

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.create(request);

        expect(result.model).toBe('text-embedding-3-small');
        expect(mockOrchestrator.request).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'POST',
            path: '/v1/embeddings',
            body: expect.objectContaining({ model: 'text-embedding-3-small' }),
          })
        );
      });

      it('should handle single text input', async () => {
        const request = createEmbeddingRequest({
          input: 'The quick brown fox',
        });
        const response = createEmbeddingResponse();

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.create(request);

        expect(result.data).toHaveLength(1);
        expect(mockOrchestrator.request).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({ input: 'The quick brown fox' }),
          })
        );
      });

      it('should handle batch text inputs', async () => {
        const request = createBatchEmbeddingRequest();
        const response = createMultipleEmbeddingsResponse(3);

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.create(request);

        expect(result.data).toHaveLength(3);
        expect(result.data[0].index).toBe(0);
        expect(result.data[1].index).toBe(1);
        expect(result.data[2].index).toBe(2);
      });

      it('should handle dimensions parameter', async () => {
        const request = createEmbeddingRequest({
          model: 'text-embedding-3-small',
          dimensions: 512,
        });
        const response = createEmbeddingResponse();

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        await service.create(request);

        expect(mockOrchestrator.request).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({ dimensions: 512 }),
          })
        );
      });

      it('should handle encoding_format parameter', async () => {
        const request = createEmbeddingRequest({
          encoding_format: 'base64',
        });
        const response = createEmbeddingResponse();

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        await service.create(request);

        expect(mockOrchestrator.request).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({ encoding_format: 'base64' }),
          })
        );
      });

      it('should handle user parameter', async () => {
        const request = createEmbeddingRequest({
          user: 'user-123',
        });
        const response = createEmbeddingResponse();

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        await service.create(request);

        expect(mockOrchestrator.request).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({ user: 'user-123' }),
          })
        );
      });

      it('should return usage information', async () => {
        const request = createEmbeddingRequest();
        const response = createEmbeddingResponse();

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.create(request);

        expect(result.usage).toBeDefined();
        expect(result.usage.prompt_tokens).toBeGreaterThan(0);
        expect(result.usage.total_tokens).toBeGreaterThan(0);
      });

      it('should pass request options through', async () => {
        const request = createEmbeddingRequest();
        const response = createEmbeddingResponse();
        const options = {
          headers: { 'X-Custom-Header': 'test' },
          timeout: 5000,
        };

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        await service.create(request, options);

        expect(mockOrchestrator.request).toHaveBeenCalledWith(
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-Custom-Header': 'test',
            }),
          })
        );
      });
    });

    describe('parameter validation', () => {
      it('should validate model is required', async () => {
        const request = { input: 'test' } as EmbeddingRequest;

        await expect(service.create(request)).rejects.toThrow();
      });

      it('should validate input is required', async () => {
        const request = {
          model: 'text-embedding-ada-002',
        } as EmbeddingRequest;

        await expect(service.create(request)).rejects.toThrow();
      });

      it('should validate input is not empty string', async () => {
        const request = createEmbeddingRequest({ input: '' });

        await expect(service.create(request)).rejects.toThrow();
      });

      it('should validate input array is not empty', async () => {
        const request = createEmbeddingRequest({ input: [] });

        await expect(service.create(request)).rejects.toThrow();
      });

      it('should validate dimensions is positive', async () => {
        const request = createEmbeddingRequest({
          model: 'text-embedding-3-small',
          dimensions: -1,
        });

        await expect(service.create(request)).rejects.toThrow();
      });
    });

    describe('error handling', () => {
      it('should handle 401 unauthorized errors', async () => {
        const request = createEmbeddingRequest();

        mockResilienceOrchestratorError(
          mockOrchestrator,
          new Error('Unauthorized')
        );

        await expect(service.create(request)).rejects.toThrow('Unauthorized');
      });

      it('should handle 429 rate limit errors', async () => {
        const request = createEmbeddingRequest();

        mockResilienceOrchestratorError(
          mockOrchestrator,
          new Error('Rate limit reached')
        );

        await expect(service.create(request)).rejects.toThrow(
          'Rate limit reached'
        );
      });

      it('should handle 500 server errors', async () => {
        const request = createEmbeddingRequest();

        mockResilienceOrchestratorError(
          mockOrchestrator,
          new Error('Internal server error')
        );

        await expect(service.create(request)).rejects.toThrow(
          'Internal server error'
        );
      });

      it('should handle timeout errors', async () => {
        const request = createEmbeddingRequest();
        const timeoutError = createTimeoutError();

        mockResilienceOrchestratorError(mockOrchestrator, timeoutError);

        await expect(service.create(request)).rejects.toThrow('Request timeout');
      });

      it('should handle network errors', async () => {
        const request = createEmbeddingRequest();

        mockResilienceOrchestratorError(
          mockOrchestrator,
          new Error('Network request failed')
        );

        await expect(service.create(request)).rejects.toThrow(
          'Network request failed'
        );
      });

      it('should handle validation errors from API', async () => {
        const request = createEmbeddingRequest();
        const validationError = createValidationError('model');

        mockResilienceOrchestratorResponse(mockOrchestrator, validationError);

        const result = await service.create(request);

        expect(result).toEqual(validationError.data);
      });
    });

    describe('retry behavior', () => {
      it('should respect resilience orchestrator retry logic', async () => {
        const request = createEmbeddingRequest();

        mockOrchestrator.request
          .mockRejectedValueOnce(new Error('Temporary error'))
          .mockResolvedValueOnce({
            status: 200,
            headers: { 'content-type': 'application/json' },
            data: createEmbeddingResponse(),
          });

        // The orchestrator handles retries internally
        // This test verifies the service doesn't interfere with retry logic
        await expect(service.create(request)).rejects.toThrow('Temporary error');
        expect(mockOrchestrator.request).toHaveBeenCalledOnce();
      });
    });
  });
});
