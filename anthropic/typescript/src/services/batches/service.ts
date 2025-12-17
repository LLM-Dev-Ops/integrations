import type { HttpTransport, RequestOptions } from '../../transport/http-transport.js';
import type { AuthManager } from '../../auth/auth-manager.js';
import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type {
  MessageBatch,
  CreateBatchRequest,
  BatchListParams,
  BatchListResponse,
  BatchResultsResponse,
} from './types.js';
import { ValidationError } from '../../errors/categories.js';
import {
  startTelemetryContext,
  emitRequestComplete,
  emitError,
} from '../../observability/telemetry.js';

export interface BatchesService {
  create(request: CreateBatchRequest, options?: RequestOptions): Promise<MessageBatch>;
  retrieve(batchId: string, options?: RequestOptions): Promise<MessageBatch>;
  list(params?: BatchListParams, options?: RequestOptions): Promise<BatchListResponse>;
  cancel(batchId: string, options?: RequestOptions): Promise<MessageBatch>;
  results(batchId: string, options?: RequestOptions): Promise<BatchResultsResponse>;
}

export class BatchesServiceImpl implements BatchesService {
  constructor(
    private readonly transport: HttpTransport,
    private readonly authManager: AuthManager,
    private readonly resilience: ResilienceOrchestrator,
  ) {}

  async create(request: CreateBatchRequest, options?: RequestOptions): Promise<MessageBatch> {
    this.validateCreateBatchRequest(request);

    // Start telemetry context
    const telemetryContext = startTelemetryContext({
      operation: 'batches.create',
      metadata: {
        requestCount: request.requests.length,
      },
    });

    try {
      const result = await this.resilience.execute(async () => {
        const headers = this.authManager.getHeaders();
        return this.transport.request<MessageBatch>(
          'POST',
          '/v1/messages/batches',
          request,
          {
            ...options,
            headers: {
              ...headers,
              ...options?.headers,
            },
          }
        );
      });

      // Emit completion event
      emitRequestComplete(telemetryContext, {
        batchId: result.id,
        status: result.processing_status,
        requestCounts: result.request_counts,
      });

      return result;
    } catch (error) {
      // Emit error event
      emitError(telemetryContext, error);
      throw error;
    }
  }

  async retrieve(batchId: string, options?: RequestOptions): Promise<MessageBatch> {
    if (!batchId || typeof batchId !== 'string' || batchId.trim() === '') {
      throw new ValidationError('Batch ID is required and must be a non-empty string');
    }

    // Start telemetry context
    const telemetryContext = startTelemetryContext({
      operation: 'batches.retrieve',
      metadata: {
        batchId,
      },
    });

    try {
      const result = await this.resilience.execute(async () => {
        const headers = this.authManager.getHeaders();
        return this.transport.request<MessageBatch>(
          'GET',
          `/v1/messages/batches/${batchId}`,
          undefined,
          {
            ...options,
            headers: {
              ...headers,
              ...options?.headers,
            },
          }
        );
      });

      // Emit completion event
      emitRequestComplete(telemetryContext, {
        batchId: result.id,
        status: result.processing_status,
        requestCounts: result.request_counts,
      });

      return result;
    } catch (error) {
      // Emit error event
      emitError(telemetryContext, error);
      throw error;
    }
  }

  async list(params?: BatchListParams, options?: RequestOptions): Promise<BatchListResponse> {
    if (params) {
      this.validateListParams(params);
    }

    // Start telemetry context
    const telemetryContext = startTelemetryContext({
      operation: 'batches.list',
      metadata: {
        limit: params?.limit,
        hasPagination: !!(params?.before_id || params?.after_id),
      },
    });

    try {
      const result = await this.resilience.execute(async () => {
        const headers = this.authManager.getHeaders();
        const queryParams = this.buildQueryParams(params);
        const path = queryParams ? `/v1/messages/batches?${queryParams}` : '/v1/messages/batches';

        return this.transport.request<BatchListResponse>(
          'GET',
          path,
          undefined,
          {
            ...options,
            headers: {
              ...headers,
              ...options?.headers,
            },
          }
        );
      });

      // Emit completion event
      emitRequestComplete(telemetryContext, {
        batchCount: result.data?.length,
        hasMore: result.has_more,
      });

      return result;
    } catch (error) {
      // Emit error event
      emitError(telemetryContext, error);
      throw error;
    }
  }

