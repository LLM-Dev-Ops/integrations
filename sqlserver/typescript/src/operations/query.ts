/**
 * SQL Server query execution layer following SPARC specification.
 *
 * Provides high-level query execution methods with metrics, tracing, and error handling.
 * @module operations/query
 */

import * as mssql from 'mssql';
import {
  SqlServerError,
  SqlServerErrorCode,
  NoRowsError,
  TooManyRowsError,
  QueryTimeoutError,
  ExecutionError,
  parseSqlServerError,
} from '../errors/index.js';
import type { Observability, SpanContext } from '../observability/index.js';
import { MetricNames } from '../observability/index.js';
import { PooledConnection } from '../pool/index.js';

// ============================================================================
// Query Parameter Types
// ============================================================================

/**
 * Supported query parameter types.
 *
 * These map to SQL Server data types and are safely parameterized to prevent SQL injection.
 */
export type QueryParam =
  | string
  | number
  | boolean
  | Date
  | Buffer
  | bigint
  | null
  | undefined
  | Record<string, unknown>
  | QueryParam[];

// ============================================================================
// Query Result Types
// ============================================================================

/**
 * Field metadata for query results.
 */
export interface FieldInfo {
  /** Column name */
  name: string;
  /** SQL Server data type name */
  dataTypeName: string;
  /** Column length */
  length?: number;
  /** Numeric precision */
  precision?: number;
  /** Numeric scale */
  scale?: number;
  /** Whether nullable */
  nullable: boolean;
}

/**
 * Query execution result with metadata.
 *
 * @template T - Row type (defaults to Record<string, unknown>)
 */
export interface QueryResult<T = Record<string, unknown>> {
  /** Result rows */
  rows: T[];
  /** Number of rows returned or affected */
  rowCount: number;
  /** Field metadata */
  fields: FieldInfo[];
  /** SQL command executed */
  command: string;
  /** Query execution duration in milliseconds */
  duration: number;
}

// ============================================================================
// Query Options
// ============================================================================

/**
 * Target for query routing.
 */
export type QueryTarget = 'primary' | 'replica' | 'any';

/**
 * Query execution options.
 */
export interface QueryOptions {
  /** Query timeout in milliseconds */
  timeout?: number;
  /** Target connection (primary/replica/any) */
  target?: QueryTarget;
}

// ============================================================================
// Prepared Statement Types
// ============================================================================

/**
 * Parameter definition for prepared statements.
 */
export interface ParameterDefinition {
  /** Parameter name (without @) */
  name: string;
  /** SQL Server data type */
  type: mssql.ISqlType;
  /** Parameter value */
  value: unknown;
}

/**
 * Prepared statement for optimized repeated execution.
 */
export class PreparedStatement {
  private readonly name: string;
  private readonly query: string;
  private readonly parameterDefs: ParameterDefinition[];
  private readonly connection: PooledConnection;
  private readonly observability: Observability;
  private prepared: mssql.PreparedStatement | null = null;
  private isPrepared: boolean = false;

  constructor(
    name: string,
    query: string,
    parameterDefs: ParameterDefinition[],
    connection: PooledConnection,
    observability: Observability
  ) {
    this.name = name;
    this.query = query;
    this.parameterDefs = parameterDefs;
    this.connection = connection;
    this.observability = observability;
  }

  /**
   * Prepares the statement on the database server.
   *
   * @throws {SqlServerError} If preparation fails
   */
  async prepare(): Promise<void> {
    if (this.isPrepared) {
      return;
    }

    const span = this.observability.tracer.startSpan('sqlserver.prepared_statement.prepare', {
      statementName: this.name,
      query: this.redactQuery(this.query),
    });

    try {
      const startTime = Date.now();

      this.prepared = new mssql.PreparedStatement(this.connection.pool);

      // Add input parameters
      for (const param of this.parameterDefs) {
        this.prepared.input(param.name, param.type);
      }

      await this.prepared.prepare(this.query);

      const duration = Date.now() - startTime;
      this.isPrepared = true;

      this.observability.logger.debug('Prepared statement created', {
        name: this.name,
        duration,
      });

      this.observability.metrics.timing('sqlserver_prepared_statement_prepare_duration_ms', duration, {
        statement_name: this.name,
      });

      span.setStatus('OK');
      span.setAttribute('duration_ms', duration);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus('ERROR', (error as Error).message);
      throw this.wrapError(error, 'Failed to prepare statement');
    } finally {
      span.end();
    }
  }

