/**
 * Embedding Types
 *
 * Type definitions for Azure OpenAI embeddings API.
 */

import type { TokenUsage } from '../../types/index.js';

/** Embedding encoding format */
export type EmbeddingEncodingFormat = 'float' | 'base64';

/** Embedding request */
export interface EmbeddingRequest {
  /** Deployment ID (Azure-specific, replaces model) */
  deploymentId: string;
  /** Text input(s) to embed */
  input: string | string[];
  /** Encoding format for embeddings */
  encoding_format?: EmbeddingEncodingFormat;
  /** Number of dimensions (for models that support it) */
  dimensions?: number;
  /** End user identifier */
  user?: string;
}

/** Embedding response */
export interface EmbeddingResponse {
  object: 'list';
  data: Embedding[];
  model: string;
  usage: EmbeddingUsage;
}

/** Single embedding */
export interface Embedding {
  object: 'embedding';
  embedding: number[] | string;
  index: number;
}

/** Embedding usage */
export interface EmbeddingUsage {
  prompt_tokens: number;
  total_tokens: number;
}

/**
 * Normalizes embedding usage to common format
 */
export function toTokenUsage(usage: EmbeddingUsage | undefined): TokenUsage | undefined {
  if (!usage) return undefined;
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: 0,
    totalTokens: usage.total_tokens,
  };
}

/**
 * Decodes base64 embedding to float array
 */
export function decodeBase64Embedding(base64: string): number[] {
  const buffer = Buffer.from(base64, 'base64');
  const floats: number[] = [];
  for (let i = 0; i < buffer.length; i += 4) {
    floats.push(buffer.readFloatLE(i));
  }
  return floats;
}

/**
 * Normalizes embedding data to float arrays
 */
export function normalizeEmbeddings(response: EmbeddingResponse): number[][] {
  return response.data.map(e => {
    if (typeof e.embedding === 'string') {
      return decodeBase64Embedding(e.embedding);
    }
    return e.embedding;
  });
}
