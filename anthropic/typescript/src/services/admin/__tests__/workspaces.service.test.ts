import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspacesServiceImpl } from '../workspaces.service.js';
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
import type { Workspace, WorkspaceMember, ListResponse } from '../types.js';

describe('WorkspacesService', () => {
  let service: WorkspacesServiceImpl;
  let mockTransport: MockHttpTransport;
  let mockAuth: MockAuthManager;
  let mockResilience: MockResilienceOrchestrator;

  beforeEach(() => {
    mockTransport = createMockHttpTransport();
    mockAuth = createMockAuthManager();
    mockResilience = createMockResilienceOrchestrator();
    service = new WorkspacesServiceImpl(mockTransport, mockAuth, mockResilience);
  });

  describe('list', () => {
    it('should list workspaces', async () => {
      const mockResponse: ListResponse<Workspace> = {
        data: [
          {
            id: 'ws_1',
            name: 'Workspace 1',
            organization_id: 'org_123',
            created_at: '2024-01-01T00:00:00Z',
          },
          {
            id: 'ws_2',
            name: 'Workspace 2',
            organization_id: 'org_123',
            created_at: '2024-01-02T00:00:00Z',
          },
        ],
        has_more: false,
        first_id: 'ws_1',
        last_id: 'ws_2',
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      const result = await service.list();

      expect(result).toEqual(mockResponse);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/workspaces',
        undefined,
        expect.any(Object)
      );
    });

    it('should list workspaces with pagination params', async () => {
      const mockResponse: ListResponse<Workspace> = {
        data: [],
        has_more: false,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      await service.list({ limit: 10, after_id: 'ws_123' });

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/workspaces?after_id=ws_123&limit=10',
        undefined,
        expect.any(Object)
      );
    });

    it('should handle before_id pagination', async () => {
      const mockResponse: ListResponse<Workspace> = {
        data: [],
        has_more: false,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      await service.list({ before_id: 'ws_456', limit: 5 });

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/workspaces?before_id=ws_456&limit=5',
        undefined,
        expect.any(Object)
      );
    });
  });

  describe('get', () => {
    it('should retrieve workspace by id', async () => {
      const mockWorkspace: Workspace = {
        id: 'ws_123',
        name: 'Test Workspace',
        organization_id: 'org_123',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockWorkspace);

      const result = await service.get('ws_123');

      expect(result).toEqual(mockWorkspace);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/workspaces/ws_123',
        undefined,
        expect.any(Object)
      );
    });

    it('should handle errors when retrieving workspace', async () => {
      const error = new Error('Workspace not found');
      mockHttpTransportError(mockTransport, error);

      await expect(service.get('ws_invalid')).rejects.toThrow('Workspace not found');
    });
  });

  describe('create', () => {
    it('should create a new workspace', async () => {
      const createRequest = { name: 'New Workspace' };
      const mockWorkspace: Workspace = {
        id: 'ws_new',
        name: 'New Workspace',
        organization_id: 'org_123',
        created_at: '2024-01-03T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockWorkspace);

      const result = await service.create(createRequest);

      expect(result).toEqual(mockWorkspace);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/workspaces',
        createRequest,
        expect.any(Object)
      );
    });
  });

  describe('update', () => {
    it('should update workspace', async () => {
      const updateRequest = { name: 'Updated Workspace' };
      const mockWorkspace: Workspace = {
        id: 'ws_123',
        name: 'Updated Workspace',
        organization_id: 'org_123',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockWorkspace);

      const result = await service.update('ws_123', updateRequest);

      expect(result).toEqual(mockWorkspace);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/workspaces/ws_123',
        updateRequest,
        expect.any(Object)
      );
    });
  });

  describe('archive', () => {
    it('should archive workspace', async () => {
      const mockWorkspace: Workspace = {
        id: 'ws_123',
        name: 'Test Workspace',
        organization_id: 'org_123',
        created_at: '2024-01-01T00:00:00Z',
        archived_at: '2024-01-05T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockWorkspace);

      const result = await service.archive('ws_123');

      expect(result).toEqual(mockWorkspace);
      expect(result.archived_at).toBeDefined();
      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/workspaces/ws_123/archive',
        undefined,
        expect.any(Object)
      );
    });
  });

  describe('listMembers', () => {
    it('should list workspace members', async () => {
      const mockResponse: ListResponse<WorkspaceMember> = {
        data: [
          {
            user_id: 'user_1',
            workspace_id: 'ws_123',
            role: 'workspace_admin',
            added_at: '2024-01-01T00:00:00Z',
          },
          {
            user_id: 'user_2',
            workspace_id: 'ws_123',
            role: 'workspace_developer',
            added_at: '2024-01-02T00:00:00Z',
          },
        ],
        has_more: false,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      const result = await service.listMembers('ws_123');

      expect(result).toEqual(mockResponse);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/workspaces/ws_123/members',
        undefined,
        expect.any(Object)
      );
    });

    it('should list members with pagination', async () => {
      const mockResponse: ListResponse<WorkspaceMember> = {
        data: [],
        has_more: false,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      await service.listMembers('ws_123', { limit: 20, after_id: 'user_10' });

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/workspaces/ws_123/members?after_id=user_10&limit=20',
        undefined,
        expect.any(Object)
      );
    });
  });

  describe('addMember', () => {
    it('should add member to workspace', async () => {
      const addRequest = {
        user_id: 'user_new',
        role: 'workspace_developer' as const,
      };
      const mockMember: WorkspaceMember = {
        user_id: 'user_new',
        workspace_id: 'ws_123',
        role: 'workspace_developer',
        added_at: '2024-01-05T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockMember);

      const result = await service.addMember('ws_123', addRequest);

      expect(result).toEqual(mockMember);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/workspaces/ws_123/members',
        addRequest,
        expect.any(Object)
      );
    });
  });

  describe('getMember', () => {
    it('should retrieve workspace member', async () => {
      const mockMember: WorkspaceMember = {
        user_id: 'user_123',
        workspace_id: 'ws_123',
        role: 'workspace_admin',
        added_at: '2024-01-01T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockMember);

      const result = await service.getMember('ws_123', 'user_123');

      expect(result).toEqual(mockMember);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/workspaces/ws_123/members/user_123',
        undefined,
        expect.any(Object)
      );
    });
  });

  describe('updateMember', () => {
    it('should update workspace member role', async () => {
      const updateRequest = { role: 'workspace_admin' as const };
      const mockMember: WorkspaceMember = {
        user_id: 'user_123',
        workspace_id: 'ws_123',
        role: 'workspace_admin',
        added_at: '2024-01-01T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockMember);

      const result = await service.updateMember('ws_123', 'user_123', updateRequest);

      expect(result).toEqual(mockMember);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/workspaces/ws_123/members/user_123',
        updateRequest,
        expect.any(Object)
      );
    });
  });

  describe('removeMember', () => {
    it('should remove member from workspace', async () => {
      mockHttpTransportResponse(mockTransport, undefined);

      await service.removeMember('ws_123', 'user_456');

      expect(mockTransport.request).toHaveBeenCalledWith(
        'DELETE',
        '/v1/workspaces/ws_123/members/user_456',
        undefined,
        expect.any(Object)
      );
    });

    it('should handle errors when removing member', async () => {
      const error = new Error('Failed to remove member');
      mockHttpTransportError(mockTransport, error);

      await expect(service.removeMember('ws_123', 'user_456')).rejects.toThrow('Failed to remove member');
    });
  });

  describe('query parameter encoding', () => {
    it('should properly encode special characters in ids', async () => {
      const mockResponse: ListResponse<Workspace> = {
        data: [],
        has_more: false,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      await service.list({ after_id: 'ws_special+id%20test' });

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        expect.stringContaining('ws_special%2Bid%2520test'),
        undefined,
        expect.any(Object)
      );
    });

    it('should build query string with all params', async () => {
      const mockResponse: ListResponse<Workspace> = {
        data: [],
        has_more: false,
      };

      mockHttpTransportResponse(mockTransport, mockResponse);

      await service.list({ before_id: 'ws_1', after_id: 'ws_2', limit: 15 });

      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/workspaces?before_id=ws_1&after_id=ws_2&limit=15',
        undefined,
        expect.any(Object)
      );
    });
  });
});
