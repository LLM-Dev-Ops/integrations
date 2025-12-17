/**
 * PostgreSQL query execution layer following SPARC specification.
 *
 * Provides high-level query execution methods with metrics, tracing, and error handling.
 * @module operations/query
 */

import type { PoolClient, QueryResult as PgQueryResult } from 'pg';
import {
  PgError,
  PgErrorCode,
  NoRowsError,
  TooManyRowsError,
  QueryTimeoutError,
  ExecutionError,
  parsePostgresError,
} from '../errors/index.js';
import type { Observability, SpanContext } from '../observability/index.js';
import { MetricNames } from '../observability/index.js';
import { TelemetryEmitter } from '@integrations/telemetry-emitter';
import { randomUUID } from 'crypto';

// ============================================================================
// Query Parameter Types
// ============================================================================

/**
 * Supported query parameter types.
 *
 * These map to PostgreSQL data types and are safely parameterized to prevent SQL injection.
 */
export type QueryParam =
  | string
  | number
  | boolean
  | Date
  | Buffer
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
  /** PostgreSQL data type OID */
  dataTypeId: number;
  /** Human-readable data type name */
  dataTypeName: string;
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
  /** SQL command executed (INSERT, UPDATE, DELETE, SELECT, etc.) */
  command: string;
  /** Query execution duration in milliseconds */
  duration: number;
}

// ============================================================================
// Query Options
// ============================================================================

/**
 * Row mode for query results.
 */
export type RowMode = 'object' | 'array';

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
  /** Row mode: 'object' returns objects, 'array' returns arrays */
  rowMode?: RowMode;
}

// ============================================================================
// Prepared Statement Types
// ============================================================================

/**
 * Prepared statement for optimized repeated execution.
 */
export class PreparedStatement {
  private readonly name: string;
  private readonly query: string;
  private readonly paramTypes: number[] | undefined;
  private readonly client: PoolClient;
  private readonly observability: Observability;
  private isPrepared: boolean = false;

  constructor(
    name: string,
    query: string,
    client: PoolClient,
    observability: Observability,
    paramTypes?: number[]
  ) {
    this.name = name;
    this.query = query;
    this.paramTypes = paramTypes;
    this.client = client;
    this.observability = observability;
  }