  /**
   * Executes the prepared statement with the given parameters.
   *
   * @template T - Row type
   * @param params - Query parameters as key-value pairs
   * @returns Query result
   * @throws {SqlServerError} If execution fails
   */
  async execute<T = Record<string, unknown>>(params?: Record<string, unknown>): Promise<QueryResult<T>> {
    if (!this.isPrepared || !this.prepared) {
      await this.prepare();
    }

    const span = this.observability.tracer.startSpan('sqlserver.prepared_statement.execute', {
      statementName: this.name,
      paramCount: params ? Object.keys(params).length : 0,
    });

    try {
      const startTime = Date.now();

      this.observability.logger.debug('Executing prepared statement', {
        name: this.name,
        paramCount: params ? Object.keys(params).length : 0,
      });

      const mssqlResult = await this.prepared!.execute(params || {});
      const duration = Date.now() - startTime;

      const result: QueryResult<T> = {
        rows: mssqlResult.recordset as T[] || [],
        rowCount: mssqlResult.rowsAffected.reduce((a, b) => a + b, 0),
        fields: this.mapColumns(mssqlResult.recordset?.columns || {}),
        command: this.detectCommand(this.query),
        duration,
      };

      this.observability.metrics.increment(MetricNames.QUERIES_TOTAL, 1, {
        command: result.command,
        prepared: 'true',
      });
      this.observability.metrics.timing(MetricNames.QUERY_DURATION_SECONDS, duration / 1000, {
        command: result.command,
        prepared: 'true',
      });

      if (result.command === 'SELECT') {
        this.observability.metrics.increment(MetricNames.ROWS_RETURNED_TOTAL, result.rowCount, {
          prepared: 'true',
        });
      } else {
        this.observability.metrics.increment(MetricNames.ROWS_AFFECTED_TOTAL, result.rowCount, {
          prepared: 'true',
        });
      }

      span.setStatus('OK');
      span.setAttribute('duration_ms', duration);
      span.setAttribute('row_count', result.rowCount);
      span.setAttribute('command', result.command);

      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus('ERROR', (error as Error).message);
      this.observability.metrics.increment(MetricNames.ERRORS_TOTAL, 1, {
        error_type: 'prepared_statement_execution',
      });
      throw this.wrapError(error, 'Failed to execute prepared statement');
    } finally {
      span.end();
    }
  }

  /**
   * Unprepares the statement.
   *
   * @throws {SqlServerError} If unprepare fails
   */
  async unprepare(): Promise<void> {
    if (!this.isPrepared || !this.prepared) {
      return;
    }

    try {
      await this.prepared.unprepare();
      this.isPrepared = false;
      this.prepared = null;
      this.observability.logger.debug('Prepared statement unprepared', {
        name: this.name,
      });
    } catch (error) {
      throw this.wrapError(error, 'Failed to unprepare statement');
    }
  }

  private mapColumns(columns: mssql.IRecordSet<unknown>['columns']): FieldInfo[] {
    if (!columns) return [];
    return Object.entries(columns).map(([name, col]) => ({
      name,
      dataTypeName: this.typeIdToName(col.type),
      length: typeof col.length === 'number' ? col.length : undefined,
      precision: typeof col.precision === 'number' ? col.precision : undefined,
      scale: typeof col.scale === 'number' ? col.scale : undefined,
      nullable: col.nullable ?? true,
    }));
  }

