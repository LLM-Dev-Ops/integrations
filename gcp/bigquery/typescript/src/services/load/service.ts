/**
 * Load Service
 *
 * Service for batch data loading into BigQuery tables.
 * Following the SPARC specification for Google BigQuery integration.
 */

import { BigQueryConfig, resolveEndpoint } from "../../config/index.js";
import { HttpTransport, getRequestId, isSuccess } from "../../transport/index.js";
import {
  BigQueryError,
  JobError,
  parseBigQueryError,
  ConfigurationError,
} from "../../error/index.js";
import { Job } from "../query/types.js";
import { LoadJobConfig } from "./types.js";
import { serializeTableSchema } from "../../types/schema.js";
import { serializeTableReference } from "../../types/table.js";

/**
 * GCP authentication provider interface.
 */
export interface GcpAuthProvider {
  /**
   * Get a valid access token.
   */
  getAccessToken(): Promise<string>;
}

/**
 * Load Service for batch data loading.
 */
export class LoadService {
  private readonly config: BigQueryConfig;
  private readonly transport: HttpTransport;
  private readonly authProvider: GcpAuthProvider;
  private readonly baseUrl: string;

  /**
   * Create a new LoadService.
   *
   * @param config - BigQuery configuration
   * @param transport - HTTP transport
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
    this.baseUrl = resolveEndpoint(config);
  }

  /**
   * Load data from Google Cloud Storage URIs.
   *
   * Creates a load job that reads data from one or more GCS URIs and loads it
   * into a BigQuery table. The job runs asynchronously and can be polled for completion.
   *
   * @param projectId - GCP project ID
   * @param config - Load job configuration with sourceUris
   * @returns Job object that can be polled for completion
   *
   * @throws {ConfigurationError} If sourceUris is missing or invalid
   * @throws {BigQueryError} If the API request fails
   *
   * @example
   * ```typescript
   * const job = await loadService.loadFromGcs('my-project', {
   *   sourceUris: ['gs://my-bucket/data.csv'],
   *   sourceFormat: 'CSV',
   *   destinationTable: {
   *     projectId: 'my-project',
   *     datasetId: 'my_dataset',
   *     tableId: 'my_table'
   *   },
   *   autodetect: true,
   *   writeDisposition: 'WRITE_TRUNCATE'
   * });
   * ```
   */
  async loadFromGcs(projectId: string, config: LoadJobConfig): Promise<Job> {
    if (!config.sourceUris || config.sourceUris.length === 0) {
      throw new ConfigurationError(
        "sourceUris must be provided for GCS loads",
        "InvalidConfig"
      );
    }

    // Validate GCS URIs
    for (const uri of config.sourceUris) {
      if (!uri.startsWith("gs://")) {
        throw new ConfigurationError(
          `Invalid GCS URI: ${uri} (must start with gs://)`,
          "InvalidConfig"
        );
      }
    }

    return this.createLoadJob(projectId, config);
  }

  /**
   * Load data from a Buffer in memory.
   *
   * Uploads data from memory to BigQuery using multipart upload. For large buffers
   * (>10MB), consider using resumable upload or loading from GCS instead.
   *
   * @param projectId - GCP project ID
   * @param data - Buffer containing the data to load
   * @param config - Load job configuration (sourceUris will be ignored)
   * @returns Job object that can be polled for completion
   *
   * @throws {ConfigurationError} If configuration is invalid
   * @throws {BigQueryError} If the API request fails
   *
   * @example
   * ```typescript
   * const csvData = Buffer.from('name,age\nAlice,30\nBob,25');
   * const job = await loadService.loadFromBuffer('my-project', csvData, {
   *   sourceFormat: 'CSV',
   *   destinationTable: {
   *     projectId: 'my-project',
   *     datasetId: 'my_dataset',
   *     tableId: 'my_table'
   *   },
   *   skipLeadingRows: 1,
   *   autodetect: true
   * });
   * ```
   */
  async loadFromBuffer(
    projectId: string,
    data: Buffer,
    config: Omit<LoadJobConfig, "sourceUris">
  ): Promise<Job> {
    // Create job configuration without sourceUris
    const jobConfig = this.buildJobConfiguration(config);

    // Detect content type from source format
    const contentType = this.getContentType(config.sourceFormat);

    // Use multipart upload
    const boundary = `----BigQueryLoadBoundary${Date.now()}`;
    const token = await this.authProvider.getAccessToken();

    // Build multipart body
    const metadata = JSON.stringify({
      configuration: {
        load: jobConfig,
      },
    });

    const parts: Buffer[] = [];

    // Part 1: Metadata
    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from("Content-Type: application/json; charset=UTF-8\r\n\r\n"));
    parts.push(Buffer.from(metadata));
    parts.push(Buffer.from("\r\n"));

    // Part 2: Data
    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Type: ${contentType}\r\n\r\n`));
    parts.push(data);
    parts.push(Buffer.from("\r\n"));

    // End boundary
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    // Upload to multipart endpoint
    const url = `https://bigquery.googleapis.com/upload/bigquery/v2/projects/${projectId}/jobs?uploadType=multipart`;

