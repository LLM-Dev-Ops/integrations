/**
 * Redshift Client Module
 *
 * Main client facade for the Redshift integration.
 * @module @llmdevops/redshift-integration/client
 */

import type {
  RedshiftConfig,
  PoolConfig,
  WlmConfig,
  CopyConfig,
  UnloadConfig,
  ObservabilityConfig,
  SimulationConfig,
} from '../config/index.js';
import {
  applyDefaults,
  validateConfig,
  configFromEnvironment,
  RedshiftConfigBuilder,
} from '../config/index.js';
import type {
  QueryResult,
  AsyncQueryStatus,
  AsyncQueryHandle,
  Row,
  ResultSet,
  HealthCheckResult,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  QueryHistoryEntry,
  CopyResult,
  UnloadResult,
  BulkInsertResult,
  ClusterStatus,
  RunningQuery,
  ExternalSchemaInfo,
  ExternalTableInfo,
  Transaction,
  TransactionOptions,
  QueryOptions,
} from '../types/index.js';
import { RedshiftError, RedshiftErrorCode, wrapError } from '../errors/index.js';
import { getMetrics, MetricsCollector } from '../metrics/index.js';
import { getAuditLogger, AuditLogger } from '../security/index.js';

// ============================================================================
// Client Options
// ============================================================================

/**
 * Options for creating a Redshift client.
 */
export interface RedshiftClientOptions {
  /** Full configuration */
  config?: RedshiftConfig;
  /** Use environment variables for configuration */
  useEnvironment?: boolean;
  /** Custom metrics collector */
  metrics?: MetricsCollector;
  /** Custom audit logger */
  auditLogger?: AuditLogger;
}

// ============================================================================
// Redshift Client
// ============================================================================

/**
 * Main Redshift client facade.
 *
 * Provides a unified interface to all Redshift operations including:
 * - Query execution (sync and async)
 * - Result streaming
 * - Data operations (COPY, UNLOAD, bulk insert)
 * - WLM operations
 * - Spectrum operations
 * - Metadata discovery
 *
 * @example
 * ```typescript
 * // Create client from environment
 * const client = await RedshiftClient.fromEnv();
 *
 * // Execute a query
 * const result = await client.execute('SELECT * FROM users WHERE active = ?', [true]);
 *
 * // Stream large results
 * const stream = await client.executeStream('SELECT * FROM large_table');
 * for await (const row of stream) {
 *   console.log(row.get('name'));
 * }
 *
 * // Run in a transaction
 * await client.runInTransaction(async (tx) => {
 *   await tx.execute('UPDATE accounts SET balance = balance - 100 WHERE id = ?', [1]);
 *   await tx.execute('UPDATE accounts SET balance = balance + 100 WHERE id = ?', [2]);
 * });
 *
 * // Close the client
 * await client.close();
 * ```
 */
export class RedshiftClient {
  private readonly config: RedshiftConfig;
  private readonly metrics: MetricsCollector;
  private readonly auditLogger: AuditLogger;
  private pool?: unknown; // ConnectionPool from pool module
  private initialized = false;
  private closed = false;

  /**
   * Creates a new Redshift client.
   * Use static factory methods instead of constructor directly.
   */
  private constructor(
    config: RedshiftConfig,
    metrics?: MetricsCollector,
    auditLogger?: AuditLogger
  ) {
    this.config = applyDefaults(config);
    validateConfig(this.config);
    this.metrics = metrics ?? getMetrics({
      prefix: this.config.observability?.metricsPrefix ?? 'redshift',
      enabled: this.config.observability?.enableMetrics ?? true,
    });
    this.auditLogger = auditLogger ?? getAuditLogger({
      enabled: true,
      redactSql: !this.config.observability?.logQueries,
    });
  }

  // ============================================================================
  // Factory Methods
  // ============================================================================

  /**
   * Creates a client from a configuration object.
   *
   * @param config - Redshift configuration
   * @returns A new Redshift client instance
   *
   * @example
   * ```typescript
   * const config: RedshiftConfig = {
   *   endpoint: {
   *     host: 'my-cluster.abc123.us-west-2.redshift.amazonaws.com',
   *     database: 'mydb',
   *     port: 5439,
   *   },
   *   credentials: {
   *     type: 'database',
   *     username: 'admin',
   *     password: 'mypassword',
   *   },
   * };
   * const client = await RedshiftClient.create(config);
   * ```
   */
  static async create(config: RedshiftConfig): Promise<RedshiftClient> {
    const client = new RedshiftClient(config);
    await client.initialize();
    return client;
  }