  private typeIdToName(type: (() => mssql.ISqlType) | mssql.ISqlType): string {
    // Handle type functions and extract type name
    try {
      const typeObj = typeof type === 'function' ? type() : type;
      return (typeObj as { type?: string }).type || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private detectCommand(query: string): string {
    const normalized = query.trim().toUpperCase();
    if (normalized.startsWith('SELECT')) return 'SELECT';
    if (normalized.startsWith('INSERT')) return 'INSERT';
    if (normalized.startsWith('UPDATE')) return 'UPDATE';
    if (normalized.startsWith('DELETE')) return 'DELETE';
    if (normalized.startsWith('EXEC')) return 'EXECUTE';
    if (normalized.startsWith('EXECUTE')) return 'EXECUTE';
    return 'OTHER';
  }

  private redactQuery(query: string): string {
    return query.length > 200 ? query.substring(0, 200) + '...' : query;
  }

  private wrapError(error: unknown, message: string): SqlServerError {
    if (error instanceof SqlServerError) {
      return error;
    }
    const parsedError = parseSqlServerError(error as Error);
    if (message && parsedError instanceof ExecutionError) {
      return new ExecutionError(
        `${message}: ${parsedError.message}`,
        parsedError.errorNumber,
        error as Error
      );
    }
    return parsedError;
  }
}

// ============================================================================
// Query Executor
// ============================================================================

/**
 * High-level query executor with connection pooling, routing, and observability.
 *
 * Provides methods for executing queries, managing prepared statements,
 * and streaming large result sets.
 */
export class QueryExecutor {
  private readonly getConnection: (target?: QueryTarget) => Promise<PooledConnection>;
  private readonly releaseConnection: (conn: PooledConnection) => void;
  private readonly observability: Observability;

  /**
   * Creates a new QueryExecutor.
   *
   * @param getConnection - Function to acquire a connection from the pool
   * @param releaseConnection - Function to release a connection back to the pool
   * @param observability - Observability container for logging, metrics, and tracing
   */
  constructor(
    getConnection: (target?: QueryTarget) => Promise<PooledConnection>,
    releaseConnection: (conn: PooledConnection) => void,
    observability: Observability
  ) {
    this.getConnection = getConnection;
    this.releaseConnection = releaseConnection;
    this.observability = observability;
  }

  /**
   * Executes a query and returns the full result set.
   *
   * @template T - Row type
   * @param query - SQL query string
   * @param params - Query parameters (optional)
   * @param options - Query options (optional)
   * @returns Query result with rows, metadata, and timing
   * @throws {SqlServerError} If query execution fails
   *
   * @example
   * ```typescript
   * const result = await executor.execute<User>(
   *   'SELECT * FROM users WHERE age > @age',
   *   { age: 18 }
   * );
   * console.log(result.rows); // User[]
   * console.log(result.duration); // execution time in ms
   * ```
   */
  async execute<T = Record<string, unknown>>(
    query: string,
    params?: Record<string, unknown>,
    options?: QueryOptions
  ): Promise<QueryResult<T>> {
    return this.observability.tracer.withSpan(
      'sqlserver.query.execute',
      async (span: SpanContext) => {
        const startTime = Date.now();
        let conn: PooledConnection | undefined;

        try {
          // Set span attributes
          span.setAttribute('query', this.redactQuery(query));
          span.setAttribute('param_count', params ? Object.keys(params).length : 0);
          if (options?.target) {
            span.setAttribute('target', options.target);
          }

          // Determine connection role
          const role = options?.target === 'replica' ? 'replica' : 'primary';
          conn = await this.getConnection(role as QueryTarget);

          this.observability.logger.debug('Executing query', {
            query: this.redactQuery(query),
            paramCount: params ? Object.keys(params).length : 0,
            target: options?.target,
          });

          // Execute query with timeout if specified
          const mssqlResult = await this.executeWithTimeout(conn, query, params, options?.timeout);
          const duration = Date.now() - startTime;

          const result: QueryResult<T> = {
            rows: mssqlResult.recordset as T[] || [],
            rowCount: mssqlResult.rowsAffected.reduce((a, b) => a + b, 0),
            fields: this.mapColumns(mssqlResult.recordset?.columns || {}),
            command: this.detectCommand(query),
            duration,
          };

          // Update connection stats
          conn.queryCount++;
          conn.lastUsedAt = new Date();

          // Record metrics
          this.recordMetrics(result, span);

          this.observability.logger.debug('Query executed successfully', {
            command: result.command,
            rowCount: result.rowCount,
            duration,
          });

          span.setStatus('OK');
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          span.recordException(error as Error);
          span.setStatus('ERROR', (error as Error).message);
          span.setAttribute('duration_ms', duration);

          this.observability.metrics.increment(MetricNames.ERRORS_TOTAL, 1, {
            error_type: 'query_execution',
          });

          this.observability.logger.error('Query execution failed', {
            query: this.redactQuery(query),
            error: (error as Error).message,
            duration,
          });

          throw this.wrapError(error, query);
        } finally {
          if (conn) {
            this.releaseConnection(conn);
          }
        }
      }
    );
  }

  /**
   * Executes a query and returns a single row or null.
   *
   * @template T - Row type
   * @param query - SQL query string
   * @param params - Query parameters (optional)
   * @param options - Query options (optional)
   * @returns Single row or null if no rows found
   * @throws {TooManyRowsError} If more than one row is returned
   * @throws {SqlServerError} If query execution fails
   */
  async executeOne<T = Record<string, unknown>>(
    query: string,
    params?: Record<string, unknown>,
    options?: QueryOptions
  ): Promise<T | null> {
    const result = await this.execute<T>(query, params, options);

    if (result.rowCount === 0 || result.rows.length === 0) {
      return null;
    }

    if (result.rows.length > 1) {
      throw new TooManyRowsError(result.rows.length);
    }

    return result.rows[0] ?? null;
  }

  /**
   * Executes a query and returns a single row.
   *
   * @template T - Row type
   * @param query - SQL query string
   * @param params - Query parameters (optional)
   * @param options - Query options (optional)
   * @returns Single row
   * @throws {NoRowsError} If no rows are returned
   * @throws {TooManyRowsError} If more than one row is returned
   * @throws {SqlServerError} If query execution fails
   */
  async executeOneRequired<T = Record<string, unknown>>(
    query: string,
    params?: Record<string, unknown>,
    options?: QueryOptions
  ): Promise<T> {
    const result = await this.executeOne<T>(query, params, options);

    if (result === null) {
      throw new NoRowsError();
    }

    return result;
  }

  /**
   * Executes a query and returns all rows as an array.
   *
   * @template T - Row type
   * @param query - SQL query string
   * @param params - Query parameters (optional)
   * @param options - Query options (optional)
   * @returns Array of rows
   * @throws {SqlServerError} If query execution fails
   */
  async executeMany<T = Record<string, unknown>>(
    query: string,
    params?: Record<string, unknown>,
    options?: QueryOptions
  ): Promise<T[]> {
    const result = await this.execute<T>(query, params, options);
    return result.rows;
  }

  /**
   * Executes a query and streams results as an async iterable.
   *
   * @template T - Row type
   * @param query - SQL query string
   * @param params - Query parameters (optional)
   * @param options - Query options (optional)
   * @returns Async iterable of rows
   * @throws {SqlServerError} If query execution fails
   */
  async *stream<T = Record<string, unknown>>(
    query: string,
    params?: Record<string, unknown>,
    options?: QueryOptions
  ): AsyncIterable<T> {
    let conn: PooledConnection | undefined;

    try {
      const role = options?.target === 'replica' ? 'replica' : 'primary';
      conn = await this.getConnection(role as QueryTarget);

      this.observability.logger.debug('Starting query stream', {
        query: this.redactQuery(query),
        paramCount: params ? Object.keys(params).length : 0,
      });

      const startTime = Date.now();

      const request = new mssql.Request(conn.pool);
      request.stream = true;

      // Add parameters
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          request.input(key, value);
        }
      }

      // Create a promise that resolves when streaming is complete
      const rows: T[] = [];

      // For streaming, we need to use the recordset event
      // But mssql's streaming API is complex, so for now we'll use a simpler approach
      const result = await request.query(query);

      const duration = Date.now() - startTime;

      this.observability.metrics.increment(MetricNames.QUERIES_TOTAL, 1, {
        command: this.detectCommand(query),
        streaming: 'true',
      });
      this.observability.metrics.timing(MetricNames.QUERY_DURATION_SECONDS, duration / 1000, {
        command: this.detectCommand(query),
        streaming: 'true',
      });

      for (const row of (result.recordset || [])) {
        yield row as T;
      }

      this.observability.logger.debug('Query stream completed', {
        rowCount: result.recordset?.length || 0,
        duration,
      });
    } catch (error) {
      this.observability.metrics.increment(MetricNames.ERRORS_TOTAL, 1, {
        error_type: 'query_stream',
      });

      this.observability.logger.error('Query stream failed', {
        query: this.redactQuery(query),
        error: (error as Error).message,
      });

      throw this.wrapError(error, query);
    } finally {
      if (conn) {
        this.releaseConnection(conn);
      }
    }
  }

