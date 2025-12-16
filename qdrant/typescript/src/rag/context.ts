/**
 * Context retrieval utilities for RAG workflows.
 *
 * This module provides helpers for fetching surrounding context chunks
 * to provide richer information for language models.
 *
 * @module rag/context
 */

import type { Filter, Point, ScoredPoint, ScrollParams, ScrollResult } from '../types.js';
import type { ContextualChunk, Payload } from './types.js';

/**
 * Interface for a collection client that can perform scroll operations.
 * This allows the context utilities to work with any client implementation.
 */
export interface ScrollableClient {
  /**
   * Scroll through points in the collection.
   *
   * @param params - Scroll parameters including filter and limit
   * @returns Scroll result with points
   */
  scroll(params: ScrollParams): Promise<ScrollResult>;
}

/**
 * Extracts the document ID from a point's payload.
 *
 * @param payload - The point's payload
 * @param field - The field name containing the document ID (default: 'document_id')
 * @returns The document ID, or undefined if not found
 *
 * @example
 * ```typescript
 * const docId = extractDocumentId(point.payload);
 * // Returns: 'doc_123'
 * ```
 */
export function extractDocumentId(
  payload: Payload | undefined,
  field = 'document_id'
): string | undefined {
  if (!payload) {
    return undefined;
  }

  const value = payload[field];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Extracts the chunk index from a point's payload.
 *
 * @param payload - The point's payload
 * @param field - The field name containing the chunk index (default: 'chunk_index')
 * @returns The chunk index, or undefined if not found
 *
 * @example
 * ```typescript
 * const chunkIndex = extractChunkIndex(point.payload);
 * // Returns: 5
 * ```
 */
export function extractChunkIndex(
  payload: Payload | undefined,
  field = 'chunk_index'
): number | undefined {
  if (!payload) {
    return undefined;
  }

  const value = payload[field];
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

/**
 * Extracts content from a point's payload.
 *
 * @param payload - The point's payload
 * @param field - The field name containing the content (default: 'content')
 * @returns The content value, or undefined if not found
 *
 * @example
 * ```typescript
 * const content = extractContent(point.payload);
 * // Returns: 'This is the document text...'
 * ```
 */
export function extractContent(
  payload: Payload | undefined,
  field = 'content'
): unknown {
  if (!payload) {
    return undefined;
  }

  return payload[field];
}

/**
 * Builds a filter for retrieving context chunks around a specific chunk.
 *
 * @param documentId - The document ID to filter by
 * @param chunkIndex - The index of the main chunk
 * @param contextBefore - Number of chunks to include before
 * @param contextAfter - Number of chunks to include after
 * @param baseFilter - Optional base filter to combine with
 * @returns A filter matching the context window
 *
 * @example
 * ```typescript
 * const filter = buildContextFilter('doc_123', 5, 2, 2);
 * // Returns filter matching chunks 3-7 from doc_123
 * ```
 */
export function buildContextFilter(
  documentId: string,
  chunkIndex: number,
  contextBefore: number,
  contextAfter: number,
  baseFilter?: Filter
): Filter {
  const startIndex = Math.max(0, chunkIndex - contextBefore);
  const endIndex = chunkIndex + contextAfter;

  const contextConditions = [
    { key: 'document_id', match: { value: documentId } },
    {
      key: 'chunk_index',
      range: {
        gte: startIndex,
        lte: endIndex,
      },
    },
  ];

  // Combine with base filter if provided
  if (baseFilter?.must) {
    return {
      must: [...contextConditions, ...baseFilter.must],
      should: baseFilter.should,
      mustNot: baseFilter.mustNot,
    };
  }

  return {
    must: contextConditions,
  };
}

/**
 * Fetches context chunks around a main chunk.
 *
 * This function retrieves surrounding chunks from the same document
 * to provide additional context for RAG applications.
 *
 * @param client - A scrollable client for fetching points
 * @param documentId - The document ID
 * @param chunkIndex - The index of the main chunk
 * @param contextBefore - Number of chunks to retrieve before
 * @param contextAfter - Number of chunks to retrieve after
 * @param baseFilter - Optional filter to apply
 * @returns Array of context points, ordered by chunk_index
 *
 * @example
 * ```typescript
 * const contextChunks = await fetchContextChunks(
 *   client,
 *   'doc_123',
 *   5,
 *   2,
 *   2
 * );
 * // Returns chunks with indices 3, 4, 5, 6, 7
 * ```
 */
export async function fetchContextChunks(
  client: ScrollableClient,
  documentId: string,
  chunkIndex: number,
  contextBefore: number,
  contextAfter: number,
  baseFilter?: Filter
): Promise<Point[]> {
  const filter = buildContextFilter(
    documentId,
    chunkIndex,
    contextBefore,
    contextAfter,
    baseFilter
  );

  const limit = contextBefore + contextAfter + 1; // Include main chunk

  const result = await client.scroll({
    filter,
    limit,
    withPayload: true,
    withVector: false, // Usually don't need vectors for context
  });

  // Sort by chunk_index to maintain document order
  const sortedPoints = result.points.sort((a, b) => {
    const indexA = extractChunkIndex(a.payload as Payload) ?? 0;
    const indexB = extractChunkIndex(b.payload as Payload) ?? 0;
    return indexA - indexB;
  });

  return sortedPoints;
}

/**
 * Enriches a main chunk with its surrounding context.
 *
 * @param client - A scrollable client for fetching points
 * @param mainChunk - The main search result chunk
 * @param contextBefore - Number of chunks to retrieve before
 * @param contextAfter - Number of chunks to retrieve after
 * @param baseFilter - Optional filter to apply
 * @returns A contextual chunk with main chunk and context
 *
 * @example
 * ```typescript
 * const enriched = await enrichWithContext(
 *   client,
 *   mainSearchResult,
 *   2,
 *   2
 * );
 * ```
 */
export async function enrichWithContext(
  client: ScrollableClient,
  mainChunk: ScoredPoint,
  contextBefore: number,
  contextAfter: number,
  baseFilter?: Filter
): Promise<ContextualChunk | null> {
  const documentId = extractDocumentId(mainChunk.payload as Payload);
  if (!documentId) {
    // Cannot fetch context without document_id
    return null;
  }

  const chunkIndex = extractChunkIndex(mainChunk.payload as Payload) ?? 0;

  const contextChunks = await fetchContextChunks(
    client,
    documentId,
    chunkIndex,
    contextBefore,
    contextAfter,
    baseFilter
  );

  return {
    mainChunk,
    contextChunks,
    documentId,
  };
}

/**
 * Groups points by document ID.
 *
 * @param points - Array of points to group
 * @param documentIdField - Field containing document ID (default: 'document_id')
 * @returns Map of document ID to points
 *
 * @example
 * ```typescript
 * const grouped = groupByDocument(searchResults);
 * // Returns: Map { 'doc_123' => [...], 'doc_456' => [...] }
 * ```
 */
export function groupByDocument(
  points: Point[],
  documentIdField = 'document_id'
): Map<string, Point[]> {
  const groups = new Map<string, Point[]>();

  for (const point of points) {
    const docId = extractDocumentId(point.payload as Payload, documentIdField);
    if (!docId) {
      continue;
    }

    const existing = groups.get(docId);
    if (existing) {
      existing.push(point);
    } else {
      groups.set(docId, [point]);
    }
  }

  return groups;
}

/**
 * Sorts chunks within each document by chunk index.
 *
 * @param documentGroups - Map of document ID to points
 * @param chunkIndexField - Field containing chunk index (default: 'chunk_index')
 * @returns Map with sorted chunks
 *
 * @example
 * ```typescript
 * const sorted = sortChunksInDocuments(documentGroups);
 * ```
 */
export function sortChunksInDocuments(
  documentGroups: Map<string, Point[]>,
  chunkIndexField = 'chunk_index'
): Map<string, Point[]> {
  const sorted = new Map<string, Point[]>();

  for (const entry of Array.from(documentGroups.entries())) {
    const [docId, points] = entry;
    const sortedPoints = [...points].sort((a, b) => {
      const indexA = extractChunkIndex(a.payload as Payload, chunkIndexField) ?? 0;
      const indexB = extractChunkIndex(b.payload as Payload, chunkIndexField) ?? 0;
      return indexA - indexB;
    });

    sorted.set(docId, sortedPoints);
  }

  return sorted;
}
