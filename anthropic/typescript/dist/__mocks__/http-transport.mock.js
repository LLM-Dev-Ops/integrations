import { vi } from 'vitest';
export function createMockHttpTransport() {
    return {
        request: vi.fn(),
        requestStream: vi.fn(),
    };
}
export function createMockHttpTransportWithDefaults() {
    const transport = createMockHttpTransport();
    // Default successful response
    transport.request.mockResolvedValue({});
    // Default stream implementation - creates a mock ReadableStream
    transport.requestStream.mockImplementation(async () => {
        const encoder = new TextEncoder();
        return new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode('data: {"type":"test"}\n\n'));
                controller.close();
            },
        });
    });
    return transport;
}
export function mockHttpTransportError(transport, error) {
    transport.request.mockRejectedValue(error);
}
export function mockHttpTransportResponse(transport, response) {
    transport.request.mockResolvedValue(response);
}
export function mockHttpTransportStream(transport, events) {
    const encoder = new TextEncoder();
    transport.requestStream.mockImplementation(async () => {
        return new ReadableStream({
            start(controller) {
                for (const event of events) {
                    controller.enqueue(encoder.encode(event));
                }
                controller.close();
            },
        });
    });
}
//# sourceMappingURL=http-transport.mock.js.map