/**
 * Query Builder for Amazon Redshift
 *
 * Fluent API for constructing SQL queries with parameterized values.
 * Supports SELECT, INSERT, UPDATE, DELETE operations with joins, filtering,
 * grouping, and ordering.
 *
 * @module @llmdevops/redshift-integration/query/builder
 */

import {
  ParameterValue,
  ParameterBinding,
  createPositionalBinding,
  createNamedBinding,
  addPositionalParam,
  toParameterValue,
  validateBinding,
  ParameterBinder,
} from './params.js';

// ============================================================================
// Query Interface
// ============================================================================

/**
 * Built query with SQL and parameters.
 */
export interface Query {
  /** SQL statement */
  sql: string;
  /** Parameter values */
  params: unknown[];
}

// ============================================================================
// QueryBuilder Class
// ============================================================================

/**
 * Fluent query builder for constructing SQL queries.
 *
 * Provides a chainable API for building SELECT, INSERT, UPDATE, and DELETE
 * queries with proper parameter binding.
 *
 * @example
 * ```typescript
 * // SELECT query
 * const query = new QueryBuilder()
 *   .select('id', 'name', 'email')
 *   .from('users')
 *   .where('status = $1', 'active')
 *   .orderBy('created_at', 'DESC')
 *   .limit(10)
 *   .build();
 *
 * // INSERT query
 * const insert = new QueryBuilder()
 *   .insertInto('users')
 *   .columns('name', 'email', 'status')
 *   .values('Alice', 'alice@example.com', 'active')
 *   .build();
 *
 * // UPDATE query
 * const update = new QueryBuilder()
 *   .update('users')
 *   .set('status', 'inactive')
 *   .set('updated_at', new Date())
 *   .where('id = $1', 123)
 *   .build();
 *
 * // DELETE query
 * const del = new QueryBuilder()
 *   .deleteFrom('users')
 *   .where('status = $1', 'deleted')
 *   .build();
 * ```
 */
export class QueryBuilder {
  private queryType: 'select' | 'insert' | 'update' | 'delete' | null = null;
  private selectColumns: string[] = [];
  private fromTable: string | null = null;
  private joins: string[] = [];
  private whereClauses: string[] = [];
  private groupByColumns: string[] = [];
  private havingClauses: string[] = [];
  private orderByColumns: Array<{ column: string; direction: 'ASC' | 'DESC' }> = [];
  private limitValue: number | null = null;
  private offsetValue: number | null = null;
  private insertTable: string | null = null;
  private insertColumns: string[] = [];
  private insertValues: unknown[][] = [];
  private updateTable: string | null = null;
  private updateSets: Array<{ column: string; value: unknown }> = [];
  private deleteTable: string | null = null;
  private params: unknown[] = [];
  private binder = new ParameterBinder();

  /**
   * Starts a SELECT query with specified columns.
   *
   * @param columns - Column names to select (use '*' for all)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.select('id', 'name', 'email')
   * builder.select('*')
   * builder.select('COUNT(*)', 'AVG(price)')
   * ```
   */
  select(...columns: string[]): this {
    this.queryType = 'select';
    this.selectColumns = columns.length > 0 ? columns : ['*'];
    return this;
  }

  /**
   * Specifies the table to select from.
   *
   * @param table - Table name
   * @returns This builder for chaining
   */
  from(table: string): this {
    this.fromTable = table;
    return this;
  }

  /**
   * Adds a WHERE condition.
   *
   * @param condition - SQL condition (can include $1, $2 placeholders)
   * @param params - Parameter values for the condition
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.where('status = $1', 'active')
   * builder.where('age > $1 AND age < $2', 18, 65)
   * builder.where('created_at >= $1', new Date('2024-01-01'))
   * ```
   */
  where(condition: string, ...params: unknown[]): this {
    this.whereClauses.push(this.replaceParams(condition, params));
    this.params.push(...params);
    return this;
  }

  /**
   * Adds an INNER JOIN clause.
   *
   * @param table - Table to join
   * @param condition - Join condition
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.join('orders', 'orders.user_id = users.id')
   * ```
   */
  join(table: string, condition: string): this {
    this.joins.push(`INNER JOIN ${table} ON ${condition}`);
    return this;
  }

  /**
   * Adds a LEFT JOIN clause.
   *
   * @param table - Table to join
   * @param condition - Join condition
   * @returns This builder for chaining
   */
  leftJoin(table: string, condition: string): this {
    this.joins.push(`LEFT JOIN ${table} ON ${condition}`);
    return this;
  }

  /**
   * Adds a RIGHT JOIN clause.
   *
   * @param table - Table to join
   * @param condition - Join condition
   * @returns This builder for chaining
   */
  rightJoin(table: string, condition: string): this {
    this.joins.push(`RIGHT JOIN ${table} ON ${condition}`);
    return this;
  }

