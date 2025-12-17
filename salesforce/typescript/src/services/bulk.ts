/**
 * Salesforce Bulk API 2.0 implementation following SPARC specification.
 *
 * Provides comprehensive support for Bulk API 2.0 operations including:
 * - Job creation and management
 * - CSV data upload and retrieval
 * - Job status polling and completion monitoring
 * - High-level orchestration for simplified bulk operations
 */

import { SalesforceClient } from '../client/index.js';
import {
  BulkJobInfo,
  BulkOperation,
  ColumnDelimiter,
  LineEnding,
} from '../types/index.js';
import { SalesforceError, SalesforceErrorCode } from '../errors/index.js';

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Options for creating a Bulk API 2.0 job.
 */
export interface CreateBulkJobOptions {
  /** The API name of the SObject to process */
  object: string;

  /** The type of operation to perform */
  operation: BulkOperation;

  /** The external ID field name (required for upsert operations) */
  externalIdFieldName?: string;

  /** The line ending format for CSV data */
  lineEnding?: LineEnding;

  /** The column delimiter for CSV data */
  columnDelimiter?: ColumnDelimiter;
}

/**
 * Options for executing a complete bulk operation.
 */
export interface BulkExecuteOptions {
  /** The API name of the SObject to process */
  object: string;

  /** The type of operation to perform */
  operation: BulkOperation;

  /** The data to process (CSV string or array of records) */
  data: string | Record<string, unknown>[];

  /** The external ID field name (required for upsert operations) */
  externalIdFieldName?: string;

  /** The line ending format for CSV data */
  lineEnding?: LineEnding;

  /** The column delimiter for CSV data */
  columnDelimiter?: ColumnDelimiter;
}

/**
 * Result of a complete bulk operation.
 */
export interface BulkJobResult {
  /** The job information */
  jobInfo: BulkJobInfo;

  /** Successfully processed records */
  successfulResults: Record<string, unknown>[];

  /** Failed records with error information */
  failedResults: Record<string, unknown>[];

  /** Unprocessed records */
  unprocessedRecords: Record<string, unknown>[];

  /** Summary statistics */
  summary: {
    /** Total number of records processed */
    totalProcessed: number;

    /** Number of successful records */
    successCount: number;

    /** Number of failed records */
    failedCount: number;

    /** Number of unprocessed records */
    unprocessedCount: number;
  };
}

// ============================================================================
// Bulk Service Interface
// ============================================================================

/**
 * Service interface for Bulk API 2.0 operations.
 */
export interface BulkService {
  /**
   * Creates a new bulk job.
   */
  createJob(options: CreateBulkJobOptions): Promise<BulkJobInfo>;

  /**
   * Uploads CSV data to a job.
   */
  uploadJobData(jobId: string, csvData: string): Promise<void>;

  /**
   * Closes a job to start processing.
   */
  closeJob(jobId: string): Promise<BulkJobInfo>;

  /**
   * Aborts a job.
   */
  abortJob(jobId: string): Promise<BulkJobInfo>;

  /**
   * Gets information about a job.
   */
  getJobInfo(jobId: string): Promise<BulkJobInfo>;

  /**
   * Gets successful results for a job as CSV.
   */
  getSuccessfulResults(jobId: string): Promise<string>;

  /**
   * Gets failed results for a job as CSV.
   */
  getFailedResults(jobId: string): Promise<string>;

  /**
   * Gets unprocessed records for a job as CSV.
   */
  getUnprocessedRecords(jobId: string): Promise<string>;

  /**
   * Deletes a job.
   */
  deleteJob(jobId: string): Promise<void>;
}

// ============================================================================
// Bulk Service Implementation
// ============================================================================

/**
 * Implementation of BulkService using Salesforce Bulk API 2.0.
 */
export class BulkServiceImpl implements BulkService {
  private readonly client: SalesforceClient;
  private readonly basePath = '/jobs/ingest';

  constructor(client: SalesforceClient) {
    this.client = client;
  }