  /**
   * Creates a client from environment variables.
   *
   * Environment variables used:
   * - REDSHIFT_HOST: Cluster hostname (required)
   * - REDSHIFT_PORT: Port number (default: 5439)
   * - REDSHIFT_DATABASE: Database name (required)
   * - REDSHIFT_USER: Database username
   * - REDSHIFT_PASSWORD: Database password
   * - See configFromEnvironment() for complete list
   *
   * @returns A new Redshift client instance
   *
   * @example
   * ```typescript
   * // Set environment variables first
   * process.env.REDSHIFT_HOST = 'my-cluster.abc123.us-west-2.redshift.amazonaws.com';
   * process.env.REDSHIFT_DATABASE = 'mydb';
   * process.env.REDSHIFT_USER = 'admin';
   * process.env.REDSHIFT_PASSWORD = 'mypassword';
   *
   * const client = await RedshiftClient.fromEnv();
   * ```
   */
  static async fromEnv(): Promise<RedshiftClient> {
    const config = configFromEnvironment();
    return RedshiftClient.create(config);
  }

  /**
   * Creates a builder for fluent configuration.
   *
   * @returns A new configuration builder
   *
   * @example
   * ```typescript
   * const client = await RedshiftClient.builder()
   *   .endpoint('my-cluster.abc123.us-west-2.redshift.amazonaws.com', 'mydb')
   *   .withDatabaseAuth('admin', 'mypassword')
   *   .poolSize(5, 20)
   *   .queryTimeout(60000)
   *   .build();
   * ```
   */
  static builder(): RedshiftConfigBuilder {
    return new RedshiftConfigBuilder();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initializes the client (connection pool, auth provider, etc.).
   */
  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const startTime = Date.now();

    try {
      // Initialize auth provider
      // Auth provider initialization would happen here with actual implementation

      // Initialize connection pool
      // Pool initialization would happen here with actual Redshift driver
      // this.pool = new ConnectionPool(this.config, this.authProvider);
      // await this.pool.initialize();

      this.initialized = true;
      this.metrics.incrementCounter('connections_total', { status: 'success' });
      this.metrics.recordDuration('connection_init_duration_seconds', startTime);

      await this.auditLogger.logConnectionOpened('client-init');
    } catch (error) {
      this.metrics.incrementCounter('connections_total', { status: 'failed' });
      this.metrics.recordDuration('connection_init_duration_seconds', startTime);

      throw new RedshiftError(
        'Failed to initialize Redshift client',
        RedshiftErrorCode.CONNECTION_FAILED,
        {
          cause: error instanceof Error ? error : undefined,
          retryable: true,
        }
      );
    }
  }

  /**
   * Ensures the client is initialized and not closed.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new RedshiftError(
        'Client not initialized',
        RedshiftErrorCode.CONNECTION_FAILED,
        { retryable: false }
      );
    }
    if (this.closed) {
      throw new RedshiftError(
        'Client is closed',
        RedshiftErrorCode.CONNECTION_LOST,
        { retryable: false }
      );
    }
  }

  // ============================================================================
  // Query Execution
  // ============================================================================

  /**
   * Executes a SQL query synchronously.
   *
   * @param sql - SQL query to execute
   * @param params - Optional query parameters (uses positional binding)
   * @param options - Optional query options
   * @returns Query result with rows and metadata
   *
   * @example
   * ```typescript
   * // Simple query
   * const result = await client.execute('SELECT * FROM users');
   * console.log(`Found ${result.resultSet.rowCount} users`);
   *
   * // Parameterized query
   * const result = await client.execute(
   *   'SELECT * FROM users WHERE active = ? AND age > ?',
   *   [true, 18]
   * );
   *
   * // With options
   * const result = await client.execute(
   *   'SELECT * FROM large_table',
   *   [],
   *   { timeoutMs: 60000, tag: 'analytics-query' }
   * );
   * ```
   */
  async execute(
    sql: string,
    params?: unknown[],
    options?: QueryOptions
  ): Promise<QueryResult> {
    this.ensureInitialized();
    const startTime = Date.now();

    try {
      // Placeholder for actual query execution
      // Would use the QueryExecutor from query module
      throw new Error('Not implemented - requires actual Redshift connection');
    } catch (error) {
      this.metrics.incrementCounter('queries_total', {
        status: 'failed',
      });
      await this.auditLogger.logQueryFailed({
        sqlText: sql,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      });
      throw wrapError(error, 'Query execution failed');
    }
  }

