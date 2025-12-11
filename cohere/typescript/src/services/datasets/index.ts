/**
 * Datasets service module.
 */

import type { HttpTransport } from '../../transport';
import type { CohereConfig } from '../../config';
import { ValidationError } from '../../errors';
import type { ApiMeta } from '../../types';

/**
 * Dataset type
 */
export type DatasetType =
  | 'embed-input'
  | 'embed-result'
  | 'cluster-input'
  | 'cluster-result'
  | 'reranker-finetune-input'
  | 'single-label-classification-finetune-input'
  | 'chat-finetune-input'
  | 'multi-label-classification-finetune-input'
  | 'qa-finetune-input';

/**
 * Dataset status
 */
export type DatasetStatus = 'unknown' | 'queued' | 'processing' | 'complete' | 'failed' | 'skipped';

/**
 * Dataset validation status
 */
export type DatasetValidationStatus = 'unknown' | 'queued' | 'processing' | 'validated' | 'failed' | 'skipped';

/**
 * Dataset information
 */
export interface Dataset {
  /** Dataset ID */
  id: string;
  /** Dataset name */
  name: string;
  /** Dataset type */
  datasetType: DatasetType;
  /** Processing status */
  status: DatasetStatus;
  /** Validation status */
  validationStatus?: DatasetValidationStatus;
  /** Creation time */
  createdAt?: string;
  /** Update time */
  updatedAt?: string;
  /** Schema description */
  schema?: string;
  /** Number of rows/samples */
  totalCount?: number;
  /** API metadata */
  meta?: ApiMeta;
}

/**
 * Create dataset request
 */
export interface CreateDatasetRequest {
  /** Dataset name */
  name: string;
  /** Dataset type */
  type: DatasetType;
  /** Data to upload (CSV or JSONL content) */
  data: string;
  /** Whether data keeps fields not in schema */
  keepFields?: string[];
  /** Optional fields */
  optionalFields?: string[];
  /** Text separator for parsing */
  textSeparator?: string;
  /** CSV delimiter */
  csvDelimiter?: string;
  /** Dry run (validate only) */
  dryRun?: boolean;
}

/**
 * List datasets response
 */
export interface ListDatasetsResponse {
  datasets: Dataset[];
}

/**
 * Datasets service interface
 */
export interface DatasetsService {
  /**
   * Create a new dataset
   */
  create(request: CreateDatasetRequest): Promise<Dataset>;

  /**
   * Get a dataset by ID
   */
  get(datasetId: string): Promise<Dataset>;

  /**
   * List all datasets
   */
  list(): Promise<ListDatasetsResponse>;

  /**
   * Delete a dataset
   */
  delete(datasetId: string): Promise<void>;
}

/**
 * Datasets service implementation
 */
export class DatasetsServiceImpl implements DatasetsService {
  private readonly transport: HttpTransport;
  private readonly config: CohereConfig;

  constructor(transport: HttpTransport, config: CohereConfig) {
    this.transport = transport;
    this.config = config;
  }

  /**
   * Create a new dataset
   */
  async create(request: CreateDatasetRequest): Promise<Dataset> {
    this.validateRequest(request);

    const url = this.config.buildUrl('/datasets');
    const body: Record<string, unknown> = {
      name: request.name,
      type: request.type,
      data: request.data,
    };

    if (request.keepFields) body['keep_fields'] = request.keepFields;
    if (request.optionalFields) body['optional_fields'] = request.optionalFields;
    if (request.textSeparator) body['text_separator'] = request.textSeparator;
    if (request.csvDelimiter) body['csv_delimiter'] = request.csvDelimiter;
    if (request.dryRun !== undefined) body['dry_run'] = request.dryRun;

    const response = await this.transport.send('POST', url, {}, body);
    return this.parseDataset(response.body as Record<string, unknown>);
  }

  /**
   * Get a dataset by ID
   */
  async get(datasetId: string): Promise<Dataset> {
    if (!datasetId || datasetId.trim() === '') {
      throw new ValidationError('Dataset ID is required', [
        { field: 'datasetId', message: 'Dataset ID is required', code: 'REQUIRED' },
      ]);
    }

    const url = this.config.buildUrl(`/datasets/${datasetId}`);
    const response = await this.transport.send('GET', url, {});
    return this.parseDataset(response.body as Record<string, unknown>);
  }

  /**
   * List all datasets
   */
  async list(): Promise<ListDatasetsResponse> {
    const url = this.config.buildUrl('/datasets');
    const response = await this.transport.send('GET', url, {});
    const data = response.body as Record<string, unknown>;

    const datasets = Array.isArray(data['datasets'])
      ? data['datasets'].map((d: Record<string, unknown>) => this.parseDataset(d))
      : [];

    return { datasets };
  }

  /**
   * Delete a dataset
   */
  async delete(datasetId: string): Promise<void> {
    if (!datasetId || datasetId.trim() === '') {
      throw new ValidationError('Dataset ID is required', [
        { field: 'datasetId', message: 'Dataset ID is required', code: 'REQUIRED' },
      ]);
    }

    const url = this.config.buildUrl(`/datasets/${datasetId}`);
    await this.transport.send('DELETE', url, {});
  }

  private validateRequest(request: CreateDatasetRequest): void {
    if (!request.name || request.name.trim() === '') {
      throw new ValidationError('Name is required', [
        { field: 'name', message: 'Dataset name is required', code: 'REQUIRED' },
      ]);
    }

    if (!request.type) {
      throw new ValidationError('Type is required', [
        { field: 'type', message: 'Dataset type is required', code: 'REQUIRED' },
      ]);
    }

    if (!request.data || request.data.trim() === '') {
      throw new ValidationError('Data is required', [
        { field: 'data', message: 'Dataset data is required', code: 'REQUIRED' },
      ]);
    }
  }

  private parseDataset(data: Record<string, unknown>): Dataset {
    return {
      id: String(data['id'] ?? ''),
      name: String(data['name'] ?? ''),
      datasetType: (data['dataset_type'] ?? data['type'] ?? 'embed-input') as DatasetType,
      status: (data['status'] ?? 'unknown') as DatasetStatus,
      validationStatus: data['validation_status'] as DatasetValidationStatus | undefined,
      createdAt: data['created_at'] as string | undefined,
      updatedAt: data['updated_at'] as string | undefined,
      schema: data['schema'] as string | undefined,
      totalCount: data['total_count'] as number | undefined,
      meta: data['meta'] as Dataset['meta'],
    };
  }
}
