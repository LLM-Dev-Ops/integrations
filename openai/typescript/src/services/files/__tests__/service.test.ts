import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FilesServiceImpl } from '../service.js';
import {
  createMockResilienceOrchestrator,
  mockResilienceOrchestratorResponse,
  mockResilienceOrchestratorError,
} from '../../../__mocks__/index.js';
import type { MockResilienceOrchestrator } from '../../../__mocks__/index.js';
import {
  createFileObject,
  createFileListResponse,
  createFileDeleteResponse,
  create401UnauthorizedError,
  create404NotFoundError,
  create500InternalServerError,
  createTimeoutError,
} from '../../../__fixtures__/index.js';
import type { FileCreateRequest } from '../types.js';

describe('FilesService', () => {
  let mockOrchestrator: MockResilienceOrchestrator;
  let service: FilesServiceImpl;

  beforeEach(() => {
    mockOrchestrator = createMockResilienceOrchestrator();
    service = new FilesServiceImpl(mockOrchestrator);
  });

  describe('create', () => {
    describe('happy path', () => {
      it('should upload a file successfully', async () => {
        const file = new Blob(['{"prompt": "test"}'], {
          type: 'application/json',
        });
        const request: FileCreateRequest = {
          file,
          purpose: 'fine-tune',
        };
        const response = createFileObject();

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.create(request);

        expect(result).toEqual(response);
        expect(result.purpose).toBe('fine-tune');
        expect(mockOrchestrator.request).toHaveBeenCalledOnce();
      });

      it('should handle different file purposes', async () => {
        const file = new Blob(['data'], { type: 'application/json' });
        const request: FileCreateRequest = {
          file,
          purpose: 'assistants',
        };
        const response = createFileObject({ purpose: 'assistants' });

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.create(request);

        expect(result.purpose).toBe('assistants');
      });

      it('should pass request options through', async () => {
        const file = new Blob(['data'], { type: 'application/json' });
        const request: FileCreateRequest = {
          file,
          purpose: 'fine-tune',
        };
        const response = createFileObject();
        const options = {
          headers: { 'X-Custom-Header': 'test' },
        };

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        await service.create(request, options);

        expect(mockOrchestrator.request).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'POST',
            path: '/v1/files',
          })
        );
      });
    });

    describe('error handling', () => {
      it('should handle validation errors', async () => {
        const request = { purpose: 'fine-tune' } as FileCreateRequest;

        await expect(service.create(request)).rejects.toThrow();
      });

      it('should handle 401 unauthorized errors', async () => {
        const file = new Blob(['data'], { type: 'application/json' });
        const request: FileCreateRequest = { file, purpose: 'fine-tune' };

        mockResilienceOrchestratorError(
          mockOrchestrator,
          new Error('Unauthorized')
        );

        await expect(service.create(request)).rejects.toThrow('Unauthorized');
      });

      it('should handle timeout errors', async () => {
        const file = new Blob(['data'], { type: 'application/json' });
        const request: FileCreateRequest = { file, purpose: 'fine-tune' };
        const timeoutError = createTimeoutError();

        mockResilienceOrchestratorError(mockOrchestrator, timeoutError);

        await expect(service.create(request)).rejects.toThrow('Request timeout');
      });
    });
  });

  describe('list', () => {
    describe('happy path', () => {
      it('should list files successfully', async () => {
        const response = createFileListResponse(3);

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.list();

        expect(result).toEqual(response);
        expect(result.data).toHaveLength(3);
        expect(mockOrchestrator.request).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'GET',
            path: '/v1/files',
          })
        );
      });

      it('should filter files by purpose', async () => {
        const response = createFileListResponse(2);

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.list({ purpose: 'fine-tune' });

        expect(result.data).toHaveLength(2);
        expect(mockOrchestrator.request).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.objectContaining({ purpose: 'fine-tune' }),
          })
        );
      });

      it('should handle empty file list', async () => {
        const response = createFileListResponse(0);

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.list();

        expect(result.data).toHaveLength(0);
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
      it('should retrieve a file by ID successfully', async () => {
        const response = createFileObject({ id: 'file-123' });

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.retrieve('file-123');

        expect(result).toEqual(response);
        expect(result.id).toBe('file-123');
        expect(mockOrchestrator.request).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'GET',
            path: '/v1/files/file-123',
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

        await expect(service.retrieve('file-nonexistent')).rejects.toThrow(
          'Not found'
        );
      });
    });
  });

  describe('delete', () => {
    describe('happy path', () => {
      it('should delete a file successfully', async () => {
        const response = createFileDeleteResponse({ id: 'file-123' });

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.delete('file-123');

        expect(result).toEqual(response);
        expect(result.deleted).toBe(true);
        expect(mockOrchestrator.request).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'DELETE',
            path: '/v1/files/file-123',
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

        await expect(service.delete('file-nonexistent')).rejects.toThrow(
          'Not found'
        );
      });

      it('should handle 401 unauthorized errors', async () => {
        mockResilienceOrchestratorError(
          mockOrchestrator,
          new Error('Unauthorized')
        );

        await expect(service.delete('file-123')).rejects.toThrow('Unauthorized');
      });
    });
  });

  describe('retrieveContent', () => {
    describe('happy path', () => {
      it('should retrieve file content successfully', async () => {
        const content = '{"prompt": "test", "completion": "response"}';

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: content,
        });

        const result = await service.retrieveContent('file-123');

        expect(result).toBe(content);
        expect(mockOrchestrator.request).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'GET',
            path: '/v1/files/file-123/content',
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
          service.retrieveContent('file-nonexistent')
        ).rejects.toThrow('Not found');
      });
    });
  });
});
