/**
 * Fine-tuning service module.
 */

import type { HttpTransport } from '../../transport';
import type { CohereConfig } from '../../config';
import { ValidationError } from '../../errors';
import type { ApiMeta } from '../../types';

/**
 * Fine-tune job status
 */
export type FineTuneStatus =
  | 'NOT_STARTED'
  | 'QUEUED'
  | 'FINETUNING_IN_PROGRESS'
  | 'DEPLOYING'
  | 'READY'
  | 'FAILED'
  | 'CANCELLED'
  | 'PAUSED'
  | 'UNKNOWN';

/**
 * Fine-tune hyperparameters
 */
export interface FineTuneHyperparameters {
  trainEpochs?: number;
  learningRate?: number;
  trainBatchSize?: number;
  earlyStoppingPatience?: number;
  earlyStoppingThreshold?: number;
}

/**
 * Fine-tune base model
 */
export interface FineTuneBaseModel {
  baseType: string;
  name?: string;
}

/**
 * Fine-tune settings
 */
export interface FineTuneSettings {
  baseModel?: FineTuneBaseModel;
  datasetId?: string;
  hyperparameters?: FineTuneHyperparameters;
}

/**
 * Fine-tuned model
 */
export interface FinetuneModel {
  /** Fine-tune ID */
  id: string;
  /** Fine-tune name */
  name: string;
  /** Status */
  status: FineTuneStatus;
  /** Settings */
  settings?: FineTuneSettings;
  /** Creation time */
  createdAt?: string;
  /** Completion time */
  completedAt?: string;
  /** Last used time */
  lastUsed?: string;
  /** Model ID when ready */
  modelId?: string;
  /** API metadata */
  meta?: ApiMeta;
}

/**
 * Create fine-tune request
 */
export interface CreateFinetuneRequest {
  /** Fine-tune name */
  name: string;
  /** Settings */
  settings: FineTuneSettings;
}

/**
 * List fine-tunes response
 */
export interface ListFinetuneResponse {
  finetunedModels: FinetuneModel[];
  nextPageToken?: string;
  totalSize?: number;
}

/**
 * Fine-tune service interface
 */
export interface FinetuneService {
  /**
   * Create a new fine-tune job
   */
  create(request: CreateFinetuneRequest): Promise<FinetuneModel>;

  /**
   * Get a fine-tune by ID
   */
  get(finetuneId: string): Promise<FinetuneModel>;

  /**
   * List all fine-tunes
   */
  list(): Promise<ListFinetuneResponse>;

  /**
   * Delete a fine-tune
   */
  delete(finetuneId: string): Promise<void>;
}

/**
 * Fine-tune service implementation
 */
export class FinetuneServiceImpl implements FinetuneService {
  private readonly transport: HttpTransport;
  private readonly config: CohereConfig;

  constructor(transport: HttpTransport, config: CohereConfig) {
    this.transport = transport;
    this.config = config;
  }

  /**
   * Create a new fine-tune job
   */
  async create(request: CreateFinetuneRequest): Promise<FinetuneModel> {
    this.validateRequest(request);

    const url = this.config.buildUrl('/finetuning/finetuned-models');
    const body = this.buildRequestBody(request);

    const response = await this.transport.send('POST', url, {}, body);
    return this.parseModel(response.body as Record<string, unknown>);
  }

  /**
   * Get a fine-tune by ID
   */
  async get(finetuneId: string): Promise<FinetuneModel> {
    if (!finetuneId || finetuneId.trim() === '') {
      throw new ValidationError('Fine-tune ID is required', [
        { field: 'finetuneId', message: 'Fine-tune ID is required', code: 'REQUIRED' },
      ]);
    }

    const url = this.config.buildUrl(`/finetuning/finetuned-models/${finetuneId}`);
    const response = await this.transport.send('GET', url, {});
    return this.parseModel(response.body as Record<string, unknown>);
  }

  /**
   * List all fine-tunes
   */
  async list(): Promise<ListFinetuneResponse> {
    const url = this.config.buildUrl('/finetuning/finetuned-models');
    const response = await this.transport.send('GET', url, {});
    const data = response.body as Record<string, unknown>;

    const models = Array.isArray(data['finetuned_models'])
      ? data['finetuned_models'].map((m: Record<string, unknown>) => this.parseModel(m))
      : [];

    return {
      finetunedModels: models,
      nextPageToken: data['next_page_token'] as string | undefined,
      totalSize: data['total_size'] as number | undefined,
    };
  }