  /**
   * Adds a FULL OUTER JOIN clause.
   *
   * @param table - Table to join
   * @param condition - Join condition
   * @returns This builder for chaining
   */
  fullJoin(table: string, condition: string): this {
    this.joins.push(`FULL OUTER JOIN ${table} ON ${condition}`);
    return this;
  }

  /**
   * Adds GROUP BY columns.
   *
   * @param columns - Columns to group by
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.groupBy('status', 'category')
   * ```
   */
  groupBy(...columns: string[]): this {
    this.groupByColumns.push(...columns);
    return this;
  }

  /**
   * Adds a HAVING condition (for filtered aggregations).
   *
   * @param condition - SQL condition
   * @param params - Parameter values
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder
   *   .select('status', 'COUNT(*) as count')
   *   .from('users')
   *   .groupBy('status')
   *   .having('COUNT(*) > $1', 10)
   * ```
   */
  having(condition: string, ...params: unknown[]): this {
    this.havingClauses.push(this.replaceParams(condition, params));
    this.params.push(...params);
    return this;
  }

  /**
   * Adds ORDER BY clause.
   *
   * @param column - Column to order by
   * @param direction - Sort direction (default: 'ASC')
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.orderBy('created_at', 'DESC')
   * builder.orderBy('name') // defaults to ASC
   * ```
   */
  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.orderByColumns.push({ column, direction });
    return this;
  }

  /**
   * Sets the LIMIT clause.
   *
   * @param n - Maximum number of rows to return
   * @returns This builder for chaining
   */
  limit(n: number): this {
    this.limitValue = n;
    return this;
  }

  /**
   * Sets the OFFSET clause.
   *
   * @param n - Number of rows to skip
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * // Pagination: page 3 with 10 items per page
   * builder.limit(10).offset(20)
   * ```
   */
  offset(n: number): this {
    this.offsetValue = n;
    return this;
  }

  /**
   * Starts an INSERT query.
   *
   * @param table - Table to insert into
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder
   *   .insertInto('users')
   *   .columns('name', 'email')
   *   .values('Alice', 'alice@example.com')
   * ```
   */
  insertInto(table: string): this {
    this.queryType = 'insert';
    this.insertTable = table;
    return this;
  }

  /**
   * Specifies columns for INSERT query.
   *
   * @param columns - Column names
   * @returns This builder for chaining
   */
  columns(...columns: string[]): this {
    this.insertColumns = columns;
    return this;
  }

  /**
   * Adds values for INSERT query.
   *
   * Can be called multiple times for batch inserts.
   *
   * @param values - Values to insert (must match columns order)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder
   *   .insertInto('users')
   *   .columns('name', 'email')
   *   .values('Alice', 'alice@example.com')
   *   .values('Bob', 'bob@example.com')  // Batch insert
   * ```
   */
  values(...values: unknown[]): this {
    this.insertValues.push(values);
    this.params.push(...values);
    return this;
  }

  /**
   * Starts an UPDATE query.
   *
   * @param table - Table to update
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder
   *   .update('users')
   *   .set('status', 'inactive')
   *   .where('id = $1', 123)
   * ```
   */
  update(table: string): this {
    this.queryType = 'update';
    this.updateTable = table;
    return this;
  }

  /**
   * Sets a column value for UPDATE query.
   *
   * @param column - Column name
   * @param value - New value
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.set('status', 'active')
   * builder.set('updated_at', new Date())
   * builder.set('count', 42)
   * ```
   */
  set(column: string, value: unknown): this {
    this.updateSets.push({ column, value });
    this.params.push(value);
    return this;
  }

  /**
   * Starts a DELETE query.
   *
   * @param table - Table to delete from
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder
   *   .deleteFrom('users')
   *   .where('status = $1', 'deleted')
   * ```
   */
  deleteFrom(table: string): this {
    this.queryType = 'delete';
    this.deleteTable = table;
    return this;
  }

  /**
   * Builds the final query with SQL and parameters.
   *
   * @returns Query object with sql and params
   * @throws {Error} If query is invalid or incomplete
   *
   * @example
   * ```typescript
   * const query = builder
   *   .select('*')
   *   .from('users')
   *   .where('status = $1', 'active')
   *   .build();
   *
   * console.log(query.sql); // SELECT * FROM users WHERE status = $1
   * console.log(query.params); // ['active']
   * ```
   */
  build(): Query {
    let sql = '';

    switch (this.queryType) {
      case 'select':
        sql = this.buildSelect();
        break;
      case 'insert':
        sql = this.buildInsert();
        break;
      case 'update':
        sql = this.buildUpdate();
        break;
      case 'delete':
        sql = this.buildDelete();
        break;
      default:
        throw new Error('Query type not specified');
    }

    return {
      sql: sql.trim(),
      params: this.binder.bindPositional(this.params),
    };
  }

  /**
   * Resets the builder to build a new query.
   *
   * @returns This builder for chaining
   */
  reset(): this {
    this.queryType = null;
    this.selectColumns = [];
    this.fromTable = null;
    this.joins = [];
    this.whereClauses = [];
    this.groupByColumns = [];
    this.havingClauses = [];
    this.orderByColumns = [];
    this.limitValue = null;
    this.offsetValue = null;
    this.insertTable = null;
    this.insertColumns = [];
    this.insertValues = [];
    this.updateTable = null;
    this.updateSets = [];
    this.deleteTable = null;
    this.params = [];
    return this;
  }

  /**
   * Builds a SELECT query.
   */
  private buildSelect(): string {
    if (!this.fromTable) {
      throw new Error('FROM clause is required for SELECT query');
    }

    const parts: string[] = [];

    // SELECT clause
    parts.push(`SELECT ${this.selectColumns.join(', ')}`);

    // FROM clause
    parts.push(`FROM ${this.fromTable}`);

    // JOIN clauses
    if (this.joins.length > 0) {
      parts.push(this.joins.join(' '));
    }

    // WHERE clause
    if (this.whereClauses.length > 0) {
      parts.push(`WHERE ${this.whereClauses.join(' AND ')}`);
    }

    // GROUP BY clause
    if (this.groupByColumns.length > 0) {
      parts.push(`GROUP BY ${this.groupByColumns.join(', ')}`);
    }

    // HAVING clause
    if (this.havingClauses.length > 0) {
      parts.push(`HAVING ${this.havingClauses.join(' AND ')}`);
    }

    // ORDER BY clause
    if (this.orderByColumns.length > 0) {
      const orderParts = this.orderByColumns.map(
        ({ column, direction }) => `${column} ${direction}`
      );
      parts.push(`ORDER BY ${orderParts.join(', ')}`);
    }

    // LIMIT clause
    if (this.limitValue !== null) {
      parts.push(`LIMIT ${this.limitValue}`);
    }

    // OFFSET clause
    if (this.offsetValue !== null) {
      parts.push(`OFFSET ${this.offsetValue}`);
    }

    return parts.join(' ');
  }

  /**
   * Builds an INSERT query.
   */
  private buildInsert(): string {
    if (!this.insertTable) {
      throw new Error('Table is required for INSERT query');
    }
    if (this.insertColumns.length === 0) {
      throw new Error('Columns are required for INSERT query');
    }
    if (this.insertValues.length === 0) {
      throw new Error('Values are required for INSERT query');
    }

    const parts: string[] = [];

    // INSERT INTO clause
    parts.push(`INSERT INTO ${this.insertTable}`);

    // Columns
    parts.push(`(${this.insertColumns.join(', ')})`);

    // VALUES clause
    const valuePlaceholders = this.insertValues.map((values, rowIndex) => {
      const placeholders = values.map((_, colIndex) => {
        const paramIndex = rowIndex * this.insertColumns.length + colIndex + 1;
        return `$${paramIndex}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    parts.push(`VALUES ${valuePlaceholders.join(', ')}`);

    return parts.join(' ');
  }

  /**
   * Builds an UPDATE query.
   */
  private buildUpdate(): string {
    if (!this.updateTable) {
      throw new Error('Table is required for UPDATE query');
    }
    if (this.updateSets.length === 0) {
      throw new Error('SET clause is required for UPDATE query');
    }

    const parts: string[] = [];

    // UPDATE clause
    parts.push(`UPDATE ${this.updateTable}`);

    // SET clause
    let paramIndex = 1;
    const setParts = this.updateSets.map(({ column }) => {
      return `${column} = $${paramIndex++}`;
    });
    parts.push(`SET ${setParts.join(', ')}`);

    // WHERE clause
    if (this.whereClauses.length > 0) {
      // Adjust parameter indices in WHERE clauses
      const adjustedWhereClauses = this.whereClauses.map((clause) => {
        return clause.replace(/\$(\d+)/g, (match, num) => {
          return `$${parseInt(num) + this.updateSets.length}`;
        });
      });
      parts.push(`WHERE ${adjustedWhereClauses.join(' AND ')}`);
    }

    return parts.join(' ');
  }

  /**
   * Builds a DELETE query.
   */
  private buildDelete(): string {
    if (!this.deleteTable) {
      throw new Error('Table is required for DELETE query');
    }

    const parts: string[] = [];

    // DELETE FROM clause
    parts.push(`DELETE FROM ${this.deleteTable}`);

    // WHERE clause
    if (this.whereClauses.length > 0) {
      parts.push(`WHERE ${this.whereClauses.join(' AND ')}`);
    }

    return parts.join(' ');
  }

  /**
   * Replaces parameter placeholders in a condition.
   */
  private replaceParams(condition: string, params: unknown[]): string {
    let paramIndex = this.params.length + 1;
    return condition.replace(/\$(\d+)/g, (match, num) => {
      const index = parseInt(num) - 1;
      if (index < params.length) {
        return `$${paramIndex + index}`;
      }
      return match;
    });
  }
}

/**
 * Creates a new QueryBuilder instance.
 *
 * @returns New QueryBuilder
 */
export function createQueryBuilder(): QueryBuilder {
  return new QueryBuilder();
}
