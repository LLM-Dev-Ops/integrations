import { describe, it, expect, beforeEach } from 'vitest';
import { ImagesServiceImpl } from '../service.js';
import {
  createMockResilienceOrchestrator,
  mockResilienceOrchestratorResponse,
  mockResilienceOrchestratorError,
} from '../../../__mocks__/index.js';
import type { MockResilienceOrchestrator } from '../../../__mocks__/index.js';
import {
  create401UnauthorizedError,
  create500InternalServerError,
  createTimeoutError,
} from '../../../__fixtures__/index.js';

describe('ImagesService', () => {
  let mockOrchestrator: MockResilienceOrchestrator;
  let service: ImagesServiceImpl;

  beforeEach(() => {
    mockOrchestrator = createMockResilienceOrchestrator();
    service = new ImagesServiceImpl(mockOrchestrator);
  });

  describe('generate', () => {
    it('should generate images successfully', async () => {
      const response = {
        created: 1677652288,
        data: [
          {
            url: 'https://example.com/image.png',
          },
        ],
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const result = await service.generate({
        prompt: 'A cute cat',
        n: 1,
        size: '1024x1024',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].url).toBeDefined();
      expect(mockOrchestrator.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/v1/images/generations',
        })
      );
    });

    it('should handle validation errors', async () => {
      await expect(
        service.generate({ prompt: '', n: 1, size: '1024x1024' })
      ).rejects.toThrow();
    });

    it('should handle unauthorized errors', async () => {
      mockResilienceOrchestratorError(
        mockOrchestrator,
        new Error('Unauthorized')
      );

      await expect(
        service.generate({ prompt: 'test', n: 1, size: '1024x1024' })
      ).rejects.toThrow('Unauthorized');
    });
  });

  describe('edit', () => {
    it('should edit images successfully', async () => {
      const response = {
        created: 1677652288,
        data: [{ url: 'https://example.com/edited.png' }],
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const image = new Blob(['image'], { type: 'image/png' });
      const result = await service.edit({
        image,
        prompt: 'Add a hat',
        n: 1,
        size: '1024x1024',
      });

      expect(result.data).toHaveLength(1);
      expect(mockOrchestrator.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/v1/images/edits',
        })
      );
    });

    it('should handle timeout errors', async () => {
      mockResilienceOrchestratorError(
        mockOrchestrator,
        createTimeoutError()
      );

      const image = new Blob(['image'], { type: 'image/png' });
      await expect(
        service.edit({ image, prompt: 'test', n: 1, size: '1024x1024' })
      ).rejects.toThrow('Request timeout');
    });
  });

  describe('createVariation', () => {
    it('should create image variations successfully', async () => {
      const response = {
        created: 1677652288,
        data: [
          { url: 'https://example.com/var1.png' },
          { url: 'https://example.com/var2.png' },
        ],
      };

      mockResilienceOrchestratorResponse(mockOrchestrator, {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: response,
      });

      const image = new Blob(['image'], { type: 'image/png' });
      const result = await service.createVariation({
        image,
        n: 2,
        size: '1024x1024',
      });

      expect(result.data).toHaveLength(2);
      expect(mockOrchestrator.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/v1/images/variations',
        })
      );
    });

    it('should handle server errors', async () => {
      mockResilienceOrchestratorError(
        mockOrchestrator,
        new Error('Internal server error')
      );

      const image = new Blob(['image'], { type: 'image/png' });
      await expect(
        service.createVariation({ image, n: 1, size: '1024x1024' })
      ).rejects.toThrow('Internal server error');
    });
  });
});