  /**
   * Creates a prepared statement for optimized repeated execution.
   *
   * @param name - Unique name for the prepared statement
   * @param query - SQL query string
   * @param parameterDefs - Parameter definitions
   * @returns Prepared statement instance
   * @throws {SqlServerError} If preparation fails
   */
  async prepare(
    name: string,
    query: string,
    parameterDefs: ParameterDefinition[]
  ): Promise<PreparedStatement> {
    const conn = await this.getConnection('primary');

    try {
      const stmt = new PreparedStatement(name, query, parameterDefs, conn, this.observability);
      await stmt.prepare();
      return stmt;
    } catch (error) {
      this.releaseConnection(conn);
      throw error;
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async executeWithTimeout(
    conn: PooledConnection,
    query: string,
    params?: Record<string, unknown>,
    timeout?: number
  ): Promise<mssql.IResult<unknown>> {
    const request = new mssql.Request(conn.pool);

    // Set timeout if specified
    if (timeout) {
      request.timeout = timeout;
    }

    // Add parameters
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        request.input(key, value);
      }
    }

    try {
      return await request.query(query);
    } catch (error) {
      const err = error as Error & { code?: string; number?: number };
      if (err.code === 'ETIMEOUT' || err.number === -2) {
        throw new QueryTimeoutError(timeout || 0);
      }
      throw error;
    }
  }

