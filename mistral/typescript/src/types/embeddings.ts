/**
 * Embedding types.
 */

/**
 * Embedding request.
 */
export interface EmbeddingRequest {
  /** Model ID to use. */
  model: string;
  /** Input text(s) to embed. */
  input: EmbeddingInput;
  /** Encoding format. */
  encoding_format?: EncodingFormat;
}

/**
 * Input for embedding requests.
 */
export type EmbeddingInput = string | string[];

/**
 * Encoding format for embeddings.
 */
export type EncodingFormat = 'float' | 'base64';

/**
 * Embedding response.
 */
export interface EmbeddingResponse {
  /** Response ID. */
  id: string;
  /** Object type. */
  object: string;
  /** Model used. */
  model: string;
  /** Embedding data. */
  data: EmbeddingData[];
  /** Token usage. */
  usage: EmbeddingUsage;
}

/**
 * Embedding data.
 */
export interface EmbeddingData {
  /** Object type. */
  object: string;
  /** Embedding vector. */
  embedding: number[];
  /** Index in the input. */
  index: number;
}

/**
 * Embedding usage information.
 */
export interface EmbeddingUsage {
  /** Number of prompt tokens. */
  prompt_tokens: number;
  /** Total tokens. */
  total_tokens: number;
}

/**
 * Creates an embedding request.
 */
export function createEmbeddingRequest(
  model: string,
  input: EmbeddingInput,
  encodingFormat?: EncodingFormat
): EmbeddingRequest {
  const request: EmbeddingRequest = { model, input };
  if (encodingFormat) {
    request.encoding_format = encodingFormat;
  }
  return request;
}
