import { vi } from 'vitest';
import type { HttpTransport, RequestOptions } from '../transport/http-transport.js';

export interface MockHttpTransport extends HttpTransport {
  request: ReturnType<typeof vi.fn>;
  requestStream: ReturnType<typeof vi.fn>;
}

export function createMockHttpTransport(): MockHttpTransport {
  return {
    request: vi.fn(),
    requestStream: vi.fn(),
  };
}

export function createMockHttpTransportWithDefaults(): MockHttpTransport {
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

export function mockHttpTransportError(
  transport: MockHttpTransport,
  error: Error
): void {
  transport.request.mockRejectedValue(error);
}

export function mockHttpTransportResponse<T>(
  transport: MockHttpTransport,
  response: T
): void {
  transport.request.mockResolvedValue(response);
}

export function mockHttpTransportStream(
  transport: MockHttpTransport,
  events: string[]
): void {
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
