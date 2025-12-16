/**
 * SQL Server stored procedure execution following SPARC specification.
 *
 * Provides stored procedure execution with input/output parameters, return values,
 * and table-valued parameters (TVP).
 *
 * @module operations/procedure
 */

import * as mssql from 'mssql';
import {
  SqlServerError,
  SqlServerErrorCode,
  ExecutionError,
  QueryTimeoutError,
  parseSqlServerError,
} from '../errors/index.js';
import type { Observability, SpanContext } from '../observability/index.js';
import { MetricNames } from '../observability/index.js';
import { PooledConnection } from '../pool/index.js';

// ============================================================================
// Procedure Types
// ============================================================================

/**
 * Stored procedure call definition.
 */
export interface ProcedureCall {
  /** Procedure name (including schema, e.g., 'dbo.GetUser') */
  name: string;
  /** Input parameters as key-value pairs */
  params?: Record<string, unknown>;
  /** Output parameter definitions */
  outputParams?: Record<string, { type: mssql.ISqlType }>;
}

/**
 * Stored procedure execution result.
 *
 * @template T - Row type for result sets
 */
export interface ProcedureResult<T = Record<string, unknown>> {
  /** Result set rows from the procedure */
  rows: T[];
  /** Output parameter values */
  output: Record<string, unknown>;
  /** Return value from the procedure (RETURN statement) */
  returnValue: number;
  /** Number of rows affected by each statement */
  rowsAffected: number[];
}

/**
 * Procedure execution options.
 */
export interface ProcedureOptions {
  /** Query timeout in milliseconds */
  timeout?: number;
}

// ============================================================================
// Table-Valued Parameter (TVP) Builder
// ============================================================================

/**
 * Builder for constructing Table-Valued Parameters (TVP).
 *
 * TVPs allow passing structured data (tables) to stored procedures,
 * which is more efficient than passing individual rows.
 *
 * @example
 * ```typescript
 * const tvp = new TvpBuilder('dbo.UserTableType')
 *   .addColumn('id', mssql.Int)
 *   .addColumn('name', mssql.NVarChar(100))
 *   .addRow([1, 'Alice'])
 *   .addRow([2, 'Bob'])
 *   .build();
 *
 * await executor.execute({
 *   name: 'dbo.InsertUsers',
 *   params: { users: tvp }
 * });
 * ```
 */
export class TvpBuilder {
  private readonly typeName: string;
  private readonly columns: Array<{ name: string; type: mssql.ISqlType }> = [];
  private readonly rows: unknown[][] = [];

  /**
   * Creates a new TVP builder.
   *
   * @param typeName - SQL Server table type name (e.g., 'dbo.UserTableType')
   */
  constructor(typeName: string) {
    this.typeName = typeName;
  }

  /**
   * Adds a column to the table structure.
   *
   * @param name - Column name
   * @param type - SQL Server data type
   * @returns This builder for chaining
   */
  addColumn(name: string, type: mssql.ISqlType): this {
    this.columns.push({ name, type });
    return this;
  }

  /**
   * Adds a row of data.
   *
   * Values must match the order of columns added via addColumn().
   *
   * @param values - Row values in column order
   * @returns This builder for chaining
   * @throws {SqlServerError} If value count doesn't match column count
   */
  addRow(values: unknown[]): this {
    if (values.length !== this.columns.length) {
      throw new SqlServerError({
        code: SqlServerErrorCode.ParamCountMismatch,
        message: `Row value count (${values.length}) does not match column count (${this.columns.length})`,
        retryable: false,
        details: {
          expectedColumns: this.columns.length,
          providedValues: values.length,
        },
      });
    }
    this.rows.push([...values]);
    return this;
  }

  /**
   * Builds the mssql.Table instance.
   *
   * @returns mssql.Table ready to use as a parameter
   * @throws {SqlServerError} If no columns have been defined
   */
  build(): mssql.Table {
    if (this.columns.length === 0) {
      throw new SqlServerError({
        code: SqlServerErrorCode.ConfigurationError,
        message: 'Cannot build TVP: no columns defined',
        retryable: false,
      });
    }

    const table = new mssql.Table(this.typeName);

    // Add columns
    for (const col of this.columns) {
      table.columns.add(col.name, col.type);
    }

    // Add rows
    for (const rowValues of this.rows) {
      table.rows.add(...(rowValues as (string | number | boolean | Date | Buffer | null | undefined)[]));
    }

    return table;
  }

  /**
   * Gets the current row count.
   */
  getRowCount(): number {
    return this.rows.length;
  }

  /**
   * Gets the current column count.
   */
  getColumnCount(): number {
    return this.columns.length;
  }
}

// ============================================================================
// Procedure Executor
// ============================================================================

/**
 * Stored procedure executor with parameter handling and observability.
 *
 * Supports:
 * - Input parameters
 * - Output parameters
 * - Return values
 * - Multiple result sets
 * - Table-valued parameters (TVP)
 */
