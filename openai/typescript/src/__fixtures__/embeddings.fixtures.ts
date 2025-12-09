import type {
  EmbeddingRequest,
  EmbeddingResponse,
  Embedding,
} from '../services/embeddings/types.js';

export function createEmbedding(overrides?: Partial<Embedding>): Embedding {
  return {
    object: 'embedding',
    embedding: Array.from({ length: 1536 }, (_, i) => Math.sin(i * 0.01)),
    index: 0,
    ...overrides,
  };
}

export function createEmbeddingRequest(
  overrides?: Partial<EmbeddingRequest>
): EmbeddingRequest {
  return {
    model: 'text-embedding-ada-002',
    input: 'The quick brown fox jumps over the lazy dog',
    ...overrides,
  };
}

export function createEmbeddingResponse(
  overrides?: Partial<EmbeddingResponse>
): EmbeddingResponse {
  return {
    object: 'list',
    data: [createEmbedding()],
    model: 'text-embedding-ada-002',
    usage: {
      prompt_tokens: 8,
      total_tokens: 8,
    },
    ...overrides,
  };
}

export function createMultipleEmbeddingsResponse(
  count: number
): EmbeddingResponse {
  return createEmbeddingResponse({
    data: Array.from({ length: count }, (_, i) =>
      createEmbedding({ index: i })
    ),
    usage: {
      prompt_tokens: 8 * count,
      total_tokens: 8 * count,
    },
  });
}

export function createBatchEmbeddingRequest(): EmbeddingRequest {
  return createEmbeddingRequest({
    input: [
      'The quick brown fox jumps over the lazy dog',
      'Lorem ipsum dolor sit amet',
      'OpenAI provides powerful AI models',
    ],
  });
}
