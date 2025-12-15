/**
 * Azure Cognitive Search Types
 *
 * Re-exports all type definitions for the integration module.
 */

// Common types
export type {
  ApiVersion,
  AuthMethod,
  QueryType,
  SearchMode,
  CaptionType,
  AnswerType,
  IndexAction,
  DocumentValue,
  Document,
  TokenUsage,
  RequestOptions,
  PaginationOptions,
  SortOptions,
  ScoringOptions,
} from './common.js';

// Request types
export type {
  BaseSearchRequest,
  VectorSearchRequest,
  KeywordSearchRequest,
  HybridSearchRequest,
  SemanticSearchRequest,
  SuggestRequest,
  AutocompleteRequest,
  UploadDocumentRequest,
  MergeDocumentRequest,
  DeleteDocumentRequest,
  BatchIndexRequest,
  LookupRequest,
  GetIndexRequest,
  GetIndexStatsRequest,
  CountDocumentsRequest,
} from './requests.js';

// Response types
export type {
  SearchResult,
  Caption,
  Answer,
  FacetValue,
  SearchResults,
  SuggestionResult,
  SuggestResults,
  AutocompleteResult,
  AutocompleteResults,
  IndexResult,
  BatchIndexResult,
  IndexField,
  IndexDefinition,
  ScoringProfileDefinition,
  ScoringFunction,
  SemanticSettings,
  SemanticConfiguration,
  PrioritizedFields,
  SemanticField,
  IndexStats,
} from './responses.js';
