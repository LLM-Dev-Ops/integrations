/**
 * Mock BigQuery client for testing.
 *
 * Following the SPARC specification for Google BigQuery integration.
 */

import { TableSchema } from "../types/schema.js";
import { TableRow } from "../types/row.js";
import { Job, JobReference, QueryRequest, QueryResponse } from "../services/query/types.js";
import { Dataset } from "../types/dataset.js";
import { Table } from "../types/table.js";
import { BigQueryError } from "../error/index.js";
import { MockQueryResult, MockConfig, CallHistoryEntry } from "./types.js";

/**
 * Mock BigQuery client for testing.
 *
 * Provides a drop-in replacement for the real BigQuery client with
 * configurable mock responses, latency simulation, and failure modes.
 */
export class MockBigQueryClient {
  private readonly config: MockConfig;
  private readonly queryResults: Map<string | RegExp, MockQueryResult>;
  private readonly jobs: Map<string, Job>;
  private readonly datasets: Map<string, Dataset>;
  private readonly tables: Map<string, Table>;
  private readonly callHistory: CallHistoryEntry[];

  private failureMode: boolean;
  private failureError?: BigQueryError;
  private requestCount: number;

  /**
   * Create a new mock BigQuery client.
   *
   * @param config - Optional configuration for mock behavior
   */
  constructor(config?: MockConfig) {
    this.config = config ?? {};
    this.queryResults = new Map();
    this.jobs = new Map();
    this.datasets = new Map();
    this.tables = new Map();
    this.callHistory = [];
    this.failureMode = false;
    this.requestCount = 0;
  }

  /**
   * Register a mock query result for a query pattern.
   *
   * @param queryPattern - String or regex pattern to match queries
   * @param result - Mock result to return
   */
  registerQueryResult(queryPattern: string | RegExp, result: MockQueryResult): void {
    this.queryResults.set(queryPattern, result);
  }

  /**
   * Register a mock job.
   *
   * @param jobId - Job ID
   * @param job - Mock job object
   */
  registerJob(jobId: string, job: Job): void {
    this.jobs.set(jobId, job);
  }

  /**
   * Register a mock dataset.
   *
   * @param datasetId - Dataset ID
   * @param dataset - Mock dataset object
   */
  registerDataset(datasetId: string, dataset: Dataset): void {
    this.datasets.set(datasetId, dataset);
  }

  /**
   * Register a mock table.
   *
   * @param tableId - Full table ID (dataset.table)
   * @param table - Mock table object
   */
  registerTable(tableId: string, table: Table): void {
    this.tables.set(tableId, table);
  }

  /**
   * Enable or disable failure mode.
   *
   * @param enabled - Whether to enable failure mode
   * @param error - Optional error to throw (creates default if not provided)
   */
  setFailureMode(enabled: boolean, error?: BigQueryError): void {
    this.failureMode = enabled;
    this.failureError = error ?? new BigQueryError(
      "Mock failure",
      "Mock.Failure",
      { retryable: false }
    );
  }

  /**
   * Clear all mocks and reset state.
   */
  clearMocks(): void {
    this.queryResults.clear();
    this.jobs.clear();
    this.datasets.clear();
    this.tables.clear();
    this.callHistory.length = 0;
    this.failureMode = false;
    this.failureError = undefined;
    this.requestCount = 0;
  }

  /**
   * Get call history for assertions.
   */
  getCallHistory(): ReadonlyArray<CallHistoryEntry> {
    return this.callHistory;
  }

  /**
   * Get calls to a specific method.
   */
  getCallsTo(methodName: string): ReadonlyArray<CallHistoryEntry> {
    return this.callHistory.filter((entry) => entry.method === methodName);
  }

  /**
   * Get the total number of requests made.
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  /**
   * Execute a query (mock implementation).
   *
   * @param request - Query request
   * @returns Query response
   */
  async query(request: QueryRequest): Promise<QueryResponse> {
    return this.executeTracked("query", [request], async () => {
      await this.simulateLatency();
      this.checkFailureMode();

      // Find matching query result
      const result = this.findMatchingQueryResult(request.query);

      if (result) {
        // Check byte limit
        if (request.maximumBytesBilled !== undefined &&
            result.totalBytesProcessed > request.maximumBytesBilled) {
          throw new BigQueryError(
            "Query exceeded maximum bytes billed",
            "Query.BytesExceeded"
          );
        }

        return {
          jobReference: this.generateJobReference(),
          schema: result.schema,
          rows: result.rows,
          totalRows: BigInt(result.rows.length),
          cacheHit: result.cacheHit,
          totalBytesProcessed: result.totalBytesProcessed,
          totalBytesBilled: result.totalBytesProcessed,
          jobComplete: true,
          numDmlAffectedRows: BigInt(0),
        };
      }

      // No matching result, return empty response
      return {
        jobReference: this.generateJobReference(),
        schema: { fields: [] },
        rows: [],
        totalRows: BigInt(0),
        cacheHit: false,
        totalBytesProcessed: BigInt(0),
        totalBytesBilled: BigInt(0),
        jobComplete: true,
        numDmlAffectedRows: BigInt(0),
      };
    });
  }

