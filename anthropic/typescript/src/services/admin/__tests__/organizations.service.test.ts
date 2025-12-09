import { describe, it, expect, beforeEach } from 'vitest';
import { OrganizationsServiceImpl } from '../organizations.service.js';
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
import type { Organization } from '../types.js';

describe('OrganizationsService', () => {
  let service: OrganizationsServiceImpl;
  let mockTransport: MockHttpTransport;
  let mockAuth: MockAuthManager;
  let mockResilience: MockResilienceOrchestrator;

  beforeEach(() => {
    mockTransport = createMockHttpTransport();
    mockAuth = createMockAuthManager();
    mockResilience = createMockResilienceOrchestrator();
    service = new OrganizationsServiceImpl(mockTransport, mockAuth, mockResilience);
  });

  describe('get', () => {
    it('should retrieve organization details', async () => {
      const mockOrg: Organization = {
        id: 'org_123',
        name: 'Test Organization',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockOrg);

      const result = await service.get();

      expect(result).toEqual(mockOrg);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/organizations/me',
        undefined,
        expect.objectContaining({ 'x-api-key': 'test-api-key' })
      );
      expect(mockResilience.execute).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when retrieving organization', async () => {
      const error = new Error('Failed to fetch organization');
      mockHttpTransportError(mockTransport, error);

      await expect(service.get()).rejects.toThrow('Failed to fetch organization');
      expect(mockTransport.request).toHaveBeenCalledWith(
        'GET',
        '/v1/organizations/me',
        undefined,
        expect.any(Object)
      );
    });

    it('should use auth headers from auth manager', async () => {
      const mockOrg: Organization = {
        id: 'org_123',
        name: 'Test Org',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockOrg);

      await service.get();

      expect(mockAuth.getHeaders).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update organization details', async () => {
      const updateRequest = { name: 'Updated Organization' };
      const mockUpdatedOrg: Organization = {
        id: 'org_123',
        name: 'Updated Organization',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-03T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockUpdatedOrg);

      const result = await service.update(updateRequest);

      expect(result).toEqual(mockUpdatedOrg);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/organizations/me',
        updateRequest,
        expect.objectContaining({ 'x-api-key': 'test-api-key' })
      );
      expect(mockResilience.execute).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when updating organization', async () => {
      const updateRequest = { name: 'Updated Name' };
      const error = new Error('Failed to update organization');
      mockHttpTransportError(mockTransport, error);

      await expect(service.update(updateRequest)).rejects.toThrow('Failed to update organization');
      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/organizations/me',
        updateRequest,
        expect.any(Object)
      );
    });

    it('should pass complete request body', async () => {
      const updateRequest = { name: 'New Organization Name' };
      const mockOrg: Organization = {
        id: 'org_123',
        name: 'New Organization Name',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-04T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockOrg);

      await service.update(updateRequest);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/organizations/me',
        expect.objectContaining({ name: 'New Organization Name' }),
        expect.any(Object)
      );
    });

    it('should use resilience orchestrator for update', async () => {
      const updateRequest = { name: 'Test' };
      const mockOrg: Organization = {
        id: 'org_123',
        name: 'Test',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockHttpTransportResponse(mockTransport, mockOrg);

      await service.update(updateRequest);

      expect(mockResilience.execute).toHaveBeenCalledTimes(1);
      expect(mockResilience.execute).toHaveBeenCalledWith(expect.any(Function));
    });
  });
});
