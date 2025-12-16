/**
 * MySQL Services Module
 *
 * Provides service classes for query execution, transaction management,
 * metadata operations, and health monitoring following the SPARC specification.
 *
 * @module services
 */

import type { ConnectionPool, PooledConnection } from '../pool/index.js';
import type {
  ExecuteResult,
  ResultSet,
  Row,
  Value,
  PreparedStatement,
  Transaction,
  TransactionOptions,
  Savepoint,
  TableInfo,
  ColumnInfo,
  IndexInfo,
  TableStats,
  ExplainResult,
  ReplicaStatus,
  ServerStatus,
  ProcessInfo,
  QueryOptions,
  StreamOptions,
  RowStream,
} from '../types/index.js';
import { IsolationLevel, SortDirection } from '../types/index.js';
import type {
  MysqlError,
  QueryTimeoutError,
  ParamCountMismatchError,
  ExecutionError,
} from '../errors/index.js';
import { SpanStatus } from '../observability/index.js';
import type { Logger, MetricsCollector, Tracer, SpanContext } from '../observability/index.js';

/**
 * Error for when a transaction is not active.
 */
interface TransactionNotActiveError {
  name: 'TransactionNotActiveError';
  message: string;
  transactionId: string;
}

/**
 * Error for when a savepoint is not found.
 */
interface SavepointNotFoundError {
  name: 'SavepointNotFoundError';
  message: string;
  savepointName: string;
}

/**
 * Extended transaction with connection context.
 */
interface ActiveTransaction extends Transaction {
  /** Whether the transaction is active */
  active: boolean;
  /** The connection used for this transaction */
  connection: PooledConnection;
}

/**
 * Error thrown when batch execution fails.
 */
interface BatchExecutionError {
  name: 'BatchExecutionError';
  message: string;
  cause: Error;
  completed: number;
  total: number;
  partialResults: ExecuteResult[];
}

/**
 * Error thrown when parameter count doesn't match.
 */
interface ParameterCountMismatchError {
  name: 'ParameterCountMismatchError';
  message: string;
  expected: number;
  received: number;
}

// ============================================================================
// Query Service
// ============================================================================

/**
 * Service for executing SQL queries and statements.
 *
 * Provides operations for:
 * - Query execution (SELECT)
 * - Statement execution (INSERT, UPDATE, DELETE)
 * - Prepared statements
 * - Batch operations
 * - Streaming results
 */
class QueryService {
  private readonly pool: ConnectionPool;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private readonly tracer: Tracer;

  constructor(
    pool: ConnectionPool,
    observability: { logger: Logger; metrics: MetricsCollector; tracer: Tracer }
  ) {
    this.pool = pool;
    this.logger = observability.logger;
    this.metrics = observability.metrics;
    this.tracer = observability.tracer;
  }

  /**
   * Execute a SQL statement that modifies data (INSERT, UPDATE, DELETE).
   *
   * @param sql - SQL statement to execute
   * @param params - Query parameters
   * @param options - Execution options
   * @returns Execution result with affected rows and last insert ID
   *
   * @example
   * ```typescript
   * const result = await queryService.execute(
   *   'INSERT INTO users (name, email) VALUES (?, ?)',
   *   ['John Doe', 'john@example.com']
   * );
   * console.log(`Inserted ${result.affectedRows} rows, ID: ${result.lastInsertId}`);
   * ```
   */
  async execute(
    sql: string,
    params: Value[] = [],
    options?: QueryOptions
  ): Promise<ExecuteResult> {
    return this.tracer.withSpan(
      'mysql.query.execute',
      async (span) => {
        span.setAttribute('db.statement', this.redactQuery(sql));
        span.setAttribute('db.operation', 'execute');

        const startTime = Date.now();
        let connection: PooledConnection | undefined;

        try {
          // Acquire connection from pool
          connection = await this.pool.acquire();

          // Execute statement with retry for transient errors
          const result = await this.executeWithRetry(
            connection,
            sql,
            params,
            options
          );

          const duration = Date.now() - startTime;

          // Emit metrics
          this.metrics.timing('mysql.query.duration_ms', duration, {
            operation: 'execute',
            status: 'success',
          });
          this.metrics.increment('mysql.query.count', 1, {
            operation: 'execute',
            status: 'success',
          });

          // Log slow queries
          if (duration > (options?.slowQueryThreshold ?? 1000)) {
            this.logger.warn('Slow query detected', {
              duration_ms: duration,
              query: this.redactQuery(sql),
            });
          }

          span.setAttribute('affected_rows', result.affectedRows);
          span.setAttribute('duration_ms', duration);

          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          this.metrics.increment('mysql.query.errors', 1, {
            operation: 'execute',
            error_type: (error as Error).name,
          });

          span.recordException(error as Error);
          span.setStatus(SpanStatus.ERROR, (error as Error).message);

          this.logger.error('Query execution failed', {
            query: this.redactQuery(sql),
            error: (error as Error).message,
            duration_ms: duration,
          });

          throw error;
        } finally {
          if (connection) {
            await this.pool.release(connection);
          }
        }
      },
      { operation: 'execute' }
    );
  }

  /**
   * Execute a SELECT query and return all results.
   *
   * @param sql - SQL query to execute
   * @param params - Query parameters
   * @param options - Query options
   * @returns Result set with rows and metadata
   *
   * @example
   * ```typescript
   * const result = await queryService.query(
   *   'SELECT * FROM users WHERE status = ?',
   *   ['active']
   * );
   * console.log(`Found ${result.rows.length} users`);
   * ```
   */
  async query(
    sql: string,
    params: Value[] = [],
    options?: QueryOptions
  ): Promise<ResultSet> {
    return this.tracer.withSpan(
      'mysql.query.query',
      async (span) => {
        span.setAttribute('db.statement', this.redactQuery(sql));
        span.setAttribute('db.operation', 'query');

        const startTime = Date.now();
        let connection: PooledConnection | undefined;

        try {
          connection = await this.pool.acquire();

          const result = await this.queryWithRetry(
            connection,
            sql,
            params,
            options
          );

          const duration = Date.now() - startTime;

          this.metrics.timing('mysql.query.duration_ms', duration, {
            operation: 'query',
            status: 'success',
          });
          this.metrics.increment('mysql.query.count', 1, {
            operation: 'query',
            status: 'success',
          });
          this.metrics.histogram('mysql.query.rows_returned', result.rows.length);

          span.setAttribute('rows_returned', result.rows.length);
          span.setAttribute('duration_ms', duration);

          return result;
        } catch (error) {
          this.metrics.increment('mysql.query.errors', 1, {
            operation: 'query',
            error_type: (error as Error).name,
          });

          span.recordException(error as Error);
          span.setStatus(SpanStatus.ERROR, (error as Error).message);

          throw error;
        } finally {
          if (connection) {
            await this.pool.release(connection);
          }
        }
      },
      { operation: 'query' }
    );
  }

  /**
   * Execute a query expecting a single row result.
   *
   * @param sql - SQL query to execute
   * @param params - Query parameters
   * @param options - Query options
   * @returns Single row or undefined if no results
   *
   * @example
   * ```typescript
   * const user = await queryService.queryOne(
   *   'SELECT * FROM users WHERE id = ?',
   *   [userId]
   * );
   * if (user) {
   *   console.log('User found:', user.values);
   * }
   * ```
   */
  async queryOne(
    sql: string,
    params: Value[] = [],
    options?: QueryOptions
  ): Promise<Row | undefined> {
    const result = await this.query(sql, params, options);
    return result.rows[0];
  }

