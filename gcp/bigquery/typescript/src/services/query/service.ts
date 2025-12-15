/**
 * Query Service Implementation
 *
 * BigQuery query operations: execute, executeAsync, dryRun, getQueryResults, executeStream.
 * Following the SPARC specification for Google BigQuery integration.
 */

import { BigQueryConfig, resolveEndpoint } from "../../config/index.js";
import { parseBigQueryError, QueryError } from "../../error/index.js";
import { GcpAuthProvider } from "../../credentials/index.js";
import { HttpTransport, isSuccess, getRequestId } from "../../transport/index.js";
import { parseTableSchema } from "../../types/schema.js";
import { parseTableRow, TableRow } from "../../types/row.js";
import {
  QueryRequest,
  QueryResponse,
  Job,
  CostEstimate,
  GetQueryResultsOptions,
  JobReference,
  DatasetReference,
  QueryParameters,
} from "./types.js";

/**
 * On-demand pricing per TB (USD). Default for US multi-region.
 * Can be overridden in config for different regions.
 */
const DEFAULT_ON_DEMAND_PRICE_PER_TB = 5.0;

/**
 * Minimum billing increment (10 MB).
 */
const MIN_BILLING_BYTES = 10 * 1024 * 1024;

/**
 * Query service for BigQuery query operations.
 */
export class QueryService {
  private config: BigQueryConfig;
  private transport: HttpTransport;
  private authProvider: GcpAuthProvider;

  constructor(config: BigQueryConfig, transport: HttpTransport, authProvider: GcpAuthProvider) {
    this.config = config;
    this.transport = transport;
    this.authProvider = authProvider;
  }

  /**
   * Execute a synchronous query via jobs.query endpoint.
   * Returns results immediately (up to 10 second timeout by default).
   */
  async execute(request: QueryRequest): Promise<QueryResponse> {
    const endpoint = resolveEndpoint(this.config);
    const token = await this.authProvider.getAccessToken();

    // Build request body
    const body: Record<string, unknown> = {
      query: request.query,
      useLegacySql: request.useLegacySql ?? this.config.useLegacySql,
      useQueryCache: request.useQueryCache ?? this.config.useQueryCache,
    };

    // Apply timeout
    if (request.timeoutMs !== undefined) {
      body.timeoutMs = request.timeoutMs;
    } else {
      body.timeoutMs = 10000; // Default 10 second timeout for sync queries
    }

    // Apply maximum bytes billed
    const maxBytesBilled = request.maximumBytesBilled ?? this.config.maximumBytesBilled;
    if (maxBytesBilled !== undefined) {
      body.maximumBytesBilled = maxBytesBilled.toString();
    }

    // Apply default dataset
    const defaultDataset = request.defaultDataset;
    if (defaultDataset) {
      body.defaultDataset = {
        projectId: defaultDataset.projectId ?? this.config.projectId,
        datasetId: defaultDataset.datasetId,
      };
    }

    // Apply dry run
    if (request.dryRun) {
      body.dryRun = true;
    }

    // Apply query parameters
    if (request.queryParameters) {
      body.parameterMode = request.queryParameters.mode;
      body.queryParameters = serializeQueryParameters(request.queryParameters);
    }

    // Apply labels
    if (request.labels) {
      body.labels = request.labels;
    }

    // Apply max results
    if (request.maxResults !== undefined) {
      body.maxResults = request.maxResults;
    }

    // Build URL
    const url = `${endpoint}/projects/${this.config.projectId}/queries`;

    // Send request
    const response = await this.transport.send({
      method: "POST",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeout: this.config.timeout,
    });

    if (!isSuccess(response)) {
      throw parseBigQueryError(response.status, response.body.toString(), getRequestId(response));
    }

    // Parse response
    const json = JSON.parse(response.body.toString());
    return parseQueryResponse(json);
  }