  /**
   * Get a job by ID (mock implementation).
   *
   * @param jobId - Job ID
   * @returns Job object
   */
  async getJob(jobId: string): Promise<Job> {
    return this.executeTracked("getJob", [jobId], async () => {
      await this.simulateLatency();
      this.checkFailureMode();

      const job = this.jobs.get(jobId);
      if (!job) {
        throw new BigQueryError(
          `Job not found: ${jobId}`,
          "Job.NotFound"
        );
      }

      return job;
    });
  }

  /**
   * Get a dataset (mock implementation).
   *
   * @param datasetId - Dataset ID
   * @returns Dataset object
   */
  async getDataset(datasetId: string): Promise<Dataset> {
    return this.executeTracked("getDataset", [datasetId], async () => {
      await this.simulateLatency();
      this.checkFailureMode();

      const dataset = this.datasets.get(datasetId);
      if (!dataset) {
        throw new BigQueryError(
          `Dataset not found: ${datasetId}`,
          "Resource.DatasetNotFound"
        );
      }

      return dataset;
    });
  }

  /**
   * Get a table (mock implementation).
   *
   * @param tableId - Table ID (dataset.table)
   * @returns Table object
   */
  async getTable(tableId: string): Promise<Table> {
    return this.executeTracked("getTable", [tableId], async () => {
      await this.simulateLatency();
      this.checkFailureMode();

      const table = this.tables.get(tableId);
      if (!table) {
        throw new BigQueryError(
          `Table not found: ${tableId}`,
          "Resource.TableNotFound"
        );
      }

      return table;
    });
  }

  /**
   * Insert rows into a table (mock implementation).
   *
   * @param tableId - Table ID
   * @param rows - Rows to insert
   */
  async insertRows(tableId: string, rows: TableRow[]): Promise<void> {
    return this.executeTracked("insertRows", [tableId, rows], async () => {
      await this.simulateLatency();
      this.checkFailureMode();

      // Check failure rate
      if (this.config.failureRate && Math.random() < this.config.failureRate) {
        throw new BigQueryError(
          "Simulated insert failure",
          "Streaming.InsertFailed",
          { retryable: true }
        );
      }

      // Mock implementation - just validate table exists
      if (!this.tables.has(tableId)) {
        throw new BigQueryError(
          `Table not found: ${tableId}`,
          "Resource.TableNotFound"
        );
      }
    });
  }

  /**
   * Find a matching query result for a query string.
   */
  private findMatchingQueryResult(query: string): MockQueryResult | undefined {
    for (const [pattern, result] of Array.from(this.queryResults.entries())) {
      if (typeof pattern === "string") {
        // String pattern - check if query contains the pattern
        if (query.includes(pattern)) {
          return result;
        }
      } else {
        // RegExp pattern - test against query
        if (pattern.test(query)) {
          return result;
        }
      }
    }
    return undefined;
  }

  /**
   * Generate a mock job reference.
   */
  private generateJobReference(): JobReference {
    const jobId = `mock-job-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    return {
      projectId: "mock-project",
      jobId,
      location: "US",
    };
  }

  /**
   * Simulate network latency if configured.
   */
  private async simulateLatency(): Promise<void> {
    if (this.config.defaultLatencyMs && this.config.defaultLatencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.defaultLatencyMs));
    }
  }

  /**
   * Check if failure mode is enabled and throw error if so.
   */
  private checkFailureMode(): void {
    if (this.failureMode && this.failureError) {
      throw this.failureError;
    }
  }

  /**
   * Execute a method with tracking.
   */
  private async executeTracked<T>(
    method: string,
    args: unknown[],
    fn: () => Promise<T>
  ): Promise<T> {
    this.requestCount++;
    this.callHistory.push({
      method,
      args,
      timestamp: new Date(),
    });

    return fn();
  }
}