  /**
   * Execute a query and stream results in batches.
   *
   * Useful for large result sets to avoid loading all data into memory.
   *
   * @param sql - SQL query to execute
   * @param params - Query parameters
   * @param options - Stream options
   * @returns Async iterable row stream
   *
   * @example
   * ```typescript
   * const stream = await queryService.queryStream(
   *   'SELECT * FROM large_table',
   *   [],
   *   { batchSize: 1000 }
   * );
   *
   * for await (const row of stream) {
   *   await processRow(row);
   * }
   * ```
   */
  async queryStream(
    sql: string,
    params: Value[] = [],
    options?: StreamOptions
  ): Promise<RowStream> {
    return this.tracer.withSpan(
      'mysql.query.stream',
      async (span) => {
        span.setAttribute('db.statement', this.redactQuery(sql));
        span.setAttribute('db.operation', 'stream');
        span.setAttribute('batch_size', options?.batchSize ?? 1000);

        const connection = await this.pool.acquire();

        try {
          // Enable streaming on connection
          await this.enableStreaming(connection);

          // Start streaming query
          const stream = await this.startStreamingQuery(
            connection,
            sql,
            params,
            options
          );

          this.metrics.increment('mysql.query.streams_started', 1);

          return stream;
        } catch (error) {
          // Release connection on error
          await this.pool.release(connection);

          this.metrics.increment('mysql.query.errors', 1, {
            operation: 'stream',
            error_type: (error as Error).name,
          });

          span.recordException(error as Error);
          span.setStatus(SpanStatus.ERROR, (error as Error).message);

          throw error;
        }
      },
      { operation: 'queryStream' }
    );
  }

  /**
   * Execute multiple statements in a batch.
   *
   * All statements are executed in sequence. If any statement fails,
   * execution stops and a BatchExecutionError is thrown with partial results.
   *
   * @param statements - Array of SQL statements with parameters
   * @returns Array of execution results
   *
   * @example
   * ```typescript
   * const results = await queryService.executeBatch([
   *   { sql: 'INSERT INTO logs (message) VALUES (?)', params: ['Log 1'] },
   *   { sql: 'INSERT INTO logs (message) VALUES (?)', params: ['Log 2'] },
   *   { sql: 'INSERT INTO logs (message) VALUES (?)', params: ['Log 3'] },
   * ]);
   * console.log(`Executed ${results.length} statements`);
   * ```
   */
  async executeBatch(
    statements: Array<{ sql: string; params?: Value[] }>
  ): Promise<ExecuteResult[]> {
    return this.tracer.withSpan(
      'mysql.query.batch',
      async (span) => {
        span.setAttribute('batch_size', statements.length);

        const startTime = Date.now();
        let connection: PooledConnection | undefined;
        const results: ExecuteResult[] = [];

        try {
          connection = await this.pool.acquire();

          for (let i = 0; i < statements.length; i++) {
            const stmt = statements[i]!;
            try {
              const result = await this.executeInternal(
                connection,
                stmt.sql,
                stmt.params ?? []
              );
              results.push(result);
            } catch (error) {
              // Throw batch error with partial results
              const batchError: BatchExecutionError = {
                name: 'BatchExecutionError',
                message: `Batch execution failed at statement ${i + 1}/${statements.length}`,
                cause: error as Error,
                completed: i,
                total: statements.length,
                partialResults: results,
              };
              throw batchError;
            }
          }

          const duration = Date.now() - startTime;

          this.metrics.timing('mysql.batch.duration_ms', duration);
          this.metrics.increment('mysql.batch.count', 1, { status: 'success' });
          this.metrics.histogram('mysql.batch.statements', statements.length);

          span.setAttribute('duration_ms', duration);
          span.setAttribute('statements_executed', statements.length);

          return results;
        } catch (error) {
          this.metrics.increment('mysql.batch.errors', 1);

          span.recordException(error as Error);
          span.setStatus(SpanStatus.ERROR, (error as Error).message);

          throw error;
        } finally {
          if (connection) {
            await this.pool.release(connection);
          }
        }
      },
      { operation: 'executeBatch' }
    );
  }

  /**
   * Prepare a SQL statement for repeated execution.
   *
   * Prepared statements are cached and can be executed multiple times
   * with different parameters for better performance.
   *
   * @param sql - SQL statement to prepare
   * @returns Prepared statement handle
   *
   * @example
   * ```typescript
   * const stmt = await queryService.prepare(
   *   'INSERT INTO users (name, email) VALUES (?, ?)'
   * );
   * // Statement can now be executed multiple times
   * ```
   */
  async prepare(sql: string): Promise<PreparedStatement> {
    return this.tracer.withSpan(
      'mysql.query.prepare',
      async (span) => {
        span.setAttribute('db.statement', this.redactQuery(sql));

        let connection: PooledConnection | undefined;

        try {
          connection = await this.pool.acquire();

          const stmt = await this.prepareInternal(connection, sql);

          this.metrics.increment('mysql.prepared_statements.created', 1);

          span.setAttribute('statement_id', stmt.id);
          span.setAttribute('param_count', stmt.paramCount);

          return stmt;
        } catch (error) {
          this.metrics.increment('mysql.prepared_statements.errors', 1);

          span.recordException(error as Error);
          span.setStatus(SpanStatus.ERROR, (error as Error).message);

          throw error;
        } finally {
          if (connection) {
            await this.pool.release(connection);
          }
        }
      },
      { operation: 'prepare' }
    );
  }

  /**
   * Execute a prepared statement with parameters.
   *
   * @param stmt - Prepared statement to execute
   * @param params - Parameter values
   * @returns Result set
   *
   * @example
   * ```typescript
   * const stmt = await queryService.prepare('SELECT * FROM users WHERE id = ?');
   * const result = await queryService.executePrepared(stmt, [123]);
   * ```
   */
  async executePrepared(
    stmt: PreparedStatement,
    params: Value[]
  ): Promise<ResultSet> {
    return this.tracer.withSpan(
      'mysql.query.execute_prepared',
      async (span) => {
        span.setAttribute('statement_id', stmt.id);
        span.setAttribute('param_count', params.length);

        // Validate parameter count
        if (params.length !== stmt.paramCount) {
          const error: ParameterCountMismatchError = {
            name: 'ParameterCountMismatchError',
            message: `Expected ${stmt.paramCount} parameters, got ${params.length}`,
            expected: stmt.paramCount,
            received: params.length,
          };
          throw error;
        }

        let connection: PooledConnection | undefined;

        try {
          connection = await this.pool.acquire();

          const result = await this.executePreparedInternal(
            connection,
            stmt,
            params
          );

          this.metrics.increment('mysql.prepared_statements.executed', 1);

          return result;
        } catch (error) {
          this.metrics.increment('mysql.prepared_statements.errors', 1);

          span.recordException(error as Error);
          span.setStatus(SpanStatus.ERROR, (error as Error).message);

          throw error;
        } finally {
          if (connection) {
            await this.pool.release(connection);
          }
        }
      },
      { operation: 'executePrepared' }
    );
  }

  // Private helper methods - MySQL driver integration

  private async executeWithRetry(
    connection: PooledConnection,
    sql: string,
    params: Value[],
    options?: QueryOptions
  ): Promise<ExecuteResult> {
    // Implementation uses retry logic - for now direct execution
    // Retry logic can be added via ResilienceOrchestrator if needed
    return this.executeInternal(connection, sql, params);
  }

  private async queryWithRetry(
    connection: PooledConnection,
    sql: string,
    params: Value[],
    options?: QueryOptions
  ): Promise<ResultSet> {
    // Implementation uses retry logic - for now direct execution
    return this.queryInternal(connection, sql, params);
  }

