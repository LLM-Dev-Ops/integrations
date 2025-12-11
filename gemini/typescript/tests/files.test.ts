/**
 * Files service tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockHttpClient } from '../src/__mocks__/index.js';
import { FilesServiceImpl } from '../src/services/files.js';
import type { GeminiFile, UploadFileRequest } from '../src/types/index.js';
import { ValidationError, FileProcessingError } from '../src/error/index.js';

describe('FilesService', () => {
  let mockClient: MockHttpClient;
  let service: FilesServiceImpl;

  beforeEach(() => {
    mockClient = new MockHttpClient();
    const config = {
      apiKey: 'test-key',
      apiVersion: 'v1',
      authMethod: 'queryParam' as const,
      baseUrl: 'https://generativelanguage.googleapis.com',
    };
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
    service = new FilesServiceImpl(httpClient as any, config as any);
  });

  describe('upload', () => {
    it('should upload file successfully', async () => {
      const fileData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header
      const request: UploadFileRequest = {
        fileData,
        mimeType: 'image/png',
        displayName: 'test-image.png',
      };

      const mockResponse = {
        file: {
          name: 'files/abc123',
          displayName: 'test-image.png',
          mimeType: 'image/png',
          sizeBytes: '4',
          state: 'ACTIVE',
          uri: 'https://generativelanguage.googleapis.com/v1/files/abc123',
        },
      };

      mockClient.enqueueJsonResponse(200, mockResponse);

      const file = await service.upload(request);

      expect(file.name).toBe('files/abc123');
      expect(file.displayName).toBe('test-image.png');
      expect(file.state).toBe('ACTIVE');
      mockClient.verifyRequestCount(1);
    });

    it('should throw error for empty file data', async () => {
      const request: UploadFileRequest = {
        fileData: new Uint8Array([]),
        mimeType: 'image/png',
      };

      await expect(service.upload(request)).rejects.toThrow(ValidationError);
    });

    it('should throw error for missing mime type', async () => {
      const request = {
        fileData: new Uint8Array([1, 2, 3]),
      } as UploadFileRequest;

      await expect(service.upload(request)).rejects.toThrow(ValidationError);
    });

    it('should handle file without display name', async () => {
      const request: UploadFileRequest = {
        fileData: new Uint8Array([1, 2, 3]),
        mimeType: 'application/octet-stream',
      };

      mockClient.enqueueJsonResponse(200, {
        file: {
          name: 'files/xyz789',
          mimeType: 'application/octet-stream',
          state: 'PROCESSING',
        },
      });

      const file = await service.upload(request);

      expect(file.name).toBe('files/xyz789');
      expect(file.state).toBe('PROCESSING');
    });
  });

  describe('list', () => {
    it('should list files successfully', async () => {
      const mockResponse = {
        files: [
          {
            name: 'files/file1',
            displayName: 'document.pdf',
            mimeType: 'application/pdf',
            state: 'ACTIVE',
          },
          {
            name: 'files/file2',
            displayName: 'image.jpg',
            mimeType: 'image/jpeg',
            state: 'ACTIVE',
          },
        ],
      };

      mockClient.enqueueJsonResponse(200, mockResponse);

      const response = await service.list();

      expect(response.files).toHaveLength(2);
      expect(response.files[0].name).toBe('files/file1');
      mockClient.verifyRequestCount(1);
    });

    it('should list files with pagination', async () => {
      mockClient.enqueueJsonResponse(200, {
        files: [],
        nextPageToken: 'token123',
      });

      const response = await service.list({ pageSize: 5 });

      expect(response.nextPageToken).toBe('token123');
      const lastRequest = mockClient.getLastRequest();
      expect(lastRequest!.url).toContain('pageSize=5');
    });

    it('should throw error for invalid page size', async () => {
      await expect(service.list({ pageSize: 0 })).rejects.toThrow(ValidationError);
    });
  });

  describe('get', () => {
    it('should get file by name', async () => {
      const mockFile: GeminiFile = {
        name: 'files/abc123',
        displayName: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: '1024',
        state: 'ACTIVE',
        uri: 'https://example.com/files/abc123',
      };

      mockClient.enqueueJsonResponse(200, mockFile);

      const file = await service.get('abc123');

      expect(file.name).toBe('files/abc123');
      expect(file.state).toBe('ACTIVE');
      mockClient.verifyRequestCount(1);
    });

    it('should normalize file name', async () => {
      mockClient.enqueueJsonResponse(200, {
        name: 'files/test',
        state: 'ACTIVE',
      });

      await service.get('files/test');

      const lastRequest = mockClient.getLastRequest();
      expect(lastRequest!.url).toContain('files/test');
    });

    it('should throw error for empty file name', async () => {
      await expect(service.get('')).rejects.toThrow(ValidationError);
    });
  });

  describe('delete', () => {
    it('should delete file successfully', async () => {
      mockClient.enqueueJsonResponse(200, {});

      await service.delete('abc123');

      mockClient.verifyRequestCount(1);
      const lastRequest = mockClient.getLastRequest();
      expect(lastRequest!.options.method).toBe('DELETE');
    });

    it('should normalize file name for delete', async () => {
      mockClient.enqueueJsonResponse(200, {});

      await service.delete('files/abc123');

      const lastRequest = mockClient.getLastRequest();
      expect(lastRequest!.url).toContain('files/abc123');
    });

    it('should throw error for empty file name', async () => {
      await expect(service.delete('')).rejects.toThrow(ValidationError);
    });
  });

  describe('waitForActive', () => {
    it('should return immediately if file is active', async () => {
      const mockFile: GeminiFile = {
        name: 'files/test',
        state: 'ACTIVE',
      };

      mockClient.enqueueJsonResponse(200, mockFile);

      const file = await service.waitForActive('test', 5000, 100);

      expect(file.state).toBe('ACTIVE');
      mockClient.verifyRequestCount(1);
    });

    it('should poll until file becomes active', async () => {
      vi.useFakeTimers();

      const processingFile: GeminiFile = {
        name: 'files/test',
        state: 'PROCESSING',
      };

      const activeFile: GeminiFile = {
        name: 'files/test',
        state: 'ACTIVE',
      };

      mockClient.enqueueJsonResponse(200, processingFile);
      mockClient.enqueueJsonResponse(200, processingFile);
      mockClient.enqueueJsonResponse(200, activeFile);

      const promise = service.waitForActive('test', 10000, 1000);

      // Fast-forward through polling intervals
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);

      const file = await promise;

      expect(file.state).toBe('ACTIVE');
      expect(mockClient.getRequests()).toHaveLength(3);

      vi.useRealTimers();
    });

    it('should throw error if file fails', async () => {
      const failedFile: GeminiFile = {
        name: 'files/test',
        state: 'FAILED',
        error: { message: 'Processing failed' },
      };

      mockClient.enqueueJsonResponse(200, failedFile);

      await expect(service.waitForActive('test')).rejects.toThrow(FileProcessingError);
    });

    it('should timeout if file does not become active', async () => {
      vi.useFakeTimers();

      const processingFile: GeminiFile = {
        name: 'files/test',
        state: 'PROCESSING',
      };

      // Queue enough processing responses
      for (let i = 0; i < 25; i++) {
        mockClient.enqueueJsonResponse(200, processingFile);
      }

      const promise = service.waitForActive('test', 2000, 100);

      try {
        // Advance through the polling attempts
        for (let i = 0; i < 25; i++) {
          await vi.advanceTimersByTimeAsync(100);
        }
        await promise;
        throw new Error('Expected timeout error');
      } catch (error: any) {
        expect(error.message).toContain('File did not become active');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should throw error for negative timeout', async () => {
      await expect(service.waitForActive('test', -1)).rejects.toThrow(ValidationError);
    });

    it('should throw error for poll interval less than 100ms', async () => {
      await expect(service.waitForActive('test', 5000, 50)).rejects.toThrow(ValidationError);
    });
  });
});