  /**
   * Executes a SQL query and returns the first row.
   *
   * @param sql - SQL query to execute
   * @param params - Optional query parameters
   * @returns First row or null if no results
   *
   * @example
   * ```typescript
   * const user = await client.executeOne(
   *   'SELECT * FROM users WHERE id = ?',
   *   [123]
   * );
   * if (user) {
   *   console.log(user.get('name'));
   * }
   * ```
   */
  async executeOne(sql: string, params?: unknown[]): Promise<Row | null> {
    const result = await this.execute(sql, params);
    return result.resultSet.rows[0] ?? null;
  }

  /**
   * Executes a SQL query and returns all rows.
   *
   * @param sql - SQL query to execute
   * @param params - Optional query parameters
   * @returns Array of rows
   *
   * @example
   * ```typescript
   * const users = await client.executeMany('SELECT * FROM users WHERE active = ?', [true]);
   * for (const user of users) {
   *   console.log(user.get('name'));
   * }
   * ```
   */
  async executeMany(sql: string, params?: unknown[]): Promise<Row[]> {
    const result = await this.execute(sql, params);
    return result.resultSet.rows;
  }

  /**
   * Executes a SQL query and streams results.
   * Use this for large result sets to avoid loading everything into memory.
   *
   * @param sql - SQL query to execute
   * @param params - Optional query parameters
   * @param options - Optional query options
   * @returns Async iterable of rows
   *
   * @example
   * ```typescript
   * const stream = client.executeStream('SELECT * FROM large_table');
   * for await (const row of stream) {
   *   console.log(row.get('id'));
   *   // Process one row at a time
   * }
   * ```
   */
  async *executeStream(
    sql: string,
    params?: unknown[],
    options?: QueryOptions
  ): AsyncIterable<Row> {
    this.ensureInitialized();

    try {
      // Placeholder for actual streaming query execution
      // Would use the StreamingQueryExecutor from query module
      throw new Error('Not implemented - requires actual Redshift connection');
    } catch (error) {
      throw wrapError(error, 'Query streaming failed');
    }
  }

  // ============================================================================
  // Async Query Methods
  // ============================================================================

  /**
   * Executes a SQL query asynchronously.
   * Returns a handle that can be polled for status and results.
   *
   * @param sql - SQL query to execute
   * @param params - Optional query parameters
   * @param options - Optional query options
   * @returns Async query handle with query ID
   *
   * @example
   * ```typescript
   * // Submit async query
   * const handle = await client.executeAsync('SELECT * FROM large_table');
   * console.log(`Query ID: ${handle.queryId}`);
   *
   * // Poll for status
   * let status = await client.getQueryStatus(handle.queryId);
   * while (status.status.status === 'running') {
   *   await new Promise(resolve => setTimeout(resolve, 1000));
   *   status = await client.getQueryStatus(handle.queryId);
   * }
   *
   * // Get results
   * if (status.status.status === 'success') {
   *   const result = await client.getQueryResult(handle.queryId);
   *   console.log(`Rows: ${result.resultSet.rowCount}`);
   * }
   * ```
   */
  async executeAsync(
    sql: string,
    params?: unknown[],
    options?: QueryOptions
  ): Promise<AsyncQueryHandle> {
    this.ensureInitialized();

    try {
      // Placeholder for actual async query execution
      throw new Error('Not implemented - requires actual Redshift connection');
    } catch (error) {
      throw wrapError(error, 'Async query submission failed');
    }
  }

  /**
   * Gets the status of an async query.
   *
   * @param queryId - Query ID to check
   * @returns Query status with progress information
   *
   * @example
   * ```typescript
   * const status = await client.getQueryStatus('01234567-89ab-cdef-0123-456789abcdef');
   * if (status.status.status === 'running') {
   *   console.log(`Progress: ${status.status.progress ?? 0}%`);
   * }
   * ```
   */
  async getQueryStatus(queryId: string): Promise<AsyncQueryStatus> {
    this.ensureInitialized();

    try {
      // Placeholder for actual status check
      throw new Error('Not implemented - requires actual Redshift connection');
    } catch (error) {
      throw wrapError(error, 'Failed to get query status');
    }
  }