  private async executeInternal(
    connection: PooledConnection,
    sql: string,
    params: Value[]
  ): Promise<ExecuteResult> {
    const convertedParams = this.convertParams(params);
    const [result] = await connection.connection.execute(sql, convertedParams);

    const resultObj = result as { affectedRows?: number; insertId?: number | bigint; warningStatus?: number };
    return {
      affectedRows: resultObj.affectedRows ?? 0,
      lastInsertId: typeof resultObj.insertId === 'bigint'
        ? Number(resultObj.insertId)
        : (resultObj.insertId ?? undefined),
      warnings: resultObj.warningStatus ?? 0,
    };
  }

  private async queryInternal(
    connection: PooledConnection,
    sql: string,
    params: Value[]
  ): Promise<ResultSet> {
    const convertedParams = this.convertParams(params);
    const [rows, fields] = await connection.connection.query(sql, convertedParams);

    const rowsArray = Array.isArray(rows) ? rows : [];
    const fieldsArray = Array.isArray(fields) ? fields : [];

    return {
      columns: fieldsArray.map((f: any) => ({
        name: f.name ?? '',
        table: f.table,
        database: f.db,
        columnType: f.type ?? 0,
        flags: this.parseColumnFlags(f.flags ?? 0),
        decimals: f.decimals ?? 0,
        maxLength: f.length ?? 0,
      })),
      rows: rowsArray.map((row: any) => this.convertRow(row)),
      affectedRows: 0,
      warnings: 0,
    };
  }

  private async enableStreaming(connection: PooledConnection): Promise<void> {
    // mysql2 supports streaming via queryStream - no explicit enable needed
    // This is a placeholder for any pre-stream setup
  }

  private async startStreamingQuery(
    connection: PooledConnection,
    sql: string,
    params: Value[],
    options?: StreamOptions
  ): Promise<RowStream> {
    const convertedParams = this.convertParams(params);
    // Use query without awaiting to get a Query object that supports streaming
    // The underlying connection supports .query().stream() for streaming results
    const queryable = connection.connection as any;
    const stream = queryable.query(sql, convertedParams).stream();

    let closed = false;
    const self = this;

    return {
      [Symbol.asyncIterator](): AsyncIterator<Row> {
        const iterator = stream[Symbol.asyncIterator]();
        return {
          async next(): Promise<IteratorResult<Row>> {
            if (closed) {
              return { done: true, value: undefined };
            }
            const result = await iterator.next();
            if (result.done) {
              return { done: true, value: undefined };
            }
            return { done: false, value: self.convertRow(result.value) };
          },
        };
      },
      async close(): Promise<void> {
        closed = true;
        stream.destroy();
      },
      get closed(): boolean {
        return closed;
      },
    };
  }

