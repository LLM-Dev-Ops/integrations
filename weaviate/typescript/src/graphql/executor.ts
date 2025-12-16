/**
 * GraphQL query executor
 *
 * Executes GraphQL queries against Weaviate's GraphQL endpoint.
 */

import type { GraphQLRequest, GraphQLResponse } from './types.js';
import { hasGraphQLErrors } from './types.js';
import { handleGraphQLErrors } from './error.js';

/**
 * HTTP transport interface for GraphQL execution
 *
 * Minimal interface required by the executor - allows dependency injection.
 */
export interface GraphQLTransport {
  /**
   * Makes an HTTP POST request
   *
   * @param path - Request path
   * @param body - Request body
   * @returns Response data
   */
  post<T>(path: string, body: unknown): Promise<T>;
}

/**
 * Observability interface for tracing and metrics
 */
export interface GraphQLObservability {
  /**
   * Starts a new trace span
   *
   * @param name - Span name
   * @returns Span object with end() method
   */
  startSpan(name: string): { end(): void };

  /**
   * Records an error
   *
   * @param error - The error to record
   */
  recordError(error: Error): void;
}

/**
 * No-op observability implementation
 */
class NoOpObservability implements GraphQLObservability {
  startSpan(_name: string): { end(): void } {
    return { end: () => {} };
  }

  recordError(_error: Error): void {
    // No-op
  }
}

/**
 * GraphQL executor configuration
 */
export interface GraphQLExecutorConfig {
  /**
   * HTTP transport for making requests
   */
  transport: GraphQLTransport;

  /**
   * Optional observability provider
   */
  observability?: GraphQLObservability;

  /**
   * GraphQL endpoint path (default: /v1/graphql)
   */
  endpoint?: string;
}

/**
 * GraphQL query executor
 *
 * Handles execution of GraphQL queries with error handling and observability.
 *
 * @example
 * ```typescript
 * const executor = new GraphQLExecutor({
 *   transport: httpClient,
 *   observability: metrics
 * });
 *
 * const result = await executor.execute<SearchData>(query);
 * ```
 */
export class GraphQLExecutor {
  private readonly transport: GraphQLTransport;
  private readonly observability: GraphQLObservability;
  private readonly endpoint: string;

  constructor(config: GraphQLExecutorConfig) {
    this.transport = config.transport;
    this.observability = config.observability ?? new NoOpObservability();
    this.endpoint = config.endpoint ?? '/v1/graphql';
  }

  /**
   * Executes a GraphQL query
   *
   * @param query - GraphQL query string
   * @param variables - Optional query variables
   * @param operationName - Optional operation name
   * @returns Query result data
   * @throws WeaviateError if the query fails
   *
   * @example
   * ```typescript
   * const query = `{
   *   Get {
   *     Article(limit: 10) {
   *       title
   *       content
   *     }
   *   }
   * }`;
   *
   * const result = await executor.execute<ArticleData>(query);
   * ```
   */
  async execute<T>(
    query: string,
    variables?: Record<string, unknown>,
    operationName?: string
  ): Promise<T> {
    const span = this.observability.startSpan('graphql.execute');

    try {
      // Build request
      const request: GraphQLRequest = {
        query,
        variables,
        operationName,
      };

      // Execute query
      const response = await this.transport.post<GraphQLResponse<T>>(
        this.endpoint,
        request
      );

      // Check for GraphQL errors
      if (hasGraphQLErrors(response)) {
        handleGraphQLErrors(response.errors);
      }

      // Validate response has data
      if (response.data === undefined || response.data === null) {
        throw new Error('GraphQL response missing data');
      }

      return response.data;
    } catch (error) {
      if (error instanceof Error) {
        this.observability.recordError(error);
      }
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Executes a GraphQL query and returns the full response
   *
   * Unlike execute(), this returns both data and errors without throwing.
   * Useful when you want to handle errors manually.
   *
   * @param query - GraphQL query string
   * @param variables - Optional query variables
   * @param operationName - Optional operation name
   * @returns Full GraphQL response with data and errors
   */
  async executeRaw<T>(
    query: string,
    variables?: Record<string, unknown>,
    operationName?: string
  ): Promise<GraphQLResponse<T>> {
    const span = this.observability.startSpan('graphql.execute_raw');

    try {
      const request: GraphQLRequest = {
        query,
        variables,
        operationName,
      };

      return await this.transport.post<GraphQLResponse<T>>(
        this.endpoint,
        request
      );
    } catch (error) {
      if (error instanceof Error) {
        this.observability.recordError(error);
      }
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Executes a batch of GraphQL queries
   *
   * Note: Weaviate doesn't natively support batched GraphQL queries,
   * so this executes them sequentially. Consider using the REST batch API
   * for better performance with multiple operations.
   *
   * @param queries - Array of queries to execute
   * @returns Array of results
   */
  async executeBatch<T>(
    queries: Array<{
      query: string;
      variables?: Record<string, unknown>;
      operationName?: string;
    }>
  ): Promise<T[]> {
    const span = this.observability.startSpan('graphql.execute_batch');

    try {
      const results: T[] = [];

      for (const query of queries) {
        const result = await this.execute<T>(
          query.query,
          query.variables,
          query.operationName
        );
        results.push(result);
      }

      return results;
    } finally {
      span.end();
    }
  }
}

/**
 * Creates a GraphQL executor instance
 *
 * @param config - Executor configuration
 * @returns GraphQLExecutor instance
 */
export function createGraphQLExecutor(
  config: GraphQLExecutorConfig
): GraphQLExecutor {
  return new GraphQLExecutor(config);
}
