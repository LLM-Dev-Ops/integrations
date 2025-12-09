import { vi } from 'vitest';
export function createMockAuthManager() {
    return {
        getHeaders: vi.fn(() => ({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        })),
        validateApiKey: vi.fn(),
    };
}
export function mockAuthManagerValidationError(manager, error) {
    manager.validateApiKey.mockImplementation(() => {
        throw error;
    });
}
export function mockAuthManagerHeaders(manager, headers) {
    manager.getHeaders.mockReturnValue(headers);
}
//# sourceMappingURL=auth-manager.mock.js.map