import { describe, it, expect, beforeEach } from 'vitest';
import { AssistantsServiceImpl } from '../service.js';
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

describe('AssistantsService', () => {
  let mockOrchestrator: MockResilienceOrchestrator;
  let service: AssistantsServiceImpl;

  beforeEach(() => {
    mockOrchestrator = createMockResilienceOrchestrator();
    service = new AssistantsServiceImpl(mockOrchestrator);
  });

  describe('create', () => {
    it('should create an assistant successfully', async () => {
      const response = {
        id: 'asst_abc123',
        object: 'assistant',
        created_at: 1677652288,
        name: 'Math Tutor',
        description: 'An assistant that helps with math',
        model: 'gpt-4',
        instructions: 'You are a helpful math tutor.',
        tools: [],
        file_ids: [],
        metadata: {},
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const result = await service.create({
        model: 'gpt-4',
        name: 'Math Tutor',
        description: 'An assistant that helps with math',
        instructions: 'You are a helpful math tutor.',
      });

      expect(result.id).toBe('asst_abc123');
      expect(result.name).toBe('Math Tutor');
      expect(mockOrchestrator.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/v1/assistants',
        })
      );
    });

    it('should create assistant with tools', async () => {
      const response = {
        id: 'asst_abc123',
        object: 'assistant',
        created_at: 1677652288,
        name: 'Code Helper',
        model: 'gpt-4',
        instructions: 'You help with code.',
        tools: [{ type: 'code_interpreter' }, { type: 'retrieval' }],
        file_ids: [],
        metadata: {},
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const result = await service.create({
        model: 'gpt-4',
        name: 'Code Helper',
        instructions: 'You help with code.',
        tools: [{ type: 'code_interpreter' }, { type: 'retrieval' }],
      });

      expect(result.tools).toHaveLength(2);
    });

    it('should handle validation errors', async () => {
      await expect(service.create({ model: '', name: 'Test' })).rejects.toThrow();
    });

    it('should handle unauthorized errors', async () => {
      mockResilienceOrchestratorError(
        mockOrchestrator,
        new Error('Unauthorized')
      );

      await expect(
        service.create({ model: 'gpt-4', name: 'Test' })
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('retrieve', () => {
    it('should retrieve an assistant successfully', async () => {
      const response = {
        id: 'asst_abc123',
        object: 'assistant',
        created_at: 1677652288,
        name: 'Math Tutor',
        model: 'gpt-4',
        instructions: 'You are a helpful math tutor.',
        tools: [],
        file_ids: [],
        metadata: {},
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const result = await service.retrieve('asst_abc123');

      expect(result.id).toBe('asst_abc123');
      expect(mockOrchestrator.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: '/v1/assistants/asst_abc123',
        })
      );
    });

    it('should handle not found errors', async () => {
      mockResilienceOrchestratorError(
        mockOrchestrator,
        new Error('Not found')
      );

      await expect(service.retrieve('asst_nonexistent')).rejects.toThrow(
        'Not found'
      );
    });
  });

  describe('update', () => {
    it('should update an assistant successfully', async () => {
      const response = {
        id: 'asst_abc123',
        object: 'assistant',
        created_at: 1677652288,
        name: 'Updated Math Tutor',
        model: 'gpt-4',
        instructions: 'Updated instructions',
        tools: [],
        file_ids: [],
        metadata: {},
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const result = await service.update('asst_abc123', {
        name: 'Updated Math Tutor',
        instructions: 'Updated instructions',
      });

      expect(result.name).toBe('Updated Math Tutor');
      expect(mockOrchestrator.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/v1/assistants/asst_abc123',
        })
      );
    });
  });

  describe('list', () => {
    it('should list assistants successfully', async () => {
      const response = {
        object: 'list',
        data: [
          {
            id: 'asst_1',
            object: 'assistant',
            created_at: 1677652288,
            name: 'Assistant 1',
            model: 'gpt-4',
            tools: [],
            file_ids: [],
          },
          {
            id: 'asst_2',
            object: 'assistant',
            created_at: 1677652300,
            name: 'Assistant 2',
            model: 'gpt-4',
            tools: [],
            file_ids: [],
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
          path: '/v1/assistants',
        })
      );
    });
  });

  describe('delete', () => {
    it('should delete an assistant successfully', async () => {
      const response = {
        id: 'asst_abc123',
        object: 'assistant.deleted',
        deleted: true,
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const result = await service.delete('asst_abc123');

      expect(result.deleted).toBe(true);
      expect(mockOrchestrator.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
          path: '/v1/assistants/asst_abc123',
        })
      );
    });

    it('should handle not found errors', async () => {
      mockResilienceOrchestratorError(
        mockOrchestrator,
        new Error('Not found')
      );

      await expect(service.delete('asst_nonexistent')).rejects.toThrow(
        'Not found'
      );
    });
  });
});
