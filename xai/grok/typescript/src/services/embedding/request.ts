/**
 * Embedding Request Types
 *
 * @module services/embedding/request
 */

/**
 * Embedding input type.
 */
export type EmbeddingInput = string | string[];

/**
 * Embedding encoding format.
 */
export type EncodingFormat = 'float' | 'base64';

/**
 * Embedding request.
 */
export interface GrokEmbeddingRequest {
  /** Input text(s) to embed */
  readonly input: EmbeddingInput;

  /** Model to use */
  readonly model: string;

  /** Encoding format for embeddings */
  readonly encoding_format?: EncodingFormat;

  /** Number of dimensions (if supported) */
  readonly dimensions?: number;

  /** User identifier for abuse detection */
  readonly user?: string;
}

/**
 * Build embedding request body for API.
 *
 * @param request - Embedding request
 * @returns Request body object
 */
export function buildEmbeddingRequestBody(
  request: GrokEmbeddingRequest
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    input: request.input,
    model: request.model,
  };

  if (request.encoding_format !== undefined) {
    body.encoding_format = request.encoding_format;
  }
  if (request.dimensions !== undefined) {
    body.dimensions = request.dimensions;
  }
  if (request.user !== undefined) {
    body.user = request.user;
  }

  return body;
}
