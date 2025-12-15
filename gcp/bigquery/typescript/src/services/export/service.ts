/**
 * Export Service
 *
 * Handles BigQuery data export operations to Google Cloud Storage.
 * Following the SPARC specification for Google BigQuery integration.
 */

import { BigQueryConfig } from "../../config/index.js";
import { HttpTransport, AuthProvider, isSuccess } from "../../transport/index.js";
import { parseBigQueryError, ConfigurationError } from "../../error/index.js";
import { serializeTableReference } from "../../types/table.js";
import { ExportJobConfig, DestinationFormat, Compression } from "./types.js";
import { Job, JobReference } from "../query/types.js";

/**
 * Export Service for BigQuery data export operations.
 */
export class ExportService {
  private readonly config: BigQueryConfig;
  private readonly transport: HttpTransport;
  private readonly authProvider: AuthProvider;

  constructor(
    config: BigQueryConfig,
    transport: HttpTransport,
    authProvider: AuthProvider
  ) {
    this.config = config;
    this.transport = transport;
    this.authProvider = authProvider;
  }

  /**
   * Export a table to Google Cloud Storage.
   *
   * @param projectId - GCP project ID
   * @param config - Export job configuration
   * @returns Job object representing the export job
   */
  async exportToGcs(projectId: string, config: ExportJobConfig): Promise<Job> {
    return this.createExportJob(projectId, config);
  }

  /**
   * Create an export job.
   *
   * @param projectId - GCP project ID
   * @param config - Export job configuration
   * @returns Job object representing the export job
   */
  async createExportJob(
    projectId: string,
    config: ExportJobConfig
  ): Promise<Job> {
    // Validate configuration
    this.validateExportConfig(config);

    // Get access token
    const token = await this.authProvider.getAccessToken();

    // Build job configuration
    const jobConfig = this.buildJobConfiguration(config);

    // Build request URL
    const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/jobs`;

    // Build request
    const request = {
      method: "POST",
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jobConfig),
      timeout: this.config.timeout,
    };

    // Send request
    const response = await this.transport.send(request);

    // Handle errors
    if (!isSuccess(response)) {
      const requestId = this.extractRequestId(response);
      throw parseBigQueryError(
        response.status,
        response.body.toString("utf-8"),
        requestId
      );
    }

    // Parse response
    const job = JSON.parse(response.body.toString("utf-8")) as Job;
    return job;
  }

  /**
   * Validate export configuration.
   */
  private validateExportConfig(config: ExportJobConfig): void {
    // Validate source table
    if (!config.sourceTable) {
      throw new ConfigurationError(
        "Source table must be specified",
        "InvalidConfig"
      );
    }

    if (!config.sourceTable.projectId) {
      throw new ConfigurationError(
        "Source table project ID must be specified",
        "InvalidConfig"
      );
    }

    if (!config.sourceTable.datasetId) {
      throw new ConfigurationError(
        "Source table dataset ID must be specified",
        "InvalidConfig"
      );
    }

    if (!config.sourceTable.tableId) {
      throw new ConfigurationError(
        "Source table ID must be specified",
        "InvalidConfig"
      );
    }

    // Validate destination URIs
    if (!config.destinationUris || config.destinationUris.length === 0) {
      throw new ConfigurationError(
        "At least one destination URI must be specified",
        "InvalidConfig"
      );
    }

    for (const uri of config.destinationUris) {
      if (!uri.startsWith("gs://")) {
        throw new ConfigurationError(
          `Invalid destination URI: ${uri} (must start with gs://)`,
          "InvalidConfig"
        );
      }
    }

    // Validate format-specific options
    if (config.fieldDelimiter !== undefined) {
      const format = config.destinationFormat ?? "NEWLINE_DELIMITED_JSON";
      if (format !== "CSV") {
        throw new ConfigurationError(
          "fieldDelimiter can only be used with CSV format",
          "InvalidConfig"
        );
      }
    }

    if (config.printHeader !== undefined) {
      const format = config.destinationFormat ?? "NEWLINE_DELIMITED_JSON";
      if (format !== "CSV") {
        throw new ConfigurationError(
          "printHeader can only be used with CSV format",
          "InvalidConfig"
        );
      }
    }

    if (config.useAvroLogicalTypes !== undefined) {
      const format = config.destinationFormat ?? "NEWLINE_DELIMITED_JSON";
      if (format !== "AVRO") {
        throw new ConfigurationError(
          "useAvroLogicalTypes can only be used with AVRO format",
          "InvalidConfig"
        );
      }
    }
  }

  /**
   * Build job configuration for export.
   */
  private buildJobConfiguration(config: ExportJobConfig): Record<string, unknown> {
    const extractConfig: Record<string, unknown> = {
      sourceTable: serializeTableReference(config.sourceTable),
      destinationUris: config.destinationUris,
    };

    // Add optional fields
    if (config.destinationFormat) {
      extractConfig.destinationFormat = config.destinationFormat;
    }

    if (config.compression) {
      extractConfig.compression = config.compression;
    }

    if (config.fieldDelimiter !== undefined) {
      extractConfig.fieldDelimiter = config.fieldDelimiter;
    }

    if (config.printHeader !== undefined) {
      extractConfig.printHeader = config.printHeader;
    }

    if (config.useAvroLogicalTypes !== undefined) {
      extractConfig.useAvroLogicalTypes = config.useAvroLogicalTypes;
    }

    return {
      configuration: {
        extract: extractConfig,
      },
    };
  }

  /**
   * Extract request ID from response headers.
   */
  private extractRequestId(response: {
    headers: Record<string, string>;
  }): string | undefined {
    // Check for x-goog-request-id header (case-insensitive)
    for (const [key, value] of Object.entries(response.headers)) {
      if (key.toLowerCase() === "x-goog-request-id") {
        return value;
      }
    }
    return undefined;
  }
}
