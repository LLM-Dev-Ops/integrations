/**
 * RAG (Retrieval-Augmented Generation) utilities for Qdrant.
 *
 * This module provides comprehensive tools for building RAG applications:
 *
 * ## Features
 *
 * - **Semantic Retrieval**: Find relevant documents using vector similarity
 * - **Context-Aware Retrieval**: Fetch surrounding chunks for richer context
 * - **Document-Level Aggregation**: Combine chunk scores into document scores
 * - **Content Extraction**: Extract text and metadata from search results
 * - **Flexible Filtering**: Apply metadata filters to searches
 *
 * ## Usage
 *
 * ### Basic Retrieval
 *
 * ```typescript
 * import { RagHelper } from '@llm-devops/qdrant-integration/rag';
 *
 * const ragHelper = new RagHelper(collectionClient);
 *
 * const results = await ragHelper.retrieve(queryVector, {
 *   limit: 10,
 *   scoreThreshold: 0.7
 * });
 * ```
 *
 * ### Context-Aware Retrieval
 *
 * ```typescript
 * const contextual = await ragHelper.retrieveWithContext(
 *   queryVector,
 *   2, // chunks before and after
 *   { limit: 5 }
 * );
 *
 * contextual.forEach(({ mainChunk, contextChunks }) => {
 *   console.log('Main:', extractContent(mainChunk.payload));
 *   contextChunks.forEach(chunk => {
 *     console.log('Context:', extractContent(chunk.payload));
 *   });
 * });
 * ```
 *
 * ### Document-Level Aggregation
 *
 * ```typescript
 * const documents = await ragHelper.retrieveDocuments(queryVector, {
 *   chunkLimit: 100,
 *   documentLimit: 5,
 *   aggregation: 'max'
 * });
 *
 * documents.forEach(doc => {
 *   console.log(`${doc.documentId}: ${doc.score}`);
 *   console.log(`  Chunks: ${doc.chunks.length}`);
 * });
 * ```
 *
 * ### Using Context Utilities
 *
 * ```typescript
 * import {
 *   extractContent,
 *   extractDocumentId,
 *   extractChunkIndex,
 *   buildContextFilter,
 *   fetchContextChunks
 * } from '@llm-devops/qdrant-integration/rag';
 *
 * // Extract metadata from payloads
 * const docId = extractDocumentId(point.payload);
 * const chunkIdx = extractChunkIndex(point.payload);
 * const content = extractContent(point.payload);
 *
 * // Build filter for context window
 * const filter = buildContextFilter(docId, chunkIdx, 2, 2);
 *
 * // Fetch surrounding chunks
 * const context = await fetchContextChunks(client, docId, chunkIdx, 2, 2);
 * ```
 *
 * @module rag
 */

// Main RAG helper
export { RagHelper, type CollectionClient, type SearchParams } from './helper.js';

// Context utilities
export {
  type ScrollableClient,
  extractDocumentId,
  extractChunkIndex,
  extractContent,
  buildContextFilter,
  fetchContextChunks,
  enrichWithContext,
  groupByDocument,
  sortChunksInDocuments,
} from './context.js';

// Type definitions
export type {
  Payload,
  RetrieveOptions,
  RetrievedDocument,
  ContextConfig,
  ContextualChunk,
  ScoreAggregation,
  DocumentRetrievalOptions,
  AggregatedDocument,
} from './types.js';
