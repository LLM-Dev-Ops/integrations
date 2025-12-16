/**
 * SQL Execution Client for Databricks SQL Warehouse
 *
 * Provides SQL statement execution with:
 * - Statement execution and polling
 * - Result pagination and streaming
 * - Query building with time travel
 * - Timeout handling and cancellation
 * - Metrics and tracing
 *
 * @module @llmdevops/databricks-delta-lake-integration/sql
 */

import { HttpExecutor } from '../http/index.js';
import {
  StatementResult,
  StatementState,
  ColumnInfo,
  Row,
  Duration,
  toMilliseconds,
} from '../types/index.js';
import {
  SqlError,
  StatementFailed,
  StatementCanceled,
  WarehouseNotRunning,
} from '../errors/index.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * SQL statement execution request
 */
interface ExecuteStatementRequest {
  warehouse_id: string;
  statement: string;
  wait_timeout?: string;
  on_wait_timeout?: 'CONTINUE' | 'CANCEL';
  disposition?: 'INLINE' | 'EXTERNAL_LINKS';
  format?: 'JSON_ARRAY' | 'ARROW_STREAM';
  byte_limit?: number;
  catalog?: string;
  schema?: string;
  parameters?: Array<{ name: string; value: string; type?: string }>;
}

/**
 * SQL statement execution response
 */
interface ExecuteStatementResponse {
  statement_id: string;
  status: {
    state: StatementState;
    error?: {
      error_code?: string;
      message: string;
    };
  };
  manifest?: {
    format: string;
    schema: {
      column_count: number;
      columns: Array<{
        name: string;
        type_name: string;
        type_text: string;
        position: number;
      }>;
    };
    total_row_count?: number;
    total_chunk_count?: number;
    truncated?: boolean;
  };
  result?: {
    data_array?: Array<Array<unknown>>;
    chunk_index?: number;
    row_offset?: number;
    row_count?: number;
    next_chunk_index?: number;
    next_chunk_internal_link?: string;
  };
}

/**
 * Statement status response
 */
interface GetStatementResponse {
  statement_id: string;
  status: {
    state: StatementState;
    error?: {
      error_code?: string;
      message: string;
    };
  };
  manifest?: ExecuteStatementResponse['manifest'];
  result?: ExecuteStatementResponse['result'];
}

/**
 * Chunk response
 */
interface ChunkResponse {
  data_array?: Array<Array<unknown>>;
  next_chunk_index?: number;
  next_chunk_internal_link?: string;
  row_count?: number;
  row_offset?: number;
}

// ============================================================================
// Metrics and Tracing
// ============================================================================

/**
 * Simple metrics collector interface
 */
interface MetricsCollector {
  incrementCounter(name: string, labels?: Record<string, string>): void;
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
}

/**
 * Simple tracer interface
 */
interface Tracer {
  startSpan(name: string, attributes?: Record<string, string>): Span;
}

/**
 * Span interface
 */
interface Span {
  end(): void;
  setError(error: Error): void;
}

/**
 * No-op metrics collector
 */
class NoopMetrics implements MetricsCollector {
  incrementCounter(_name: string, _labels?: Record<string, string>): void {}
  recordHistogram(_name: string, _value: number, _labels?: Record<string, string>): void {}
}

/**
 * No-op tracer
 */
class NoopTracer implements Tracer {
  startSpan(_name: string, _attributes?: Record<string, string>): Span {
    return {
      end: () => {},
      setError: (_error: Error) => {},
    };
  }
}

// ============================================================================
// Semaphore for Concurrency Control
// ============================================================================

/**
 * Semaphore for controlling concurrent chunk fetches
 */
class Semaphore {
  private permits: number;
  private readonly maxPermits: number;
  private readonly waitQueue: Array<() => void> = [];

  constructor(maxPermits: number) {
    this.maxPermits = maxPermits;
    this.permits = maxPermits;
  }

