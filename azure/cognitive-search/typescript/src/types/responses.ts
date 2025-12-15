/**
 * Azure Cognitive Search Response Types
 *
 * Response type definitions for all search and document operations.
 */

import type { Document } from './common.js';

// ============================================================================
// Search Responses
// ============================================================================

/** Search result item */
export interface SearchResult {
  /** Document ID */
  id: string;
  /** Search score */
  score: number;
  /** Semantic reranker score (if semantic search) */
  rerankerScore?: number;
  /** Highlighted fields */
  highlights?: Record<string, string[]>;
  /** Captions (if semantic search) */
  captions?: Caption[];
  /** Document content */
  document: Document;
}

/** Caption from semantic search */
export interface Caption {
  /** Caption text */
  text: string;
  /** Highlighted caption */
  highlights?: string;
}

/** Answer from semantic search */
export interface Answer {
  /** Answer text */
  text: string;
  /** Highlighted answer */
  highlights?: string;
  /** Answer score */
  score: number;
  /** Document key this answer came from */
  key?: string;
}

/** Facet value */
export interface FacetValue {
  /** Facet value */
  value: string | number | boolean;
  /** Count of documents with this value */
  count: number;
}

/** Search results response */
export interface SearchResults {
  /** Search result items */
  results: SearchResult[];
  /** Total count of matching documents */
  count?: number;
  /** Facet results */
  facets?: Record<string, FacetValue[]>;
  /** Semantic answers (if semantic search) */
  answers?: Answer[];
  /** Continuation token for pagination */
  nextLink?: string;
}

// ============================================================================
// Suggestion and Autocomplete Responses
// ============================================================================

/** Suggestion item */
export interface SuggestionResult {
  /** Suggested text */
  text: string;
  /** Document associated with suggestion */
  document: Document;
}

/** Suggestion results response */
export interface SuggestResults {
  /** Suggestion items */
  results: SuggestionResult[];
}

/** Autocomplete item */
export interface AutocompleteResult {
  /** Completed text */
  text: string;
  /** Query plus completed text */
  queryPlusText: string;
}

/** Autocomplete results response */
export interface AutocompleteResults {
  /** Autocomplete items */
  results: AutocompleteResult[];
}

// ============================================================================
// Document Responses
// ============================================================================

/** Single document index result */
export interface IndexResult {
  /** Document key */
  key: string;
  /** Whether the operation succeeded */
  succeeded: boolean;
  /** HTTP status code */
  statusCode: number;
  /** Error message if failed */
  errorMessage?: string;
}

/** Batch index results response */
export interface BatchIndexResult {
  /** Individual document results */
  results: IndexResult[];
  /** Number of successful operations */
  successCount: number;
  /** Number of failed operations */
  failureCount: number;
}

// ============================================================================
// Index Responses
// ============================================================================

/** Index field definition */
export interface IndexField {
  /** Field name */
  name: string;
  /** Field type */
  type: string;
  /** Whether field is key */
  key?: boolean;
  /** Whether field is searchable */
  searchable?: boolean;
  /** Whether field is filterable */
  filterable?: boolean;
  /** Whether field is sortable */
  sortable?: boolean;
  /** Whether field is facetable */
  facetable?: boolean;
  /** Whether field is retrievable */
  retrievable?: boolean;
  /** Vector search dimensions */
  dimensions?: number;
  /** Vector search profile */
  vectorSearchProfile?: string;
}

/** Index definition */
export interface IndexDefinition {
  /** Index name */
  name: string;
  /** Field definitions */
  fields: IndexField[];
  /** Scoring profiles */
  scoringProfiles?: ScoringProfileDefinition[];
  /** Semantic configurations */
  semanticSettings?: SemanticSettings;
}

/** Scoring profile definition */
export interface ScoringProfileDefinition {
  /** Profile name */
  name: string;
  /** Text weights */
  textWeights?: Record<string, number>;
  /** Functions */
  functions?: ScoringFunction[];
}

/** Scoring function */
export interface ScoringFunction {
  /** Function type */
  type: 'freshness' | 'magnitude' | 'distance' | 'tag';
  /** Field name */
  fieldName: string;
  /** Boost factor */
  boost: number;
  /** Interpolation */
  interpolation?: 'constant' | 'linear' | 'quadratic' | 'logarithmic';
}

/** Semantic settings */
export interface SemanticSettings {
  /** Configurations */
  configurations?: SemanticConfiguration[];
}

/** Semantic configuration */
export interface SemanticConfiguration {
  /** Configuration name */
  name: string;
  /** Prioritized fields */
  prioritizedFields: PrioritizedFields;
}

/** Prioritized fields for semantic search */
export interface PrioritizedFields {
  /** Title field */
  titleField?: SemanticField;
  /** Content fields */
  contentFields?: SemanticField[];
  /** Keyword fields */
  keywordsFields?: SemanticField[];
}

/** Semantic field */
export interface SemanticField {
  /** Field name */
  fieldName: string;
}

/** Index statistics */
export interface IndexStats {
  /** Document count */
  documentCount: number;
  /** Storage size in bytes */
  storageSize: number;
  /** Vector index size in bytes */
  vectorIndexSize?: number;
}
