/**
 * RAG (Retrieval-Augmented Generation) retriever for Pinecone.
 *
 * This module provides high-level retrieval utilities optimized for RAG workflows,
 * including content extraction, scoring, and multi-query retrieval.
 *
 * @module rag/retriever
 */

import type { QueryRequest, QueryResponse } from '../types/query.js';
import type { MetadataFilter } from '../types/filter.js';
import type { Metadata } from '../types/metadata.js';

/**
 * Query for retrieving relevant vectors.
 */
export interface RetrievalQuery {
  /**
   * Query embedding vector
   */
  embedding: number[];

  /**
   * Number of results to return
   */
  topK: number;

  /**
   * Minimum similarity score threshold (0-1)
   */
  minScore?: number;

  /**
   * Metadata filter to apply
   */
  filter?: MetadataFilter;

  /**
   * Namespace to query
   */
  namespace?: string;
}

/**
 * Result from a retrieval operation.
 */
export interface RetrievalResult {
  /**
   * Vector ID
   */
  id: string;

  /**
   * Similarity score (0-1, where 1 is most similar)
   */
  score: number;

  /**
   * Extracted content from metadata
   */
  content?: string;

  /**
   * Full metadata object
   */
  metadata: Metadata;
}

/**
 * Configuration for RAG retriever behavior.
 */
export interface RAGRetrieverConfig {
  /**
   * Default namespace for queries
   */
  defaultNamespace?: string;

  /**
   * Default topK value
   */
  defaultTopK?: number;

  /**
   * Whether to include metadata in results (default: true)
   */
  includeMetadata?: boolean;

  /**
   * Metadata field to extract as content (default: 'content')
   */
  contentField?: string;
}

/**
 * High-level retriever for RAG (Retrieval-Augmented Generation) workflows.
 *
 * The RAGRetriever simplifies common retrieval patterns by:
 * - Automatically extracting content from metadata
 * - Filtering results by minimum score
 * - Supporting multi-query retrieval with deduplication
 * - Providing a fluent interface for configuration
 *
 * @example
 * ```typescript
 * const retriever = new RAGRetriever(queryFn, {
 *   defaultNamespace: 'docs',
 *   defaultTopK: 5,
 *   contentField: 'text'
 * });
 *
 * // Simple retrieval
 * const results = await retriever.retrieve({
 *   embedding: [0.1, 0.2, ...],
 *   topK: 10,
 *   minScore: 0.7
 * });
 *
 * results.forEach(result => {
 *   console.log(`${result.id}: ${result.content} (score: ${result.score})`);
 * });
 *
 * // Multi-query retrieval
 * const multiResults = await retriever.multiRetrieve([
 *   { embedding: embedding1, topK: 5 },
 *   { embedding: embedding2, topK: 5 }
 * ]);
 *
 * // Fluent interface
 * const customRetriever = retriever
 *   .withDefaultNamespace('custom')
 *   .withMinScore(0.8);
 * ```
 */
export class RAGRetriever {
  private config: Required<RAGRetrieverConfig>;
  private globalMinScore?: number;

  /**
   * Creates a new RAGRetriever.
   *
   * @param queryFn - Function to execute Pinecone queries
   * @param config - Configuration for retriever behavior
   *
   * @example
   * ```typescript
   * const retriever = new RAGRetriever(
   *   async (req) => pineconeClient.query(req),
   *   {
   *     defaultNamespace: 'docs',
   *     contentField: 'text'
   *   }
   * );
   * ```
   */
  constructor(
    private queryFn: (req: QueryRequest) => Promise<QueryResponse>,
    config?: RAGRetrieverConfig
  ) {
    this.config = {
      defaultNamespace: config?.defaultNamespace ?? '',
      defaultTopK: config?.defaultTopK ?? 10,
      includeMetadata: config?.includeMetadata ?? true,
      contentField: config?.contentField ?? 'content',
    };
  }

  /**
   * Returns a new retriever with a different default namespace.
   *
   * @param namespace - Default namespace to use
   * @returns A new RAGRetriever with updated config
   *
   * @example
   * ```typescript
   * const docsRetriever = retriever.withDefaultNamespace('docs');
   * const codeRetriever = retriever.withDefaultNamespace('code');
   * ```
   */
  withDefaultNamespace(namespace: string): this {
    const newRetriever = new RAGRetriever(this.queryFn, {
      ...this.config,
      defaultNamespace: namespace,
    }) as this;
    newRetriever.globalMinScore = this.globalMinScore;
    return newRetriever;
  }