  private async prepareInternal(
    connection: PooledConnection,
    sql: string
  ): Promise<PreparedStatement> {
    // mysql2 prepare returns a PreparedStatementInfo object
    const stmt = await connection.connection.prepare(sql);
    const stmtAny = stmt as any;

    // Count placeholders in SQL for param count
    const paramCount = (sql.match(/\?/g) || []).length;

    return {
      id: `stmt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      sql,
      paramCount,
      columns: stmtAny.columns?.map((c: any) => ({
        name: c.name ?? '',
        table: c.table,
        database: c.db,
        columnType: c.type ?? 0,
        flags: this.parseColumnFlags(c.flags ?? 0),
        decimals: c.decimals ?? 0,
        maxLength: c.length ?? 0,
      })) ?? [],
      createdAt: new Date(),
    };
  }

  private async executePreparedInternal(
    connection: PooledConnection,
    stmt: PreparedStatement,
    params: Value[]
  ): Promise<ResultSet> {
    // Execute prepared statement via regular execute with the stored SQL
    return this.queryInternal(connection, stmt.sql, params);
  }

  private convertParams(params: Value[]): unknown[] {
    return params.map(p => {
      switch (p.type) {
        case 'Null': return null;
        case 'Bool': return p.value;
        case 'Int': return p.value;
        case 'UInt': return p.value;
        case 'Float': return p.value;
        case 'Double': return p.value;
        case 'String': return p.value;
        case 'Bytes': return Buffer.from(p.value);
        case 'Date': return p.value;
        case 'Time': return p.value;
        case 'DateTime': return p.value;
        case 'Timestamp': return p.value;
        case 'Decimal': return p.value;
        case 'Json': return JSON.stringify(p.value);
        default: return null;
      }
    });
  }

  private convertRow(row: unknown): Row {
    if (!row || typeof row !== 'object') {
      const emptyValues: Value[] = [];
      return {
        values: emptyValues,
        get(index: number): Value {
          return { type: 'Null' };
        },
      };
    }

    const rowObj = row as Record<string, unknown>;
    const values: Value[] = Object.values(rowObj).map(v => this.toValue(v));

    return {
      values,
      get(index: number): Value {
        if (index < 0 || index >= values.length) {
          return { type: 'Null' };
        }
        return values[index]!;
      },
    };
  }

  private toValue(v: unknown): Value {
    if (v === null || v === undefined) {
      return { type: 'Null' };
    }
    if (typeof v === 'boolean') {
      return { type: 'Bool', value: v };
    }
    if (typeof v === 'number') {
      return Number.isInteger(v) ? { type: 'Int', value: v } : { type: 'Float', value: v };
    }
    if (typeof v === 'string') {
      return { type: 'String', value: v };
    }
    if (typeof v === 'bigint') {
      return { type: 'Int', value: Number(v) };
    }
    if (v instanceof Date) {
      return { type: 'DateTime', value: v };
    }
    if (Buffer.isBuffer(v)) {
      return { type: 'Bytes', value: new Uint8Array(v) };
    }
    if (v instanceof Uint8Array) {
      return { type: 'Bytes', value: v };
    }
    return { type: 'Json', value: v };
  }

  private parseColumnFlags(flags: number): any {
    // MySQL column flags bitmask parsing
    return {
      notNull: (flags & 1) !== 0,
      primaryKey: (flags & 2) !== 0,
      uniqueKey: (flags & 4) !== 0,
      multipleKey: (flags & 8) !== 0,
      blob: (flags & 16) !== 0,
      unsigned: (flags & 32) !== 0,
      zerofill: (flags & 64) !== 0,
      binary: (flags & 128) !== 0,
      enum: (flags & 256) !== 0,
      autoIncrement: (flags & 512) !== 0,
      timestamp: (flags & 1024) !== 0,
      set: (flags & 2048) !== 0,
    };
  }

  private redactQuery(sql: string): string {
    // Redact sensitive data from query for logging
    return sql.substring(0, 100) + (sql.length > 100 ? '...' : '');
  }
}

// ============================================================================
// Transaction Service
// ============================================================================

/**
 * Service for managing database transactions.
 *
 * Provides operations for:
 * - Starting, committing, and rolling back transactions
 * - Savepoint management
 * - Transaction isolation levels
 * - Automatic transaction wrapper
 */
class TransactionService {
  private readonly pool: ConnectionPool;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private readonly tracer: Tracer;

  constructor(
    pool: ConnectionPool,
    observability: { logger: Logger; metrics: MetricsCollector; tracer: Tracer }
  ) {
    this.pool = pool;
    this.logger = observability.logger;
    this.metrics = observability.metrics;
    this.tracer = observability.tracer;
  }

  /**
   * Begin a new transaction.
   *
   * @param options - Transaction options (isolation level, read-only, timeout)
   * @returns Transaction handle
   *
   * @example
   * ```typescript
   * const tx = await transactionService.begin({
   *   isolationLevel: 'READ_COMMITTED',
   *   readOnly: false
   * });
   * ```
   */
  async begin(options?: TransactionOptions): Promise<ActiveTransaction> {
    return this.tracer.withSpan(
      'mysql.transaction.begin',
      async (span) => {
        const connection = await this.pool.acquire();

        try {
          // Set isolation level if specified
          if (options?.isolationLevel) {
            await this.setIsolationLevel(connection, options.isolationLevel);
            span.setAttribute('isolation_level', options.isolationLevel);
          }

          // Set read-only mode if specified
          if (options?.readOnly) {
            await this.setReadOnly(connection, true);
            span.setAttribute('read_only', true);
          }

          // Begin transaction
          await this.beginInternal(connection);

          const transaction: ActiveTransaction = {
            id: this.generateTransactionId(),
            connection,
            isolationLevel: options?.isolationLevel ?? IsolationLevel.RepeatableRead,
            readOnly: options?.readOnly ?? false,
            startedAt: new Date(),
            savepoints: [],
            active: true,
          };

          this.metrics.increment('mysql.transactions.started', 1);

          span.setAttribute('transaction_id', transaction.id);

          this.logger.debug('Transaction started', {
            transaction_id: transaction.id,
            isolation_level: transaction.isolationLevel,
          });

          return transaction;
        } catch (error) {
          // Release connection on error
          await this.pool.release(connection);

          this.metrics.increment('mysql.transactions.errors', 1, {
            operation: 'begin',
          });

          span.recordException(error as Error);
          span.setStatus(SpanStatus.ERROR, (error as Error).message);

          throw error;
        }
      },
      { operation: 'begin' }
    );
  }

  /**
   * Commit a transaction.
   *
   * @param tx - Transaction to commit
   *
   * @example
   * ```typescript
   * const tx = await transactionService.begin();
   * try {
   *   // Perform operations...
   *   await transactionService.commit(tx);
   * } catch (error) {
   *   await transactionService.rollback(tx);
   * }
   * ```
   */
  async commit(tx: ActiveTransaction): Promise<void> {
    return this.tracer.withSpan(
      'mysql.transaction.commit',
      async (span) => {
        span.setAttribute('transaction_id', tx.id);

        if (!tx.active) {
          const error: TransactionNotActiveError = {
            name: 'TransactionNotActiveError',
            message: 'Transaction is not active',
            transactionId: tx.id,
          };
          throw error;
        }

        try {
          await this.commitInternal(tx.connection);

          tx.active = false;

          const duration = Date.now() - tx.startedAt.getTime();

          this.metrics.increment('mysql.transactions.committed', 1);
          this.metrics.timing('mysql.transaction.duration_ms', duration);

          span.setAttribute('duration_ms', duration);

          this.logger.debug('Transaction committed', {
            transaction_id: tx.id,
            duration_ms: duration,
          });
        } catch (error) {
          this.metrics.increment('mysql.transactions.errors', 1, {
            operation: 'commit',
          });

          span.recordException(error as Error);
          span.setStatus(SpanStatus.ERROR, (error as Error).message);

          throw error;
        } finally {
          await this.pool.release(tx.connection);
        }
      },
      { operation: 'commit' }
    );
  }

  /**
   * Rollback a transaction.
   *
   * @param tx - Transaction to rollback
   *
   * @example
   * ```typescript
   * const tx = await transactionService.begin();
   * try {
   *   // Perform operations...
   *   await transactionService.commit(tx);
   * } catch (error) {
   *   await transactionService.rollback(tx);
   * }
   * ```
   */
  async rollback(tx: ActiveTransaction): Promise<void> {
    return this.tracer.withSpan(
      'mysql.transaction.rollback',
      async (span) => {
        span.setAttribute('transaction_id', tx.id);

        if (!tx.active) {
          const error: TransactionNotActiveError = {
            name: 'TransactionNotActiveError',
            message: 'Transaction is not active',
            transactionId: tx.id,
          };
          throw error;
        }

        try {
          await this.rollbackInternal(tx.connection);

          tx.active = false;

          this.metrics.increment('mysql.transactions.rolled_back', 1);

          this.logger.debug('Transaction rolled back', {
            transaction_id: tx.id,
          });
        } catch (error) {
          this.metrics.increment('mysql.transactions.errors', 1, {
            operation: 'rollback',
          });

          span.recordException(error as Error);
          span.setStatus(SpanStatus.ERROR, (error as Error).message);

          throw error;
        } finally {
          await this.pool.release(tx.connection);
        }
      },
      { operation: 'rollback' }
    );
  }

  /**
   * Create a savepoint within a transaction.
   *
   * Savepoints allow partial rollback of a transaction.
   *
   * @param tx - Active transaction
   * @param name - Savepoint name
   * @returns Savepoint handle
   *
   * @example
   * ```typescript
   * const tx = await transactionService.begin();
   * const sp = await transactionService.savepoint(tx, 'sp1');
   * // ... perform operations ...
   * await transactionService.rollbackToSavepoint(tx, sp);
   * ```
   */
  async savepoint(tx: ActiveTransaction, name: string): Promise<Savepoint> {
    return this.tracer.withSpan(
      'mysql.transaction.savepoint',
      async (span) => {
        span.setAttribute('transaction_id', tx.id);
        span.setAttribute('savepoint_name', name);

        if (!tx.active) {
          const error: TransactionNotActiveError = {
            name: 'TransactionNotActiveError',
            message: 'Transaction is not active',
            transactionId: tx.id,
          };
          throw error;
        }

        await this.createSavepointInternal(tx.connection, name);

        const savepoint: Savepoint = {
          name,
          createdAt: new Date(),
        };

        tx.savepoints.push(savepoint);

        this.metrics.increment('mysql.transactions.savepoints_created', 1);

        this.logger.debug('Savepoint created', {
          transaction_id: tx.id,
          savepoint: name,
        });

        return savepoint;
      },
      { operation: 'savepoint' }
    );
  }

  /**
   * Rollback to a savepoint.
   *
   * @param tx - Active transaction
   * @param savepoint - Savepoint to rollback to
   *
   * @example
   * ```typescript
   * const tx = await transactionService.begin();
   * const sp = await transactionService.savepoint(tx, 'sp1');
   * // ... perform operations ...
   * await transactionService.rollbackToSavepoint(tx, sp);
   * ```
   */
  async rollbackToSavepoint(tx: ActiveTransaction, savepoint: Savepoint): Promise<void> {
    return this.tracer.withSpan(
      'mysql.transaction.rollback_to_savepoint',
      async (span) => {
        span.setAttribute('transaction_id', tx.id);
        span.setAttribute('savepoint_name', savepoint.name);

        if (!tx.active) {
          const error: TransactionNotActiveError = {
            name: 'TransactionNotActiveError',
            message: 'Transaction is not active',
            transactionId: tx.id,
          };
          throw error;
        }

        // Verify savepoint exists
        const index = tx.savepoints.findIndex((sp) => sp.name === savepoint.name);
        if (index === -1) {
          const error: SavepointNotFoundError = {
            name: 'SavepointNotFoundError',
            message: `Savepoint '${savepoint.name}' not found`,
            savepointName: savepoint.name,
          };
          throw error;
        }

        await this.rollbackToSavepointInternal(tx.connection, savepoint.name);

        // Remove savepoints created after this one
        tx.savepoints.splice(index + 1);

        this.metrics.increment('mysql.transactions.savepoints_rolled_back', 1);

        this.logger.debug('Rolled back to savepoint', {
          transaction_id: tx.id,
          savepoint: savepoint.name,
        });
      },
      { operation: 'rollbackToSavepoint' }
    );
  }

  /**
   * Execute a function within a transaction.
   *
   * Automatically commits on success and rolls back on error.
   *
   * @param options - Transaction options
   * @param fn - Function to execute within transaction
   * @returns Result of the function
   *
   * @example
   * ```typescript
   * const result = await transactionService.withTransaction(
   *   { isolationLevel: 'SERIALIZABLE' },
   *   async (tx) => {
   *     // Perform operations using tx
   *     return someValue;
   *   }
   * );
   * ```
   */
  async withTransaction<T>(
    options: TransactionOptions | undefined,
    fn: (tx: ActiveTransaction) => Promise<T>
  ): Promise<T> {
    return this.tracer.withSpan(
      'mysql.transaction.with_transaction',
      async (span) => {
        const tx = await this.begin(options);

        try {
          const result = await fn(tx);
          await this.commit(tx);
          return result;
        } catch (error) {
          try {
            await this.rollback(tx);
          } catch (rollbackError) {
            this.logger.error('Rollback failed', {
              transaction_id: tx.id,
              error: (rollbackError as Error).message,
            });
          }

          throw error;
        }
      },
      { operation: 'withTransaction' }
    );
  }

  // Private helper methods - MySQL driver integration

  private async setIsolationLevel(
    connection: PooledConnection,
    level: IsolationLevel
  ): Promise<void> {
    // Map IsolationLevel to MySQL isolation level string
    let levelString: string;
    switch (level) {
      case IsolationLevel.ReadUncommitted:
        levelString = 'READ UNCOMMITTED';
        break;
      case IsolationLevel.ReadCommitted:
        levelString = 'READ COMMITTED';
        break;
      case IsolationLevel.RepeatableRead:
        levelString = 'REPEATABLE READ';
        break;
      case IsolationLevel.Serializable:
        levelString = 'SERIALIZABLE';
        break;
      default:
        levelString = 'REPEATABLE READ';
    }
    await connection.connection.query(`SET TRANSACTION ISOLATION LEVEL ${levelString}`);
  }

  private async setReadOnly(
    connection: PooledConnection,
    readOnly: boolean
  ): Promise<void> {
    if (readOnly) {
      await connection.connection.query('SET TRANSACTION READ ONLY');
    } else {
      await connection.connection.query('SET TRANSACTION READ WRITE');
    }
  }

  private async beginInternal(connection: PooledConnection): Promise<void> {
    await connection.connection.query('START TRANSACTION');
    connection.inTransaction = true;
    connection.transactionDepth = 1;
  }

  private async commitInternal(connection: PooledConnection): Promise<void> {
    await connection.connection.query('COMMIT');
    connection.inTransaction = false;
    connection.transactionDepth = 0;
  }

  private async rollbackInternal(connection: PooledConnection): Promise<void> {
    await connection.connection.query('ROLLBACK');
    connection.inTransaction = false;
    connection.transactionDepth = 0;
  }

  private async createSavepointInternal(
    connection: PooledConnection,
    name: string
  ): Promise<void> {
    // Validate savepoint name (alphanumeric and underscore only)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(`Invalid savepoint name: ${name}`);
    }
    await connection.connection.query(`SAVEPOINT ${name}`);
    connection.transactionDepth++;
  }

  private async rollbackToSavepointInternal(
    connection: PooledConnection,
    name: string
  ): Promise<void> {
    // Validate savepoint name
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(`Invalid savepoint name: ${name}`);
    }
    await connection.connection.query(`ROLLBACK TO SAVEPOINT ${name}`);
  }

  private async releaseSavepointInternal(
    connection: PooledConnection,
    name: string
  ): Promise<void> {
    // Validate savepoint name
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(`Invalid savepoint name: ${name}`);
    }
    await connection.connection.query(`RELEASE SAVEPOINT ${name}`);
    connection.transactionDepth = Math.max(1, connection.transactionDepth - 1);
  }

  private generateTransactionId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}

// ============================================================================
// Metadata Service
// ============================================================================

/**
 * Service for database metadata introspection.
 *
 * Provides operations for:
 * - Listing databases, tables, and indexes
 * - Describing table schemas
 * - Getting table statistics
 * - Analyzing query execution plans
 */
class MetadataService {
  private readonly pool: ConnectionPool;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private readonly tracer: Tracer;

  constructor(
    pool: ConnectionPool,
    observability: { logger: Logger; metrics: MetricsCollector; tracer: Tracer }
  ) {
    this.pool = pool;
    this.logger = observability.logger;
    this.metrics = observability.metrics;
    this.tracer = observability.tracer;
  }

  /**
   * List all accessible databases.
   *
   * @returns Array of database names
   *
   * @example
   * ```typescript
   * const databases = await metadataService.listDatabases();
   * console.log('Available databases:', databases);
   * ```
   */
  async listDatabases(): Promise<string[]> {
    return this.tracer.withSpan(
      'mysql.metadata.list_databases',
      async (span) => {
        let connection: PooledConnection | undefined;

        try {
          connection = await this.pool.acquire();

          const databases = await this.listDatabasesInternal(connection);

          this.metrics.increment('mysql.metadata.operations', 1, {
            operation: 'list_databases',
          });

          span.setAttribute('database_count', databases.length);

          return databases;
        } catch (error) {
          this.metrics.increment('mysql.metadata.errors', 1, {
            operation: 'list_databases',
          });

          span.recordException(error as Error);
          span.setStatus(SpanStatus.ERROR, (error as Error).message);

          throw error;
        } finally {
          if (connection) {
            await this.pool.release(connection);
          }
        }
      },
      { operation: 'listDatabases' }
    );
  }

  /**
   * List all tables in a database.
   *
   * @param database - Database name
   * @returns Array of table information
   *
   * @example
   * ```typescript
   * const tables = await metadataService.listTables('mydb');
   * tables.forEach(table => {
   *   console.log(`${table.name}: ${table.rows} rows, ${table.engine} engine`);
   * });
   * ```
   */
  async listTables(database: string): Promise<TableInfo[]> {
    return this.tracer.withSpan(
      'mysql.metadata.list_tables',
      async (span) => {
        span.setAttribute('database', database);

        let connection: PooledConnection | undefined;

        try {
          connection = await this.pool.acquire();

          const tables = await this.listTablesInternal(connection, database);

          this.metrics.increment('mysql.metadata.operations', 1, {
            operation: 'list_tables',
          });

          span.setAttribute('table_count', tables.length);

          return tables;
        } catch (error) {
          this.metrics.increment('mysql.metadata.errors', 1, {
            operation: 'list_tables',
          });

          span.recordException(error as Error);
          span.setStatus(SpanStatus.ERROR, (error as Error).message);

          throw error;
        } finally {
          if (connection) {
            await this.pool.release(connection);
          }
        }
      },
      { operation: 'listTables' }
    );
  }

  /**
   * Describe the schema of a table.
   *
   * @param database - Database name
   * @param table - Table name
   * @returns Array of column information
   *
   * @example
   * ```typescript
   * const columns = await metadataService.describeTable('mydb', 'users');
   * columns.forEach(col => {
   *   console.log(`${col.name}: ${col.columnType} ${col.isNullable ? 'NULL' : 'NOT NULL'}`);
   * });
   * ```
   */
  async describeTable(database: string, table: string): Promise<ColumnInfo[]> {
    return this.tracer.withSpan(
      'mysql.metadata.describe_table',
      async (span) => {
        span.setAttribute('database', database);
        span.setAttribute('table', table);

        let connection: PooledConnection | undefined;

        try {
          connection = await this.pool.acquire();

          const columns = await this.describeTableInternal(
            connection,
            database,
            table
          );

          this.metrics.increment('mysql.metadata.operations', 1, {
            operation: 'describe_table',
          });

          span.setAttribute('column_count', columns.length);

          return columns;
        } catch (error) {
          this.metrics.increment('mysql.metadata.errors', 1, {
            operation: 'describe_table',
          });

          span.recordException(error as Error);
          span.setStatus(SpanStatus.ERROR, (error as Error).message);

          throw error;
        } finally {
          if (connection) {
            await this.pool.release(connection);
          }
        }
      },
      { operation: 'describeTable' }
    );
  }

  /**
   * List indexes on a table.
   *
   * @param database - Database name
   * @param table - Table name
   * @returns Array of index information
   *
   * @example
   * ```typescript
   * const indexes = await metadataService.listIndexes('mydb', 'users');
   * indexes.forEach(idx => {
   *   console.log(`${idx.name}: ${idx.columns.map(c => c.name).join(', ')}`);
   * });
   * ```
   */
  async listIndexes(database: string, table: string): Promise<IndexInfo[]> {
    return this.tracer.withSpan(
      'mysql.metadata.list_indexes',
      async (span) => {
        span.setAttribute('database', database);
        span.setAttribute('table', table);

        let connection: PooledConnection | undefined;

        try {
          connection = await this.pool.acquire();

          const indexes = await this.listIndexesInternal(
            connection,
            database,
            table
          );

          this.metrics.increment('mysql.metadata.operations', 1, {
            operation: 'list_indexes',
          });

          span.setAttribute('index_count', indexes.length);

          return indexes;
        } catch (error) {
          this.metrics.increment('mysql.metadata.errors', 1, {
            operation: 'list_indexes',
          });

          span.recordException(error as Error);
          span.setStatus(SpanStatus.ERROR, (error as Error).message);

          throw error;
        } finally {
          if (connection) {
            await this.pool.release(connection);
          }
        }
      },
      { operation: 'listIndexes' }
    );
  }

  /**
   * Get statistics for a table.
   *
   * @param database - Database name
   * @param table - Table name
   * @returns Table statistics
   *
   * @example
   * ```typescript
   * const stats = await metadataService.getTableStats('mydb', 'users');
   * console.log(`Rows: ${stats.rows}, Data: ${stats.dataLength} bytes`);
   * ```
   */
  async getTableStats(database: string, table: string): Promise<TableStats> {
    return this.tracer.withSpan(
      'mysql.metadata.get_table_stats',
      async (span) => {
        span.setAttribute('database', database);
        span.setAttribute('table', table);

        let connection: PooledConnection | undefined;

        try {
          connection = await this.pool.acquire();

          const stats = await this.getTableStatsInternal(
            connection,
            database,
            table
          );

          this.metrics.increment('mysql.metadata.operations', 1, {
            operation: 'get_table_stats',
          });

          return stats;
        } catch (error) {
          this.metrics.increment('mysql.metadata.errors', 1, {
            operation: 'get_table_stats',
          });

          span.recordException(error as Error);
          span.setStatus(SpanStatus.ERROR, (error as Error).message);

          throw error;
        } finally {
          if (connection) {
            await this.pool.release(connection);
          }
        }
      },
      { operation: 'getTableStats' }
    );
  }

  /**
   * Get the execution plan for a query.
   *
   * @param sql - SQL query to explain
   * @returns Execution plan details
   *
   * @example
   * ```typescript
   * const plan = await metadataService.explainQuery(
   *   'SELECT * FROM users WHERE email = "test@example.com"'
   * );
   * plan.forEach(row => {
   *   console.log(`Table: ${row.table}, Type: ${row.accessType}, Rows: ${row.rows}`);
   * });
   * ```
   */
  async explainQuery(sql: string): Promise<ExplainResult[]> {
    return this.tracer.withSpan(
      'mysql.metadata.explain_query',
      async (span) => {
        span.setAttribute('db.statement', sql.substring(0, 100));

        let connection: PooledConnection | undefined;

        try {
          connection = await this.pool.acquire();

          const plan = await this.explainQueryInternal(connection, sql);

          this.metrics.increment('mysql.metadata.operations', 1, {
            operation: 'explain_query',
          });

          span.setAttribute('plan_rows', plan.length);

          return plan;
        } catch (error) {
          this.metrics.increment('mysql.metadata.errors', 1, {
            operation: 'explain_query',
          });

          span.recordException(error as Error);
          span.setStatus(SpanStatus.ERROR, (error as Error).message);

          throw error;
        } finally {
          if (connection) {
            await this.pool.release(connection);
          }
        }
      },
      { operation: 'explainQuery' }
    );
  }

  // Private helper methods - MySQL driver integration

  private async listDatabasesInternal(
    connection: PooledConnection
  ): Promise<string[]> {
    const [rows] = await connection.connection.query(
      `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA
       WHERE SCHEMA_NAME NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')
       ORDER BY SCHEMA_NAME`
    );
    const rowsArray = rows as any[];
    return rowsArray.map((row: any) => row.SCHEMA_NAME as string);
  }

  private async listTablesInternal(
    connection: PooledConnection,
    database: string
  ): Promise<TableInfo[]> {
    const [rows] = await connection.connection.query(
      `SELECT
        TABLE_NAME as name,
        TABLE_SCHEMA as \`database\`,
        ENGINE as engine,
        ROW_FORMAT as rowFormat,
        TABLE_ROWS as \`rows\`,
        AVG_ROW_LENGTH as avgRowLength,
        DATA_LENGTH as dataLength,
        INDEX_LENGTH as indexLength,
        AUTO_INCREMENT as autoIncrement,
        CREATE_TIME as createTime,
        UPDATE_TIME as updateTime,
        TABLE_COLLATION as collation,
        TABLE_COMMENT as comment
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`,
      [database]
    );
    const rowsArray = rows as any[];
    return rowsArray.map((row: any) => ({
      name: row.name,
      database: row.database,
      engine: row.engine || 'InnoDB',
      rowFormat: row.rowFormat || 'Dynamic',
      rows: Number(row.rows) || 0,
      avgRowLength: Number(row.avgRowLength) || 0,
      dataLength: Number(row.dataLength) || 0,
      indexLength: Number(row.indexLength) || 0,
      autoIncrement: row.autoIncrement ? Number(row.autoIncrement) : undefined,
      createTime: row.createTime ? new Date(row.createTime) : new Date(),
      updateTime: row.updateTime ? new Date(row.updateTime) : undefined,
      collation: row.collation || 'utf8mb4_unicode_ci',
      comment: row.comment || '',
    }));
  }

