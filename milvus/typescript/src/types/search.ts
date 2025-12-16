import { ConsistencyLevel } from './consistency.js';
import { MetricType, SearchParams } from './metric.js';
import { FieldValue } from './entity.js';

/**
 * Request for vector similarity search.
 */
export interface SearchRequest {
  /** Collection to search in */
  collectionName: string;
  /** Optional partition names to search */
  partitionNames?: string[];
  /** Name of the vector field to search */
  vectorField: string;
  /** Query vectors */
  vectors: number[][];
  /** Distance metric type */
  metricType: MetricType;
  /** Number of results to return per query */
  topK: number;
  /** Index-specific search parameters */
  params: SearchParams;
  /** Optional filter expression */
  filter?: string;
  /** Fields to include in results */
  outputFields: string[];
  /** Consistency level override */
  consistencyLevel?: ConsistencyLevel;
}

/**
 * Response from a search operation.
 */
export interface SearchResponse {
  /** Results for each query vector */
  results: SearchHits[];
}

/**
 * Search hits for a single query.
 */
export interface SearchHits {
  /** Entity IDs */
  ids: bigint[];
  /** Distance/similarity scores */
  scores: number[];
  /** Field values for each result */
  fields: Record<string, FieldValue>[];
}

/**
 * Single search hit with ID, score, and fields.
 */
export interface SearchHit {
  /** Entity ID */
  id: bigint;
  /** Distance/similarity score */
  score: number;
  /** Field values */
  fields?: Record<string, FieldValue>;
}

/**
 * Iterator over search hits.
 */
export function* iterateSearchHits(hits: SearchHits): Generator<SearchHit> {
  for (let i = 0; i < hits.ids.length; i++) {
    const id = hits.ids[i];
    const score = hits.scores[i];
    if (id !== undefined && score !== undefined) {
      yield {
        id,
        score,
        fields: hits.fields[i],
      };
    }
  }
}

/**
 * Hybrid search request with multiple vector queries and reranking.
 */
export interface HybridSearchRequest {
  /** Collection to search in */
  collectionName: string;
  /** Optional partition names */
  partitionNames?: string[];
  /** Individual search requests */
  searches: SearchRequest[];
  /** Reranking strategy */
  rerankStrategy: RerankStrategy;
  /** Final number of results after reranking */
  finalTopK: number;
  /** Consistency level override */
  consistencyLevel?: ConsistencyLevel;
}

/**
 * Reranking strategy for hybrid search.
 */
export type RerankStrategy =
  | { type: 'rrf'; k: number }
  | { type: 'weightedSum'; weights: number[] }
  | { type: 'maxScore' };

/**
 * Create RRF (Reciprocal Rank Fusion) reranking strategy.
 * @param k RRF constant (typically 60)
 */
export function createRRFStrategy(k: number = 60): RerankStrategy {
  return { type: 'rrf', k };
}

/**
 * Create weighted sum reranking strategy.
 * @param weights Weights for each search (should sum to 1.0)
 */
export function createWeightedSumStrategy(weights: number[]): RerankStrategy {
  return { type: 'weightedSum', weights };
}

/**
 * Create max score reranking strategy.
 */
export function createMaxScoreStrategy(): RerankStrategy {
  return { type: 'maxScore' };
}

/**
 * Range search request.
 */
export interface RangeSearchRequest {
  /** Collection to search in */
  collectionName: string;
  /** Optional partition names */
  partitionNames?: string[];
  /** Name of the vector field */
  vectorField: string;
  /** Query vectors */
  vectors: number[][];
  /** Distance metric type */
  metricType: MetricType;
  /** Search parameters */
  params: SearchParams;
  /** Radius for range search */
  radius: number;
  /** Optional inner radius for annular search */
  rangeFilter?: number;
  /** Optional filter expression */
  filter?: string;
  /** Fields to include in results */
  outputFields: string[];
  /** Consistency level override */
  consistencyLevel?: ConsistencyLevel;
}
