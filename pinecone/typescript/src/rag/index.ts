/**
 * RAG (Retrieval-Augmented Generation) utilities for Pinecone.
 *
 * This module provides high-level tools for building RAG applications:
 * - Semantic retrieval with scoring and filtering
 * - Content extraction from metadata
 * - Multi-query retrieval with deduplication
 *
 * @module rag
 */

export {
  RAGRetriever,
  type RetrievalQuery,
  type RetrievalResult,
  type RAGRetrieverConfig,
} from './retriever.js';
