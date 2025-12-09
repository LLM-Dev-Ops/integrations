import { describe, it, expect, beforeEach } from 'vitest';
import { BatchesServiceImpl } from '../service.js';
import {
  createMockResilienceOrchestrator,
  mockResilienceOrchestratorResponse,
  mockResilienceOrchestratorError,
} from '../../../__mocks__/index.js';
import type { MockResilienceOrchestrator } from '../../../__mocks__/index.js';
import {
  create401UnauthorizedError,
  create404NotFoundError,
  create500InternalServerError,
} from '../../../__fixtures__/index.js';

describe('BatchesService', () => {
  let mockOrchestrator: MockResilienceOrchestrator;
  let service: BatchesServiceImpl;

  beforeEach(() => {
    mockOrchestrator = createMockResilienceOrchestrator();
    service = new BatchesServiceImpl(mockOrchestrator);
  });

  describe('create', () => {
    it('should create a batch successfully', async () => {
      const response = {
        id: 'batch_abc123',
        object: 'batch',
        endpoint: '/v1/chat/completions',
        input_file_id: 'file-abc123',
        completion_window: '24h',
        status: 'validating',
        created_at: 1677652288,
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const result = await service.create({
        input_file_id: 'file-abc123',
        endpoint: '/v1/chat/completions',
        completion_window: '24h',
      });

      expect(result.id).toBe('batch_abc123');
      expect(result.status).toBe('validating');
      expect(mockOrchestrator.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/v1/batches',
        })
      );
    });

    it('should handle validation errors', async () => {
      await expect(
        service.create({
          input_file_id: '',
          endpoint: '/v1/chat/completions',
          completion_window: '24h',
        })
      ).rejects.toThrow();
    });

    it('should handle unauthorized errors', async () => {
      mockResilienceOrchestratorError(
        mockOrchestrator,
        new Error('Unauthorized')
      );

      await expect(
        service.create({
          input_file_id: 'file-123',
          endpoint: '/v1/chat/completions',
          completion_window: '24h',
        })
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('retrieve', () => {
    it('should retrieve a batch successfully', async () => {
      const response = {
        id: 'batch_abc123',
        object: 'batch',
        endpoint: '/v1/chat/completions',
        input_file_id: 'file-abc123',
        completion_window: '24h',
        status: 'completed',
        output_file_id: 'file-output123',
        error_file_id: null,
        created_at: 1677652288,
        completed_at: 1677738688,
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const result = await service.retrieve('batch_abc123');

      expect(result.id).toBe('batch_abc123');
      expect(result.status).toBe('completed');
      expect(mockOrchestrator.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: '/v1/batches/batch_abc123',
        })
      );
    });

    it('should handle not found errors', async () => {
      mockResilienceOrchestratorError(
        mockOrchestrator,
        new Error('Not found')
      );

      await expect(service.retrieve('batch_nonexistent')).rejects.toThrow(
        'Not found'
      );
    });
  });

  describe('list', () => {
    it('should list batches successfully', async () => {
      const response = {
        object: 'list',
        data: [
          {
            id: 'batch_1',
            object: 'batch',
            endpoint: '/v1/chat/completions',
            input_file_id: 'file-1',
            completion_window: '24h',
            status: 'completed',
            created_at: 1677652288,
          },
          {
            id: 'batch_2',
            object: 'batch',
            endpoint: '/v1/chat/completions',
            input_file_id: 'file-2',
            completion_window: '24h',
            status: 'in_progress',
            created_at: 1677652300,
          },
        ],
        has_more: false,
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const result = await service.list();

      expect(result.data).toHaveLength(2);
      expect(mockOrchestrator.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: '/v1/batches',
        })
      );
    });
  });

  describe('cancel', () => {
    it('should cancel a batch successfully', async () => {
      const response = {
        id: 'batch_abc123',
        object: 'batch',
        endpoint: '/v1/chat/completions',
        input_file_id: 'file-abc123',
        completion_window: '24h',
        status: 'cancelling',
        created_at: 1677652288,
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const result = await service.cancel('batch_abc123');

      expect(result.id).toBe('batch_abc123');
      expect(result.status).toBe('cancelling');
      expect(mockOrchestrator.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/v1/batches/batch_abc123/cancel',
        })
      );
    });

    it('should handle not found errors', async () => {
      mockResilienceOrchestratorError(
        mockOrchestrator,
        new Error('Not found')
      );

      await expect(service.cancel('batch_nonexistent')).rejects.toThrow(
        'Not found'
      );
    });
  });
});