  async cancel(batchId: string, options?: RequestOptions): Promise<MessageBatch> {
    if (!batchId || typeof batchId !== 'string' || batchId.trim() === '') {
      throw new ValidationError('Batch ID is required and must be a non-empty string');
    }

    // Start telemetry context
    const telemetryContext = startTelemetryContext({
      operation: 'batches.cancel',
      metadata: {
        batchId,
      },
    });

    try {
      const result = await this.resilience.execute(async () => {
        const headers = this.authManager.getHeaders();
        return this.transport.request<MessageBatch>(
          'POST',
          `/v1/messages/batches/${batchId}/cancel`,
          undefined,
          {
            ...options,
            headers: {
              ...headers,
              ...options?.headers,
            },
          }
        );
      });

      // Emit completion event
      emitRequestComplete(telemetryContext, {
        batchId: result.id,
        status: result.processing_status,
      });

      return result;
    } catch (error) {
      // Emit error event
      emitError(telemetryContext, error);
      throw error;
    }
  }

  async results(batchId: string, options?: RequestOptions): Promise<BatchResultsResponse> {
    if (!batchId || typeof batchId !== 'string' || batchId.trim() === '') {
      throw new ValidationError('Batch ID is required and must be a non-empty string');
    }

    // Start telemetry context
    const telemetryContext = startTelemetryContext({
      operation: 'batches.results',
      metadata: {
        batchId,
      },
    });

    try {
      const result = await this.resilience.execute(async () => {
        const headers = this.authManager.getHeaders();
        return this.transport.request<BatchResultsResponse>(
          'GET',
          `/v1/messages/batches/${batchId}/results`,
          undefined,
          {
            ...options,
            headers: {
              ...headers,
              ...options?.headers,
            },
          }
        );
      });

      // Emit completion event
      emitRequestComplete(telemetryContext, {
        batchId,
        resultCount: result.length,
      });

      return result;
    } catch (error) {
      // Emit error event
      emitError(telemetryContext, error);
      throw error;
    }
  }

  private validateCreateBatchRequest(request: CreateBatchRequest): void {
    if (!request) {
      throw new ValidationError('Request is required');
    }

    if (!request.requests || !Array.isArray(request.requests)) {
      throw new ValidationError('Requests must be an array');
    }

    if (request.requests.length === 0) {
      throw new ValidationError('Requests array cannot be empty');
    }

    for (let i = 0; i < request.requests.length; i++) {
      const batchRequest = request.requests[i];
      if (!batchRequest || !batchRequest.custom_id || typeof batchRequest.custom_id !== 'string') {
        throw new ValidationError(`Request at index ${i} must have a valid custom_id`);
      }

      if (!batchRequest.params) {
        throw new ValidationError(`Request at index ${i} must have params`);
      }

      const params = batchRequest.params;

      // Basic validation of message params
      if (!params.model || typeof params.model !== 'string') {
        throw new ValidationError(`Request at index ${i}: model is required`);
      }

      if (!params.max_tokens || typeof params.max_tokens !== 'number' || params.max_tokens <= 0) {
        throw new ValidationError(`Request at index ${i}: max_tokens must be a positive number`);
      }

      if (!params.messages || !Array.isArray(params.messages) || params.messages.length === 0) {
        throw new ValidationError(`Request at index ${i}: messages must be a non-empty array`);
      }
    }
  }

  private validateListParams(params: BatchListParams): void {
    if (params.before_id && params.after_id) {
      throw new ValidationError('Cannot specify both before_id and after_id');
    }

    if (params.limit !== undefined) {
      if (typeof params.limit !== 'number' || params.limit <= 0) {
        throw new ValidationError('Limit must be a positive number');
      }
    }
  }

  private buildQueryParams(params?: BatchListParams): string {
    if (!params) {
      return '';
    }

    const queryParts: string[] = [];

    if (params.before_id) {
      queryParts.push(`before_id=${encodeURIComponent(params.before_id)}`);
    }

    if (params.after_id) {
      queryParts.push(`after_id=${encodeURIComponent(params.after_id)}`);
    }

    if (params.limit !== undefined) {
      queryParts.push(`limit=${params.limit}`);
    }

    return queryParts.join('&');
  }
}

export function createBatchesService(
  transport: HttpTransport,
  authManager: AuthManager,
  resilience: ResilienceOrchestrator
): BatchesService {
  return new BatchesServiceImpl(transport, authManager, resilience);
}