  /**
   * Acquire a permit (blocks if none available)
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    // Wait for a permit to be released
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  /**
   * Release a permit
   */
  release(): void {
    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift()!;
      resolve();
    } else {
      this.permits = Math.min(this.permits + 1, this.maxPermits);
    }
  }

  /**
   * Execute with permit (auto-release)
   */
  async withPermit<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// ============================================================================
// Query Builder
// ============================================================================

/**
 * Fluent query builder for SQL with time travel support
 */
export class QueryBuilder {
  private sql: string = '';
  private params: Record<string, unknown> = {};

  /**
   * Create a new query builder
   */
  static create(): QueryBuilder {
    return new QueryBuilder();
  }

  /**
   * Set SELECT clause
   */
  select(columns: string[]): this {
    this.sql = `SELECT ${columns.join(', ')}`;
    return this;
  }

  /**
   * Set FROM clause
   */
  fromTable(table: string): this {
    this.sql = `${this.sql} FROM ${table}`;
    return this;
  }

  /**
   * Add WHERE clause
   */
  whereClause(condition: string): this {
    this.sql = `${this.sql} WHERE ${condition}`;
    return this;
  }

  /**
   * Add parameter
   */
  withParameter(name: string, value: unknown): this {
    this.params[name] = value;
    return this;
  }

  /**
   * Add VERSION AS OF clause for time travel
   */
  versionAsOf(version: number): this {
    this.sql = `${this.sql} VERSION AS OF ${version}`;
    return this;
  }

  /**
   * Add TIMESTAMP AS OF clause for time travel
   */
  timestampAsOf(timestamp: string): this {
    this.sql = `${this.sql} TIMESTAMP AS OF '${timestamp}'`;
    return this;
  }

  /**
   * Add LIMIT clause
   */
  limit(limit: number): this {
    this.sql = `${this.sql} LIMIT ${limit}`;
    return this;
  }

  /**
   * Add ORDER BY clause
   */
  orderBy(columns: string[]): this {
    this.sql = `${this.sql} ORDER BY ${columns.join(', ')}`;
    return this;
  }

  /**
   * Build the query and parameters
   */
  build(): [string, Record<string, unknown>] {
    return [this.sql, this.params];
  }

  /**
   * Get the SQL string
   */
  toSql(): string {
    return this.sql;
  }
}

// ============================================================================
// SQL Client
// ============================================================================

/**
 * SQL client configuration
 */
export interface SqlClientConfig {
  /** HTTP executor */
  httpExecutor: HttpExecutor;
  /** SQL warehouse ID */
  warehouseId: string;
  /** Default timeout for queries */
  defaultTimeout?: Duration;
  /** Default catalog */
  catalog?: string;
  /** Default schema */
  schema?: string;
  /** Metrics collector */
  metrics?: MetricsCollector;
  /** Tracer */
  tracer?: Tracer;
  /** Max concurrent chunk fetches */
  maxConcurrentChunks?: number;
}

/**
 * SQL client for Databricks SQL Warehouse
 *
 * Executes SQL statements with support for:
 * - Synchronous and asynchronous execution
 * - Result streaming with pagination
 * - Timeout handling and cancellation
 * - Metrics and tracing
 */
export class SqlClient {
  private readonly httpExecutor: HttpExecutor;
  private readonly warehouseId: string;
  private readonly defaultTimeoutMs: number;
  private readonly catalog?: string;
  private readonly schema?: string;
  private readonly metrics: MetricsCollector;
  private readonly tracer: Tracer;
  private readonly chunkSemaphore: Semaphore;

  constructor(config: SqlClientConfig) {
    this.httpExecutor = config.httpExecutor;
    this.warehouseId = config.warehouseId;
    this.defaultTimeoutMs = config.defaultTimeout
      ? toMilliseconds(config.defaultTimeout)
      : 300000; // 5 minutes default
    this.catalog = config.catalog;
    this.schema = config.schema;
    this.metrics = config.metrics || new NoopMetrics();
    this.tracer = config.tracer || new NoopTracer();
    this.chunkSemaphore = new Semaphore(config.maxConcurrentChunks || 3);
  }