    const response = await this.transport.send({
      method: "POST",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": body.length.toString(),
      },
      body,
      timeout: this.config.timeout,
    });

    const requestId = getRequestId(response);

    if (!isSuccess(response)) {
      throw parseBigQueryError(response.status, response.body.toString("utf-8"), requestId);
    }

    // Parse job response
    const responseBody = JSON.parse(response.body.toString("utf-8"));
    return this.parseJob(responseBody);
  }

  /**
   * Create a load job (low-level method).
   *
   * Creates a BigQuery load job with the specified configuration. This is a low-level
   * method used by loadFromGcs and other higher-level methods.
   *
   * @param projectId - GCP project ID
   * @param config - Load job configuration
   * @returns Job object that can be polled for completion
   *
   * @throws {BigQueryError} If the API request fails
   */
  async createLoadJob(projectId: string, config: LoadJobConfig): Promise<Job> {
    const token = await this.authProvider.getAccessToken();
    const url = `${this.baseUrl}/projects/${projectId}/jobs`;

    const jobConfig = this.buildJobConfiguration(config);

    const requestBody = {
      configuration: {
        load: jobConfig,
      },
    };

    const response = await this.transport.send({
      method: "POST",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      timeout: this.config.timeout,
    });

    const requestId = getRequestId(response);

    if (!isSuccess(response)) {
      throw parseBigQueryError(response.status, response.body.toString("utf-8"), requestId);
    }

    // Parse job response
    const responseBody = JSON.parse(response.body.toString("utf-8"));
    return this.parseJob(responseBody);
  }

  /**
   * Build job configuration from LoadJobConfig.
   */
  private buildJobConfiguration(config: LoadJobConfig): Record<string, unknown> {
    const jobConfig: Record<string, unknown> = {
      destinationTable: serializeTableReference(config.destinationTable),
    };

    // Source URIs (for GCS loads)
    if (config.sourceUris && config.sourceUris.length > 0) {
      jobConfig.sourceUris = config.sourceUris;
    }

    // Source format
    if (config.sourceFormat) {
      jobConfig.sourceFormat = config.sourceFormat;
    }

    // Schema
    if (config.schema) {
      jobConfig.schema = serializeTableSchema(config.schema);
    }

    // Write disposition
    if (config.writeDisposition) {
      jobConfig.writeDisposition = config.writeDisposition;
    }

    // Create disposition
    if (config.createDisposition) {
      jobConfig.createDisposition = config.createDisposition;
    }

    // CSV-specific options
    if (config.skipLeadingRows !== undefined) {
      jobConfig.skipLeadingRows = config.skipLeadingRows;
    }

    if (config.fieldDelimiter) {
      jobConfig.fieldDelimiter = config.fieldDelimiter;
    }

    if (config.quote !== undefined) {
      jobConfig.quote = config.quote;
    }

    if (config.allowQuotedNewlines !== undefined) {
      jobConfig.allowQuotedNewlines = config.allowQuotedNewlines;
    }

    if (config.allowJaggedRows !== undefined) {
      jobConfig.allowJaggedRows = config.allowJaggedRows;
    }

    // Encoding
    if (config.encoding) {
      jobConfig.encoding = config.encoding;
    }

    // Error tolerance
    if (config.maxBadRecords !== undefined) {
      jobConfig.maxBadRecords = config.maxBadRecords;
    }

    // Autodetect
    if (config.autodetect !== undefined) {
      jobConfig.autodetect = config.autodetect;
    }

    // Null marker
    if (config.nullMarker !== undefined) {
      jobConfig.nullMarker = config.nullMarker;
    }

    // Schema update options
    if (config.schemaUpdateOptions && config.schemaUpdateOptions.length > 0) {
      jobConfig.schemaUpdateOptions = config.schemaUpdateOptions;
    }

    return jobConfig;
  }

  /**
   * Get content type for source format.
   */
  private getContentType(sourceFormat?: string): string {
    switch (sourceFormat) {
      case "CSV":
        return "text/csv";
      case "NEWLINE_DELIMITED_JSON":
        return "application/json";
      case "AVRO":
        return "application/octet-stream";
      case "PARQUET":
        return "application/octet-stream";
      case "ORC":
        return "application/octet-stream";
      default:
        return "application/octet-stream";
    }
  }

  /**
   * Parse Job from BigQuery API response.
   */
  private parseJob(json: Record<string, unknown>): Job {
    const jobReference = json.jobReference as Record<string, unknown>;
    const status = json.status as Record<string, unknown>;
    const configuration = json.configuration as Record<string, unknown>;
    const statistics = json.statistics as Record<string, unknown> | undefined;

    const job: Job = {
      jobReference: {
        projectId: jobReference.projectId as string,
        jobId: jobReference.jobId as string,
        location: jobReference.location as string | undefined,
      },
      status: {
        state: status.state as string,
      },
      configuration: {},
    };

    // Parse error result
    if (status.errorResult) {
      const errorResult = status.errorResult as Record<string, unknown>;
      job.status.errorResult = {
        reason: errorResult.reason as string,
        location: errorResult.location as string | undefined,
        message: errorResult.message as string,
      };
    }

    // Parse errors array
    if (status.errors) {
      const errors = status.errors as Array<Record<string, unknown>>;
      job.status.errors = errors.map((e) => ({
        reason: e.reason as string,
        location: e.location as string | undefined,
        message: e.message as string,
      }));
    }

    // Parse configuration (if present)
    // Note: The Job type currently only supports query configuration.
    // For load jobs, we extend it here with type assertion.
    if (configuration.load) {
      const loadConfig = configuration.load as Record<string, unknown>;
      (job.configuration as any).load = {
        sourceUris: loadConfig.sourceUris as string[] | undefined,
        sourceFormat: loadConfig.sourceFormat as string | undefined,
        destinationTable: loadConfig.destinationTable as Record<string, unknown> | undefined,
        writeDisposition: loadConfig.writeDisposition as string | undefined,
        createDisposition: loadConfig.createDisposition as string | undefined,
      };
    }

    // Parse statistics (if present)
    if (statistics) {
      job.statistics = {
        creationTime: statistics.creationTime as string | undefined,
        startTime: statistics.startTime as string | undefined,
        endTime: statistics.endTime as string | undefined,
      };
    }

    return job;
  }
}
