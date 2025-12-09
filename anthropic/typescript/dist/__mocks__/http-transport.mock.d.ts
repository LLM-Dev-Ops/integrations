import { vi } from 'vitest';
import type { HttpTransport } from '../transport/http-transport.js';
export interface MockHttpTransport extends HttpTransport {
    request: ReturnType<typeof vi.fn>;
    requestStream: ReturnType<typeof vi.fn>;
}
export declare function createMockHttpTransport(): MockHttpTransport;
export declare function createMockHttpTransportWithDefaults(): MockHttpTransport;
export declare function mockHttpTransportError(transport: MockHttpTransport, error: Error): void;
export declare function mockHttpTransportResponse<T>(transport: MockHttpTransport, response: T): void;
export declare function mockHttpTransportStream(transport: MockHttpTransport, events: string[]): void;
//# sourceMappingURL=http-transport.mock.d.ts.map