  /**
   * Gets the result of a completed async query.
   *
   * @param queryId - Query ID to retrieve results for
   * @returns Query result
   *
   * @example
   * ```typescript
   * const result = await client.getQueryResult('01234567-89ab-cdef-0123-456789abcdef');
   * console.log(`Returned ${result.resultSet.rowCount} rows`);
   * ```
   */
  async getQueryResult(queryId: string): Promise<QueryResult> {
    this.ensureInitialized();

    try {
      // Placeholder for actual result retrieval
      throw new Error('Not implemented - requires actual Redshift connection');
    } catch (error) {
      throw wrapError(error, 'Failed to get query result');
    }
  }

  /**
   * Cancels a running query.
   *
   * @param queryId - Query ID to cancel
   *
   * @example
   * ```typescript
   * await client.cancelQuery('01234567-89ab-cdef-0123-456789abcdef');
   * console.log('Query cancelled');
   * ```
   */
  async cancelQuery(queryId: string): Promise<void> {
    this.ensureInitialized();

    try {
      // Placeholder for actual query cancellation
      throw new Error('Not implemented - requires actual Redshift connection');
    } catch (error) {
      throw wrapError(error, 'Failed to cancel query');
    }
  }

  // ============================================================================
  // Transaction Methods
  // ============================================================================

  /**
   * Begins a new transaction.
   *
   * @param options - Optional transaction options
   * @returns Transaction object
   *
   * @example
   * ```typescript
   * const tx = await client.beginTransaction();
   * try {
   *   await tx.execute('UPDATE accounts SET balance = balance - 100 WHERE id = ?', [1]);
   *   await tx.execute('UPDATE accounts SET balance = balance + 100 WHERE id = ?', [2]);
   *   await tx.commit();
   * } catch (error) {
   *   await tx.rollback();
   *   throw error;
   * }
   * ```
   */
  async beginTransaction(options?: TransactionOptions): Promise<Transaction> {
    this.ensureInitialized();

    try {
      // Placeholder for actual transaction creation
      throw new Error('Not implemented - requires actual Redshift connection');
    } catch (error) {
      throw wrapError(error, 'Failed to begin transaction');
    }
  }

