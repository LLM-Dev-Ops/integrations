/**
 * Types for the Embed service.
 */

import type { ApiMeta, EmbeddingType, InputType, TruncateOption } from '../../types';

/**
 * Embeddings organized by type
 */
export interface EmbeddingsByType {
  float?: number[][];
  int8?: number[][];
  uint8?: number[][];
  binary?: number[][];
  ubinary?: number[][];
}

/**
 * Embed request
 */
export interface EmbedRequest {
  /** Texts to embed */
  texts: string[];
  /** Model to use */
  model?: string;
  /** Input type for better embeddings */
  inputType?: InputType;
  /** Embedding types to return */
  embeddingTypes?: EmbeddingType[];
  /** Truncation behavior */
  truncate?: TruncateOption;
}

/**
 * Embed response
 */
export interface EmbedResponse {
  /** Embed ID */
  id?: string;
  /** Float embeddings (legacy) */
  embeddings?: number[][];
  /** Embeddings organized by type */
  embeddingsByType?: EmbeddingsByType;
  /** Original texts */
  texts?: string[];
  /** API metadata */
  meta?: ApiMeta;
}

/**
 * Embed job status
 */
export type EmbedJobStatus =
  | 'processing'
  | 'complete'
  | 'failed'
  | 'cancelling'
  | 'cancelled';

/**
 * Embed job request (for batch processing)
 */
export interface EmbedJobRequest {
  /** Dataset ID to embed */
  datasetId: string;
  /** Model to use */
  model?: string;
  /** Input type */
  inputType?: InputType;
  /** Embedding types */
  embeddingTypes?: EmbeddingType[];
  /** Truncation behavior */
  truncate?: TruncateOption;
  /** Output dataset name */
  name?: string;
}

/**
 * Embed job
 */
export interface EmbedJob {
  /** Job ID */
  jobId: string;
  /** Job name */
  name?: string;
  /** Job status */
  status: EmbedJobStatus;
  /** Creation time */
  createdAt?: string;
  /** Input dataset ID */
  inputDatasetId?: string;
  /** Output dataset ID */
  outputDatasetId?: string;
  /** Model used */
  model?: string;
  /** Truncation setting */
  truncate?: TruncateOption;
  /** API metadata */
  meta?: ApiMeta;
}