  /**
   * Execute an asynchronous query via jobs.insert endpoint.
   * Returns a Job reference immediately without waiting for completion.
   */
  async executeAsync(request: QueryRequest): Promise<Job> {
    const endpoint = resolveEndpoint(this.config);
    const token = await this.authProvider.getAccessToken();

    // Build query configuration
    const queryConfig: Record<string, unknown> = {
      query: request.query,
      useLegacySql: request.useLegacySql ?? this.config.useLegacySql,
      useQueryCache: request.useQueryCache ?? this.config.useQueryCache,
    };

    // Apply maximum bytes billed
    const maxBytesBilled = request.maximumBytesBilled ?? this.config.maximumBytesBilled;
    if (maxBytesBilled !== undefined) {
      queryConfig.maximumBytesBilled = maxBytesBilled.toString();
    }

    // Apply default dataset
    const defaultDataset = request.defaultDataset;
    if (defaultDataset) {
      queryConfig.defaultDataset = {
        projectId: defaultDataset.projectId ?? this.config.projectId,
        datasetId: defaultDataset.datasetId,
      };
    }

    // Apply priority
    if (request.priority) {
      queryConfig.priority = request.priority;
    }

    // Apply query parameters
    if (request.queryParameters) {
      queryConfig.parameterMode = request.queryParameters.mode;
      queryConfig.queryParameters = serializeQueryParameters(request.queryParameters);
    }

    // Build job configuration
    const body: Record<string, unknown> = {
      configuration: {
        query: queryConfig,
      },
    };

    // Apply labels
    if (request.labels) {
      body.labels = request.labels;
    }

    // Build URL
    const url = `${endpoint}/projects/${this.config.projectId}/jobs`;

    // Send request
    const response = await this.transport.send({
      method: "POST",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeout: this.config.timeout,
    });

    if (!isSuccess(response)) {
      throw parseBigQueryError(response.status, response.body.toString(), getRequestId(response));
    }

    // Parse response
    const json = JSON.parse(response.body.toString());
    return parseJob(json);
  }

  /**
   * Perform a dry-run query to estimate cost without executing.
   */
  async dryRun(query: string, defaultDataset?: DatasetReference): Promise<CostEstimate> {
    const response = await this.execute({
      query,
      defaultDataset,
      dryRun: true,
    });

    // Calculate cost estimate
    const bytesProcessed = response.totalBytesProcessed ?? 0n;
    const bytesBilled = calculateBytesBilled(bytesProcessed);
    const estimatedCostUsd = calculateCostUsd(bytesBilled);

    return {
      totalBytesProcessed: bytesProcessed,
      totalBytesBilled: bytesBilled,
      estimatedCostUsd,
      cacheHit: response.cacheHit,
      schema: response.schema,
    };
  }

  /**
   * Get query results for a completed or running query job.
   * Supports pagination via options.pageToken.
   */
  async getQueryResults(
    projectId: string,
    jobId: string,
    options?: GetQueryResultsOptions
  ): Promise<QueryResponse> {
    const endpoint = resolveEndpoint(this.config);
    const token = await this.authProvider.getAccessToken();

    // Build query parameters
    const params = new URLSearchParams();
    if (options?.maxResults !== undefined) {
      params.set("maxResults", options.maxResults.toString());
    }
    if (options?.pageToken) {
      params.set("pageToken", options.pageToken);
    }
    if (options?.timeoutMs !== undefined) {
      params.set("timeoutMs", options.timeoutMs.toString());
    }
    if (options?.startIndex !== undefined) {
      params.set("startIndex", options.startIndex.toString());
    }

    // Build URL
    let url = `${endpoint}/projects/${projectId}/queries/${jobId}`;
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    // Send request
    const response = await this.transport.send({
      method: "GET",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: this.config.timeout,
    });

    if (!isSuccess(response)) {
      throw parseBigQueryError(response.status, response.body.toString(), getRequestId(response));
    }

    // Parse response
    const json = JSON.parse(response.body.toString());
    return parseQueryResponse(json);
  }

  /**
   * Execute a query and return results as an async iterable stream.
   * Automatically handles pagination.
   */
  async *executeStream(request: QueryRequest): AsyncIterable<TableRow> {
    // Execute initial query
    const response = await this.execute(request);

    // Yield rows from first page
    for (const row of response.rows) {
      yield row;
    }

    // Fetch additional pages if needed
    let pageToken = response.pageToken;
    while (pageToken) {
      const nextResponse = await this.getQueryResults(
        response.jobReference.projectId,
        response.jobReference.jobId,
        { pageToken }
      );

      for (const row of nextResponse.rows) {
        yield row;
      }

      pageToken = nextResponse.pageToken;
    }
  }
}

/**
 * Parse query response from BigQuery JSON.
 */