  /**
   * Runs a function within a transaction.
   * Automatically commits on success or rolls back on error.
   *
   * @param fn - Function to run in transaction
   * @param options - Optional transaction options
   * @returns Result of the function
   *
   * @example
   * ```typescript
   * await client.runInTransaction(async (tx) => {
   *   await tx.execute('UPDATE accounts SET balance = balance - 100 WHERE id = ?', [1]);
   *   await tx.execute('UPDATE accounts SET balance = balance + 100 WHERE id = ?', [2]);
   * });
   * ```
   */
  async runInTransaction<T>(
    fn: (tx: Transaction) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T> {
    const tx = await this.beginTransaction(options);
    try {
      const result = await fn(tx);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  // ============================================================================
  // Health Check
  // ============================================================================

  /**
   * Performs a health check on the Redshift connection.
   *
   * @returns Health check result with connectivity and latency information
   *
   * @example
   * ```typescript
   * const health = await client.healthCheck();
   * if (health.healthy) {
   *   console.log(`Redshift is healthy (latency: ${health.latencyMs}ms)`);
   * } else {
   *   console.error(`Redshift is unhealthy: ${health.error}`);
   * }
   * ```
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      if (!this.initialized || this.closed) {
        return {
          healthy: false,
          redshiftReachable: false,
          latencyMs: 0,
          error: 'Client not initialized or closed',
        };
      }

      // Execute simple query to check connectivity
      await this.execute('SELECT 1');

      return {
        healthy: true,
        redshiftReachable: true,
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        redshiftReachable: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ============================================================================
  // Metadata Operations
  // ============================================================================

  /**
   * Lists schemas in the current database.
   *
   * @returns Array of schema information
   *
   * @example
   * ```typescript
   * const schemas = await client.listSchemas();
   * for (const schema of schemas) {
   *   console.log(schema.name);
   * }
   * ```
   */
  async listSchemas(): Promise<SchemaInfo[]> {
    this.ensureInitialized();
    // Would use SchemaDiscoveryService
    throw new Error('Not implemented');
  }

  /**
   * Lists tables in a schema.
   *
   * @param schema - Schema name (or database.schema)
   * @returns Array of table information
   *
   * @example
   * ```typescript
   * const tables = await client.listTables('public');
   * for (const table of tables) {
   *   console.log(`${table.name} - ${table.rowCount ?? 0} rows`);
   * }
   * ```
   */
  async listTables(schema: string): Promise<TableInfo[]> {
    this.ensureInitialized();
    throw new Error('Not implemented');
  }

  /**
   * Describes a table's columns.
   *
   * @param schema - Schema name
   * @param table - Table name
   * @returns Array of column information
   *
   * @example
   * ```typescript
   * const columns = await client.describeTable('public', 'users');
   * for (const col of columns) {
   *   console.log(`${col.name}: ${col.dataType} ${col.isNullable ? 'NULL' : 'NOT NULL'}`);
   * }
   * ```
   */
  async describeTable(schema: string, table: string): Promise<ColumnInfo[]> {
    this.ensureInitialized();
    throw new Error('Not implemented');
  }

  /**
   * Gets query history for a time period.
   *
   * @param startTime - Start of time range
   * @param endTime - End of time range
   * @param options - Optional filtering options
   * @returns Array of query history entries
   *
   * @example
   * ```typescript
   * const start = new Date(Date.now() - 3600000); // 1 hour ago
   * const end = new Date();
   * const history = await client.getQueryHistory(start, end, { limit: 100 });
   * for (const entry of history) {
   *   console.log(`${entry.queryId}: ${entry.executionTimeMs}ms`);
   * }
   * ```
   */
  async getQueryHistory(
    startTime: Date,
    endTime: Date,
    options?: {
      user?: string;
      limit?: number;
    }
  ): Promise<QueryHistoryEntry[]> {
    this.ensureInitialized();
    throw new Error('Not implemented');
  }

  // ============================================================================
  // Data Operations
  // ============================================================================

  /**
   * Loads data from S3 using COPY command.
   *
   * @param table - Target table name (schema.table or table)
   * @param s3Path - S3 path to data files (s3://bucket/prefix)
   * @param options - COPY options including format, credentials, etc.
   * @returns COPY result with rows loaded and any errors
   *
   * @example
   * ```typescript
   * const result = await client.copyFromS3(
   *   'public.users',
   *   's3://my-bucket/data/users/',
   *   {
   *     format: 'CSV',
   *     delimiter: ',',
   *     ignoreHeader: 1,
   *     iamRole: 'arn:aws:iam::123456789012:role/RedshiftCopyRole',
   *   }
   * );
   * console.log(`Loaded ${result.rowsLoaded} rows`);
   * ```
   */
  async copyFromS3(
    table: string,
    s3Path: string,
    options: {
      format?: string;
      delimiter?: string;
      ignoreHeader?: number;
      iamRole?: string;
      compression?: string;
      maxErrors?: number;
    }
  ): Promise<CopyResult> {
    this.ensureInitialized();
    throw new Error('Not implemented');
  }

  /**
   * Unloads query results to S3 using UNLOAD command.
   *
   * @param query - SQL query to execute
   * @param s3Path - S3 path for output files (s3://bucket/prefix)
   * @param options - UNLOAD options including format, credentials, etc.
   * @returns UNLOAD result with file count and rows unloaded
   *
   * @example
   * ```typescript
   * const result = await client.unloadToS3(
   *   'SELECT * FROM users WHERE created_at > DATEADD(day, -7, GETDATE())',
   *   's3://my-bucket/exports/users/',
   *   {
   *     format: 'PARQUET',
   *     iamRole: 'arn:aws:iam::123456789012:role/RedshiftUnloadRole',
   *     parallel: true,
   *   }
   * );
   * console.log(`Unloaded ${result.rowsUnloaded} rows to ${result.fileCount} files`);
   * ```
   */
  async unloadToS3(
    query: string,
    s3Path: string,
    options: {
      format?: string;
      iamRole?: string;
      parallel?: boolean;
      maxFileSize?: number;
      compression?: string;
    }
  ): Promise<UnloadResult> {
    this.ensureInitialized();
    throw new Error('Not implemented');
  }

  /**
   * Performs a bulk insert of records.
   *
   * @param table - Target table name
   * @param rows - Array of records to insert
   * @param options - Bulk insert options
   * @returns Bulk insert result with rows inserted
   *
   * @example
   * ```typescript
   * const users = [
   *   { name: 'Alice', email: 'alice@example.com', age: 30 },
   *   { name: 'Bob', email: 'bob@example.com', age: 25 },
   * ];
   * const result = await client.bulkInsert('users', users, { batchSize: 1000 });
   * console.log(`Inserted ${result.rowsInserted} rows`);
   * ```
   */
  async bulkInsert<T extends Record<string, unknown>>(
    table: string,
    rows: T[],
    options?: {
      batchSize?: number;
      onError?: 'CONTINUE' | 'ABORT';
    }
  ): Promise<BulkInsertResult> {
    this.ensureInitialized();
    throw new Error('Not implemented');
  }

  // ============================================================================
  // WLM Operations
  // ============================================================================

  /**
   * Sets the query group for the current session.
   * Used for workload management (WLM) queue routing.
   *
   * @param queryGroup - Query group name
   *
   * @example
   * ```typescript
   * await client.setQueryGroup('analytics');
   * // Subsequent queries will use the analytics queue
   * ```
   */
  async setQueryGroup(queryGroup: string): Promise<void> {
    this.ensureInitialized();
    await this.execute(`SET query_group TO '${queryGroup}'`);
  }

  /**
   * Gets the current cluster status.
   *
   * @returns Cluster status information
   *
   * @example
   * ```typescript
   * const status = await client.getClusterStatus();
   * console.log(`Cluster: ${status.clusterIdentifier}`);
   * console.log(`Status: ${status.clusterStatus}`);
   * console.log(`Node count: ${status.numberOfNodes}`);
   * ```
   */
  async getClusterStatus(): Promise<ClusterStatus> {
    this.ensureInitialized();
    throw new Error('Not implemented');
  }

  /**
   * Gets currently running queries.
   *
   * @returns Array of running query information
   *
   * @example
   * ```typescript
   * const queries = await client.getRunningQueries();
   * for (const q of queries) {
   *   console.log(`Query ${q.queryId}: ${q.query.substring(0, 50)}...`);
   *   console.log(`  Duration: ${q.durationMs}ms, Queue: ${q.queue}`);
   * }
   * ```
   */
  async getRunningQueries(): Promise<RunningQuery[]> {
    this.ensureInitialized();
    throw new Error('Not implemented');
  }

  // ============================================================================
  // Spectrum Operations
  // ============================================================================

  /**
   * Lists external schemas (Spectrum schemas).
   *
   * @returns Array of external schema information
   *
   * @example
   * ```typescript
   * const schemas = await client.listExternalSchemas();
   * for (const schema of schemas) {
   *   console.log(`${schema.name}: ${schema.databaseName}`);
   * }
   * ```
   */
  async listExternalSchemas(): Promise<ExternalSchemaInfo[]> {
    this.ensureInitialized();
    throw new Error('Not implemented');
  }

  /**
   * Lists external tables in a Spectrum schema.
   *
   * @param schema - External schema name
   * @returns Array of external table information
   *
   * @example
   * ```typescript
   * const tables = await client.listExternalTables('spectrum_schema');
   * for (const table of tables) {
   *   console.log(`${table.name}: ${table.location}`);
   * }
   * ```
   */
  async listExternalTables(schema: string): Promise<ExternalTableInfo[]> {
    this.ensureInitialized();
    throw new Error('Not implemented');
  }

  // ============================================================================
  // Configuration Access
  // ============================================================================

  /**
   * Gets the current configuration (read-only).
   *
   * @returns The client configuration
   *
   * @example
   * ```typescript
   * const config = client.getConfig();
   * console.log(`Host: ${config.endpoint.host}`);
   * console.log(`Database: ${config.endpoint.database}`);
   * ```
   */
  getConfig(): Readonly<RedshiftConfig> {
    return this.config;
  }

  /**
   * Gets the metrics collector.
   *
   * @returns The metrics collector instance
   *
   * @example
   * ```typescript
   * const metrics = client.getMetrics();
   * console.log(metrics.getMetrics()); // Prometheus format
   * ```
   */
  getMetrics(): MetricsCollector {
    return this.metrics;
  }

  /**
   * Gets the audit logger.
   *
   * @returns The audit logger instance
   *
   * @example
   * ```typescript
   * const logger = client.getAuditLogger();
   * const events = logger.getEvents({ type: 'query_executed', limit: 10 });
   * ```
   */
  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Closes the client and releases all resources.
   * All connections in the pool will be closed.
   *
   * @example
   * ```typescript
   * await client.close();
   * console.log('Client closed');
   * ```
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    try {
      // Close connection pool
      // if (this.pool) {
      //   await this.pool.close();
      // }

      await this.auditLogger.logConnectionClosed('client-close');
      this.closed = true;
    } catch (error) {
      throw wrapError(error, 'Failed to close client');
    }
  }

  /**
   * Checks if the client is closed.
   *
   * @returns True if the client is closed
   *
   * @example
   * ```typescript
   * if (client.isClosed()) {
   *   console.log('Client is closed, cannot execute queries');
   * }
   * ```
   */
  isClosed(): boolean {
    return this.closed;
  }
}

// ============================================================================
// Exports
// ============================================================================

export { RedshiftConfigBuilder };
