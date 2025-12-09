import { vi } from 'vitest';
import type { HttpTransport, HttpRequest, HttpResponse } from '../types/common.js';

export interface MockHttpTransport extends HttpTransport {
  request: ReturnType<typeof vi.fn>;
  stream: ReturnType<typeof vi.fn>;
}

export function createMockHttpTransport(): MockHttpTransport {
  return {
    request: vi.fn<[HttpRequest], Promise<HttpResponse<unknown>>>(),
    stream: vi.fn<[HttpRequest], AsyncIterable<unknown>>(),
  };
}

export function createMockHttpTransportWithDefaults(): MockHttpTransport {
  const transport = createMockHttpTransport();

  // Default successful response
  transport.request.mockResolvedValue({
    status: 200,
    headers: { 'content-type': 'application/json' },
    data: {},
  });

  // Default stream implementation
  transport.stream.mockImplementation(async function* () {
    yield { data: 'chunk1' };
    yield { data: 'chunk2' };
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
  response: HttpResponse<T>
): void {
  transport.request.mockResolvedValue(response);
}

export function mockHttpTransportStream<T>(
  transport: MockHttpTransport,
  chunks: T[]
): void {
  transport.stream.mockImplementation(async function* () {
    for (const chunk of chunks) {
      yield chunk;
    }
  });
}
