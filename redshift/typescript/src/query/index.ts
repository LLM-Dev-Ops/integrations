/**
 * Query Module for Amazon Redshift
 *
 * Provides query building, parameter binding, and execution capabilities
 * for Amazon Redshift databases.
 *
 * @module @llmdevops/redshift-integration/query
 *
 * @example
 * ```typescript
 * import {
 *   QueryBuilder,
 *   QueryExecutor,
 *   ParameterBinder
 * } from '@llmdevops/redshift-integration/query';
 *
 * // Build a query
 * const query = new QueryBuilder()
 *   .select('id', 'name', 'email')
 *   .from('users')
 *   .where('status = $1', 'active')
 *   .orderBy('created_at', 'DESC')
 *   .limit(10)
 *   .build();
 *
 * // Execute the query
 * const executor = new QueryExecutor(poolFactory);
 * const result = await executor.executeQuery(query);
 *
 * // Bind parameters
 * const binder = new ParameterBinder();
 * const params = binder.bindPositional([123, 'alice@example.com', new Date()]);
 * ```
 */

// ============================================================================
// Parameter Binding Exports
// ============================================================================

export {
  ParameterBinder,
  createParameterBinder,
  type ParameterValue,
  toParameterValue,
  extractParameterValue,
  type ParameterBinding,
  createPositionalBinding,
  createNamedBinding,
  addPositionalParam,
  addNamedParam,
  validateBinding,
  toDriverParams,
  fromRawValues,
} from './params.js';

// ============================================================================
// Query Builder Exports
// ============================================================================

export {
  QueryBuilder,
  createQueryBuilder,
  type Query,
} from './builder.js';

// ============================================================================
// Query Executor Exports
// ============================================================================

export {
  QueryExecutor,
  createQueryExecutor,
  type QueryExecutorConfig,
  type QueryExecutionOptions,
  type RetryConfig,
} from './executor.js';
