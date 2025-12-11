/**
 * Common types used across the Cohere client.
 */

/**
 * Token usage information
 */
export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Billed units for metered operations
 */
export interface BilledUnits {
  inputTokens: number;
  outputTokens: number;
  searchUnits?: number;
  classifications?: number;
}

/**
 * API version information
 */
export interface ApiVersion {
  version: string;
  isDeprecated: boolean;
  deprecationDate?: string;
}

/**
 * API metadata returned with responses
 */
export interface ApiMeta {
  apiVersion?: ApiVersion;
  billedUnits?: BilledUnits;
  warnings?: string[];
}

/**
 * Finish reason for generation
 */
export type FinishReason =
  | 'COMPLETE'
  | 'MAX_TOKENS'
  | 'STOP_SEQUENCE'
  | 'ERROR'
  | 'USER_CANCEL';

/**
 * Embedding type options
 */
export type EmbeddingType = 'float' | 'int8' | 'uint8' | 'binary' | 'ubinary';

/**
 * Input type for embeddings
 */
export type InputType =
  | 'search_document'
  | 'search_query'
  | 'classification'
  | 'clustering';

/**
 * Truncation options
 */
export type TruncateOption = 'NONE' | 'START' | 'END';

/**
 * Parameters for paginated list operations
 */
export interface ListParams {
  pageSize?: number;
  pageToken?: string;
}

/**
 * Response wrapper for paginated list operations
 */
export interface ListResponse<T> {
  items: T[];
  nextPageToken?: string;
  totalSize?: number;
}

/**
 * Connector for RAG operations
 */
export interface ConnectorConfig {
  id: string;
  options?: Record<string, unknown>;
}

/**
 * Generation options common across services
 */
export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  seed?: number;
}

/**
 * Request metadata for tracking
 */
export interface RequestMeta {
  requestId?: string;
  clientName?: string;
  timestamp?: number;
}

/**
 * Headers extracted from rate limit responses
 */
export interface RateLimitHeaders {
  limit?: number;
  remaining?: number;
  reset?: number;
  retryAfter?: number;
}

/**
 * Parse rate limit headers from response
 */
export function parseRateLimitHeaders(headers: Headers): RateLimitHeaders {
  return {
    limit: parseIntHeader(headers, 'x-ratelimit-limit'),
    remaining: parseIntHeader(headers, 'x-ratelimit-remaining'),
    reset: parseIntHeader(headers, 'x-ratelimit-reset'),
    retryAfter: parseIntHeader(headers, 'retry-after'),
  };
}

function parseIntHeader(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (value === null) return undefined;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? undefined : parsed;
}
