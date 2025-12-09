import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type { RequestOptions } from '../../types/common.js';
import type {
  FineTuningJobCreateRequest,
  FineTuningJob,
  FineTuningJobListParams,
  FineTuningJobListResponse,
  FineTuningJobEventListResponse,
} from './types.js';
import { FineTuningValidator } from './validation.js';

export interface FineTuningService {
  create(request: FineTuningJobCreateRequest, options?: RequestOptions): Promise<FineTuningJob>;
  list(params?: FineTuningJobListParams, options?: RequestOptions): Promise<FineTuningJobListResponse>;
  retrieve(jobId: string, options?: RequestOptions): Promise<FineTuningJob>;
  cancel(jobId: string, options?: RequestOptions): Promise<FineTuningJob>;
  listEvents(jobId: string, params?: FineTuningJobListParams, options?: RequestOptions): Promise<FineTuningJobEventListResponse>;
}

export class FineTuningServiceImpl implements FineTuningService {
  constructor(private readonly orchestrator: ResilienceOrchestrator) {}

  async create(request: FineTuningJobCreateRequest, options?: RequestOptions): Promise<FineTuningJob> {
    FineTuningValidator.validateCreate(request);

    return this.orchestrator.request({
      method: 'POST',
      path: '/v1/fine_tuning/jobs',
      body: request,
      ...options,
    });
  }

  async list(params?: FineTuningJobListParams, options?: RequestOptions): Promise<FineTuningJobListResponse> {
    const query: Record<string, string | number> = {};
    if (params?.limit) query.limit = params.limit;
    if (params?.after) query.after = params.after;

    return this.orchestrator.request({
      method: 'GET',
      path: '/v1/fine_tuning/jobs',
      query,
      ...options,
    });
  }

  async retrieve(jobId: string, options?: RequestOptions): Promise<FineTuningJob> {
    FineTuningValidator.validateJobId(jobId);

    return this.orchestrator.request({
      method: 'GET',
      path: `/v1/fine_tuning/jobs/${encodeURIComponent(jobId)}`,
      ...options,
    });
  }

  async cancel(jobId: string, options?: RequestOptions): Promise<FineTuningJob> {
    FineTuningValidator.validateJobId(jobId);

    return this.orchestrator.request({
      method: 'POST',
      path: `/v1/fine_tuning/jobs/${encodeURIComponent(jobId)}/cancel`,
      ...options,
    });
  }

  async listEvents(jobId: string, params?: FineTuningJobListParams, options?: RequestOptions): Promise<FineTuningJobEventListResponse> {
    FineTuningValidator.validateJobId(jobId);

    const query: Record<string, string | number> = {};
    if (params?.limit) query.limit = params.limit;
    if (params?.after) query.after = params.after;

    return this.orchestrator.request({
      method: 'GET',
      path: `/v1/fine_tuning/jobs/${encodeURIComponent(jobId)}/events`,
      query,
      ...options,
    });
  }
}
