/**
 * Azure Cognitive Search Common Types
 *
 * Shared type definitions used across the integration module.
 */

/** API version for Azure Cognitive Search REST API */
export type ApiVersion = '2024-07-01' | '2023-11-01' | '2023-07-01-Preview';

/** Authentication method */
export type AuthMethod = 'api-key' | 'azure-ad' | 'managed-identity';

/** Search query type */
export type QueryType = 'simple' | 'full' | 'semantic';

/** Search mode for keyword searches */
export type SearchMode = 'any' | 'all';

/** Caption type for semantic search */
export type CaptionType = 'none' | 'extractive';

/** Answer type for semantic search */
export type AnswerType = 'none' | 'extractive';

/** Index action for document operations */
export type IndexAction = 'upload' | 'merge' | 'mergeOrUpload' | 'delete';

/** Document value types */
export type DocumentValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | number[]
  | DocumentValue[]
  | { [key: string]: DocumentValue };

/** Generic document type - uses unknown for flexibility with API responses */
export type Document = Record<string, unknown>;

/** Token usage information */
export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** Request options for all operations */
export interface RequestOptions {
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Custom request headers */
  headers?: Record<string, string>;
}

/** Pagination options */
export interface PaginationOptions {
  /** Number of results to return */
  top?: number;
  /** Number of results to skip */
  skip?: number;
  /** Include total count in response */
  includeCount?: boolean;
}

/** Sorting options */
export interface SortOptions {
  /** Order by expression (e.g., "timestamp desc, score") */
  orderBy?: string;
}

/** Scoring profile configuration */
export interface ScoringOptions {
  /** Name of scoring profile to apply */
  scoringProfile?: string;
  /** Scoring parameters */
  scoringParameters?: string[];
}
