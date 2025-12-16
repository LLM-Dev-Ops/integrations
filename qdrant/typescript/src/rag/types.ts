/**
 * Type definitions for RAG (Retrieval-Augmented Generation) operations.
 *
 * This module provides types for semantic search, context retrieval,
 * and document-level aggregation in RAG workflows.
 *
 * @module rag/types
 */

import type { Filter, Point, ScoredPoint } from '../types.js';

/**
 * Payload type for points - flexible JSON-like structure.
 */
export type Payload = Record<string, unknown>;

/**
 * Options for basic retrieval operations.
 *
 * @example
 * ```typescript
 * const options: RetrieveOptions = {
 *   limit: 5,
 *   scoreThreshold: 0.8,
 *   filter: {
 *     must: [
 *       { key: 'category', match: { value: 'documentation' } }
 *     ]
 *   }
 * };
 * ```
 */
export interface RetrieveOptions {
  /**
   * Maximum number of results to return.
   * @default 10
   */
  limit?: number;

  /**
   * Filter to apply to the search.
   * Only points matching the filter will be considered.
   */
  filter?: Filter;

  /**
   * Minimum similarity score threshold (0-1).
   * Results with scores below this threshold will be filtered out.
   * @default 0.7
   */
  scoreThreshold?: number;
}

/**
 * A document retrieved from semantic search.
 *
 * Represents a single search result with its similarity score,
 * content, and metadata.
 *
 * @example
 * ```typescript
 * const doc: RetrievedDocument = {
 *   id: 'doc_123',
 *   score: 0.95,
 *   content: 'This is the document text...',
 *   metadata: {
 *     title: 'Example Document',
 *     author: 'John Doe',
 *     created_at: '2025-01-15'
 *   }
 * };
 * ```
 */
export interface RetrievedDocument {
  /**
   * Unique identifier for the document/chunk.
   */
  id: string;

  /**
   * Similarity score (0-1, where 1 is most similar).
   */
  score: number;

  /**
   * Extracted content from the point payload.
   * Typically from a 'content' or 'text' field.
   */
  content?: unknown;

  /**
   * Full payload/metadata of the point.
   */
  metadata?: Payload;
}

/**
 * Configuration for context-aware retrieval.
 *
 * Defines how many context chunks to retrieve around each main result.
 *
 * @example
 * ```typescript
 * const config: ContextConfig = {
 *   initialLimit: 10,
 *   contextBefore: 2,
 *   contextAfter: 2,
 *   filter: {
 *     must: [{ key: 'type', match: { value: 'chunk' } }]
 *   }
 * };
 * ```
 */
export interface ContextConfig {
  /**
   * Initial number of main results to retrieve.
   */
  initialLimit: number;

  /**
   * Number of chunks to retrieve before each main result.
   */
  contextBefore: number;

  /**
   * Number of chunks to retrieve after each main result.
   */
  contextAfter: number;

  /**
   * Optional filter to apply to context retrieval.
   */
  filter?: Filter;
}

/**
 * A chunk with its surrounding context.
 *
 * Represents a main search result along with neighboring chunks
 * from the same document, providing broader context for RAG.
 *
 * @example
 * ```typescript
 * const chunk: ContextualChunk = {
 *   mainChunk: {
 *     id: 'chunk_5',
 *     score: 0.92,
 *     vector: [0.1, 0.2, ...],
 *     payload: {
 *       content: 'Main chunk text...',
 *       document_id: 'doc_123',
 *       chunk_index: 5
 *     }
 *   },
 *   contextChunks: [
 *     // chunks 3, 4, 6, 7 from same document
 *   ],
 *   documentId: 'doc_123'
 * };
 * ```
 */
export interface ContextualChunk {
  /**
   * The main chunk that matched the search query.
   */
  mainChunk: ScoredPoint;

  /**
   * Surrounding chunks from the same document.
   * Ordered by chunk_index, providing context before and after the main chunk.
   */
  contextChunks: Point[];

  /**
   * The document ID that all chunks belong to.
   */
  documentId: string;
}

/**
 * Aggregation method for combining chunk scores at document level.
 */
export type ScoreAggregation = 'max' | 'sum' | 'avg';

/**
 * Options for document-level retrieval with chunk aggregation.
 *
 * When documents are chunked, this allows retrieving complete documents
 * by aggregating chunk-level scores.
 *
 * @example
 * ```typescript
 * const options: DocumentRetrievalOptions = {
 *   chunkLimit: 100,      // Retrieve top 100 chunks
 *   documentLimit: 5,      // Return top 5 documents
 *   aggregation: 'max',    // Use max chunk score as document score
 *   filter: {
 *     must: [{ key: 'status', match: { value: 'published' } }]
 *   }
 * };
 * ```
 */
export interface DocumentRetrievalOptions {
  /**
   * Maximum number of chunks to retrieve from search.
   */
  chunkLimit: number;

  /**
   * Maximum number of documents to return after aggregation.
   */
  documentLimit: number;

  /**
   * Filter to apply to chunk search.
   */
  filter?: Filter;

  /**
   * Method for aggregating chunk scores to document scores.
   *
   * - 'max': Use the highest chunk score as document score
   * - 'sum': Sum all chunk scores for the document
   * - 'avg': Average all chunk scores for the document
   */
  aggregation: ScoreAggregation;
}

/**
 * A document aggregated from multiple chunks.
 *
 * @example
 * ```typescript
 * const doc: AggregatedDocument = {
 *   documentId: 'doc_123',
 *   score: 0.95,
 *   chunks: [
 *     { id: 'chunk_3', score: 0.95, ... },
 *     { id: 'chunk_5', score: 0.88, ... }
 *   ],
 *   aggregationMethod: 'max'
 * };
 * ```
 */
export interface AggregatedDocument {
  /**
   * The document identifier.
   */
  documentId: string;

  /**
   * Aggregated score for the entire document.
   */
  score: number;

  /**
   * All chunks belonging to this document, sorted by score.
   */
  chunks: ScoredPoint[];

  /**
   * The aggregation method used to compute the document score.
   */
  aggregationMethod: ScoreAggregation;
}
