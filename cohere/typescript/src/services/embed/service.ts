/**
 * Embed service implementation.
 */

import type { HttpTransport } from '../../transport';
import type { CohereConfig } from '../../config';
import { ValidationError } from '../../errors';
import type {
  EmbedRequest,
  EmbedResponse,
  EmbedJob,
  EmbedJobRequest,
} from './types';

/**
 * Embed service interface
 */
export interface EmbedService {
  /**
   * Create embeddings for texts
   */
  embed(request: EmbedRequest): Promise<EmbedResponse>;

  /**
   * Create an async embed job
   */
  createJob(request: EmbedJobRequest): Promise<EmbedJob>;

  /**
   * Get an embed job by ID
   */
  getJob(jobId: string): Promise<EmbedJob>;

  /**
   * List embed jobs
   */
  listJobs(): Promise<EmbedJob[]>;

  /**
   * Cancel an embed job
   */
  cancelJob(jobId: string): Promise<void>;
}

/**
 * Embed service implementation
 */
export class EmbedServiceImpl implements EmbedService {
  private readonly transport: HttpTransport;
  private readonly config: CohereConfig;

  constructor(transport: HttpTransport, config: CohereConfig) {
    this.transport = transport;
    this.config = config;
  }

  /**
   * Create embeddings for texts
   */
  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    this.validateRequest(request);

    const url = this.config.buildUrl('/embed');
    const body = this.buildRequestBody(request);

    const response = await this.transport.send('POST', url, {}, body);
    return this.parseResponse(response.body);
  }

  /**
   * Create an async embed job
   */
  async createJob(request: EmbedJobRequest): Promise<EmbedJob> {
    if (!request.datasetId || request.datasetId.trim() === '') {
      throw new ValidationError('Dataset ID is required', [
        { field: 'datasetId', message: 'Dataset ID is required', code: 'REQUIRED' },
      ]);
    }

    const url = this.config.buildUrl('/embed-jobs');
    const body: Record<string, unknown> = {
      dataset_id: request.datasetId,
    };

    if (request.model) body['model'] = request.model;
    if (request.inputType) body['input_type'] = request.inputType;
    if (request.embeddingTypes) body['embedding_types'] = request.embeddingTypes;
    if (request.truncate) body['truncate'] = request.truncate;
    if (request.name) body['name'] = request.name;

    const response = await this.transport.send('POST', url, {}, body);
    return this.parseJob(response.body);
  }

  /**
   * Get an embed job by ID
   */
  async getJob(jobId: string): Promise<EmbedJob> {
    if (!jobId || jobId.trim() === '') {
      throw new ValidationError('Job ID is required', [
        { field: 'jobId', message: 'Job ID is required', code: 'REQUIRED' },
      ]);
    }

    const url = this.config.buildUrl(`/embed-jobs/${jobId}`);
    const response = await this.transport.send('GET', url, {});
    return this.parseJob(response.body);
  }

  /**
   * List embed jobs
   */
  async listJobs(): Promise<EmbedJob[]> {
    const url = this.config.buildUrl('/embed-jobs');
    const response = await this.transport.send('GET', url, {});
    const data = response.body as Record<string, unknown>;
    const jobs = data['embed_jobs'];

    if (!Array.isArray(jobs)) {
      return [];
    }

    return jobs.map((j) => this.parseJob(j));
  }

  /**
   * Cancel an embed job
   */
  async cancelJob(jobId: string): Promise<void> {
    if (!jobId || jobId.trim() === '') {
      throw new ValidationError('Job ID is required', [
        { field: 'jobId', message: 'Job ID is required', code: 'REQUIRED' },
      ]);
    }

    const url = this.config.buildUrl(`/embed-jobs/${jobId}/cancel`);
    await this.transport.send('POST', url, {});
  }

  /**
   * Validate the request
   */
  private validateRequest(request: EmbedRequest): void {
    if (!request.texts || request.texts.length === 0) {
      throw new ValidationError('Texts are required', [
        { field: 'texts', message: 'At least one text is required', code: 'REQUIRED' },
      ]);
    }

    if (request.texts.length > 96) {
      throw new ValidationError('Too many texts', [
        { field: 'texts', message: 'Maximum 96 texts per request', code: 'OUT_OF_RANGE' },
      ]);
    }

    for (let i = 0; i < request.texts.length; i++) {
      if (typeof request.texts[i] !== 'string') {
        throw new ValidationError('Invalid text', [
          { field: `texts[${i}]`, message: 'Text must be a string', code: 'INVALID_TYPE' },
        ]);
      }
    }
  }

  /**
   * Build the request body
   */
  private buildRequestBody(request: EmbedRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      texts: request.texts,
    };

    if (request.model) body['model'] = request.model;
    if (request.inputType) body['input_type'] = request.inputType;
    if (request.embeddingTypes) body['embedding_types'] = request.embeddingTypes;
    if (request.truncate) body['truncate'] = request.truncate;

    return body;
  }

  /**
   * Parse the response
   */
  private parseResponse(body: unknown): EmbedResponse {
    const data = body as Record<string, unknown>;

    return {
      id: data['id'] as string | undefined,
      embeddings: data['embeddings'] as number[][] | undefined,
      embeddingsByType: data['embeddings_by_type'] as EmbedResponse['embeddingsByType'],
      texts: data['texts'] as string[] | undefined,
      meta: data['meta'] as EmbedResponse['meta'],
    };
  }

  /**
   * Parse an embed job
   */
  private parseJob(body: unknown): EmbedJob {
    const data = body as Record<string, unknown>;

    return {
      jobId: String(data['job_id'] ?? data['id'] ?? ''),
      name: data['name'] as string | undefined,
      status: (data['status'] ?? 'processing') as EmbedJob['status'],
      createdAt: data['created_at'] as string | undefined,
      inputDatasetId: data['input_dataset_id'] as string | undefined,
      outputDatasetId: data['output_dataset_id'] as string | undefined,
      model: data['model'] as string | undefined,
      truncate: data['truncate'] as EmbedJob['truncate'],
      meta: data['meta'] as EmbedJob['meta'],
    };
  }
}