function parseQueryResponse(json: Record<string, unknown>): QueryResponse {
  const jobRef = json.jobReference as Record<string, unknown>;

  return {
    jobReference: {
      projectId: jobRef.projectId as string,
      jobId: jobRef.jobId as string,
      location: jobRef.location as string | undefined,
    },
    schema: json.schema ? parseTableSchema(json.schema as Record<string, unknown>) : undefined,
    rows: json.rows ? (json.rows as Record<string, unknown>[]).map(parseTableRow) : [],
    totalRows: json.totalRows ? BigInt(json.totalRows as string) : undefined,
    pageToken: json.pageToken as string | undefined,
    cacheHit: (json.cacheHit as boolean) ?? false,
    totalBytesProcessed: json.totalBytesProcessed
      ? BigInt(json.totalBytesProcessed as string)
      : undefined,
    totalBytesBilled: json.totalBytesBilled ? BigInt(json.totalBytesBilled as string) : undefined,
    jobComplete: (json.jobComplete as boolean) ?? false,
    numDmlAffectedRows: json.numDmlAffectedRows
      ? BigInt(json.numDmlAffectedRows as string)
      : undefined,
  };
}

/**
 * Parse job response from BigQuery JSON.
 */
function parseJob(json: Record<string, unknown>): Job {
  const jobRef = json.jobReference as Record<string, unknown>;
  const status = json.status as Record<string, unknown>;
  const configuration = json.configuration as Record<string, unknown>;
  const statistics = json.statistics as Record<string, unknown> | undefined;

  return {
    jobReference: {
      projectId: jobRef.projectId as string,
      jobId: jobRef.jobId as string,
      location: jobRef.location as string | undefined,
    },
    status: {
      state: status.state as string,
      errorResult: status.errorResult
        ? {
            reason: (status.errorResult as Record<string, unknown>).reason as string,
            location: (status.errorResult as Record<string, unknown>).location as string | undefined,
            message: (status.errorResult as Record<string, unknown>).message as string,
          }
        : undefined,
      errors: status.errors
        ? (status.errors as Record<string, unknown>[]).map((e) => ({
            reason: e.reason as string,
            location: e.location as string | undefined,
            message: e.message as string,
          }))
        : undefined,
    },
    configuration: {
      query: configuration.query
        ? {
            query: (configuration.query as Record<string, unknown>).query as string,
            destinationTable: (configuration.query as Record<string, unknown>)
              .destinationTable as any,
            useLegacySql: (configuration.query as Record<string, unknown>).useLegacySql as
              | boolean
              | undefined,
            priority: (configuration.query as Record<string, unknown>).priority as
              | string
              | undefined,
          }
        : undefined,
    },
    statistics: statistics
      ? {
          creationTime: statistics.creationTime as string | undefined,
          startTime: statistics.startTime as string | undefined,
          endTime: statistics.endTime as string | undefined,
          totalBytesProcessed: statistics.totalBytesProcessed as string | undefined,
          totalBytesBilled: statistics.totalBytesBilled as string | undefined,
          query: statistics.query
            ? {
                totalBytesProcessed: (statistics.query as Record<string, unknown>)
                  .totalBytesProcessed as string | undefined,
                totalBytesBilled: (statistics.query as Record<string, unknown>)
                  .totalBytesBilled as string | undefined,
                cacheHit: (statistics.query as Record<string, unknown>).cacheHit as
                  | boolean
                  | undefined,
                billingTier: (statistics.query as Record<string, unknown>).billingTier as
                  | number
                  | undefined,
              }
            : undefined,
        }
      : undefined,
  };
}

/**
 * Serialize query parameters to BigQuery JSON format.
 */
function serializeQueryParameters(params: QueryParameters): Record<string, unknown>[] {
  if (params.mode === "NAMED") {
    return Object.entries(params.parameters).map(([name, param]) => ({
      name,
      parameterType: { type: param.type },
      parameterValue: { value: param.value },
    }));
  } else {
    return params.parameters.map((param) => ({
      parameterType: { type: param.type },
      parameterValue: { value: param.value },
    }));
  }
}

/**
 * Calculate bytes billed from bytes processed.
 * BigQuery rounds up to nearest 10 MB.
 */
function calculateBytesBilled(bytesProcessed: bigint): bigint {
  const minBytes = BigInt(MIN_BILLING_BYTES);
  if (bytesProcessed < minBytes) {
    return minBytes;
  }

  // Round up to nearest 10 MB
  const roundUpBytes = BigInt(MIN_BILLING_BYTES);
  return ((bytesProcessed + roundUpBytes - 1n) / roundUpBytes) * roundUpBytes;
}

/**
 * Calculate estimated cost in USD from bytes billed.
 * Uses on-demand pricing: $5.00 per TB (default for US multi-region).
 */
function calculateCostUsd(bytesBilled: bigint): number {
  const bytesPerTB = 1024n * 1024n * 1024n * 1024n; // 1 TB
  const tbProcessed = Number(bytesBilled) / Number(bytesPerTB);
  return tbProcessed * DEFAULT_ON_DEMAND_PRICE_PER_TB;
}