  /**
   * Returns a new retriever with a different default topK.
   *
   * @param topK - Default number of results to return
   * @returns A new RAGRetriever with updated config
   *
   * @example
   * ```typescript
   * const smallRetriever = retriever.withDefaultTopK(3);
   * const largeRetriever = retriever.withDefaultTopK(20);
   * ```
   */
  withDefaultTopK(topK: number): this {
    const newRetriever = new RAGRetriever(this.queryFn, {
      ...this.config,
      defaultTopK: topK,
    }) as this;
    newRetriever.globalMinScore = this.globalMinScore;
    return newRetriever;
  }

  /**
   * Returns a new retriever with a global minimum score filter.
   *
   * @param minScore - Minimum score threshold (0-1)
   * @returns A new RAGRetriever with updated config
   *
   * @example
   * ```typescript
   * const strictRetriever = retriever.withMinScore(0.8);
   * ```
   */
  withMinScore(minScore: number): this {
    const newRetriever = new RAGRetriever(this.queryFn, this.config) as this;
    newRetriever.globalMinScore = minScore;
    return newRetriever;
  }

  /**
   * Retrieves relevant vectors for a single query.
   *
   * @param query - Retrieval query with embedding and parameters
   * @returns Array of retrieval results sorted by score (descending)
   *
   * @example
   * ```typescript
   * const results = await retriever.retrieve({
   *   embedding: [0.1, 0.2, 0.3, ...],
   *   topK: 5,
   *   minScore: 0.7,
   *   filter: { category: { $eq: 'documentation' } }
   * });
   *
   * results.forEach(result => {
   *   console.log(result.content, result.score);
   * });
   * ```
   */
  async retrieve(query: RetrievalQuery): Promise<RetrievalResult[]> {
    // Build Pinecone query request
    const request: QueryRequest = {
      namespace: query.namespace ?? this.config.defaultNamespace,
      vector: query.embedding,
      topK: query.topK ?? this.config.defaultTopK,
      filter: query.filter,
      includeMetadata: this.config.includeMetadata,
      includeValues: false,
    };

    // Execute query
    const response = await this.queryFn(request);

    // Determine minimum score (query-level takes precedence)
    const minScore = query.minScore ?? this.globalMinScore;

    // Transform and filter results
    const results = response.matches
      .filter((match) => minScore === undefined || match.score >= minScore)
      .map((match) => this.transformToResult(match));

    return results;
  }

  /**
   * Retrieves and merges results from multiple queries.
   *
   * Executes all queries in parallel, then merges and deduplicates results.
   * If the same vector ID appears in multiple queries, the highest score is kept.
   *
   * @param queries - Array of retrieval queries
   * @returns Merged and deduplicated results sorted by score (descending)
   *
   * @example
   * ```typescript
   * // Multi-vector search (e.g., hybrid or re-ranking)
   * const results = await retriever.multiRetrieve([
   *   { embedding: queryEmbedding1, topK: 10 },
   *   { embedding: queryEmbedding2, topK: 10 }
   * ]);
   *
   * // Results are deduplicated and sorted by score
   * console.log(results.length); // <= 20 (may be less due to deduplication)
   * ```
   */
  async multiRetrieve(queries: RetrievalQuery[]): Promise<RetrievalResult[]> {
    // Execute all queries in parallel
    const resultArrays = await Promise.all(
      queries.map((query) => this.retrieve(query))
    );

    // Merge results with deduplication by ID
    const resultMap = new Map<string, RetrievalResult>();

    for (const results of resultArrays) {
      for (const result of results) {
        const existing = resultMap.get(result.id);

        // Keep the result with the highest score
        if (!existing || result.score > existing.score) {
          resultMap.set(result.id, result);
        }
      }
    }

    // Convert to array and sort by score descending
    const mergedResults = Array.from(resultMap.values()).sort(
      (a, b) => b.score - a.score
    );

    return mergedResults;
  }

  /**
   * Transforms a Pinecone ScoredVector to a RetrievalResult.
   * Extracts content from the configured metadata field.
   *
   * @param match - Scored vector from Pinecone query
   * @returns Retrieval result with extracted content
   */
  private transformToResult(match: {
    id: string;
    score: number;
    metadata?: Metadata;
  }): RetrievalResult {
    const metadata = match.metadata ?? {};

    // Extract content from metadata field
    const contentValue = metadata[this.config.contentField];
    const content = typeof contentValue === 'string' ? contentValue : undefined;

    return {
      id: match.id,
      score: match.score,
      content,
      metadata,
    };
  }
}