  /**
   * Creates a new bulk job.
   */
  async createJob(options: CreateBulkJobOptions): Promise<BulkJobInfo> {
    // Validate upsert operation has externalIdFieldName
    if (options.operation === 'upsert' && !options.externalIdFieldName) {
      throw new SalesforceError({
        code: SalesforceErrorCode.ConfigurationError,
        message: 'externalIdFieldName is required for upsert operations',
        retryable: false,
      });
    }

    const requestBody: Record<string, unknown> = {
      operation: options.operation,
      object: options.object,
      contentType: 'CSV',
    };

    if (options.externalIdFieldName) {
      requestBody.externalIdFieldName = options.externalIdFieldName;
    }

    if (options.lineEnding) {
      requestBody.lineEnding = options.lineEnding;
    }

    if (options.columnDelimiter) {
      requestBody.columnDelimiter = options.columnDelimiter;
    }

    this.client.logger.info('Creating bulk job', {
      object: options.object,
      operation: options.operation,
    });

    const jobInfo = await this.client.post<BulkJobInfo>(this.basePath, requestBody);

    this.client.logger.info('Bulk job created', {
      jobId: jobInfo.id,
      state: jobInfo.state,
    });

    return jobInfo;
  }

  /**
   * Uploads CSV data to a job.
   */
  async uploadJobData(jobId: string, csvData: string): Promise<void> {
    this.client.logger.info('Uploading data to bulk job', {
      jobId,
      dataSize: csvData.length,
    });

    await this.client.request({
      method: 'PUT',
      path: `${this.basePath}/${jobId}/batches`,
      body: csvData,
      headers: {
        'Content-Type': 'text/csv',
      },
    });

    this.client.logger.info('Data uploaded successfully', { jobId });
  }

  /**
   * Closes a job to start processing.
   */
  async closeJob(jobId: string): Promise<BulkJobInfo> {
    this.client.logger.info('Closing bulk job', { jobId });

    const jobInfo = await this.client.request<BulkJobInfo>({
      method: 'PATCH',
      path: `${this.basePath}/${jobId}`,
      body: { state: 'UploadComplete' },
    });

    this.client.logger.info('Bulk job closed', {
      jobId,
      state: jobInfo.data.state,
    });

    return jobInfo.data;
  }

  /**
   * Aborts a job.
   */
  async abortJob(jobId: string): Promise<BulkJobInfo> {
    this.client.logger.info('Aborting bulk job', { jobId });

    const jobInfo = await this.client.request<BulkJobInfo>({
      method: 'PATCH',
      path: `${this.basePath}/${jobId}`,
      body: { state: 'Aborted' },
    });

    this.client.logger.info('Bulk job aborted', {
      jobId,
      state: jobInfo.data.state,
    });

    return jobInfo.data;
  }

  /**
   * Gets information about a job.
   */
  async getJobInfo(jobId: string): Promise<BulkJobInfo> {
    return await this.client.get<BulkJobInfo>(`${this.basePath}/${jobId}`);
  }

  /**
   * Gets successful results for a job as CSV.
   */
  async getSuccessfulResults(jobId: string): Promise<string> {
    this.client.logger.debug('Fetching successful results', { jobId });

    const response = await this.client.request<string>({
      method: 'GET',
      path: `${this.basePath}/${jobId}/successfulResults`,
      rawResponse: true,
    });

    return response.data;
  }

  /**
   * Gets failed results for a job as CSV.
   */
  async getFailedResults(jobId: string): Promise<string> {
    this.client.logger.debug('Fetching failed results', { jobId });

    const response = await this.client.request<string>({
      method: 'GET',
      path: `${this.basePath}/${jobId}/failedResults`,
      rawResponse: true,
    });

    return response.data;
  }

  /**
   * Gets unprocessed records for a job as CSV.
   */
  async getUnprocessedRecords(jobId: string): Promise<string> {
    this.client.logger.debug('Fetching unprocessed records', { jobId });

    const response = await this.client.request<string>({
      method: 'GET',
      path: `${this.basePath}/${jobId}/unprocessedrecords`,
      rawResponse: true,
    });

    return response.data;
  }

