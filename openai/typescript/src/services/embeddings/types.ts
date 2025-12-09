export type EmbeddingEncodingFormat = 'float' | 'base64';

export interface EmbeddingRequest {
  model: string;
  input: string | string[] | number[] | number[][];
  encoding_format?: EmbeddingEncodingFormat;
  dimensions?: number;
  user?: string;
}

export interface EmbeddingResponse {
  object: 'list';
  data: Embedding[];
  model: string;
  usage: EmbeddingUsage;
}

export interface Embedding {
  object: 'embedding';
  embedding: number[];
  index: number;
}

export interface EmbeddingUsage {
  prompt_tokens: number;
  total_tokens: number;
}

// Helper to create embedding request
export function createEmbeddingRequest(
  model: string,
  input: string | string[]
): EmbeddingRequest {
  return { model, input };
}
