/**
 * Models service module.
 */

import type { HttpTransport } from '../../transport';
import type { CohereConfig } from '../../config';
import { ValidationError, NotFoundError } from '../../errors';

/**
 * Model capability
 */
export type ModelCapability = 'chat' | 'generate' | 'embed' | 'rerank' | 'classify' | 'summarize';

/**
 * Model information
 */
export interface ModelInfo {
  /** Model name/ID */
  name: string;
  /** Model endpoints/capabilities */
  endpoints?: ModelCapability[];
  /** Whether model is fine-tuned */
  finetuned?: boolean;
  /** Context length */
  contextLength?: number;
  /** Tokenizer model */
  tokenizerUrl?: string;
  /** Whether model is default */
  default?: boolean;
}

/**
 * Model list response
 */
export interface ModelListResponse {
  /** Available models */
  models: ModelInfo[];
}

/**
 * Models service interface
 */
export interface ModelsService {
  /**
   * List available models
   */
  list(): Promise<ModelListResponse>;

  /**
   * Get a specific model
   */
  get(modelName: string): Promise<ModelInfo>;
}

/**
 * Models service implementation
 */
export class ModelsServiceImpl implements ModelsService {
  private readonly transport: HttpTransport;
  private readonly config: CohereConfig;

  constructor(transport: HttpTransport, config: CohereConfig) {
    this.transport = transport;
    this.config = config;
  }

  /**
   * List available models
   */
  async list(): Promise<ModelListResponse> {
    const url = this.config.buildUrl('/models');
    const response = await this.transport.send('GET', url, {});
    const data = response.body as Record<string, unknown>;

    const models = Array.isArray(data['models'])
      ? data['models'].map((m: Record<string, unknown>) => this.parseModel(m))
      : [];

    return { models };
  }

  /**
   * Get a specific model
   */
  async get(modelName: string): Promise<ModelInfo> {
    if (!modelName || modelName.trim() === '') {
      throw new ValidationError('Model name is required', [
        { field: 'modelName', message: 'Model name is required', code: 'REQUIRED' },
      ]);
    }

    const url = this.config.buildUrl(`/models/${modelName}`);
    try {
      const response = await this.transport.send('GET', url, {});
      return this.parseModel(response.body as Record<string, unknown>);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError(`Model not found: ${modelName}`, {
          resource: 'model',
          resourceId: modelName,
        });
      }
      throw error;
    }
  }

  private parseModel(data: Record<string, unknown>): ModelInfo {
    return {
      name: String(data['name'] ?? ''),
      endpoints: data['endpoints'] as ModelCapability[] | undefined,
      finetuned: data['finetuned'] as boolean | undefined,
      contextLength: data['context_length'] as number | undefined,
      tokenizerUrl: data['tokenizer_url'] as string | undefined,
      default: data['default'] as boolean | undefined,
    };
  }
}
