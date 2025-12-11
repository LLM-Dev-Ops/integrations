/**
 * Fine-tuning service.
 */

import type { HttpTransport } from '../transport';
import type {
  FineTuningJob,
  FineTuningJobListResponse,
  CreateFineTuningJobRequest,
  FineTuningEvent,
  FineTuningCheckpoint,
  ListFineTuningJobsParams,
} from '../types/fine-tuning';

/**
 * Fine-tuning service interface.
 */
export interface FineTuningService {
  /** Lists fine-tuning jobs. */
  list(params?: ListFineTuningJobsParams): Promise<FineTuningJobListResponse>;

  /** Retrieves a specific fine-tuning job. */
  retrieve(jobId: string): Promise<FineTuningJob>;

  /** Creates a new fine-tuning job. */
  create(request: CreateFineTuningJobRequest): Promise<FineTuningJob>;

  /** Cancels a fine-tuning job. */
  cancel(jobId: string): Promise<FineTuningJob>;

  /** Starts a fine-tuning job. */
  start(jobId: string): Promise<FineTuningJob>;

  /** Gets events for a fine-tuning job. */
  listEvents(jobId: string): Promise<FineTuningEvent[]>;

  /** Gets checkpoints for a fine-tuning job. */
  listCheckpoints(jobId: string): Promise<FineTuningCheckpoint[]>;
}

/**
 * Default implementation of the fine-tuning service.
 */
export class DefaultFineTuningService implements FineTuningService {
  constructor(private readonly transport: HttpTransport) {}

  async list(params?: ListFineTuningJobsParams): Promise<FineTuningJobListResponse> {
    const query = this.buildQueryString(params);
    const body = await this.transport.get(`/v1/fine_tuning/jobs${query}`);
    return JSON.parse(body) as FineTuningJobListResponse;
  }

  async retrieve(jobId: string): Promise<FineTuningJob> {
    const body = await this.transport.get(`/v1/fine_tuning/jobs/${jobId}`);
    return JSON.parse(body) as FineTuningJob;
  }

  async create(request: CreateFineTuningJobRequest): Promise<FineTuningJob> {
    const body = await this.transport.post('/v1/fine_tuning/jobs', request);
    return JSON.parse(body) as FineTuningJob;
  }

  async cancel(jobId: string): Promise<FineTuningJob> {
    const body = await this.transport.post(`/v1/fine_tuning/jobs/${jobId}/cancel`, {});
    return JSON.parse(body) as FineTuningJob;
  }

  async start(jobId: string): Promise<FineTuningJob> {
    const body = await this.transport.post(`/v1/fine_tuning/jobs/${jobId}/start`, {});
    return JSON.parse(body) as FineTuningJob;
  }

  async listEvents(jobId: string): Promise<FineTuningEvent[]> {
    const body = await this.transport.get(`/v1/fine_tuning/jobs/${jobId}/events`);
    return JSON.parse(body) as FineTuningEvent[];
  }

  async listCheckpoints(jobId: string): Promise<FineTuningCheckpoint[]> {
    const body = await this.transport.get(`/v1/fine_tuning/jobs/${jobId}/checkpoints`);
    return JSON.parse(body) as FineTuningCheckpoint[];
  }

  private buildQueryString(params?: ListFineTuningJobsParams): string {
    if (!params) return '';

    const entries = Object.entries(params).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '';

    return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  }
}

/**
 * Creates a fine-tuning service.
 */
export function createFineTuningService(transport: HttpTransport): FineTuningService {
  return new DefaultFineTuningService(transport);
}
