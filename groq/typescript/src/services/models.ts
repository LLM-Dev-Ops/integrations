/**
 * Models service for listing and retrieving model information.
 */

import { HttpTransport } from '../transport';
import { GroqError } from '../errors';
import { Model, ModelList } from '../types/models';

/**
 * Models service interface.
 */
export interface ModelsService {
  /**
   * Lists all available models.
   */
  list(): Promise<ModelList>;

  /**
   * Gets information about a specific model.
   */
  get(modelId: string): Promise<Model>;
}

/**
 * Default models service implementation.
 */
export class DefaultModelsService implements ModelsService {
  private readonly transport: HttpTransport;

  constructor(transport: HttpTransport) {
    this.transport = transport;
  }

  async list(): Promise<ModelList> {
    const response = await this.transport.request<ModelList>({
      method: 'GET',
      path: 'models',
    });

    return response.data;
  }

  async get(modelId: string): Promise<Model> {
    if (!modelId || modelId.length === 0) {
      throw GroqError.validation('Model ID is required', 'model');
    }

    const response = await this.transport.request<Model>({
      method: 'GET',
      path: `models/${encodeURIComponent(modelId)}`,
    });

    return response.data;
  }
}

/**
 * Creates a models service.
 */
export function createModelsService(transport: HttpTransport): ModelsService {
  return new DefaultModelsService(transport);
}
