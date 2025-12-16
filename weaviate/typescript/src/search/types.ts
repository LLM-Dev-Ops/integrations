/**
 * Search-specific types for the Weaviate integration
 *
 * Re-exports search types from the main types module and provides
 * additional search service configuration types.
 *
 * @module search/types
 */

// Re-export search types from main types module
export type {
  NearVectorQuery,
  NearObjectQuery,
  NearTextQuery,
  HybridQuery,
  BM25Query,
  SearchResult,
  SearchHit,
  SearchGroup,
  MoveParams,
  GroupByConfig,
  AskQuery,
  AskResult,
} from '../types/search.js';

export { FusionType } from '../types/search.js';

export type { Vector } from '../types/vector.js';
export type { WhereFilter } from '../types/filter.js';
export type { UUID } from '../types/property.js';

/**
 * Search service configuration
 */
export interface SearchServiceConfig {
  /**
   * GraphQL executor for query execution
   */
  graphqlExecutor: {
    execute<T>(query: string): Promise<T>;
  };

  /**
   * Observability context for tracing and metrics
   */
  observability: {
    tracer: {
      startSpan(name: string, attributes?: Record<string, string | number | boolean>): {
        end(status?: 'ok' | 'error'): void;
        setAttribute(key: string, value: string | number | boolean): void;
        recordError(error: Error): void;
      };
    };
    metrics: {
      increment(name: string, value?: number, labels?: Record<string, string>): void;
      histogram(name: string, value: number, labels?: Record<string, string>): void;
    };
  };

  /**
   * Schema cache for validation
   */
  schemaCache: {
    getClass(className: string): Promise<{
      name: string;
      vectorizer: string;
      properties: Array<{
        name: string;
        dataType: string[];
      }>;
      vectorIndexConfig?: {
        distance: string;
      };
    }>;
  };

  /**
   * Resilience orchestrator for retry and circuit breaking
   */
  resilience: {
    execute<T>(operation: () => Promise<T>): Promise<T>;
  };
}

/**
 * Search iterator configuration
 */
export interface SearchIteratorConfig {
  /**
   * Page size for pagination
   */
  pageSize: number;

  /**
   * Maximum total results to fetch
   */
  maxResults?: number;
}

/**
 * Vector dimension validation result
 */
export interface VectorValidationResult {
  valid: boolean;
  expectedDimensions?: number;
  actualDimensions?: number;
  error?: string;
}

/**
 * Vectorizer validation result
 */
export interface VectorizerValidationResult {
  valid: boolean;
  vectorizer?: string;
  error?: string;
}
