/**
 * RAG (Retrieval-Augmented Generation) helper for Qdrant.
 *
 * This module provides high-level utilities for building RAG applications,
 * including semantic retrieval, context-aware chunk retrieval, and
 * document-level aggregation.
 *
 * @module rag/helper
 */

import type { Filter, ScoredPoint, ScrollParams, ScrollResult } from '../types.js';
import {
  extractChunkIndex,
  extractContent,
  extractDocumentId,
  enrichWithContext,
  groupByDocument,
  type ScrollableClient,
} from './context.js';
import type {
  AggregatedDocument,
  ContextualChunk,
  DocumentRetrievalOptions,
  Payload,
  RetrievedDocument,
  RetrieveOptions,
  ScoreAggregation,
} from './types.js';

/**
 * Interface for a collection client that supports search and scroll operations.
 */
export interface CollectionClient extends ScrollableClient {
  /**
   * Perform a semantic search with a query vector.
   *
   * @param params - Search parameters
   * @returns Array of scored points
   */
  search(params: SearchParams): Promise<ScoredPoint[]>;
}

/**
 * Search parameters for collection client.
 */
export interface SearchParams {
  /**
   * Query vector for similarity search.
   */
  vector: number[];

  /**
   * Maximum number of results to return.
   */
  limit: number;

  /**
   * Optional filter to apply.
   */
  filter?: Filter;

  /**
   * Minimum score threshold.
   */
  scoreThreshold?: number;

  /**
   * Whether to include payload in results.
   */
  withPayload?: boolean;

  /**
   * Whether to include vector in results.
   */
  withVector?: boolean;
}

/**
 * High-level RAG helper for semantic search and retrieval.
 *
 * The RagHelper simplifies common RAG patterns by providing:
 * - Simple semantic retrieval with scoring and filtering
 * - Context-aware chunk retrieval with surrounding chunks
 * - Document-level aggregation from chunk-level scores
 * - Content extraction from payloads
 *
 * @example
 * ```typescript
 * const ragHelper = new RagHelper(collectionClient, {
 *   defaultLimit: 10,
 *   scoreThreshold: 0.7
 * });
 *
 * // Simple retrieval
 * const results = await ragHelper.retrieve(queryVector, {
 *   limit: 5,
 *   scoreThreshold: 0.8
 * });
 *
 * // With context
 * const contextual = await ragHelper.retrieveWithContext(
 *   queryVector,
 *   2, // 2 chunks before and after
 *   { limit: 5 }
 * );
 *
 * // Document-level aggregation
 * const documents = await ragHelper.retrieveDocuments(queryVector, {
 *   chunkLimit: 100,
 *   documentLimit: 5,
 *   aggregation: 'max'
 * });
 * ```
 */
export class RagHelper {
  /**
   * The collection client for performing searches.
   */
  private readonly client: CollectionClient;

  /**
   * Default number of results to retrieve.
   */
  private readonly defaultLimit: number;

  /**
   * Default minimum score threshold.
   */
  private readonly scoreThreshold: number;

  /**
   * Field name containing content in payloads.
   */
  private readonly contentField: string;

  /**
   * Field name containing document ID in payloads.
   */
  private readonly documentIdField: string;

  /**
   * Field name containing chunk index in payloads.
   */
  private readonly chunkIndexField: string;

  /**
   * Creates a new RagHelper.
   *
   * @param client - Collection client for search and scroll operations
   * @param options - Configuration options
   *
   * @example
   * ```typescript
   * const helper = new RagHelper(collectionClient, {
   *   defaultLimit: 10,
   *   scoreThreshold: 0.7,
   *   contentField: 'text'
   * });
   * ```
   */
  constructor(
    client: CollectionClient,
    options?: {
      defaultLimit?: number;
      scoreThreshold?: number;
      contentField?: string;
      documentIdField?: string;
      chunkIndexField?: string;
    }
  ) {
    this.client = client;
    this.defaultLimit = options?.defaultLimit ?? 10;
    this.scoreThreshold = options?.scoreThreshold ?? 0.7;
    this.contentField = options?.contentField ?? 'content';
    this.documentIdField = options?.documentIdField ?? 'document_id';
    this.chunkIndexField = options?.chunkIndexField ?? 'chunk_index';
  }

