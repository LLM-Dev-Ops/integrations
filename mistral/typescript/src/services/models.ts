/**
 * Models service.
 */

import type { HttpTransport } from '../transport';
import type {
  Model,
  ModelListResponse,
  DeleteModelResponse,
  ArchiveModelResponse,
  UnarchiveModelResponse,
  UpdateModelRequest,
} from '../types/models';

/**
 * Models service interface.
 */
export interface ModelsService {
  /** Lists all available models. */
  list(): Promise<ModelListResponse>;

  /** Retrieves a specific model. */
  retrieve(modelId: string): Promise<Model>;

  /** Deletes a fine-tuned model. */
  delete(modelId: string): Promise<DeleteModelResponse>;

  /** Updates a fine-tuned model. */
  update(modelId: string, request: UpdateModelRequest): Promise<Model>;

  /** Archives a fine-tuned model. */
  archive(modelId: string): Promise<ArchiveModelResponse>;

  /** Unarchives a fine-tuned model. */
  unarchive(modelId: string): Promise<UnarchiveModelResponse>;
}

/**
 * Default implementation of the models service.
 */
export class DefaultModelsService implements ModelsService {
  constructor(private readonly transport: HttpTransport) {}

  async list(): Promise<ModelListResponse> {
    const body = await this.transport.get('/v1/models');
    return JSON.parse(body) as ModelListResponse;
  }

  async retrieve(modelId: string): Promise<Model> {
    const body = await this.transport.get(`/v1/models/${modelId}`);
    return JSON.parse(body) as Model;
  }

  async delete(modelId: string): Promise<DeleteModelResponse> {
    const body = await this.transport.delete(`/v1/models/${modelId}`);
    return JSON.parse(body) as DeleteModelResponse;
  }

  async update(modelId: string, request: UpdateModelRequest): Promise<Model> {
    const body = await this.transport.patch(`/v1/models/${modelId}`, request);
    return JSON.parse(body) as Model;
  }

  async archive(modelId: string): Promise<ArchiveModelResponse> {
    const body = await this.transport.post(`/v1/models/${modelId}/archive`, {});
    return JSON.parse(body) as ArchiveModelResponse;
  }

  async unarchive(modelId: string): Promise<UnarchiveModelResponse> {
    const body = await this.transport.delete(`/v1/models/${modelId}/archive`);
    return JSON.parse(body) as UnarchiveModelResponse;
  }
}

/**
 * Creates a models service.
 */
export function createModelsService(transport: HttpTransport): ModelsService {
  return new DefaultModelsService(transport);
}
