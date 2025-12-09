import { vi } from 'vitest';
import type { AuthManager } from '../auth/auth-manager.js';
export interface MockAuthManager extends AuthManager {
    getHeaders: ReturnType<typeof vi.fn>;
    validateApiKey: ReturnType<typeof vi.fn>;
}
export declare function createMockAuthManager(): MockAuthManager;
export declare function mockAuthManagerValidationError(manager: MockAuthManager, error: Error): void;
export declare function mockAuthManagerHeaders(manager: MockAuthManager, headers: Record<string, string>): void;
//# sourceMappingURL=auth-manager.mock.d.ts.map