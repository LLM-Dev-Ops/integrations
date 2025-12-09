import { describe, it, expect, beforeEach } from 'vitest';
import { ApiKeysServiceImpl } from '../api-keys.service.js';
import {
  createMockHttpTransport,
  mockHttpTransportResponse,
  mockHttpTransportError,
  type MockHttpTransport,
} from '../../../__mocks__/http-transport.mock.js';
import {
  createMockAuthManager,
  type MockAuthManager,
} from '../../../__mocks__/auth-manager.mock.js';
import {
  createMockResilienceOrchestrator,
  type MockResilienceOrchestrator,
} from '../../../__mocks__/resilience.mock.js';
import type { ApiKey, ApiKeyWithSecret, ListResponse } from '../types.js';

describe('ApiKeysService', () => {
  let service: ApiKeysServiceImpl;
  let mockTransport: MockHttpTransport;
  let mockAuth: MockAuthManager;
  let mockResilience: MockResilienceOrchestrator;

  beforeEach(() => {
    mockTransport = createMockHttpTransport();
    mockAuth = createMockAuthManager();
    mockResilience = createMockResilienceOrchestrator();
    service = new ApiKeysServiceImpl(mockTransport, mockAuth, mockResilience);
  });

  describe('list', () => {
    it('should list API keys', async () => {
      const mockResponse: ListResponse<ApiKey> = {
        data: [
          {
            id: 'key_1',
            name: 'Production Key',
            workspace_id: 'ws_123',
            created_at: '2024-01-01T00:00:00Z',
            status: 'active',
            partial_key_hint: 'sk-ant-...abc123',
          },
          {
            id: 'key_2',
            name: 'Development Key',
            workspace_id: 'ws_123',
            created_at: '2024-01-02T00:00:00Z',
            status: 'active',
            partial_key_hint: 'sk-ant-...def456',
          },
        ],
        has_more: false,
        first_id: 'key_1',
        last_id: 'key_2',
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      const result = await service.list();

      expect(result).toEqual(mockResponse);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/api_keys',
        undefined,
        expect.any(Object)
      );
    });

    it('should list API keys with pagination params', async () => {
      const mockResponse: ListResponse<ApiKey> = {
        data: [],
        has_more: false,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      await service.list({ limit: 10, after_id: 'key_5' });

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/api_keys?after_id=key_5&limit=10',
        undefined,
        expect.any(Object)
      );
    });

    it('should handle before_id pagination', async () => {
      const mockResponse: ListResponse<ApiKey> = {
        data: [],
        has_more: true,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      await service.list({ before_id: 'key_10', limit: 20 });

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/api_keys?before_id=key_10&limit=20',
        undefined,
        expect.any(Object)
      );
    });

    it('should handle errors when listing API keys', async () => {
      const error = new Error('Failed to fetch API keys');
      mockHttpTransportError(mockTransport, error);

      await expect(service.list()).rejects.toThrow('Failed to fetch API keys');
    });
  });

  describe('get', () => {
    it('should retrieve API key by id', async () => {
      const mockApiKey: ApiKey = {
        id: 'key_123',
        name: 'Test Key',
        workspace_id: 'ws_123',
        created_at: '2024-01-01T00:00:00Z',
        status: 'active',
        partial_key_hint: 'sk-ant-...test123',
      };

      mockHttpTransportResponse(mockTransport, mockApiKey);

      const result = await service.get('key_123');

      expect(result).toEqual(mockApiKey);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/api_keys/key_123',
        undefined,
        expect.any(Object)
      );
    });

    it('should handle errors when retrieving API key', async () => {
      const error = new Error('API key not found');
      mockHttpTransportError(mockTransport, error);

      await expect(service.get('key_invalid')).rejects.toThrow('API key not found');
    });

    it('should use resilience orchestrator', async () => {
      const mockApiKey: ApiKey = {
        id: 'key_123',
        name: 'Test',
        workspace_id: 'ws_123',
        created_at: '2024-01-01T00:00:00Z',
        status: 'active',
        partial_key_hint: 'sk-ant-...test',
      };

      mockHttpTransportResponse(mockTransport, mockApiKey);

      await service.get('key_123');

      expect(mockResilience.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('create', () => {
    it('should create a new API key', async () => {
      const createRequest = {
        name: 'New API Key',
        workspace_id: 'ws_123',
      };
      const mockApiKeyWithSecret: ApiKeyWithSecret = {
        id: 'key_new',
        name: 'New API Key',
        workspace_id: 'ws_123',
        created_at: '2024-01-03T00:00:00Z',
        status: 'active',
        partial_key_hint: 'sk-ant-...xyz789',
        api_key_secret: 'sk-ant-api03-full-secret-key',
      };

      mockHttpTransportResponse(mockTransport, mockApiKeyWithSecret);

      const result = await service.create(createRequest);

      expect(result).toEqual(mockApiKeyWithSecret);
      expect(result.api_key_secret).toBeDefined();
      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/api_keys',
        createRequest,
        expect.any(Object)
      );
    });

    it('should pass workspace_id in create request', async () => {
      const createRequest = {
        name: 'Test Key',
        workspace_id: 'ws_456',
      };
      const mockApiKey: ApiKeyWithSecret = {
        id: 'key_test',
        name: 'Test Key',
        workspace_id: 'ws_456',
        created_at: '2024-01-01T00:00:00Z',
        status: 'active',
        partial_key_hint: 'sk-ant-...test',
        api_key_secret: 'sk-ant-api03-secret',
      };

      mockHttpTransportResponse(mockTransport, mockApiKey);

      await service.create(createRequest);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/api_keys',
        expect.objectContaining({ workspace_id: 'ws_456' }),
        expect.any(Object)
      );
    });

    it('should handle errors when creating API key', async () => {
      const createRequest = {
        name: 'Test',
        workspace_id: 'ws_123',
      };
      const error = new Error('Failed to create API key');
      mockHttpTransportError(mockTransport, error);

      await expect(service.create(createRequest)).rejects.toThrow('Failed to create API key');
    });
  });

  describe('update', () => {
    it('should update API key name', async () => {
      const updateRequest = { name: 'Updated Key Name' };
      const mockApiKey: ApiKey = {
        id: 'key_123',
        name: 'Updated Key Name',
        workspace_id: 'ws_123',
        created_at: '2024-01-01T00:00:00Z',
        status: 'active',
        partial_key_hint: 'sk-ant-...test',
      };

      mockHttpTransportResponse(mockTransport, mockApiKey);

      const result = await service.update('key_123', updateRequest);

      expect(result).toEqual(mockApiKey);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/api_keys/key_123',
        updateRequest,
        expect.any(Object)
      );
    });

    it('should update API key status', async () => {
      const updateRequest = { status: 'disabled' as const };
      const mockApiKey: ApiKey = {
        id: 'key_123',
        name: 'Test Key',
        workspace_id: 'ws_123',
        created_at: '2024-01-01T00:00:00Z',
        status: 'disabled',
        partial_key_hint: 'sk-ant-...test',
      };

      mockHttpTransportResponse(mockTransport, mockApiKey);

      const result = await service.update('key_123', updateRequest);

      expect(result.status).toBe('disabled');
      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/api_keys/key_123',
        expect.objectContaining({ status: 'disabled' }),
        expect.any(Object)
      );
    });

    it('should update both name and status', async () => {
      const updateRequest = {
        name: 'Archived Key',
        status: 'archived' as const,
      };
      const mockApiKey: ApiKey = {
        id: 'key_123',
        name: 'Archived Key',
        workspace_id: 'ws_123',
        created_at: '2024-01-01T00:00:00Z',
        status: 'archived',
        partial_key_hint: 'sk-ant-...test',
      };

      mockHttpTransportResponse(mockTransport, mockApiKey);

      const result = await service.update('key_123', updateRequest);

      expect(result.name).toBe('Archived Key');
      expect(result.status).toBe('archived');
    });

    it('should handle errors when updating API key', async () => {
      const updateRequest = { name: 'New Name' };
      const error = new Error('Failed to update API key');
      mockHttpTransportError(mockTransport, error);

      await expect(service.update('key_123', updateRequest)).rejects.toThrow('Failed to update API key');
    });
  });

  describe('query parameter building', () => {
    it('should properly encode special characters', async () => {
      const mockResponse: ListResponse<ApiKey> = {
        data: [],
        has_more: false,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      await service.list({ after_id: 'key+special%20chars' });

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        expect.stringContaining('key%2Bspecial%2520chars'),
        undefined,
        expect.any(Object)
      );
    });

    it('should handle empty params object', async () => {
      const mockResponse: ListResponse<ApiKey> = {
        data: [],
        has_more: false,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      await service.list({});

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/api_keys',
        undefined,
        expect.any(Object)
      );
    });

    it('should handle limit of 0', async () => {
      const mockResponse: ListResponse<ApiKey> = {
        data: [],
        has_more: false,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      await service.list({ limit: 0 });

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/api_keys?limit=0',
        undefined,
        expect.any(Object)
      );
    });
  });
});