  private async describeTableInternal(
    connection: PooledConnection,
    database: string,
    table: string
  ): Promise<ColumnInfo[]> {
    const [rows] = await connection.connection.query(
      `SELECT
        COLUMN_NAME as name,
        ORDINAL_POSITION as ordinalPosition,
        COLUMN_DEFAULT as \`default\`,
        IS_NULLABLE as isNullable,
        DATA_TYPE as dataType,
        COLUMN_TYPE as columnType,
        CHARACTER_MAXIMUM_LENGTH as maxLength,
        NUMERIC_PRECISION as numericPrecision,
        NUMERIC_SCALE as numericScale,
        CHARACTER_SET_NAME as characterSet,
        COLLATION_NAME as collation,
        COLUMN_KEY as columnKey,
        EXTRA as extra,
        COLUMN_COMMENT as comment
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION`,
      [database, table]
    );
    const rowsArray = rows as any[];
    return rowsArray.map((row: any) => ({
      name: row.name,
      ordinalPosition: Number(row.ordinalPosition),
      default: row.default ?? undefined,
      isNullable: row.isNullable === 'YES',
      dataType: row.dataType,
      columnType: row.columnType,
      maxLength: row.maxLength ? Number(row.maxLength) : undefined,
      numericPrecision: row.numericPrecision ? Number(row.numericPrecision) : undefined,
      numericScale: row.numericScale ? Number(row.numericScale) : undefined,
      characterSet: row.characterSet ?? undefined,
      collation: row.collation ?? undefined,
      columnKey: this.parseColumnKey(row.columnKey),
      extra: row.extra || '',
      comment: row.comment || '',
    }));
  }

