/**
 * Types for the Rerank service.
 */

import type { ApiMeta } from '../../types';

/**
 * Document for reranking (can be string or object)
 */
export type RerankDocument = string | { text: string; [key: string]: unknown };

/**
 * Rerank request
 */
export interface RerankRequest {
  /** The query to rerank documents against */
  query: string;
  /** Documents to rerank */
  documents: RerankDocument[];
  /** Model to use */
  model?: string;
  /** Number of top results to return */
  topN?: number;
  /** Maximum number of chunks per document */
  maxChunksPerDoc?: number;
  /** Return documents in results */
  returnDocuments?: boolean;
}

/**
 * Rerank result
 */
export interface RerankResult {
  /** Index of the document in the original list */
  index: number;
  /** Relevance score (0-1) */
  relevanceScore: number;
  /** Document content (if returnDocuments=true) */
  document?: RerankDocument;
}

/**
 * Rerank response
 */
export interface RerankResponse {
  /** Response ID */
  id?: string;
  /** Reranked results (sorted by relevance) */
  results: RerankResult[];
  /** API metadata */
  meta?: ApiMeta;
}
