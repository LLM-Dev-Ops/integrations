import { describe, it, expect, beforeEach } from 'vitest';
import { ModerationsServiceImpl } from '../service.js';
import {
  createMockResilienceOrchestrator,
  mockResilienceOrchestratorResponse,
  mockResilienceOrchestratorError,
} from '../../../__mocks__/index.js';
import type { MockResilienceOrchestrator } from '../../../__mocks__/index.js';
import {
  create401UnauthorizedError,
  create500InternalServerError,
} from '../../../__fixtures__/index.js';

describe('ModerationsService', () => {
  let mockOrchestrator: MockResilienceOrchestrator;
  let service: ModerationsServiceImpl;

  beforeEach(() => {
    mockOrchestrator = createMockResilienceOrchestrator();
    service = new ModerationsServiceImpl(mockOrchestrator);
  });

  describe('create', () => {
    it('should check moderation successfully', async () => {
      const response = {
        id: 'modr-123',
        model: 'text-moderation-latest',
        results: [
          {
            flagged: false,
            categories: {
              hate: false,
              'hate/threatening': false,
              'self-harm': false,
              sexual: false,
              'sexual/minors': false,
              violence: false,
              'violence/graphic': false,
            },
            category_scores: {
              hate: 0.001,
              'hate/threatening': 0.0001,
              'self-harm': 0.0001,
              sexual: 0.001,
              'sexual/minors': 0.0001,
              violence: 0.001,
              'violence/graphic': 0.0001,
            },
          },
        ],
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const result = await service.create({
        input: 'This is a test message.',
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].flagged).toBe(false);
      expect(mockOrchestrator.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/v1/moderations',
        })
      );
    });

    it('should handle flagged content', async () => {
      const response = {
        id: 'modr-123',
        model: 'text-moderation-latest',
        results: [
          {
            flagged: true,
            categories: {
              hate: true,
              'hate/threatening': false,
              'self-harm': false,
              sexual: false,
              'sexual/minors': false,
              violence: false,
              'violence/graphic': false,
            },
            category_scores: {
              hate: 0.95,
              'hate/threatening': 0.01,
              'self-harm': 0.001,
              sexual: 0.001,
              'sexual/minors': 0.0001,
              violence: 0.01,
              'violence/graphic': 0.001,
            },
          },
        ],
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const result = await service.create({
        input: 'Inappropriate content',
      });

      expect(result.results[0].flagged).toBe(true);
      expect(result.results[0].categories.hate).toBe(true);
    });

    it('should handle batch input', async () => {
      const response = {
        id: 'modr-123',
        model: 'text-moderation-latest',
        results: [
          {
            flagged: false,
            categories: {} as any,
            category_scores: {} as any,
          },
          {
            flagged: false,
            categories: {} as any,
            category_scores: {} as any,
          },
        ],
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const result = await service.create({
        input: ['Message 1', 'Message 2'],
      });

      expect(result.results).toHaveLength(2);
    });

    it('should handle validation errors', async () => {
      await expect(service.create({ input: '' })).rejects.toThrow();
    });

    it('should handle unauthorized errors', async () => {
      mockResilienceOrchestratorError(
        mockOrchestrator,
        new Error('Unauthorized')
      );

      await expect(service.create({ input: 'test' })).rejects.toThrow(
        'Unauthorized'
      );
    });

    it('should handle server errors', async () => {
      mockResilienceOrchestratorError(
        mockOrchestrator,
        new Error('Internal server error')
      );

      await expect(service.create({ input: 'test' })).rejects.toThrow(
        'Internal server error'
      );
    });
  });
});