  /**
   * Deletes a job.
   */
  async deleteJob(jobId: string): Promise<void> {
    this.client.logger.info('Deleting bulk job', { jobId });

    await this.client.delete(`${this.basePath}/${jobId}`);

    this.client.logger.info('Bulk job deleted', { jobId });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Converts an array of records to CSV format.
 *
 * @param records - Array of records to convert
 * @returns CSV string with header row and data rows
 */
export function recordsToCSV(records: Record<string, unknown>[]): string {
  if (records.length === 0) {
    return '';
  }

  // Extract all unique field names from all records
  const fieldSet = new Set<string>();
  for (const record of records) {
    for (const field of Object.keys(record)) {
      fieldSet.add(field);
    }
  }
  const fields = Array.from(fieldSet).sort();

  // Create header row
  const header = fields.map(escapeCSVField).join(',');

  // Create data rows
  const rows = records.map((record) => {
    return fields
      .map((field) => {
        const value = record[field];
        return escapeCSVField(value);
      })
      .join(',');
  });

  return [header, ...rows].join('\n');
}

/**
 * Parses CSV results into an array of records.
 *
 * @param csv - CSV string to parse
 * @returns Array of records with field names as keys
 */
export function parseCSVResults(csv: string): Record<string, unknown>[] {
  if (!csv || csv.trim().length === 0) {
    return [];
  }

  const lines = csv.trim().split('\n');
  if (lines.length === 0) {
    return [];
  }

  // Parse header row
  const headers = parseCSVLine(lines[0]);
  if (headers.length === 0) {
    return [];
  }

  // Parse data rows
  const records: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) {
      continue; // Skip empty lines
    }

    const record: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const value = j < values.length ? values[j] : '';

      // Convert empty strings to null for optional fields
      record[header] = value === '' ? null : parseValue(value);
    }
    records.push(record);
  }

  return records;
}

/**
 * Waits for a bulk job to complete.
 *
 * @param service - BulkService instance
 * @param jobId - Job ID to monitor
 * @param pollInterval - Interval between status checks in milliseconds
 * @param maxAttempts - Maximum number of polling attempts
 * @returns Final job information
 * @throws Error if job fails or max attempts reached
 */
export async function waitForJobCompletion(
  service: BulkService,
  jobId: string,
  pollInterval: number,
  maxAttempts: number
): Promise<BulkJobInfo> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    const jobInfo = await service.getJobInfo(jobId);

    // Check terminal states
    if (jobInfo.state === 'JobComplete') {
      return jobInfo;
    }

    if (jobInfo.state === 'Failed') {
      throw new SalesforceError({
        code: SalesforceErrorCode.ServerError,
        message: `Bulk job ${jobId} failed`,
        retryable: false,
        details: { jobInfo },
      });
    }

    if (jobInfo.state === 'Aborted') {
      throw new SalesforceError({
        code: SalesforceErrorCode.ServerError,
        message: `Bulk job ${jobId} was aborted`,
        retryable: false,
        details: { jobInfo },
      });
    }

    // Wait before next poll
    if (attempts < maxAttempts) {
      await sleep(pollInterval);
    }
  }

  throw new SalesforceError({
    code: SalesforceErrorCode.TimeoutError,
    message: `Bulk job ${jobId} did not complete within ${maxAttempts} attempts`,
    retryable: false,
    details: { jobId, maxAttempts, pollInterval },
  });
}

/**
 * Escapes a field value for CSV format.
 */
function escapeCSVField(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  let str = String(value);

  // Quote field if it contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    // Escape quotes by doubling them
    str = str.replace(/"/g, '""');
    return `"${str}"`;
  }

  return str;
}

/**
 * Parses a single CSV line into an array of values.
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = i + 1 < line.length ? line[i + 1] : '';

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field delimiter
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Add last field
  values.push(current);

  return values;
}

/**
 * Parses a string value to its appropriate type.
 */