  /**
   * Execute a SQL statement and wait for completion
   *
   * @param sql - SQL statement to execute
   * @returns Statement result with schema and rows
   */
  async execute(sql: string): Promise<StatementResult> {
    return this.executeWithTimeout(sql, {
      value: this.defaultTimeoutMs,
      unit: 'ms',
    });
  }

  /**
   * Execute a SQL statement with custom timeout
   *
   * Per refinement: Submit with wait_timeout: "0s", then poll until complete
   *
   * @param sql - SQL statement to execute
   * @param timeout - Execution timeout
   * @returns Statement result with schema and rows
   */
  async executeWithTimeout(sql: string, timeout: Duration): Promise<StatementResult> {
    const span = this.tracer.startSpan('databricks.sql.execute', {
      warehouse_id: this.warehouseId,
      statement_hash: this.hashString(sql),
    });

    const startTime = Date.now();

    try {
      // Step 1: Submit statement with immediate return
      const request: ExecuteStatementRequest = {
        warehouse_id: this.warehouseId,
        statement: sql,
        wait_timeout: '0s', // Return immediately
        on_wait_timeout: 'CONTINUE',
        disposition: 'INLINE',
        format: 'JSON_ARRAY',
      };

      if (this.catalog) {
        request.catalog = this.catalog;
      }
      if (this.schema) {
        request.schema = this.schema;
      }

      const response = await this.httpExecutor.post<ExecuteStatementResponse>(
        '/sql/statements',
        request
      );

      this.metrics.incrementCounter('databricks_sql_queries_total', {
        warehouse_id: this.warehouseId,
      });

      // Step 2: Poll until complete or timeout
      const statementId = response.statement_id;
      const timeoutMs = toMilliseconds(timeout);
      const result = await this.pollStatementWithTimeout(statementId, timeoutMs, startTime);

      // Record metrics
      const durationSeconds = (Date.now() - startTime) / 1000;
      this.metrics.recordHistogram('databricks_sql_query_duration_seconds', durationSeconds, {
        warehouse_id: this.warehouseId,
      });
      this.metrics.recordHistogram('databricks_sql_rows_returned', result.rows.length, {
        warehouse_id: this.warehouseId,
      });

      span.end();
      return result;
    } catch (error) {
      span.setError(error as Error);
      throw error;
    }
  }

  /**
   * Execute a SQL statement and stream results
   *
   * @param sql - SQL statement to execute
   * @returns Async iterator of rows
   */
  async *executeStream<T = Row>(sql: string): AsyncIterableIterator<T> {
    const result = await this.execute(sql);

    // Yield initial rows
    for (const row of result.rows) {
      yield row as T;
    }

    // Fetch and yield remaining chunks in parallel
    if (result.chunkCount && result.chunkCount > 1) {
      const chunkIndices = Array.from(
        { length: result.chunkCount - 1 },
        (_, i) => i + 1
      );

      // Fetch chunks with concurrency control
      const chunkPromises = chunkIndices.map((chunkIndex) =>
        this.chunkSemaphore.withPermit(async () => {
          return {
            index: chunkIndex,
            rows: await this.fetchChunk(result.statementId, chunkIndex),
          };
        })
      );

      // Process chunks as they complete (not necessarily in order)
      for (const chunkPromise of chunkPromises) {
        const chunk = await chunkPromise;
        for (const row of chunk.rows) {
          yield row as T;
        }
      }
    }
  }

  /**
   * Poll statement until completion
   *
   * @param statementId - Statement ID to poll
   * @returns Statement result
   */
  async pollStatement(statementId: string): Promise<StatementResult> {
    return this.pollStatementWithTimeout(statementId, this.defaultTimeoutMs, Date.now());
  }