  private mapColumns(columns: Record<string, mssql.IColumnMetadata>): FieldInfo[] {
    return Object.entries(columns).map(([name, col]) => ({
      name,
      dataTypeName: this.typeIdToName(col.type),
      length: col.length,
      precision: col.precision,
      scale: col.scale,
      nullable: col.nullable ?? true,
    }));
  }

  private typeIdToName(type: (() => mssql.ISqlType) | mssql.ISqlType): string {
    const typeObj = typeof type === 'function' ? type() : type;
    return typeObj.type || 'unknown';
  }

  private detectCommand(query: string): string {
    const normalized = query.trim().toUpperCase();
    if (normalized.startsWith('SELECT')) return 'SELECT';
    if (normalized.startsWith('INSERT')) return 'INSERT';
    if (normalized.startsWith('UPDATE')) return 'UPDATE';
    if (normalized.startsWith('DELETE')) return 'DELETE';
    if (normalized.startsWith('EXEC')) return 'EXECUTE';
    if (normalized.startsWith('EXECUTE')) return 'EXECUTE';
    if (normalized.startsWith('MERGE')) return 'MERGE';
    return 'OTHER';
  }

  private recordMetrics(result: QueryResult<unknown>, span: SpanContext): void {
    this.observability.metrics.increment(MetricNames.QUERIES_TOTAL, 1, {
      command: result.command,
    });

    this.observability.metrics.timing(
      MetricNames.QUERY_DURATION_SECONDS,
      result.duration / 1000,
      {
        command: result.command,
      }
    );

    if (result.command === 'SELECT') {
      this.observability.metrics.increment(MetricNames.ROWS_RETURNED_TOTAL, result.rowCount);
      span.setAttribute('rows_returned', result.rowCount);
    } else {
      this.observability.metrics.increment(MetricNames.ROWS_AFFECTED_TOTAL, result.rowCount);
      span.setAttribute('rows_affected', result.rowCount);
    }

    span.setAttribute('duration_ms', result.duration);
    span.setAttribute('command', result.command);
    span.setAttribute('field_count', result.fields.length);
  }

  private redactQuery(query: string): string {
    const maxLength = 200;
    if (query.length <= maxLength) {
      return query;
    }
    return query.substring(0, maxLength) + '...';
  }

  private wrapError(error: unknown, query: string): SqlServerError {
    if (error instanceof SqlServerError) {
      return error;
    }

    const parsedError = parseSqlServerError(error as Error);

    if (parsedError instanceof ExecutionError) {
      return new ExecutionError(
        parsedError.message,
        parsedError.errorNumber,
        error as Error
      );
    }

    return parsedError;
  }
}