  /**
   * Retrieves relevant documents based on a query vector.
   *
   * Performs semantic search and returns results with extracted content.
   * Results are automatically filtered by score threshold and limit.
   *
   * @param queryVector - Query embedding vector
   * @param options - Retrieval options
   * @returns Array of retrieved documents with scores and content
   *
   * @example
   * ```typescript
   * const results = await ragHelper.retrieve(
   *   [0.1, 0.2, 0.3, ...],
   *   {
   *     limit: 10,
   *     scoreThreshold: 0.8,
   *     filter: {
   *       must: [{ key: 'category', match: { value: 'docs' } }]
   *     }
   *   }
   * );
   *
   * results.forEach(doc => {
   *   console.log(`${doc.id}: ${doc.content} (score: ${doc.score})`);
   * });
   * ```
   */
  async retrieve(
    queryVector: number[],
    options?: RetrieveOptions
  ): Promise<RetrievedDocument[]> {
    const limit = options?.limit ?? this.defaultLimit;
    const scoreThreshold = options?.scoreThreshold ?? this.scoreThreshold;
    const filter = options?.filter;

    // Perform search
    const searchResults = await this.client.search({
      vector: queryVector,
      limit,
      filter,
      scoreThreshold,
      withPayload: true,
      withVector: false, // Don't return vectors in RAG results
    });

    // Transform to retrieved documents
    return searchResults.map((point) => this.transformToDocument(point));
  }

  /**
   * Retrieves documents with surrounding context chunks.
   *
   * For each search result, fetches neighboring chunks from the same document
   * to provide richer context for language models. Useful when documents are
   * split into chunks and you want to show the relevant chunk plus surrounding text.
   *
   * @param queryVector - Query embedding vector
   * @param contextWindow - Number of chunks to retrieve before AND after each result
   * @param options - Retrieval options
   * @returns Array of contextual chunks with main chunk and surrounding context
   *
   * @example
   * ```typescript
   * const contextual = await ragHelper.retrieveWithContext(
   *   queryVector,
   *   2, // Get 2 chunks before and 2 after
   *   {
   *     limit: 5,
   *     scoreThreshold: 0.75
   *   }
   * );
   *
   * contextual.forEach(({ mainChunk, contextChunks, documentId }) => {
   *   console.log(`Document: ${documentId}`);
   *   console.log(`Main chunk (score ${mainChunk.score}):`);
   *   console.log(extractContent(mainChunk.payload));
   *   console.log(`\nContext (${contextChunks.length} chunks):`);
   *   contextChunks.forEach(chunk => {
   *     console.log(extractContent(chunk.payload));
   *   });
   * });
   * ```
   */
  async retrieveWithContext(
    queryVector: number[],
    contextWindow: number,
    options?: RetrieveOptions
  ): Promise<ContextualChunk[]> {
    const limit = options?.limit ?? this.defaultLimit;
    const scoreThreshold = options?.scoreThreshold ?? this.scoreThreshold;
    const filter = options?.filter;

    // Get initial search results
    const searchResults = await this.client.search({
      vector: queryVector,
      limit,
      filter,
      scoreThreshold,
      withPayload: true,
      withVector: false,
    });

    // Enrich each result with context
    const contextualChunks: ContextualChunk[] = [];

    for (const mainChunk of searchResults) {
      const enriched = await enrichWithContext(
        this.client,
        mainChunk,
        contextWindow,
        contextWindow,
        filter
      );

      if (enriched) {
        contextualChunks.push(enriched);
      }
    }

    return contextualChunks;
  }