  /**
   * Poll statement with timeout
   */
  private async pollStatementWithTimeout(
    statementId: string,
    timeoutMs: number,
    startTime: number
  ): Promise<StatementResult> {
    const pollIntervalMs = 500; // 500ms between polls

    while (true) {
      // Check timeout
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        // Cancel the statement on timeout
        await this.cancel(statementId).catch(() => {
          // Ignore cancellation errors
        });
        throw new SqlError(
          `Statement execution timed out after ${timeoutMs}ms`,
          statementId
        );
      }

      // Get statement status
      const response = await this.httpExecutor.get<GetStatementResponse>(
        `/sql/statements/${statementId}`
      );

      const state = response.status.state;

      switch (state) {
        case 'SUCCEEDED':
          return this.parseResult(response);

        case 'FAILED':
          throw new StatementFailed(
            statementId,
            response.status.error?.message || 'Statement execution failed'
          );

        case 'CANCELED':
          throw new StatementCanceled(statementId);

        case 'PENDING':
        case 'RUNNING':
          // Continue polling
          await this.delay(pollIntervalMs);
          break;

        case 'CLOSED':
          throw new SqlError('Statement was closed', statementId);

        default:
          throw new SqlError(
            `Unknown statement state: ${state}`,
            statementId
          );
      }
    }
  }

  /**
   * Fetch a specific chunk of results
   *
   * @param statementId - Statement ID
   * @param chunkIndex - Chunk index (0-based)
   * @returns Chunk rows
   */
  async fetchChunk(statementId: string, chunkIndex: number): Promise<Row[]> {
    const span = this.tracer.startSpan('databricks.sql.fetch', {
      statement_id: statementId,
      chunk_index: chunkIndex.toString(),
    });

    try {
      const response = await this.httpExecutor.get<ChunkResponse>(
        `/sql/statements/${statementId}/result/chunks/${chunkIndex}`
      );

      const rows = response.data_array || [];

      span.end();

      // Record row count in span
      this.metrics.recordHistogram('databricks_sql_rows_returned', rows.length, {
        statement_id: statementId,
        chunk_index: chunkIndex.toString(),
      });

      return rows;
    } catch (error) {
      span.setError(error as Error);
      throw error;
    }
  }

  /**
   * Cancel a running statement
   *
   * @param statementId - Statement ID to cancel
   */
  async cancel(statementId: string): Promise<void> {
    await this.httpExecutor.post(`/sql/statements/${statementId}/cancel`);
  }

  /**
   * Parse statement execution response into result
   */
  private parseResult(response: GetStatementResponse | ExecuteStatementResponse): StatementResult {
    const manifest = response.manifest;
    const result = response.result;

    if (!manifest) {
      throw new SqlError('Missing manifest in statement response', response.statement_id);
    }

    // Parse schema
    const schema: ColumnInfo[] = manifest.schema.columns.map((col) => ({
      name: col.name,
      typeName: col.type_name,
      typeText: col.type_text,
      position: col.position,
    }));

    // Parse rows
    const rows: Row[] = result?.data_array || [];

    return {
      statementId: response.statement_id,
      schema,
      rows,
      totalRowCount: manifest.total_row_count,
      chunkCount: manifest.total_chunk_count,
      nextChunkIndex: result?.next_chunk_index,
      bytesProcessed: undefined, // Not available in response
      rowOffset: result?.row_offset,
    };
  }

  /**
   * Simple string hash for tracing
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a SQL client
 *
 * @param config - SQL client configuration
 * @returns SQL client instance
 */
export function createSqlClient(config: SqlClientConfig): SqlClient {
  return new SqlClient(config);
}

/**
 * Create a query builder
 *
 * @returns Query builder instance
 */
export function createQueryBuilder(): QueryBuilder {
  return QueryBuilder.create();
}

// ============================================================================
// Exports
// ============================================================================

export type {
  SqlClientConfig,
  MetricsCollector,
  Tracer,
  Span,
};
