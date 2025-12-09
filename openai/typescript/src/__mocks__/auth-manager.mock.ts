import { vi } from 'vitest';
import type { AuthManager } from '../auth/auth-manager.js';

export interface MockAuthManager extends AuthManager {
  getAuthHeaders: ReturnType<typeof vi.fn>;
  validateConfig: ReturnType<typeof vi.fn>;
}

export function createMockAuthManager(): MockAuthManager {
  return {
    getAuthHeaders: vi.fn(() => ({
      Authorization: 'Bearer test-api-key',
    })),
    validateConfig: vi.fn(),
  };
}

export function createMockAuthManagerWithOrganization(): MockAuthManager {
  return {
    getAuthHeaders: vi.fn(() => ({
      Authorization: 'Bearer test-api-key',
      'OpenAI-Organization': 'test-org',
    })),
    validateConfig: vi.fn(),
  };
}

export function mockAuthManagerValidationError(
  manager: MockAuthManager,
  error: Error
): void {
  manager.validateConfig.mockImplementation(() => {
    throw error;
  });
}