function parseValue(value: string): unknown {
  // Handle boolean values
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Handle numeric values
  if (/^-?\d+$/.test(value)) {
    return parseInt(value, 10);
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    return parseFloat(value);
  }

  // Return as string
  return value;
}

/**
 * Sleep utility for polling.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Bulk Orchestrator
// ============================================================================

/**
 * High-level orchestrator for bulk operations.
 * Handles the complete lifecycle of a bulk job from creation to results retrieval.
 */
export class BulkOrchestrator {
  private readonly service: BulkService;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;

  constructor(
    client: SalesforceClient,
    options?: {
      pollIntervalMs?: number;
      maxPollAttempts?: number;
    }
  ) {
    this.service = new BulkServiceImpl(client);
    this.pollIntervalMs = options?.pollIntervalMs ?? 5000; // Default: 5 seconds
    this.maxPollAttempts = options?.maxPollAttempts ?? 120; // Default: 120 attempts (10 minutes at 5s intervals)
  }

  /**
   * Executes a complete bulk operation.
   *
   * This method:
   * 1. Creates a bulk job
   * 2. Converts records to CSV if needed
   * 3. Uploads the data
   * 4. Closes the job
   * 5. Polls until completion
   * 6. Retrieves and parses results
   *
   * @param options - Bulk execution options
   * @returns Complete job results with success/failed/unprocessed records
   */
  async execute(options: BulkExecuteOptions): Promise<BulkJobResult> {
    // Convert data to CSV if needed
    const csvData =
      typeof options.data === 'string'
        ? options.data
        : recordsToCSV(options.data);

    if (!csvData || csvData.trim().length === 0) {
      throw new SalesforceError({
        code: SalesforceErrorCode.ConfigurationError,
        message: 'No data provided for bulk operation',
        retryable: false,
      });
    }

    // Create job
    const jobInfo = await this.service.createJob({
      object: options.object,
      operation: options.operation,
      externalIdFieldName: options.externalIdFieldName,
      lineEnding: options.lineEnding,
      columnDelimiter: options.columnDelimiter,
    });

    try {
      // Upload data
      await this.service.uploadJobData(jobInfo.id, csvData);

      // Close job
      await this.service.closeJob(jobInfo.id);

      // Wait for completion
      const completedJobInfo = await waitForJobCompletion(
        this.service,
        jobInfo.id,
        this.pollIntervalMs,
        this.maxPollAttempts
      );

      // Retrieve results
      const [successfulCSV, failedCSV, unprocessedCSV] = await Promise.all([
        this.service.getSuccessfulResults(jobInfo.id),
        this.service.getFailedResults(jobInfo.id),
        this.service.getUnprocessedRecords(jobInfo.id),
      ]);

      // Parse results
      const successfulResults = parseCSVResults(successfulCSV);
      const failedResults = parseCSVResults(failedCSV);
      const unprocessedRecords = parseCSVResults(unprocessedCSV);

      return {
        jobInfo: completedJobInfo,
        successfulResults,
        failedResults,
        unprocessedRecords,
        summary: {
          totalProcessed: completedJobInfo.numberRecordsProcessed ?? 0,
          successCount: successfulResults.length,
          failedCount: failedResults.length,
          unprocessedCount: unprocessedRecords.length,
        },
      };
    } catch (error) {
      // Attempt to abort the job on error
      try {
        await this.service.abortJob(jobInfo.id);
      } catch (abortError) {
        // Log but don't throw abort error
        console.error('Failed to abort job after error:', abortError);
      }

      throw error;
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a BulkService instance.
 *
 * @param client - Salesforce client
 * @returns BulkService instance
 */
export function createBulkService(client: SalesforceClient): BulkService {
  return new BulkServiceImpl(client);
}

/**
 * Creates a BulkOrchestrator instance.
 *
 * @param client - Salesforce client
 * @param options - Orchestrator options
 * @returns BulkOrchestrator instance
 */
export function createBulkOrchestrator(
  client: SalesforceClient,
  options?: {
    pollIntervalMs?: number;
    maxPollAttempts?: number;
  }
): BulkOrchestrator {
  return new BulkOrchestrator(client, options);
}
