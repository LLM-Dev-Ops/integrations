/**
 * Streaming Service
 *
 * Provides streaming insert functionality for BigQuery tables.
 * Implements the tabledata.insertAll API for real-time data ingestion.
 */

import { BigQueryConfig } from "../../config/index.js";
import { StreamingError, parseBigQueryError } from "../../error/index.js";
import {
  HttpTransport,
  HttpResponse,
  AuthProvider,
  isSuccess,
  getRequestId,
} from "../../transport/index.js";
import {
  InsertAllRequest,
  InsertAllResponse,
  InsertRow,
  InsertError,
  ErrorProto,
} from "./types.js";

/**
 * GCP Auth Provider interface.
 * Re-exported from transport for convenience.
 */
export type GcpAuthProvider = AuthProvider;

/**
 * Streaming Service for BigQuery.
 *
 * Handles streaming inserts (tabledata.insertAll) with support for:
 * - Partial failures (some rows succeed, some fail)
 * - Insert ID-based deduplication
 * - Table template suffixes for date-sharded tables
 * - Detailed error reporting per row
 */
export class StreamingService {
  private static readonly MAX_ROWS = 10000;
  private static readonly MAX_BYTES = 10485760; // 10 MB

  private readonly config: BigQueryConfig;
  private readonly transport: HttpTransport;
  private readonly authProvider: GcpAuthProvider;

  /**
   * Create a new streaming service.
   *
   * @param config - BigQuery configuration
   * @param transport - HTTP transport layer
   * @param authProvider - GCP authentication provider
   */
  constructor(
    config: BigQueryConfig,
    transport: HttpTransport,
    authProvider: GcpAuthProvider
  ) {
    this.config = config;
    this.transport = transport;
    this.authProvider = authProvider;
  }

  /**
   * Insert rows into a table using streaming inserts.
   *
   * This method provides low-latency data ingestion with the following features:
   * - Data is immediately available for querying (within seconds)
   * - Supports partial failures (some rows can fail while others succeed)
   * - Uses insert IDs for exactly-once semantics
   * - Limited to 10,000 rows and 10MB per request
   *
   * API Endpoint: POST /projects/{projectId}/datasets/{datasetId}/tables/{tableId}/insertAll
   *
   * @param projectId - GCP project ID
   * @param datasetId - Dataset ID
   * @param tableId - Table ID
   * @param request - Insert request with rows and options
   * @returns Insert response with any errors for failed rows
   * @throws {StreamingError} If request validation fails or insert fails completely
   * @throws {AuthenticationError} If authentication fails
   * @throws {NetworkError} If network request fails
   */
  async insertAll(
    projectId: string,
    datasetId: string,
    tableId: string,
    request: InsertAllRequest
  ): Promise<InsertAllResponse> {
    // Validate row count
    if (request.rows.length > StreamingService.MAX_ROWS) {
      throw new StreamingError(
        `Too many rows: ${request.rows.length} (maximum: ${StreamingService.MAX_ROWS})`,
        "RowCountExceeded"
      );
    }

    // Estimate request size
    const estimatedSize = this.estimateRequestSize(request);
    if (estimatedSize > StreamingService.MAX_BYTES) {
      throw new StreamingError(
        `Request too large: ~${estimatedSize} bytes (maximum: ${StreamingService.MAX_BYTES})`,
        "RowCountExceeded"
      );
    }

    // Build request body
    const body = this.buildRequestBody(request);

    // Build URL
    const path = `/projects/${projectId}/datasets/${datasetId}/tables/${tableId}/insertAll`;
    const url = `${this.getBaseUrl()}${path}`;

    // Get auth token
    const token = await this.authProvider.getAccessToken();

    // Send request
    const httpRequest = {
      method: "POST",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeout: this.config.timeout,
    };

    let response: HttpResponse;
    try {
      response = await this.transport.send(httpRequest);
    } catch (error) {
      throw new StreamingError(
        `Streaming insert failed: ${error instanceof Error ? error.message : String(error)}`,
        "InsertFailed",
        { retryable: true }
      );
    }

    // Handle response
    if (!isSuccess(response)) {
      const requestId = getRequestId(response);
      const bodyText = response.body.toString("utf-8");
      throw parseBigQueryError(response.status, bodyText, requestId);
    }

    // Parse response
    const responseBody = JSON.parse(response.body.toString("utf-8"));
    return this.parseInsertAllResponse(responseBody);
  }

  /**
   * Build the request body for insertAll API.
   */
  private buildRequestBody(request: InsertAllRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      rows: request.rows.map((row) => this.serializeRow(row)),
    };

    if (request.skipInvalidRows !== undefined) {
      body.skipInvalidRows = request.skipInvalidRows;
    }

    if (request.ignoreUnknownValues !== undefined) {
      body.ignoreUnknownValues = request.ignoreUnknownValues;
    }

    if (request.templateSuffix) {
      body.templateSuffix = request.templateSuffix;
    }

    if (request.traceId) {
      body.traceId = request.traceId;
    }

    return body;
  }

  /**
   * Serialize a single row for the API.
   */
  private serializeRow(row: InsertRow): Record<string, unknown> {
    const serialized: Record<string, unknown> = {
      json: row.json,
    };

    if (row.insertId) {
      serialized.insertId = row.insertId;
    }

    return serialized;
  }

  /**
   * Parse insertAll response from API.
   */
  private parseInsertAllResponse(json: Record<string, unknown>): InsertAllResponse {
    const response: InsertAllResponse = {};

    if (json.insertErrors) {
      const errors = json.insertErrors as Array<Record<string, unknown>>;
      response.insertErrors = errors.map((error) => this.parseInsertError(error));
    }

    return response;
  }

  /**
   * Parse a single insert error.
   */
  private parseInsertError(json: Record<string, unknown>): InsertError {
    const index = (json.index as number) ?? 0;
    const errors = (json.errors as Array<Record<string, unknown>>) ?? [];

    return {
      index,
      errors: errors.map((e) => this.parseErrorProto(e)),
    };
  }

  /**
   * Parse error details.
   */
  private parseErrorProto(json: Record<string, unknown>): ErrorProto {
    return {
      reason: (json.reason as string) ?? "unknown",
      location: json.location as string | undefined,
      message: (json.message as string) ?? "",
    };
  }

  /**
   * Estimate request size in bytes.
   */
  private estimateRequestSize(request: InsertAllRequest): number {
    // Rough estimation: serialize to JSON and measure
    // In production, you might want a more accurate byte counter
    const body = this.buildRequestBody(request);
    return JSON.stringify(body).length;
  }

  /**
   * Get the BigQuery API base URL.
   */
  private getBaseUrl(): string {
    return this.config.apiEndpoint ?? "https://bigquery.googleapis.com/bigquery/v2";
  }
}
