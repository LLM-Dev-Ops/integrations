/**
 * Query Builder
 *
 * Builder for constructing parameterized SQL queries with options.
 * @module @llmdevops/snowflake-integration/query/builder
 */

import { Value, toValue } from '../types/index.js';
import {
  ParameterBinding,
  createPositionalBinding,
  createNamedBinding,
  addPositionalParam,
  addNamedParam,
  validateBinding,
} from './params.js';

/**
 * Query execution mode.
 */
export type QueryExecutionMode = 'sync' | 'async';

/**
 * Query object built by QueryBuilder.
 */
export interface Query {
  /** SQL statement */
  sql: string;
  /** Parameter bindings */
  bindings: ParameterBinding;
  /** Warehouse to use */
  warehouse?: string;
  /** Query timeout in milliseconds */
  timeoutMs?: number;
  /** Query tag for tracking */
  tag?: string;
  /** Execution mode */
  executionMode: QueryExecutionMode;
  /** Additional options */
  options?: Record<string, unknown>;
}

/**
 * Query builder for constructing SQL queries with parameters.
 */
export class QueryBuilder {
  private sql: string;
  private bindings: ParameterBinding;
  private warehouseName?: string;
  private timeoutMs?: number;
  private queryTag?: string;
  private executionMode: QueryExecutionMode = 'sync';
  private additionalOptions: Record<string, unknown> = {};

  /**
   * Creates a new query builder.
   *
   * @param sql - The SQL statement
   * @param bindingType - Type of parameter binding ('positional' or 'named')
   */
  constructor(sql: string, bindingType: 'positional' | 'named' = 'positional') {
    this.sql = sql;
    this.bindings =
      bindingType === 'positional' ? createPositionalBinding() : createNamedBinding();
  }

  /**
   * Adds a positional parameter value.
   *
   * @param value - The parameter value
   * @returns This builder for chaining
   */
  bind(value: unknown): this {
    const v = typeof value === 'object' && value !== null && 'type' in value
      ? value as Value
      : toValue(value);
    addPositionalParam(this.bindings, v);
    return this;
  }

  /**
   * Adds a named parameter value.
   *
   * @param name - The parameter name (without ':' prefix)
   * @param value - The parameter value
   * @returns This builder for chaining
   */
  bindNamed(name: string, value: unknown): this {
    const v = typeof value === 'object' && value !== null && 'type' in value
      ? value as Value
      : toValue(value);
    addNamedParam(this.bindings, name, v);
    return this;
  }

  /**
   * Sets the warehouse for query execution.
   *
   * @param name - Warehouse name
   * @returns This builder for chaining
   */
  warehouse(name: string): this {
    this.warehouseName = name;
    return this;
  }

  /**
   * Sets the query timeout.
   *
   * @param duration - Timeout duration in milliseconds
   * @returns This builder for chaining
   */
  timeout(duration: number): this {
    if (duration <= 0) {
      throw new Error('Timeout must be greater than 0');
    }
    this.timeoutMs = duration;
    return this;
  }

  /**
   * Sets a query tag for tracking.
   *
   * @param tag - Query tag
   * @returns This builder for chaining
   */
  tag(tag: string): this {
    this.queryTag = tag;
    return this;
  }

  /**
   * Enables async execution mode.
   *
   * @returns This builder for chaining
   */
  asyncMode(): this {
    this.executionMode = 'async';
    return this;
  }

  /**
   * Sets sync execution mode (default).
   *
   * @returns This builder for chaining
   */
  syncMode(): this {
    this.executionMode = 'sync';
    return this;
  }

  /**
   * Sets an additional option.
   *
   * @param key - Option key
   * @param value - Option value
   * @returns This builder for chaining
   */
  option(key: string, value: unknown): this {
    this.additionalOptions[key] = value;
    return this;
  }

  /**
   * Builds the query object.
   *
   * @returns The constructed query
   */
  build(): Query {
    validateBinding(this.bindings);

    return {
      sql: this.sql,
      bindings: this.bindings,
      warehouse: this.warehouseName,
      timeoutMs: this.timeoutMs,
      tag: this.queryTag,
      executionMode: this.executionMode,
      options: Object.keys(this.additionalOptions).length > 0 ? this.additionalOptions : undefined,
    };
  }

  /**
   * Resets the builder to build a new query with the same SQL.
   *
   * @returns This builder for chaining
   */
  reset(): this {
    this.bindings =
      this.bindings.type === 'positional' ? createPositionalBinding() : createNamedBinding();
    this.warehouseName = undefined;
    this.timeoutMs = undefined;
    this.queryTag = undefined;
    this.executionMode = 'sync';
    this.additionalOptions = {};
    return this;
  }

  /**
   * Creates a new query builder from an existing query.
   *
   * @param query - The query to copy
   * @returns A new query builder
   */
  static fromQuery(query: Query): QueryBuilder {
    const builder = new QueryBuilder(query.sql, query.bindings.type);
    builder.bindings = query.bindings;
    builder.warehouseName = query.warehouse;
    builder.timeoutMs = query.timeoutMs;
    builder.queryTag = query.tag;
    builder.executionMode = query.executionMode;
    builder.additionalOptions = query.options || {};
    return builder;
  }
}

/**
 * Helper function to create a query builder.
 *
 * @param sql - The SQL statement
 * @param bindingType - Type of parameter binding
 * @returns A new query builder
 */
export function query(sql: string, bindingType?: 'positional' | 'named'): QueryBuilder {
  return new QueryBuilder(sql, bindingType);
}
