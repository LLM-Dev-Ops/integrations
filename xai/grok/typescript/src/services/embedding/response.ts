/**
 * Embedding Response Types
 *
 * @module services/embedding/response
 */

/**
 * Single embedding result.
 */
export interface Embedding {
  /** Object type */
  readonly object: 'embedding';

  /** Embedding vector */
  readonly embedding: number[];

  /** Index in the input array */
  readonly index: number;
}

/**
 * Embedding usage information.
 */
export interface EmbeddingUsage {
  /** Prompt tokens */
  readonly prompt_tokens: number;

  /** Total tokens */
  readonly total_tokens: number;
}

/**
 * Embedding response.
 */
export interface GrokEmbeddingResponse {
  /** Object type */
  readonly object: 'list';

  /** Model used */
  readonly model: string;

  /** Embeddings */
  readonly data: Embedding[];

  /** Token usage */
  readonly usage: EmbeddingUsage;
}

/**
 * Extract embeddings as array of vectors.
 *
 * @param response - Embedding response
 * @returns Array of embedding vectors
 */
export function extractEmbeddings(response: GrokEmbeddingResponse): number[][] {
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((e) => e.embedding);
}

/**
 * Extract single embedding.
 *
 * @param response - Embedding response
 * @returns First embedding vector
 */
export function extractSingleEmbedding(response: GrokEmbeddingResponse): number[] {
  if (response.data.length === 0) {
    return [];
  }
  return response.data[0].embedding;
}
