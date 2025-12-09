import { describe, it, expect, beforeEach } from 'vitest';
import { FineTuningServiceImpl } from '../service.js';
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

describe('FineTuningService', () => {
  let mockOrchestrator: MockResilienceOrchestrator;
  let service: FineTuningServiceImpl;

  beforeEach(() => {
    mockOrchestrator = createMockResilienceOrchestrator();
    service = new FineTuningServiceImpl(mockOrchestrator);
  });

  describe('create', () => {
    it('should create a fine-tuning job successfully', async () => {
      const response = {
        id: 'ftjob-abc123',
        object: 'fine_tuning.job',
        model: 'gpt-3.5-turbo',
        created_at: 1677652288,
        finished_at: null,
        fine_tuned_model: null,
        organization_id: 'org-123',
        result_files: [],
        status: 'created',
        validation_file: null,
        training_file: 'file-abc123',
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const result = await service.create({
        model: 'gpt-3.5-turbo',
        training_file: 'file-abc123',
      });

      expect(result.id).toBe('ftjob-abc123');
      expect(result.status).toBe('created');
      expect(mockOrchestrator.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/v1/fine_tuning/jobs',
        })
      );
    });

    it('should handle validation errors', async () => {
      await expect(
        service.create({ model: '', training_file: 'file-123' })
      ).rejects.toThrow();
    });

    it('should handle unauthorized errors', async () => {
      mockResilienceOrchestratorError(
        mockOrchestrator,
        new Error('Unauthorized')
      );

      await expect(
        service.create({ model: 'gpt-3.5-turbo', training_file: 'file-123' })
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('retrieve', () => {
    it('should retrieve a fine-tuning job successfully', async () => {
      const response = {
        id: 'ftjob-abc123',
        object: 'fine_tuning.job',
        model: 'gpt-3.5-turbo',
        created_at: 1677652288,
        finished_at: 1677738688,
        fine_tuned_model: 'ft:gpt-3.5-turbo:acme:suffix:abc123',
        organization_id: 'org-123',
        result_files: ['file-result123'],
        status: 'succeeded',
        validation_file: null,
        training_file: 'file-abc123',
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const result = await service.retrieve('ftjob-abc123');

      expect(result.id).toBe('ftjob-abc123');
      expect(result.status).toBe('succeeded');
      expect(mockOrchestrator.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: '/v1/fine_tuning/jobs/ftjob-abc123',
        })
      );
    });

    it('should handle not found errors', async () => {
      mockResilienceOrchestratorError(
        mockOrchestrator,
        new Error('Not found')
      );

      await expect(service.retrieve('ftjob-nonexistent')).rejects.toThrow(
        'Not found'
      );
    });
  });

  describe('list', () => {
    it('should list fine-tuning jobs successfully', async () => {
      const response = {
        object: 'list',
        data: [
          {
            id: 'ftjob-1',
            object: 'fine_tuning.job',
            model: 'gpt-3.5-turbo',
            created_at: 1677652288,
            status: 'succeeded',
            training_file: 'file-1',
          },
          {
            id: 'ftjob-2',
            object: 'fine_tuning.job',
            model: 'gpt-3.5-turbo',
            created_at: 1677652300,
            status: 'running',
            training_file: 'file-2',
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
          path: '/v1/fine_tuning/jobs',
        })
      );
    });
  });

  describe('cancel', () => {
    it('should cancel a fine-tuning job successfully', async () => {
      const response = {
        id: 'ftjob-abc123',
        object: 'fine_tuning.job',
        model: 'gpt-3.5-turbo',
        created_at: 1677652288,
        status: 'cancelled',
        training_file: 'file-abc123',
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const result = await service.cancel('ftjob-abc123');

      expect(result.id).toBe('ftjob-abc123');
      expect(result.status).toBe('cancelled');
      expect(mockOrchestrator.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/v1/fine_tuning/jobs/ftjob-abc123/cancel',
        })
      );
    });

    it('should handle not found errors', async () => {
      mockResilienceOrchestratorError(
        mockOrchestrator,
        new Error('Not found')
      );

      await expect(service.cancel('ftjob-nonexistent')).rejects.toThrow(
        'Not found'
      );
    });
  });

  describe('listEvents', () => {
    it('should list fine-tuning job events successfully', async () => {
      const response = {
        object: 'list',
        data: [
          {
            object: 'fine_tuning.job.event',
            id: 'ftevent-1',
            created_at: 1677652288,
            level: 'info',
            message: 'Job created',
          },
          {
            object: 'fine_tuning.job.event',
            id: 'ftevent-2',
            created_at: 1677652300,
            level: 'info',
            message: 'Training started',
          },
        ],
        has_more: false,
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const result = await service.listEvents('ftjob-abc123');

      expect(result.data).toHaveLength(2);
      expect(mockOrchestrator.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: '/v1/fine_tuning/jobs/ftjob-abc123/events',
        })
      );
    });
  });
});
