import { vi } from 'vitest';
import type { AuthManager } from '../auth/auth-manager.js';

export interface MockAuthManager extends AuthManager {
  getHeaders: ReturnType<typeof vi.fn>;
  validateApiKey: ReturnType<typeof vi.fn>;
}

export function createMockAuthManager(): MockAuthManager {
  return {
    getHeaders: vi.fn(() => ({
      'x-api-key': 'test-api-key',
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    })),
    validateApiKey: vi.fn(),
  };
}

export function mockAuthManagerValidationError(
  manager: MockAuthManager,
  error: Error
): void {
  manager.validateApiKey.mockImplementation(() => {
    throw error;
  });
}

export function mockAuthManagerHeaders(
  manager: MockAuthManager,
  headers: Record<string, string>
): void {
  manager.getHeaders.mockReturnValue(headers);
}