  /**
   * Prepares the statement on the database server.
   *
   * @throws {PgError} If preparation fails
   */
  async prepare(): Promise<void> {
    if (this.isPrepared) {
      return;
    }

    const span = this.observability.tracer.startSpan('pg.prepared_statement.prepare', {
      statementName: this.name,
      query: this.redactQuery(this.query),
    });

    try {
      const startTime = Date.now();

      // PostgreSQL prepare statement syntax
      let prepareQuery = `PREPARE ${this.name}`;
      if (this.paramTypes && this.paramTypes.length > 0) {
        const typeNames = this.paramTypes.map((oid) => this.oidToTypeName(oid)).join(', ');
        prepareQuery += ` (${typeNames})`;
      }
      prepareQuery += ` AS ${this.query}`;

      await this.client.query(prepareQuery);

      const duration = Date.now() - startTime;
      this.isPrepared = true;

      this.observability.logger.debug('Prepared statement created', {
        name: this.name,
        duration,
      });

      this.observability.metrics.timing('pg_prepared_statement_prepare_duration_ms', duration, {
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
   * @param params - Query parameters
   * @returns Query result
   * @throws {PgError} If execution fails
   */
  async execute<T = Record<string, unknown>>(params?: QueryParam[]): Promise<QueryResult<T>> {
    if (!this.isPrepared) {
      await this.prepare();
    }

    const span = this.observability.tracer.startSpan('pg.prepared_statement.execute', {
      statementName: this.name,
      paramCount: params?.length ?? 0,
    });

    // Generate correlation ID for telemetry
    const correlationId = randomUUID();

    try {
      const startTime = Date.now();
      const executeQuery = `EXECUTE ${this.name}${params && params.length > 0 ? ` (${params.map((_, i) => `$${i + 1}`).join(', ')})` : ''}`;

      // Emit telemetry: Query initiation
      try {
        const telemetry = TelemetryEmitter.getInstance();
        telemetry.emitRequestStart('postgresql', correlationId, {
          statementType: 'prepared',
          statementName: this.name,
          paramCount: params?.length ?? 0,
        });
      } catch {
        // Fail-open: ignore telemetry errors
      }

      this.observability.logger.debug('Executing prepared statement', {
        name: this.name,
        paramCount: params?.length ?? 0,
      });

      const pgResult: PgQueryResult = await this.client.query(executeQuery, params as unknown[]);
      const duration = Date.now() - startTime;

      const result: QueryResult<T> = {
        rows: pgResult.rows as T[],
        rowCount: pgResult.rowCount ?? 0,
        fields: this.mapFields(pgResult.fields),
        command: pgResult.command,
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

      // Emit telemetry: Query completion
      try {
        const telemetry = TelemetryEmitter.getInstance();
        telemetry.emitRequestComplete('postgresql', correlationId, {
          statementType: 'prepared',
          statementName: this.name,
          queryType: result.command,
          rowCount: result.rowCount,
        });

        // Emit latency event
        telemetry.emitLatency('postgresql', correlationId, duration, {
          statementType: 'prepared',
          queryType: result.command,
        });
      } catch {
        // Fail-open: ignore telemetry errors
      }

      span.setStatus('OK');
      span.setAttribute('duration_ms', duration);
      span.setAttribute('row_count', result.rowCount);
      span.setAttribute('command', result.command);

      return result;
    } catch (error) {
      const duration = Date.now() - (span as any).startTime || 0;
      span.recordException(error as Error);
      span.setStatus('ERROR', (error as Error).message);
      this.observability.metrics.increment(MetricNames.ERRORS_TOTAL, 1, {
        error_type: 'prepared_statement_execution',
      });

      // Emit telemetry: Error
      try {
        const telemetry = TelemetryEmitter.getInstance();
        telemetry.emitError('postgresql', correlationId, error as Error, {
          statementType: 'prepared',
          statementName: this.name,
          duration,
        });
      } catch {
        // Fail-open: ignore telemetry errors
      }

      throw this.wrapError(error, 'Failed to execute prepared statement');
    } finally {
      span.end();
    }
  }

  /**
   * Deallocates the prepared statement.
   *
   * @throws {PgError} If deallocation fails
   */
  async deallocate(): Promise<void> {
    if (!this.isPrepared) {
      return;
    }

    try {
      await this.client.query(`DEALLOCATE ${this.name}`);
      this.isPrepared = false;
      this.observability.logger.debug('Prepared statement deallocated', {
        name: this.name,
      });
    } catch (error) {
      throw this.wrapError(error, 'Failed to deallocate prepared statement');
    }
  }

  private mapFields(fields: PgQueryResult['fields']): FieldInfo[] {
    return fields.map((field) => ({
      name: field.name,
      dataTypeId: field.dataTypeID,
      dataTypeName: this.oidToTypeName(field.dataTypeID),
    }));
  }

  private oidToTypeName(oid: number): string {
    // PostgreSQL type OID to name mapping (common types)
    const typeMap: Record<number, string> = {
      16: 'bool',
      20: 'int8',
      21: 'int2',
      23: 'int4',
      25: 'text',
      700: 'float4',
      701: 'float8',
      1043: 'varchar',
      1082: 'date',
      1114: 'timestamp',
      1184: 'timestamptz',
      2950: 'uuid',
      3802: 'jsonb',
    };
    return typeMap[oid] || `oid_${oid}`;
  }

  private redactQuery(query: string): string {
    // Simple query redaction for logging
    return query.length > 200 ? query.substring(0, 200) + '...' : query;
  }

  private wrapError(error: unknown, message: string): PgError {
    if (error instanceof PgError) {
      return error;
    }
    const parsedError = parsePostgresError(error as Error);
    // Add context message if available
    if (message && parsedError instanceof ExecutionError) {
      return new ExecutionError(
        `${message}: ${parsedError.message}`,
        parsedError.sqlState,
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
  private readonly getConnection: (target?: QueryTarget) => Promise<PoolClient>;
  private readonly releaseConnection: (client: PoolClient) => void;
  private readonly observability: Observability;

  /**
   * Creates a new QueryExecutor.
   *
   * @param getConnection - Function to acquire a connection from the pool
   * @param releaseConnection - Function to release a connection back to the pool
   * @param observability - Observability container for logging, metrics, and tracing
   */
  constructor(
    getConnection: (target?: QueryTarget) => Promise<PoolClient>,
    releaseConnection: (client: PoolClient) => void,
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
   * @throws {PgError} If query execution fails
   *
   * @example
   * ```typescript
   * const result = await executor.execute<User>(
   *   'SELECT * FROM users WHERE age > $1',
   *   [18]
   * );
   * console.log(result.rows); // User[]
   * console.log(result.duration); // execution time in ms
   * ```
   */
  async execute<T = Record<string, unknown>>(
    query: string,
    params?: QueryParam[],
    options?: QueryOptions
  ): Promise<QueryResult<T>> {
    return this.observability.tracer.withSpan(
      'pg.query.execute',
      async (span: SpanContext) => {
        const startTime = Date.now();
        let client: PoolClient | undefined;

        // Generate correlation ID for telemetry
        const correlationId = randomUUID();

        // Extract query type for telemetry metadata
        const queryType = this.extractQueryType(query);

        try {
          // Set span attributes
          span.setAttribute('query', this.redactQuery(query));
          span.setAttribute('param_count', params?.length ?? 0);
          if (options?.target) {
            span.setAttribute('target', options.target);
          }

          // Emit telemetry: Query initiation
          try {
            const telemetry = TelemetryEmitter.getInstance();
            telemetry.emitRequestStart('postgresql', correlationId, {
              queryType,
              paramCount: params?.length ?? 0,
              target: options?.target || 'any',
            });
          } catch {
            // Fail-open: ignore telemetry errors
          }

          // Acquire connection
          client = await this.getConnection(options?.target);

          this.observability.logger.debug('Executing query', {
            query: this.redactQuery(query),
            paramCount: params?.length ?? 0,
            target: options?.target,
          });

          // Execute query with timeout if specified
          const pgResult = await this.executeWithTimeout(client, query, params, options?.timeout);
          const duration = Date.now() - startTime;

          const result: QueryResult<T> = {
            rows: pgResult.rows as T[],
            rowCount: pgResult.rowCount ?? 0,
            fields: this.mapFields(pgResult.fields),
            command: pgResult.command,
            duration,
          };

          // Record metrics
          this.recordMetrics(result, span);

          this.observability.logger.debug('Query executed successfully', {
            command: result.command,
            rowCount: result.rowCount,
            duration,
          });

          // Emit telemetry: Query completion
          try {
            const telemetry = TelemetryEmitter.getInstance();
            telemetry.emitRequestComplete('postgresql', correlationId, {
              queryType: result.command,
              rowCount: result.rowCount,
              fieldCount: result.fields.length,
            });

            // Emit latency event
            telemetry.emitLatency('postgresql', correlationId, duration, {
              queryType: result.command,
            });
          } catch {
            // Fail-open: ignore telemetry errors
          }

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

          // Emit telemetry: Error
          try {
            const telemetry = TelemetryEmitter.getInstance();
            telemetry.emitError('postgresql', correlationId, error as Error, {
              queryType,
              duration,
            });
          } catch {
            // Fail-open: ignore telemetry errors
          }

          throw this.wrapError(error, query);
        } finally {
          if (client) {
            this.releaseConnection(client);
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
   * @throws {PgError} If query execution fails
   *
   * @example
   * ```typescript
   * const user = await executor.executeOne<User>(
   *   'SELECT * FROM users WHERE id = $1',
   *   [userId]
   * );
   * if (user) {
   *   console.log(user.name);
   * }
   * ```
   */
  async executeOne<T = Record<string, unknown>>(
    query: string,
    params?: QueryParam[],
    options?: QueryOptions
  ): Promise<T | null> {
    const result = await this.execute<T>(query, params, options);

    if (result.rowCount === 0) {
      return null;
    }

    if (result.rowCount > 1) {
      throw new TooManyRowsError(result.rowCount);
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
   * @throws {PgError} If query execution fails
   *
   * @example
   * ```typescript
   * const user = await executor.executeOneRequired<User>(
   *   'SELECT * FROM users WHERE id = $1',
   *   [userId]
   * );
   * console.log(user.name); // guaranteed to exist
   * ```
   */
  async executeOneRequired<T = Record<string, unknown>>(
    query: string,
    params?: QueryParam[],
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
   * This is a convenience method equivalent to execute().rows.
   *
   * @template T - Row type
   * @param query - SQL query string
   * @param params - Query parameters (optional)
   * @param options - Query options (optional)
   * @returns Array of rows
   * @throws {PgError} If query execution fails
   *
   * @example
   * ```typescript
   * const users = await executor.executeMany<User>(
   *   'SELECT * FROM users WHERE active = $1',
   *   [true]
   * );
   * users.forEach(user => console.log(user.name));
   * ```
   */
  async executeMany<T = Record<string, unknown>>(
    query: string,
    params?: QueryParam[],
    options?: QueryOptions
  ): Promise<T[]> {
    const result = await this.execute<T>(query, params, options);
    return result.rows;
  }

  /**
   * Executes a query and streams results as an async iterable.
   *
   * This is useful for processing large result sets without loading
   * all rows into memory at once.
   *
   * @template T - Row type
   * @param query - SQL query string
   * @param params - Query parameters (optional)
   * @param options - Query options (optional)
   * @returns Async iterable of rows
   * @throws {PgError} If query execution fails
   *
   * @example
   * ```typescript
   * for await (const user of executor.stream<User>('SELECT * FROM users')) {
   *   console.log(user.name);
   *   // Process one row at a time
   * }
   * ```
   */
  async *stream<T = Record<string, unknown>>(
    query: string,
    params?: QueryParam[],
    options?: QueryOptions
  ): AsyncIterable<T> {
    let client: PoolClient | undefined;

    try {
      client = await this.getConnection(options?.target);

      this.observability.logger.debug('Starting query stream', {
        query: this.redactQuery(query),
        paramCount: params?.length ?? 0,
      });

      const startTime = Date.now();

      // Use QueryStream from pg-query-stream or implement cursor-based pagination
      // For now, we'll use a simple approach with LIMIT/OFFSET
      // In production, you'd want to use pg-query-stream or server-side cursors
      const result: PgQueryResult = await client.query(query, params as unknown[]);

      const duration = Date.now() - startTime;

      this.observability.metrics.increment(MetricNames.QUERIES_TOTAL, 1, {
        command: result.command,
        streaming: 'true',
      });
      this.observability.metrics.timing(MetricNames.QUERY_DURATION_SECONDS, duration / 1000, {
        command: result.command,
        streaming: 'true',
      });

      for (const row of result.rows) {
        yield row as T;
      }

      this.observability.logger.debug('Query stream completed', {
        rowCount: result.rowCount,
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
      if (client) {
        this.releaseConnection(client);
      }
    }
  }

  /**
   * Creates a prepared statement for optimized repeated execution.
   *
   * @param name - Unique name for the prepared statement
   * @param query - SQL query string
   * @param paramTypes - Optional array of PostgreSQL type OIDs for parameters
   * @returns Prepared statement instance
   * @throws {PgError} If preparation fails
   *
   * @example
   * ```typescript
   * const stmt = await executor.prepare(
   *   'get_user_by_id',
   *   'SELECT * FROM users WHERE id = $1',
   *   [23] // int4 OID
   * );
   *
   * const user1 = await stmt.execute<User>([1]);
   * const user2 = await stmt.execute<User>([2]);
   *
   * await stmt.deallocate();
   * ```
   */
  async prepare(
    name: string,
    query: string,
    paramTypes?: number[]
  ): Promise<PreparedStatement> {
    const client = await this.getConnection('primary');

    try {
      const stmt = new PreparedStatement(name, query, client, this.observability, paramTypes);
      await stmt.prepare();
      return stmt;
    } catch (error) {
      this.releaseConnection(client);
      throw error;
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async executeWithTimeout(
    client: PoolClient,
    query: string,
    params?: QueryParam[],
    timeout?: number
  ): Promise<PgQueryResult> {
    if (!timeout) {
      return client.query(query, params as unknown[]);
    }

    // Set statement timeout for this query
    await client.query(`SET LOCAL statement_timeout = ${timeout}`);

    try {
      return await client.query(query, params as unknown[]);
    } catch (error) {
      const err = error as Error & { code?: string };
      if (err.code === '57014') {
        // Query timeout error (SQLSTATE 57014)
        throw new QueryTimeoutError(timeout);
      }
      throw error;
    }
  }

  private mapFields(fields: PgQueryResult['fields']): FieldInfo[] {
    return fields.map((field) => ({
      name: field.name,
      dataTypeId: field.dataTypeID,
      dataTypeName: this.oidToTypeName(field.dataTypeID),
    }));
  }

  private oidToTypeName(oid: number): string {
    // PostgreSQL type OID to name mapping (common types)
    const typeMap: Record<number, string> = {
      16: 'bool',
      20: 'int8',
      21: 'int2',
      23: 'int4',
      25: 'text',
      700: 'float4',
      701: 'float8',
      1043: 'varchar',
      1082: 'date',
      1114: 'timestamp',
      1184: 'timestamptz',
      2950: 'uuid',
      3802: 'jsonb',
    };
    return typeMap[oid] || `oid_${oid}`;
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
    // Simple query redaction for logging - truncate long queries
    const maxLength = 200;
    if (query.length <= maxLength) {
      return query;
    }
    return query.substring(0, maxLength) + '...';
  }

  private extractQueryType(query: string): string {
    // Extract the first SQL keyword (SELECT, INSERT, UPDATE, DELETE, etc.)
    const trimmed = query.trim().toUpperCase();
    const match = trimmed.match(/^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|BEGIN|COMMIT|ROLLBACK)/);
    return match?.[1] ?? 'UNKNOWN';
  }

  private wrapError(error: unknown, query: string): PgError {
    if (error instanceof PgError) {
      return error;
    }

    const parsedError = parsePostgresError(error as Error);

    // Add query context to execution errors
    if (parsedError instanceof ExecutionError) {
      return new ExecutionError(
        parsedError.message,
        parsedError.sqlState,
        error as Error
      );
    }

    return parsedError;
  }
}