export class ProcedureExecutor {
  private readonly getConnection: () => Promise<PooledConnection>;
  private readonly releaseConnection: (conn: PooledConnection) => void;
  private readonly observability: Observability;

  /**
   * Creates a new ProcedureExecutor.
   *
   * @param getConnection - Function to acquire a connection from the pool
   * @param releaseConnection - Function to release a connection back to the pool
   * @param observability - Observability container for logging, metrics, and tracing
   */
  constructor(
    getConnection: () => Promise<PooledConnection>,
    releaseConnection: (conn: PooledConnection) => void,
    observability: Observability
  ) {
    this.getConnection = getConnection;
    this.releaseConnection = releaseConnection;
    this.observability = observability;
  }

  /**
   * Executes a stored procedure.
   *
   * @template T - Row type for result sets
   * @param call - Procedure call definition
   * @param options - Execution options
   * @returns Procedure result with rows, output params, and return value
   * @throws {SqlServerError} If execution fails
   *
   * @example
   * ```typescript
   * // Simple procedure call
   * const result = await executor.execute({
   *   name: 'dbo.GetUsers',
   *   params: { minAge: 18 }
   * });
   *
   * // With output parameters
   * const result = await executor.execute({
   *   name: 'dbo.CreateUser',
   *   params: { name: 'Alice', email: 'alice@example.com' },
   *   outputParams: { userId: { type: mssql.Int } }
   * });
   * console.log('New user ID:', result.output.userId);
   *
   * // With table-valued parameter
   * const tvp = new TvpBuilder('dbo.OrderItemType')
   *   .addColumn('productId', mssql.Int)
   *   .addColumn('quantity', mssql.Int)
   *   .addRow([101, 5])
   *   .addRow([102, 3])
   *   .build();
   *
   * const result = await executor.execute({
   *   name: 'dbo.CreateOrder',
   *   params: { customerId: 42, items: tvp },
   *   outputParams: { orderId: { type: mssql.Int } }
   * });
   * ```
   */
  async execute<T = Record<string, unknown>>(
    call: ProcedureCall,
    options?: ProcedureOptions
  ): Promise<ProcedureResult<T>> {
    return this.observability.tracer.withSpan(
      'sqlserver.procedure.execute',
      async (span: SpanContext) => {
        const startTime = Date.now();
        let conn: PooledConnection | undefined;

        try {
          // Set span attributes
          span.setAttribute('procedure_name', call.name);
          span.setAttribute('input_param_count', call.params ? Object.keys(call.params).length : 0);
          span.setAttribute(
            'output_param_count',
            call.outputParams ? Object.keys(call.outputParams).length : 0
          );

          conn = await this.getConnection();

          this.observability.logger.debug('Executing stored procedure', {
            procedure: call.name,
            inputParamCount: call.params ? Object.keys(call.params).length : 0,
            outputParamCount: call.outputParams ? Object.keys(call.outputParams).length : 0,
          });

          // Execute the procedure
          const mssqlResult = await this.executeStoredProcedure(conn, call, options?.timeout);
          const duration = Date.now() - startTime;

          // Build result
          const result: ProcedureResult<T> = {
            rows: (mssqlResult.recordset as T[]) || [],
            output: this.extractOutputParams(mssqlResult, call.outputParams),
            returnValue: mssqlResult.returnValue ?? 0,
            rowsAffected: mssqlResult.rowsAffected,
          };

          // Update connection stats
          conn.queryCount++;
          conn.lastUsedAt = new Date();

          // Record metrics
          this.recordMetrics(call, result, duration, span);

          this.observability.logger.debug('Stored procedure executed successfully', {
            procedure: call.name,
            rowCount: result.rows.length,
            returnValue: result.returnValue,
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
            error_type: 'procedure_execution',
          });

          this.observability.logger.error('Stored procedure execution failed', {
            procedure: call.name,
            error: (error as Error).message,
            duration,
          });

          throw this.wrapError(error, call.name);
        } finally {
          if (conn) {
            this.releaseConnection(conn);
          }
        }
      }
    );
  }

  /**
   * Executes a stored procedure and returns only the first result set.
   *
   * @template T - Row type
   * @param call - Procedure call definition
   * @param options - Execution options
   * @returns Array of rows from the first result set
   */
  async executeMany<T = Record<string, unknown>>(
    call: ProcedureCall,
    options?: ProcedureOptions
  ): Promise<T[]> {
    const result = await this.execute<T>(call, options);
    return result.rows;
  }

  /**
   * Executes a stored procedure and returns only output parameters.
   *
   * Useful for procedures that don't return result sets.
   *
   * @param call - Procedure call definition
   * @param options - Execution options
   * @returns Output parameter values
   */
  async executeForOutput(
    call: ProcedureCall,
    options?: ProcedureOptions
  ): Promise<Record<string, unknown>> {
    const result = await this.execute(call, options);
    return result.output;
  }

  /**
   * Executes a stored procedure and returns only the return value.
   *
   * @param call - Procedure call definition
   * @param options - Execution options
   * @returns Return value from the procedure
   */
  async executeForReturnValue(call: ProcedureCall, options?: ProcedureOptions): Promise<number> {
    const result = await this.execute(call, options);
    return result.returnValue;
  }