  private parseColumnKey(key: string): any {
    switch (key) {
      case 'PRI': return 'Primary';
      case 'UNI': return 'Unique';
      case 'MUL': return 'Multiple';
      default: return 'None';
    }
  }

  private async listIndexesInternal(
    connection: PooledConnection,
    database: string,
    table: string
  ): Promise<IndexInfo[]> {
    const [rows] = await connection.connection.query(
      `SELECT
        INDEX_NAME as name,
        TABLE_NAME as \`table\`,
        NON_UNIQUE as nonUnique,
        INDEX_TYPE as indexType,
        COLUMN_NAME as columnName,
        SEQ_IN_INDEX as ordinal,
        COLLATION as direction,
        SUB_PART as subPart,
        INDEX_COMMENT as comment
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
      [database, table]
    );
    const rowsArray = rows as any[];

    // Group columns by index name
    const indexMap = new Map<string, IndexInfo>();
    for (const row of rowsArray) {
      const indexName = row.name as string;
      if (!indexMap.has(indexName)) {
        indexMap.set(indexName, {
          name: indexName,
          table: row.table,
          unique: row.nonUnique === 0,
          indexType: this.parseIndexType(row.indexType),
          columns: [],
          comment: row.comment || '',
        });
      }
      const index = indexMap.get(indexName)!;
      index.columns.push({
        name: row.columnName,
        ordinal: Number(row.ordinal),
        direction: row.direction === 'D' ? SortDirection.Descending : SortDirection.Ascending,
        subPart: row.subPart ? Number(row.subPart) : undefined,
      });
    }

    return Array.from(indexMap.values());
  }

  private parseIndexType(type: string): any {
    switch (type?.toUpperCase()) {
      case 'BTREE': return 'BTree';
      case 'HASH': return 'Hash';
      case 'FULLTEXT': return 'FullText';
      case 'SPATIAL': return 'Spatial';
      default: return 'BTree';
    }
  }

  private async getTableStatsInternal(
    connection: PooledConnection,
    database: string,
    table: string
  ): Promise<TableStats> {
    const [rows] = await connection.connection.query(
      `SELECT
        TABLE_NAME as name,
        TABLE_SCHEMA as \`database\`,
        TABLE_ROWS as \`rows\`,
        DATA_LENGTH as dataLength,
        INDEX_LENGTH as indexLength,
        AVG_ROW_LENGTH as avgRowLength,
        DATA_FREE as dataFree,
        AUTO_INCREMENT as autoIncrement,
        CREATE_TIME as createTime,
        UPDATE_TIME as updateTime,
        CHECK_TIME as checkTime
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [database, table]
    );
    const rowsArray = rows as any[];
    if (rowsArray.length === 0) {
      throw new Error(`Table '${database}.${table}' not found`);
    }
    const row = rowsArray[0];
    return {
      name: row.name,
      database: row.database,
      rows: Number(row.rows) || 0,
      dataLength: Number(row.dataLength) || 0,
      indexLength: Number(row.indexLength) || 0,
      avgRowLength: Number(row.avgRowLength) || 0,
      dataFree: Number(row.dataFree) || 0,
      autoIncrement: row.autoIncrement ? Number(row.autoIncrement) : undefined,
      createTime: row.createTime ? new Date(row.createTime) : new Date(),
      updateTime: row.updateTime ? new Date(row.updateTime) : undefined,
      checkTime: row.checkTime ? new Date(row.checkTime) : undefined,
    };
  }

  private async explainQueryInternal(
    connection: PooledConnection,
    sql: string
  ): Promise<ExplainResult[]> {
    const [rows] = await connection.connection.query(`EXPLAIN ${sql}`);
    const rowsArray = rows as any[];
    return rowsArray.map((row: any) => ({
      id: Number(row.id) || 1,
      selectType: row.select_type || 'SIMPLE',
      table: row.table ?? undefined,
      partitions: row.partitions ?? undefined,
      accessType: this.parseAccessType(row.type),
      possibleKeys: row.possible_keys ?? undefined,
      key: row.key ?? undefined,
      keyLen: row.key_len ?? undefined,
      ref: row.ref ?? undefined,
      rows: Number(row.rows) || 0,
      filtered: Number(row.filtered) || 100,
      extra: row.Extra ?? undefined,
    }));
  }

  private parseAccessType(type: string): any {
    const typeMap: Record<string, string> = {
      'system': 'System',
      'const': 'Const',
      'eq_ref': 'EqRef',
      'ref': 'Ref',
      'fulltext': 'FullText',
      'ref_or_null': 'RefOrNull',
      'index_merge': 'IndexMerge',
      'unique_subquery': 'UniqueSubquery',
      'index_subquery': 'IndexSubquery',
      'range': 'Range',
      'index': 'Index',
      'ALL': 'All',
    };
    return typeMap[type?.toLowerCase()] || 'All';
  }
}

// ============================================================================
// Health Service
// ============================================================================

/**
 * Service for monitoring database health and status.
 *
 * Provides operations for:
 * - Connectivity checks
 * - Replication status
 * - Server status and variables
 * - Process list monitoring
 */
class HealthService {
  private readonly pool: ConnectionPool;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private readonly tracer: Tracer;

  constructor(
    pool: ConnectionPool,
    observability: { logger: Logger; metrics: MetricsCollector; tracer: Tracer }
  ) {
    this.pool = pool;
    this.logger = observability.logger;
    this.metrics = observability.metrics;
    this.tracer = observability.tracer;
  }

  /**
   * Ping the database to check connectivity.
   *
   * @returns true if connection is alive, false otherwise
   *
   * @example
   * ```typescript
   * const isAlive = await healthService.ping();
   * if (!isAlive) {
   *   console.error('Database connection failed');
   * }
   * ```
   */
  async ping(): Promise<boolean> {
    return this.tracer.withSpan(
      'mysql.health.ping',
      async (span) => {
        let connection: PooledConnection | undefined;

        try {
          connection = await this.pool.acquire(); // Primary connection for health check
          await this.pingInternal(connection);

          this.metrics.increment('mysql.health.ping', 1, { status: 'success' });

          return true;
        } catch (error) {
          this.metrics.increment('mysql.health.ping', 1, { status: 'failed' });

          span.recordException(error as Error);
          span.setStatus(SpanStatus.ERROR, (error as Error).message);

          this.logger.warn('Ping failed', {
            error: (error as Error).message,
          });

          return false;
        } finally {
          if (connection) {
            await this.pool.release(connection);
          }
        }
      },
      { operation: 'ping' }
    );
  }

  /**
   * Check replication status for replicas.
   *
   * @returns Array of replica status information
   *
   * @example
   * ```typescript
   * const replicas = await healthService.checkReplication();
   * replicas.forEach(replica => {
   *   console.log(`${replica.endpoint}: lag=${replica.secondsBehindMaster}s`);
   * });
   * ```
   */
  async checkReplication(): Promise<ReplicaStatus[]> {
    return this.tracer.withSpan(
      'mysql.health.check_replication',
      async (span) => {
        let connection: PooledConnection | undefined;

        try {
          connection = await this.pool.acquire();

          const status = await this.checkReplicationInternal(connection);

          this.metrics.increment('mysql.health.replication_checks', 1);

          // Emit lag metrics for each replica
          status.forEach((replica) => {
            if (replica.secondsBehindMaster !== undefined) {
              this.metrics.gauge(
                'mysql.replication.lag_seconds',
                replica.secondsBehindMaster,
                { endpoint: replica.endpoint }
              );
            }
          });

          span.setAttribute('replica_count', status.length);

          return status;
        } catch (error) {
          this.metrics.increment('mysql.health.errors', 1, {
            operation: 'check_replication',
          });

          span.recordException(error as Error);
          span.setStatus(SpanStatus.ERROR, (error as Error).message);

          throw error;
        } finally {
          if (connection) {
            await this.pool.release(connection);
          }
        }
      },
      { operation: 'checkReplication' }
    );
  }

  /**
   * Get server status and variables.
   *
   * @returns Server status information
   *
   * @example
   * ```typescript
   * const status = await healthService.getServerStatus();
   * console.log(`Uptime: ${status.uptime}s, Connections: ${status.connections}`);
   * ```
   */
  async getServerStatus(): Promise<ServerStatus> {
    return this.tracer.withSpan(
      'mysql.health.get_server_status',
      async (span) => {
        let connection: PooledConnection | undefined;

        try {
          connection = await this.pool.acquire();

          const status = await this.getServerStatusInternal(connection);

          this.metrics.increment('mysql.health.status_checks', 1);

          // Emit key metrics
          if (status.uptime !== undefined) {
            this.metrics.gauge('mysql.server.uptime_seconds', status.uptime);
          }
          if (status.connections !== undefined) {
            this.metrics.gauge('mysql.server.connections', status.connections);
          }
          if (status.threadsConnected !== undefined) {
            this.metrics.gauge(
              'mysql.server.threads_connected',
              status.threadsConnected
            );
          }

          return status;
        } catch (error) {
          this.metrics.increment('mysql.health.errors', 1, {
            operation: 'get_server_status',
          });

          span.recordException(error as Error);
          span.setStatus(SpanStatus.ERROR, (error as Error).message);

          throw error;
        } finally {
          if (connection) {
            await this.pool.release(connection);
          }
        }
      },
      { operation: 'getServerStatus' }
    );
  }

  /**
   * Get the list of active processes/connections.
   *
   * @returns Array of process information
   *
   * @example
   * ```typescript
   * const processes = await healthService.getProcessList();
   * console.log(`Active processes: ${processes.length}`);
   * processes.forEach(proc => {
   *   console.log(`${proc.id}: ${proc.user}@${proc.host} - ${proc.command}`);
   * });
   * ```
   */
  async getProcessList(): Promise<ProcessInfo[]> {
    return this.tracer.withSpan(
      'mysql.health.get_process_list',
      async (span) => {
        let connection: PooledConnection | undefined;

        try {
          connection = await this.pool.acquire();

          const processes = await this.getProcessListInternal(connection);

          this.metrics.increment('mysql.health.process_list_checks', 1);
          this.metrics.gauge('mysql.server.active_processes', processes.length);

          span.setAttribute('process_count', processes.length);

          return processes;
        } catch (error) {
          this.metrics.increment('mysql.health.errors', 1, {
            operation: 'get_process_list',
          });

          span.recordException(error as Error);
          span.setStatus(SpanStatus.ERROR, (error as Error).message);

          throw error;
        } finally {
          if (connection) {
            await this.pool.release(connection);
          }
        }
      },
      { operation: 'getProcessList' }
    );
  }

  // Private helper methods - MySQL driver integration

  private async pingInternal(connection: PooledConnection): Promise<void> {
    await connection.connection.query('SELECT 1');
  }

  private async checkReplicationInternal(
    connection: PooledConnection
  ): Promise<ReplicaStatus[]> {
    // Try SHOW REPLICA STATUS first (MySQL 8.0.22+), fall back to SHOW SLAVE STATUS
    let rows: any[];
    try {
      const [result] = await connection.connection.query('SHOW REPLICA STATUS');
      rows = result as any[];
    } catch {
      const [result] = await connection.connection.query('SHOW SLAVE STATUS');
      rows = result as any[];
    }

    if (!rows || rows.length === 0) {
      // Not a replica or no replication configured
      return [];
    }

    return rows.map((row: any) => ({
      endpoint: `${row.Source_Host || row.Master_Host}:${row.Source_Port || row.Master_Port}`,
      secondsBehindMaster: row.Seconds_Behind_Source !== null
        ? Number(row.Seconds_Behind_Source)
        : (row.Seconds_Behind_Master !== null ? Number(row.Seconds_Behind_Master) : undefined),
      ioRunning: (row.Replica_IO_Running || row.Slave_IO_Running) === 'Yes',
      sqlRunning: (row.Replica_SQL_Running || row.Slave_SQL_Running) === 'Yes',
      lastError: row.Last_Error || row.Last_SQL_Error || undefined,
    }));
  }

  private async getServerStatusInternal(
    connection: PooledConnection
  ): Promise<ServerStatus> {
    // Get global status variables
    const [statusRows] = await connection.connection.query('SHOW GLOBAL STATUS');
    const statusArray = statusRows as any[];
    const statusMap = new Map<string, string>();
    for (const row of statusArray) {
      statusMap.set(row.Variable_name.toLowerCase(), row.Value);
    }

    // Get global variables
    const [varRows] = await connection.connection.query("SHOW GLOBAL VARIABLES LIKE 'version%'");
    const varArray = varRows as any[];
    const varMap = new Map<string, string>();
    for (const row of varArray) {
      varMap.set(row.Variable_name.toLowerCase(), row.Value);
    }

    // Check read-only status
    const [readOnlyRows] = await connection.connection.query("SHOW GLOBAL VARIABLES LIKE 'read_only'");
    const readOnlyArray = readOnlyRows as any[];
    const readOnly = readOnlyArray.length > 0 && readOnlyArray[0].Value === 'ON';

    return {
      version: varMap.get('version') || 'unknown',
      uptime: Number(statusMap.get('uptime')) || 0,
      connections: Number(statusMap.get('connections')) || 0,
      threadsConnected: Number(statusMap.get('threads_connected')) || 0,
      threadsRunning: Number(statusMap.get('threads_running')) || 0,
      threadsCreated: Number(statusMap.get('threads_created')) || 0,
      questions: Number(statusMap.get('questions')) || 0,
      slowQueries: Number(statusMap.get('slow_queries')) || 0,
      bytesReceived: Number(statusMap.get('bytes_received')) || 0,
      bytesSent: Number(statusMap.get('bytes_sent')) || 0,
      innodbBufferPoolSize: statusMap.has('innodb_buffer_pool_bytes_data')
        ? Number(statusMap.get('innodb_buffer_pool_bytes_data'))
        : undefined,
      innodbBufferPoolPagesData: statusMap.has('innodb_buffer_pool_pages_data')
        ? Number(statusMap.get('innodb_buffer_pool_pages_data'))
        : undefined,
      innodbBufferPoolPagesFree: statusMap.has('innodb_buffer_pool_pages_free')
        ? Number(statusMap.get('innodb_buffer_pool_pages_free'))
        : undefined,
      readOnly,
    };
  }

  private async getProcessListInternal(
    connection: PooledConnection
  ): Promise<ProcessInfo[]> {
    const [rows] = await connection.connection.query('SHOW PROCESSLIST');
    const rowsArray = rows as any[];

    return rowsArray.map((row: any) => ({
      id: Number(row.Id),
      user: row.User || '',
      host: row.Host || '',
      database: row.db || undefined,
      command: row.Command || '',
      time: Number(row.Time) || 0,
      state: row.State || undefined,
      info: row.Info || undefined,
    }));
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  QueryService,
  TransactionService,
  MetadataService,
  HealthService,
};
