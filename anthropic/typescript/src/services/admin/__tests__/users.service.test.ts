import { describe, it, expect, beforeEach } from 'vitest';
import { UsersServiceImpl } from '../users.service.js';
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
import type { User, ListResponse } from '../types.js';

describe('UsersService', () => {
  let service: UsersServiceImpl;
  let mockTransport: MockHttpTransport;
  let mockAuth: MockAuthManager;
  let mockResilience: MockResilienceOrchestrator;

  beforeEach(() => {
    mockTransport = createMockHttpTransport();
    mockAuth = createMockAuthManager();
    mockResilience = createMockResilienceOrchestrator();
    service = new UsersServiceImpl(mockTransport, mockAuth, mockResilience);
  });

  describe('list', () => {
    it('should list users', async () => {
      const mockResponse: ListResponse<User> = {
        data: [
          {
            id: 'user_1',
            email: 'user1@example.com',
            name: 'User One',
            created_at: '2024-01-01T00:00:00Z',
          },
          {
            id: 'user_2',
            email: 'user2@example.com',
            name: 'User Two',
            created_at: '2024-01-02T00:00:00Z',
          },
        ],
        has_more: false,
        first_id: 'user_1',
        last_id: 'user_2',
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      const result = await service.list();

      expect(result).toEqual(mockResponse);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/users',
        undefined,
        expect.any(Object)
      );
    });

    it('should list users with pagination params', async () => {
      const mockResponse: ListResponse<User> = {
        data: [],
        has_more: false,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      await service.list({ limit: 25, after_id: 'user_50' });

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/users?after_id=user_50&limit=25',
        undefined,
        expect.any(Object)
      );
    });

    it('should handle before_id pagination', async () => {
      const mockResponse: ListResponse<User> = {
        data: [],
        has_more: true,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      await service.list({ before_id: 'user_100', limit: 50 });

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/users?before_id=user_100&limit=50',
        undefined,
        expect.any(Object)
      );
    });

    it('should handle errors when listing users', async () => {
      const error = new Error('Failed to fetch users');
      mockHttpTransportError(mockTransport, error);

      await expect(service.list()).rejects.toThrow('Failed to fetch users');
    });

    it('should list users without optional name field', async () => {
      const mockResponse: ListResponse<User> = {
        data: [
          {
            id: 'user_no_name',
            email: 'noname@example.com',
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
        has_more: false,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      const result = await service.list();

      expect(result.data[0].name).toBeUndefined();
    });
  });

  describe('get', () => {
    it('should retrieve user by id', async () => {
      const mockUser: User = {
        id: 'user_123',
        email: 'user123@example.com',
        name: 'Test User',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockUser);

      const result = await service.get('user_123');

      expect(result).toEqual(mockUser);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/users/user_123',
        undefined,
        expect.any(Object)
      );
    });

    it('should retrieve user without name', async () => {
      const mockUser: User = {
        id: 'user_456',
        email: 'user456@example.com',
        created_at: '2024-01-02T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockUser);

      const result = await service.get('user_456');

      expect(result.name).toBeUndefined();
      expect(result.email).toBe('user456@example.com');
    });

    it('should handle errors when retrieving user', async () => {
      const error = new Error('User not found');
      mockHttpTransportError(mockTransport, error);

      await expect(service.get('user_invalid')).rejects.toThrow('User not found');
    });

    it('should use auth headers', async () => {
      const mockUser: User = {
        id: 'user_123',
        email: 'test@example.com',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockUser);

      await service.get('user_123');

      expect(mockAuth.getHeaders).toHaveBeenCalled();
    });

    it('should use resilience orchestrator', async () => {
      const mockUser: User = {
        id: 'user_123',
        email: 'test@example.com',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockUser);

      await service.get('user_123');

      expect(mockResilience.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('getMe', () => {
    it('should retrieve current user', async () => {
      const mockUser: User = {
        id: 'user_me',
        email: 'current@example.com',
        name: 'Current User',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockUser);

      const result = await service.getMe();

      expect(result).toEqual(mockUser);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/users/me',
        undefined,
        expect.any(Object)
      );
    });

    it('should retrieve current user without name', async () => {
      const mockUser: User = {
        id: 'user_me',
        email: 'me@example.com',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockUser);

      const result = await service.getMe();

      expect(result.name).toBeUndefined();
    });

    it('should handle errors when retrieving current user', async () => {
      const error = new Error('Unauthorized');
      mockHttpTransportError(mockTransport, error);

      await expect(service.getMe()).rejects.toThrow('Unauthorized');
    });

    it('should use auth headers for current user', async () => {
      const mockUser: User = {
        id: 'user_me',
        email: 'me@example.com',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockUser);

      await service.getMe();

      expect(mockAuth.getHeaders).toHaveBeenCalled();
      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/users/me',
        undefined,
        expect.objectContaining({ 'x-api-key': 'test-api-key' })
      );
    });

    it('should use resilience orchestrator for getMe', async () => {
      const mockUser: User = {
        id: 'user_me',
        email: 'me@example.com',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockUser);

      await service.getMe();

      expect(mockResilience.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('query parameter building', () => {
    it('should properly encode special characters in user ids', async () => {
      const mockResponse: ListResponse<User> = {
        data: [],
        has_more: false,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      await service.list({ after_id: 'user+special%20id' });

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        expect.stringContaining('user%2Bspecial%2520id'),
        undefined,
        expect.any(Object)
      );
    });

    it('should handle empty params object', async () => {
      const mockResponse: ListResponse<User> = {
        data: [],
        has_more: false,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      await service.list({});

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/users',
        undefined,
        expect.any(Object)
      );
    });

    it('should build query with multiple params', async () => {
      const mockResponse: ListResponse<User> = {
        data: [],
        has_more: false,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      await service.list({ before_id: 'user_1', after_id: 'user_2', limit: 30 });

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/users?before_id=user_1&after_id=user_2&limit=30',
        undefined,
        expect.any(Object)
      );
    });

    it('should handle limit of 0', async () => {
      const mockResponse: ListResponse<User> = {
        data: [],
        has_more: false,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      await service.list({ limit: 0 });

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/users?limit=0',
        undefined,
        expect.any(Object)
      );
    });
  });

  describe('user fields validation', () => {
    it('should handle users with all fields', async () => {
      const mockUser: User = {
        id: 'user_complete',
        email: 'complete@example.com',
        name: 'Complete User',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockUser);

      const result = await service.get('user_complete');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('created_at');
    });

    it('should handle users with minimal fields', async () => {
      const mockUser: User = {
        id: 'user_minimal',
        email: 'minimal@example.com',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockUser);

      const result = await service.get('user_minimal');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email');
      expect(result).toHaveProperty('created_at');
      expect(result.name).toBeUndefined();
    });

    it('should preserve email format', async () => {
      const mockUser: User = {
        id: 'user_email',
        email: 'test.user+tag@example.co.uk',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockUser);

      const result = await service.get('user_email');

      expect(result.email).toBe('test.user+tag@example.co.uk');
    });

    it('should preserve ISO 8601 date format', async () => {
      const mockUser: User = {
        id: 'user_date',
        email: 'date@example.com',
        created_at: '2024-01-15T14:30:45.123Z',
      };

      mockHttpTransportResponse(mockTransport, mockUser);

      const result = await service.get('user_date');

      expect(result.created_at).toBe('2024-01-15T14:30:45.123Z');
    });
  });
});