  /**
   * Creates a TVP builder for constructing table-valued parameters.
   *
   * @param typeName - SQL Server table type name
   * @returns New TvpBuilder instance
   */
  createTvp(typeName: string): TvpBuilder {
    return new TvpBuilder(typeName);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Executes the stored procedure using mssql.
   */
  private async executeStoredProcedure(
    conn: PooledConnection,
    call: ProcedureCall,
    timeout?: number
  ): Promise<mssql.IProcedureResult<unknown>> {
    const request = new mssql.Request(conn.pool);

    // Set timeout if specified
    if (timeout) {
      (request as unknown as { timeout: number }).timeout = timeout;
    }

    // Add input parameters
    if (call.params) {
      for (const [key, value] of Object.entries(call.params)) {
        // Check if the value is a Table (TVP)
        if (value instanceof mssql.Table) {
          request.input(key, value);
        } else if (value === null || value === undefined) {
          // Handle null/undefined - let mssql infer type
          request.input(key, value);
        } else {
          // Regular parameter
          request.input(key, value);
        }
      }
    }

    // Add output parameters
    if (call.outputParams) {
      for (const [key, paramDef] of Object.entries(call.outputParams)) {
        request.output(key, paramDef.type);
      }
    }

    try {
      return await request.execute(call.name);
    } catch (error) {
      const err = error as Error & { code?: string; number?: number };
      if (err.code === 'ETIMEOUT' || err.number === -2) {
        throw new QueryTimeoutError(timeout || 0);
      }
      throw error;
    }
  }

  /**
   * Extracts output parameter values from the result.
   */
  private extractOutputParams(
    mssqlResult: mssql.IProcedureResult<unknown>,
    outputParamDefs?: Record<string, { type: mssql.ISqlType }>
  ): Record<string, unknown> {
    if (!outputParamDefs || Object.keys(outputParamDefs).length === 0) {
      return {};
    }

    const output: Record<string, unknown> = {};

    // mssql returns output params in the 'output' property
    if (mssqlResult.output) {
      for (const key of Object.keys(outputParamDefs)) {
        // Output params are returned without @ prefix
        const cleanKey = key.startsWith('@') ? key.substring(1) : key;
        output[cleanKey] = mssqlResult.output[cleanKey];
      }
    }

    return output;
  }

  /**
   * Records metrics for procedure execution.
   */
  private recordMetrics(
    call: ProcedureCall,
    result: ProcedureResult<unknown>,
    duration: number,
    span: SpanContext
  ): void {
    this.observability.metrics.increment(MetricNames.QUERIES_TOTAL, 1, {
      command: 'PROCEDURE',
      procedure: call.name,
    });

    this.observability.metrics.timing(MetricNames.QUERY_DURATION_SECONDS, duration / 1000, {
      command: 'PROCEDURE',
      procedure: call.name,
    });

    const totalRowsAffected = result.rowsAffected.reduce((sum, count) => sum + count, 0);
    this.observability.metrics.increment(MetricNames.ROWS_RETURNED_TOTAL, result.rows.length, {
      command: 'PROCEDURE',
    });
    this.observability.metrics.increment(MetricNames.ROWS_AFFECTED_TOTAL, totalRowsAffected, {
      command: 'PROCEDURE',
    });

    span.setAttribute('duration_ms', duration);
    span.setAttribute('row_count', result.rows.length);
    span.setAttribute('rows_affected', totalRowsAffected);
    span.setAttribute('return_value', result.returnValue);
    span.setAttribute('output_param_count', Object.keys(result.output).length);
  }

  /**
   * Wraps errors in SqlServerError types.
   */
  private wrapError(error: unknown, procedureName: string): SqlServerError {
    if (error instanceof SqlServerError) {
      return error;
    }

    const parsedError = parseSqlServerError(error as Error);

    if (parsedError instanceof ExecutionError) {
      return new ExecutionError(
        `Procedure '${procedureName}' failed: ${parsedError.message}`,
        parsedError.errorNumber,
        error as Error
      );
    }

    return parsedError;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a TVP builder for constructing table-valued parameters.
 *
 * @param typeName - SQL Server table type name
 * @returns New TvpBuilder instance
 *
 * @example
 * ```typescript
 * const tvp = tvp('dbo.ProductTableType')
 *   .addColumn('id', mssql.Int)
 *   .addColumn('name', mssql.NVarChar(100))
 *   .addColumn('price', mssql.Decimal(10, 2))
 *   .addRow([1, 'Widget', 9.99])
 *   .addRow([2, 'Gadget', 19.99])
 *   .build();
 * ```
 */
export function tvp(typeName: string): TvpBuilder {
  return new TvpBuilder(typeName);
}

/**
 * Type guard to check if a value is a mssql.Table (TVP).
 */
export function isTvp(value: unknown): value is mssql.Table {
  return value instanceof mssql.Table;
}
