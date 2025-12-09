import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { beforeAll, afterEach, afterAll } from 'vitest';
import {
  createChatCompletionResponse,
  createEmbeddingResponse,
  createModelListResponse,
  createFileObject,
  create401UnauthorizedError,
  create429RateLimitError,
  create500InternalServerError,
} from '../../__fixtures__/index.js';

const BASE_URL = 'https://api.openai.com';

// Default handlers for common endpoints
export const handlers = [
  // Chat Completions
  http.post(`${BASE_URL}/v1/chat/completions`, () => {
    return HttpResponse.json(createChatCompletionResponse());
  }),

  // Embeddings
  http.post(`${BASE_URL}/v1/embeddings`, () => {
    return HttpResponse.json(createEmbeddingResponse());
  }),

  // Models
  http.get(`${BASE_URL}/v1/models`, () => {
    return HttpResponse.json(createModelListResponse());
  }),

  http.get(`${BASE_URL}/v1/models/:modelId`, ({ params }) => {
    return HttpResponse.json({
      id: params.modelId,
      object: 'model',
      created: 1687882411,
      owned_by: 'openai',
    });
  }),

  // Files
  http.post(`${BASE_URL}/v1/files`, () => {
    return HttpResponse.json(createFileObject());
  }),

  http.get(`${BASE_URL}/v1/files`, () => {
    return HttpResponse.json({
      object: 'list',
      data: [createFileObject()],
      has_more: false,
    });
  }),

  http.get(`${BASE_URL}/v1/files/:fileId`, ({ params }) => {
    return HttpResponse.json(
      createFileObject({ id: params.fileId as string })
    );
  }),

  http.delete(`${BASE_URL}/v1/files/:fileId`, ({ params }) => {
    return HttpResponse.json({
      id: params.fileId,
      object: 'file',
      deleted: true,
    });
  }),
];

// Create MSW server
export const server = setupServer(...handlers);

// Setup MSW
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

// Helper functions for test setup
export function mockChatCompletion(response = createChatCompletionResponse()) {
  server.use(
    http.post(`${BASE_URL}/v1/chat/completions`, () => {
      return HttpResponse.json(response);
    })
  );
}

export function mockEmbeddings(response = createEmbeddingResponse()) {
  server.use(
    http.post(`${BASE_URL}/v1/embeddings`, () => {
      return HttpResponse.json(response);
    })
  );
}

export function mockUnauthorizedError() {
  server.use(
    http.post(`${BASE_URL}/v1/chat/completions`, () => {
      const error = create401UnauthorizedError();
      return HttpResponse.json(error.data, { status: error.status });
    })
  );
}

export function mockRateLimitError() {
  server.use(
    http.post(`${BASE_URL}/v1/chat/completions`, () => {
      const error = create429RateLimitError();
      return HttpResponse.json(error.data, {
        status: error.status,
        headers: error.headers,
      });
    })
  );
}

export function mockServerError() {
  server.use(
    http.post(`${BASE_URL}/v1/chat/completions`, () => {
      const error = create500InternalServerError();
      return HttpResponse.json(error.data, { status: error.status });
    })
  );
}

export function mockStreamingResponse(chunks: string[]) {
  server.use(
    http.post(`${BASE_URL}/v1/chat/completions`, () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      return new HttpResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    })
  );
}
