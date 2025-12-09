import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelsServiceImpl } from '../service.js';
import {
  createMockResilienceOrchestrator,
  mockResilienceOrchestratorResponse,
  mockResilienceOrchestratorError,
} from '../../../__mocks__/index.js';
import type { MockResilienceOrchestrator } from '../../../__mocks__/index.js';
import {
  createModel,
  createModelListResponse,
  createModelDeleteResponse,
  createFineTunedModel,
  create401UnauthorizedError,
  create404NotFoundError,
  create500InternalServerError,
} from '../../../__fixtures__/index.js';

describe('ModelsService', () => {
  let mockOrchestrator: MockResilienceOrchestrator;
  let service: ModelsServiceImpl;

  beforeEach(() => {
    mockOrchestrator = createMockResilienceOrchestrator();
    service = new ModelsServiceImpl(mockOrchestrator);
  });

  describe('list', () => {
    describe('happy path', () => {
      it('should list all models successfully', async () => {
        const response = createModelListResponse();

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.list();

        expect(result).toEqual(response);
        expect(result.data.length).toBeGreaterThan(0);
        expect(mockOrchestrator.request).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'GET',
            path: '/v1/models',
          })
        );
      });

      it('should include various model types', async () => {
        const response = createModelListResponse();

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.list();

        const modelIds = result.data.map((m) => m.id);
        expect(modelIds).toContain('gpt-4');
        expect(modelIds).toContain('gpt-3.5-turbo');
      });
    });

    describe('error handling', () => {
      it('should handle 401 unauthorized errors', async () => {
        mockResilienceOrchestratorError(
          mockOrchestrator,
          new Error('Unauthorized')
        );

        await expect(service.list()).rejects.toThrow('Unauthorized');
      });

      it('should handle 500 server errors', async () => {
        mockResilienceOrchestratorError(
          mockOrchestrator,
          new Error('Internal server error')
        );

        await expect(service.list()).rejects.toThrow('Internal server error');
      });
    });
  });

  describe('retrieve', () => {
    describe('happy path', () => {
      it('should retrieve a model by ID successfully', async () => {
        const response = createModel({ id: 'gpt-4' });

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.retrieve('gpt-4');

        expect(result).toEqual(response);
        expect(result.id).toBe('gpt-4');
        expect(mockOrchestrator.request).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'GET',
            path: '/v1/models/gpt-4',
          })
        );
      });

      it('should retrieve fine-tuned models', async () => {
        const response = createFineTunedModel();

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.retrieve(response.id);

        expect(result.id).toContain('ft:');
        expect(result.owned_by).toBe('acme');
      });
    });

    describe('error handling', () => {
      it('should handle 404 not found errors', async () => {
        mockResilienceOrchestratorError(
          mockOrchestrator,
          new Error('Not found')
        );

        await expect(service.retrieve('nonexistent-model')).rejects.toThrow(
          'Not found'
        );
      });

      it('should handle 401 unauthorized errors', async () => {
        mockResilienceOrchestratorError(
          mockOrchestrator,
          new Error('Unauthorized')
        );

        await expect(service.retrieve('gpt-4')).rejects.toThrow('Unauthorized');
      });
    });
  });

  describe('delete', () => {
    describe('happy path', () => {
      it('should delete a fine-tuned model successfully', async () => {
        const modelId = 'ft:gpt-3.5-turbo:acme:suffix:abc123';
        const response = createModelDeleteResponse({ id: modelId });

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.delete(modelId);

        expect(result).toEqual(response);
        expect(result.deleted).toBe(true);
        expect(mockOrchestrator.request).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'DELETE',
            path: `/v1/models/${modelId}`,
          })
        );
      });
    });

    describe('error handling', () => {
      it('should handle 404 not found errors', async () => {
        mockResilienceOrchestratorError(
          mockOrchestrator,
          new Error('Not found')
        );

        await expect(
          service.delete('ft:gpt-3.5-turbo:nonexistent')
        ).rejects.toThrow('Not found');
      });

      it('should handle unauthorized deletion attempts', async () => {
        mockResilienceOrchestratorError(
          mockOrchestrator,
          new Error('Forbidden')
        );

        await expect(service.delete('gpt-4')).rejects.toThrow('Forbidden');
      });
    });
  });
});
