import { describe, it, expect, beforeEach } from 'vitest';
import { InvitesServiceImpl } from '../invites.service.js';
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
import type { Invite, ListResponse } from '../types.js';

describe('InvitesService', () => {
  let service: InvitesServiceImpl;
  let mockTransport: MockHttpTransport;
  let mockAuth: MockAuthManager;
  let mockResilience: MockResilienceOrchestrator;

  beforeEach(() => {
    mockTransport = createMockHttpTransport();
    mockAuth = createMockAuthManager();
    mockResilience = createMockResilienceOrchestrator();
    service = new InvitesServiceImpl(mockTransport, mockAuth, mockResilience);
  });

  describe('list', () => {
    it('should list invites', async () => {
      const mockResponse: ListResponse<Invite> = {
        data: [
          {
            id: 'inv_1',
            email: 'user1@example.com',
            workspace_id: 'ws_123',
            role: 'workspace_developer',
            status: 'pending',
            created_at: '2024-01-01T00:00:00Z',
            expires_at: '2024-01-08T00:00:00Z',
          },
          {
            id: 'inv_2',
            email: 'user2@example.com',
            workspace_id: 'ws_123',
            role: 'workspace_user',
            status: 'accepted',
            created_at: '2024-01-02T00:00:00Z',
            expires_at: '2024-01-09T00:00:00Z',
          },
        ],
        has_more: false,
        first_id: 'inv_1',
        last_id: 'inv_2',
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      const result = await service.list();

      expect(result).toEqual(mockResponse);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/invites',
        undefined,
        expect.any(Object)
      );
    });

    it('should list invites with pagination params', async () => {
      const mockResponse: ListResponse<Invite> = {
        data: [],
        has_more: false,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      await service.list({ limit: 15, after_id: 'inv_10' });

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/invites?after_id=inv_10&limit=15',
        undefined,
        expect.any(Object)
      );
    });

    it('should handle before_id pagination', async () => {
      const mockResponse: ListResponse<Invite> = {
        data: [],
        has_more: true,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      await service.list({ before_id: 'inv_20' });

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/invites?before_id=inv_20',
        undefined,
        expect.any(Object)
      );
    });

    it('should handle errors when listing invites', async () => {
      const error = new Error('Failed to fetch invites');
      mockHttpTransportError(mockTransport, error);

      await expect(service.list()).rejects.toThrow('Failed to fetch invites');
    });
  });

  describe('get', () => {
    it('should retrieve invite by id', async () => {
      const mockInvite: Invite = {
        id: 'inv_123',
        email: 'newuser@example.com',
        workspace_id: 'ws_123',
        role: 'workspace_admin',
        status: 'pending',
        created_at: '2024-01-01T00:00:00Z',
        expires_at: '2024-01-08T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockInvite);

      const result = await service.get('inv_123');

      expect(result).toEqual(mockInvite);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/invites/inv_123',
        undefined,
        expect.any(Object)
      );
    });

    it('should handle errors when retrieving invite', async () => {
      const error = new Error('Invite not found');
      mockHttpTransportError(mockTransport, error);

      await expect(service.get('inv_invalid')).rejects.toThrow('Invite not found');
    });

    it('should use auth headers', async () => {
      const mockInvite: Invite = {
        id: 'inv_123',
        email: 'test@example.com',
        workspace_id: 'ws_123',
        role: 'workspace_developer',
        status: 'pending',
        created_at: '2024-01-01T00:00:00Z',
        expires_at: '2024-01-08T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockInvite);

      await service.get('inv_123');

      expect(mockAuth.getHeaders).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create a new invite', async () => {
      const createRequest = {
        email: 'newdev@example.com',
        workspace_id: 'ws_123',
        role: 'workspace_developer' as const,
      };
      const mockInvite: Invite = {
        id: 'inv_new',
        email: 'newdev@example.com',
        workspace_id: 'ws_123',
        role: 'workspace_developer',
        status: 'pending',
        created_at: '2024-01-05T00:00:00Z',
        expires_at: '2024-01-12T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockInvite);

      const result = await service.create(createRequest);

      expect(result).toEqual(mockInvite);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/invites',
        createRequest,
        expect.any(Object)
      );
    });

    it('should create invite with admin role', async () => {
      const createRequest = {
        email: 'admin@example.com',
        workspace_id: 'ws_456',
        role: 'workspace_admin' as const,
      };
      const mockInvite: Invite = {
        id: 'inv_admin',
        email: 'admin@example.com',
        workspace_id: 'ws_456',
        role: 'workspace_admin',
        status: 'pending',
        created_at: '2024-01-05T00:00:00Z',
        expires_at: '2024-01-12T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockInvite);

      const result = await service.create(createRequest);

      expect(result.role).toBe('workspace_admin');
    });

    it('should create invite with user role', async () => {
      const createRequest = {
        email: 'user@example.com',
        workspace_id: 'ws_123',
        role: 'workspace_user' as const,
      };
      const mockInvite: Invite = {
        id: 'inv_user',
        email: 'user@example.com',
        workspace_id: 'ws_123',
        role: 'workspace_user',
        status: 'pending',
        created_at: '2024-01-05T00:00:00Z',
        expires_at: '2024-01-12T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockInvite);

      const result = await service.create(createRequest);

      expect(result.role).toBe('workspace_user');
    });

    it('should create invite with billing role', async () => {
      const createRequest = {
        email: 'billing@example.com',
        workspace_id: 'ws_123',
        role: 'workspace_billing' as const,
      };
      const mockInvite: Invite = {
        id: 'inv_billing',
        email: 'billing@example.com',
        workspace_id: 'ws_123',
        role: 'workspace_billing',
        status: 'pending',
        created_at: '2024-01-05T00:00:00Z',
        expires_at: '2024-01-12T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockInvite);

      const result = await service.create(createRequest);

      expect(result.role).toBe('workspace_billing');
    });

    it('should handle errors when creating invite', async () => {
      const createRequest = {
        email: 'test@example.com',
        workspace_id: 'ws_123',
        role: 'workspace_developer' as const,
      };
      const error = new Error('Failed to create invite');
      mockHttpTransportError(mockTransport, error);

      await expect(service.create(createRequest)).rejects.toThrow('Failed to create invite');
    });

    it('should pass all fields in create request', async () => {
      const createRequest = {
        email: 'complete@example.com',
        workspace_id: 'ws_789',
        role: 'workspace_developer' as const,
      };
      const mockInvite: Invite = {
        id: 'inv_complete',
        email: 'complete@example.com',
        workspace_id: 'ws_789',
        role: 'workspace_developer',
        status: 'pending',
        created_at: '2024-01-05T00:00:00Z',
        expires_at: '2024-01-12T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockInvite);

      await service.create(createRequest);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/invites',
        expect.objectContaining({
          email: 'complete@example.com',
          workspace_id: 'ws_789',
          role: 'workspace_developer',
        }),
        expect.any(Object)
      );
    });
  });

  describe('delete', () => {
    it('should delete invite', async () => {
      mockHttpTransportResponse(mockTransport, undefined);

      await service.delete('inv_123');

      expect(mockTransport.request).toHaveBeenCalledWith(
        'DELETE',
        '/v1/invites/inv_123',
        undefined,
        expect.any(Object)
      );
    });

    it('should handle errors when deleting invite', async () => {
      const error = new Error('Failed to delete invite');
      mockHttpTransportError(mockTransport, error);

      await expect(service.delete('inv_123')).rejects.toThrow('Failed to delete invite');
    });

    it('should use resilience orchestrator for delete', async () => {
      mockHttpTransportResponse(mockTransport, undefined);

      await service.delete('inv_456');

      expect(mockResilience.execute).toHaveBeenCalledTimes(1);
    });
  });

  describe('invite status handling', () => {
    it('should handle pending invites', async () => {
      const mockInvite: Invite = {
        id: 'inv_pending',
        email: 'pending@example.com',
        workspace_id: 'ws_123',
        role: 'workspace_developer',
        status: 'pending',
        created_at: '2024-01-01T00:00:00Z',
        expires_at: '2024-01-08T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockInvite);

      const result = await service.get('inv_pending');

      expect(result.status).toBe('pending');
    });

    it('should handle accepted invites', async () => {
      const mockInvite: Invite = {
        id: 'inv_accepted',
        email: 'accepted@example.com',
        workspace_id: 'ws_123',
        role: 'workspace_developer',
        status: 'accepted',
        created_at: '2024-01-01T00:00:00Z',
        expires_at: '2024-01-08T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockInvite);

      const result = await service.get('inv_accepted');

      expect(result.status).toBe('accepted');
    });

    it('should handle expired invites', async () => {
      const mockInvite: Invite = {
        id: 'inv_expired',
        email: 'expired@example.com',
        workspace_id: 'ws_123',
        role: 'workspace_developer',
        status: 'expired',
        created_at: '2024-01-01T00:00:00Z',
        expires_at: '2024-01-08T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockInvite);

      const result = await service.get('inv_expired');

      expect(result.status).toBe('expired');
    });

    it('should handle deleted invites', async () => {
      const mockInvite: Invite = {
        id: 'inv_deleted',
        email: 'deleted@example.com',
        workspace_id: 'ws_123',
        role: 'workspace_developer',
        status: 'deleted',
        created_at: '2024-01-01T00:00:00Z',
        expires_at: '2024-01-08T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockInvite);

      const result = await service.get('inv_deleted');

      expect(result.status).toBe('deleted');
    });
  });
});
