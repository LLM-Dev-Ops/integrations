/**
 * Batch processing types for Mistral API.
 */

/**
 * Batch job status.
 */
export type BatchStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'TIMED_OUT'
  | 'CANCELLED'
  | 'CANCELLING';

/**
 * Batch job creation request.
 */
export interface CreateBatchRequest {
  /** Input file ID(s). */
  input_files: string[];
  /** Endpoint to call (e.g., /v1/chat/completions). */
  endpoint: string;
  /** Model to use. */
  model: string;
  /** Optional metadata. */
  metadata?: Record<string, string>;
  /** Timeout in hours. */
  timeout_hours?: number;
}

/**
 * Batch job.
 */
export interface BatchJob {
  /** Batch ID. */
  id: string;
  /** Object type. */
  object: string;
  /** Input files. */
  input_files: string[];
  /** Endpoint. */
  endpoint: string;
  /** Model. */
  model: string;
  /** Output file ID. */
  output_file?: string;
  /** Error file ID. */
  error_file?: string;
  /** Status. */
  status: BatchStatus;
  /** Creation timestamp. */
  created_at: number;
  /** Started timestamp. */
  started_at?: number;
  /** Completed timestamp. */
  completed_at?: number;
  /** Metadata. */
  metadata: Record<string, string>;
  /** Total requests. */
  total_requests?: number;
  /** Completed requests. */
  completed_requests?: number;
  /** Succeeded requests. */
  succeeded_requests?: number;
  /** Failed requests. */
  failed_requests?: number;
}

/**
 * Response from listing batch jobs.
 */
export interface BatchListResponse {
  /** Object type. */
  object: string;
  /** List of batches. */
  data: BatchJob[];
  /** Total count. */
  total?: number;
}

/**
 * A single request in a batch input file.
 */
export interface BatchInputRequest {
  /** Custom ID for this request. */
  custom_id: string;
  /** Request body. */
  body: unknown;
}

/**
 * A single response from a batch output file.
 */
export interface BatchOutputResponse {
  /** Custom ID matching the request. */
  custom_id: string;
  /** Response data. */
  response?: BatchResponseData;
  /** Error if request failed. */
  error?: BatchError;
}

/**
 * Response data from a batch request.
 */
export interface BatchResponseData {
  /** HTTP status code. */
  status_code: number;
  /** Response body. */
  body: unknown;
}

/**
 * Error from a batch request.
 */
export interface BatchError {
  /** Error code. */
  code: string;
  /** Error message. */
  message: string;
}

/**
 * Query parameters for listing batch jobs.
 */
export interface ListBatchJobsParams {
  /** Page number. */
  page?: number;
  /** Page size. */
  page_size?: number;
  /** Model filter. */
  model?: string;
  /** Status filter. */
  status?: string;
  /** Created after timestamp. */
  created_after?: number;
  /** Created before timestamp. */
  created_before?: number;
}

/**
 * Builder for batch requests.
 */
export class CreateBatchRequestBuilder {
  private request: Partial<CreateBatchRequest> = {
    input_files: [],
  };

  inputFile(fileId: string): this {
    this.request.input_files = [...(this.request.input_files ?? []), fileId];
    return this;
  }

  inputFiles(fileIds: string[]): this {
    this.request.input_files = fileIds;
    return this;
  }

  endpoint(endpoint: string): this {
    this.request.endpoint = endpoint;
    return this;
  }

  model(model: string): this {
    this.request.model = model;
    return this;
  }

  metadata(key: string, value: string): this {
    this.request.metadata = {
      ...this.request.metadata,
      [key]: value,
    };
    return this;
  }

  timeoutHours(hours: number): this {
    this.request.timeout_hours = hours;
    return this;
  }

  build(): CreateBatchRequest {
    if (!this.request.endpoint) {
      this.request.endpoint = '/v1/chat/completions';
    }
    if (!this.request.model) {
      this.request.model = 'mistral-large-latest';
    }
    return this.request as CreateBatchRequest;
  }
}

/**
 * Creates a batch request builder.
 */
export function createBatch(): CreateBatchRequestBuilder {
  return new CreateBatchRequestBuilder();
}