  /**
   * Delete a fine-tune
   */
  async delete(finetuneId: string): Promise<void> {
    if (!finetuneId || finetuneId.trim() === '') {
      throw new ValidationError('Fine-tune ID is required', [
        { field: 'finetuneId', message: 'Fine-tune ID is required', code: 'REQUIRED' },
      ]);
    }

    const url = this.config.buildUrl(`/finetuning/finetuned-models/${finetuneId}`);
    await this.transport.send('DELETE', url, {});
  }

  private validateRequest(request: CreateFinetuneRequest): void {
    if (!request.name || request.name.trim() === '') {
      throw new ValidationError('Name is required', [
        { field: 'name', message: 'Fine-tune name is required', code: 'REQUIRED' },
      ]);
    }

    if (!request.settings) {
      throw new ValidationError('Settings are required', [
        { field: 'settings', message: 'Fine-tune settings are required', code: 'REQUIRED' },
      ]);
    }

    if (!request.settings.baseModel) {
      throw new ValidationError('Base model is required', [
        { field: 'settings.baseModel', message: 'Base model is required', code: 'REQUIRED' },
      ]);
    }

    if (!request.settings.datasetId) {
      throw new ValidationError('Dataset ID is required', [
        { field: 'settings.datasetId', message: 'Dataset ID is required', code: 'REQUIRED' },
      ]);
    }
  }

  private buildRequestBody(request: CreateFinetuneRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      name: request.name,
      settings: {
        base_model: request.settings.baseModel
          ? {
              base_type: request.settings.baseModel.baseType,
              name: request.settings.baseModel.name,
            }
          : undefined,
        dataset_id: request.settings.datasetId,
      },
    };

    if (request.settings.hyperparameters) {
      const hp = request.settings.hyperparameters;
      (body['settings'] as Record<string, unknown>)['hyperparameters'] = {
        train_epochs: hp.trainEpochs,
        learning_rate: hp.learningRate,
        train_batch_size: hp.trainBatchSize,
        early_stopping_patience: hp.earlyStoppingPatience,
        early_stopping_threshold: hp.earlyStoppingThreshold,
      };
    }

    return body;
  }

  private parseModel(data: Record<string, unknown>): FinetuneModel {
    const model = data['finetuned_model'] ?? data;
    const m = model as Record<string, unknown>;

    return {
      id: String(m['id'] ?? ''),
      name: String(m['name'] ?? ''),
      status: (m['status'] ?? 'UNKNOWN') as FineTuneStatus,
      settings: m['settings'] ? this.parseSettings(m['settings'] as Record<string, unknown>) : undefined,
      createdAt: m['created_at'] as string | undefined,
      completedAt: m['completed_at'] as string | undefined,
      lastUsed: m['last_used'] as string | undefined,
      modelId: m['model_id'] as string | undefined,
      meta: m['meta'] as FinetuneModel['meta'],
    };
  }

  private parseSettings(data: Record<string, unknown>): FineTuneSettings {
    const baseModel = data['base_model'] as Record<string, unknown> | undefined;
    const hyperparams = data['hyperparameters'] as Record<string, unknown> | undefined;

    return {
      baseModel: baseModel
        ? {
            baseType: String(baseModel['base_type'] ?? ''),
            name: baseModel['name'] as string | undefined,
          }
        : undefined,
      datasetId: data['dataset_id'] as string | undefined,
      hyperparameters: hyperparams
        ? {
            trainEpochs: hyperparams['train_epochs'] as number | undefined,
            learningRate: hyperparams['learning_rate'] as number | undefined,
            trainBatchSize: hyperparams['train_batch_size'] as number | undefined,
            earlyStoppingPatience: hyperparams['early_stopping_patience'] as number | undefined,
            earlyStoppingThreshold: hyperparams['early_stopping_threshold'] as number | undefined,
          }
        : undefined,
    };
  }
}

/**
 * Create a fine-tune request with common defaults
 */
export function createFinetuneRequest(
  name: string,
  baseModel: string,
  datasetId: string,
  hyperparameters?: FineTuneHyperparameters
): CreateFinetuneRequest {
  return {
    name,
    settings: {
      baseModel: { baseType: baseModel },
      datasetId,
      hyperparameters,
    },
  };
}

/**
 * Check if a fine-tune status is complete
 */
export function isFineTuneComplete(status: FineTuneStatus): boolean {
  return status === 'READY' || status === 'FAILED' || status === 'CANCELLED';
}

/**
 * Check if a fine-tune status is in progress
 */
export function isFineTuneInProgress(status: FineTuneStatus): boolean {
  return status === 'QUEUED' || status === 'FINETUNING_IN_PROGRESS' || status === 'DEPLOYING';
}
