/**
 * Azure Cognitive Search Request Types
 *
 * Request type definitions for all search and document operations.
 */

import type {
  QueryType,
  SearchMode,
  CaptionType,
  AnswerType,
  IndexAction,
  Document,
  RequestOptions,
  PaginationOptions,
  SortOptions,
  ScoringOptions,
} from './common.js';

// ============================================================================
// Search Requests
// ============================================================================

/** Base search request options */
export interface BaseSearchRequest extends RequestOptions, PaginationOptions, SortOptions, ScoringOptions {
  /** Index name to search */
  index: string;
  /** Fields to select in response */
  select?: string[];
  /** OData filter expression */
  filter?: string;
  /** Facets to retrieve */
  facets?: string[];
}

/** Vector search request */
export interface VectorSearchRequest extends BaseSearchRequest {
  /** Query vector */
  vector: number[];
  /** Vector field to search */
  vectorField: string;
  /** Number of nearest neighbors to return */
  k: number;
  /** Use exhaustive KNN instead of approximate */
  exhaustive?: boolean;
}

/** Keyword search request */
export interface KeywordSearchRequest extends BaseSearchRequest {
  /** Search query text */
  query: string;
  /** Fields to search in */
  searchFields?: string[];
  /** Query type (simple or full Lucene) */
  queryType?: QueryType;
  /** Search mode (any or all terms must match) */
  searchMode?: SearchMode;
  /** Fields to highlight */
  highlightFields?: string[];
  /** Highlight pre-tag */
  highlightPreTag?: string;
  /** Highlight post-tag */
  highlightPostTag?: string;
}

/** Hybrid search request (vector + keyword) */
export interface HybridSearchRequest extends BaseSearchRequest {
  /** Keyword query text */
  keywordQuery: string;
  /** Query vector */
  vector: number[];
  /** Vector field to search */
  vectorField: string;
  /** Number of nearest neighbors for vector search */
  k: number;
  /** Fields to search for keywords */
  searchFields?: string[];
  /** Semantic configuration name for reranking */
  semanticConfig?: string;
}

/** Semantic search request */
export interface SemanticSearchRequest extends BaseSearchRequest {
  /** Search query text */
  query: string;
  /** Semantic configuration name */
  semanticConfig: string;
  /** Optional query vector for hybrid semantic */
  vector?: number[];
  /** Vector field if using hybrid */
  vectorField?: string;
  /** K for vector search */
  k?: number;
  /** Caption type */
  captions?: CaptionType;
  /** Answer type */
  answers?: AnswerType;
  /** Number of answers to return */
  answerCount?: number;
}

// ============================================================================
// Suggestion and Autocomplete Requests
// ============================================================================

/** Suggestion request */
export interface SuggestRequest extends RequestOptions {
  /** Index name */
  index: string;
  /** Search text for suggestions */
  searchText: string;
  /** Suggester name (configured in index) */
  suggesterName: string;
  /** Filter expression */
  filter?: string;
  /** Fields to select */
  select?: string[];
  /** Number of suggestions to return */
  top?: number;
  /** Enable fuzzy matching */
  fuzzy?: boolean;
  /** Highlight pre-tag */
  highlightPreTag?: string;
  /** Highlight post-tag */
  highlightPostTag?: string;
}

/** Autocomplete request */
export interface AutocompleteRequest extends RequestOptions {
  /** Index name */
  index: string;
  /** Search text for autocomplete */
  searchText: string;
  /** Suggester name (configured in index) */
  suggesterName: string;
  /** Autocomplete mode */
  autocompleteMode?: 'oneTerm' | 'twoTerms' | 'oneTermWithContext';
  /** Filter expression */
  filter?: string;
  /** Number of results to return */
  top?: number;
  /** Enable fuzzy matching */
  fuzzy?: boolean;
}

// ============================================================================
// Document Requests
// ============================================================================

/** Single document upload request */
export interface UploadDocumentRequest extends RequestOptions {
  /** Index name */
  index: string;
  /** Document to upload */
  document: Document;
}

/** Single document merge request */
export interface MergeDocumentRequest extends RequestOptions {
  /** Index name */
  index: string;
  /** Document fields to merge */
  document: Document;
}

/** Single document delete request */
export interface DeleteDocumentRequest extends RequestOptions {
  /** Index name */
  index: string;
  /** Key field name */
  keyField: string;
  /** Key value of document to delete */
  key: string;
}

/** Batch index request */
export interface BatchIndexRequest extends RequestOptions {
  /** Index name */
  index: string;
  /** Documents with actions */
  documents: Array<{ action: IndexAction; document: Document }>;
}

/** Document lookup request */
export interface LookupRequest extends RequestOptions {
  /** Index name */
  index: string;
  /** Document key */
  key: string;
  /** Fields to select */
  select?: string[];
}

// ============================================================================
// Index Requests
// ============================================================================

/** Get index request */
export interface GetIndexRequest extends RequestOptions {
  /** Index name */
  index: string;
}

/** Get index stats request */
export interface GetIndexStatsRequest extends RequestOptions {
  /** Index name */
  index: string;
}

/** Count documents request */
export interface CountDocumentsRequest extends RequestOptions {
  /** Index name */
  index: string;
}