  /**
   * Retrieves documents with chunk-level aggregation.
   *
   * When documents are split into chunks, this method:
   * 1. Searches for relevant chunks
   * 2. Groups chunks by document ID
   * 3. Aggregates chunk scores to document scores
   * 4. Returns top documents based on aggregated scores
   *
   * This is useful for RAG systems where you want to retrieve whole documents
   * but search is performed at the chunk level.
   *
   * @param queryVector - Query embedding vector
   * @param options - Document retrieval options
   * @returns Array of aggregated documents sorted by score
   *
   * @example
   * ```typescript
   * const documents = await ragHelper.retrieveDocuments(
   *   queryVector,
   *   {
   *     chunkLimit: 100,      // Search top 100 chunks
   *     documentLimit: 5,     // Return top 5 documents
   *     aggregation: 'max',   // Use max chunk score as doc score
   *     filter: {
   *       must: [{ key: 'status', match: { value: 'published' } }]
   *     }
   *   }
   * );
   *
   * documents.forEach(doc => {
   *   console.log(`Document ${doc.documentId}:`);
   *   console.log(`  Score: ${doc.score} (${doc.aggregationMethod})`);
   *   console.log(`  Chunks: ${doc.chunks.length}`);
   *   doc.chunks.forEach(chunk => {
   *     console.log(`    - ${chunk.id}: ${chunk.score}`);
   *   });
   * });
   * ```
   */
  async retrieveDocuments(
    queryVector: number[],
    options: DocumentRetrievalOptions
  ): Promise<AggregatedDocument[]> {
    const { chunkLimit, documentLimit, filter, aggregation } = options;

    // Search for chunks
    const chunkResults = await this.client.search({
      vector: queryVector,
      limit: chunkLimit,
      filter,
      withPayload: true,
      withVector: false,
    });

    // Group chunks by document
    const documentGroups = this.groupChunksByDocument(chunkResults);

    // Aggregate scores for each document
    const aggregatedDocs = this.aggregateDocumentScores(
      documentGroups,
      aggregation
    );

    // Sort by score and limit
    aggregatedDocs.sort((a, b) => b.score - a.score);

    return aggregatedDocs.slice(0, documentLimit);
  }

  /**
   * Transforms a scored point to a retrieved document.
   *
   * @param point - Scored point from search
   * @returns Retrieved document with extracted content
   */
  private transformToDocument(point: ScoredPoint): RetrievedDocument {
    const payload = point.payload as Payload | undefined;
    const content = extractContent(payload, this.contentField);

    return {
      id: String(point.id),
      score: point.score,
      content,
      metadata: payload,
    };
  }

  /**
   * Groups search results by document ID.
   *
   * @param chunks - Array of scored chunks
   * @returns Map of document ID to chunks
   */
  private groupChunksByDocument(
    chunks: ScoredPoint[]
  ): Map<string, ScoredPoint[]> {
    const groups = new Map<string, ScoredPoint[]>();

    for (const chunk of chunks) {
      const docId = extractDocumentId(
        chunk.payload as Payload,
        this.documentIdField
      );

      if (!docId) {
        // Skip chunks without document_id
        continue;
      }

      const existing = groups.get(docId);
      if (existing) {
        existing.push(chunk);
      } else {
        groups.set(docId, [chunk]);
      }
    }

    return groups;
  }

  /**
   * Aggregates chunk scores to document scores.
   *
   * @param documentGroups - Map of document ID to chunks
   * @param aggregation - Aggregation method
   * @returns Array of aggregated documents
   */
  private aggregateDocumentScores(
    documentGroups: Map<string, ScoredPoint[]>,
    aggregation: ScoreAggregation
  ): AggregatedDocument[] {
    const documents: AggregatedDocument[] = [];

    for (const entry of Array.from(documentGroups.entries())) {
      const [documentId, chunks] = entry;
      if (chunks.length === 0) {
        continue;
      }

      // Sort chunks by score
      const sortedChunks = [...chunks].sort((a, b) => b.score - a.score);

      // Calculate aggregated score
      const score = this.calculateAggregatedScore(sortedChunks, aggregation);

      documents.push({
        documentId,
        score,
        chunks: sortedChunks,
        aggregationMethod: aggregation,
      });
    }

    return documents;
  }

  /**
   * Calculates aggregated score from chunk scores.
   *
   * @param chunks - Array of scored chunks
   * @param aggregation - Aggregation method
   * @returns Aggregated score
   */
  private calculateAggregatedScore(
    chunks: ScoredPoint[],
    aggregation: ScoreAggregation
  ): number {
    if (chunks.length === 0) {
      return 0;
    }

    switch (aggregation) {
      case 'max':
        // Maximum score among all chunks
        return Math.max(...chunks.map((c) => c.score));

      case 'sum':
        // Sum of all chunk scores
        return chunks.reduce((sum, c) => sum + c.score, 0);

      case 'avg':
        // Average of all chunk scores
        const sum = chunks.reduce((acc, c) => acc + c.score, 0);
        return sum / chunks.length;

      default:
        // Default to max if unknown aggregation
        return Math.max(...chunks.map((c) => c.score));
    }
  }
}
