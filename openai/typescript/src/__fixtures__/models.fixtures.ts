import type { PaginatedResponse } from '../types/common.js';

export interface Model {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
}

export interface ModelDeleteResponse {
  id: string;
  object: 'model';
  deleted: boolean;
}

export function createModel(overrides?: Partial<Model>): Model {
  return {
    id: 'gpt-4',
    object: 'model',
    created: 1687882411,
    owned_by: 'openai',
    ...overrides,
  };
}

export function createModelListResponse(): PaginatedResponse<Model> {
  return {
    object: 'list',
    data: [
      createModel({ id: 'gpt-4', owned_by: 'openai' }),
      createModel({ id: 'gpt-4-turbo', owned_by: 'openai' }),
      createModel({ id: 'gpt-3.5-turbo', owned_by: 'openai' }),
      createModel({ id: 'text-embedding-ada-002', owned_by: 'openai' }),
      createModel({ id: 'whisper-1', owned_by: 'openai' }),
      createModel({ id: 'dall-e-3', owned_by: 'openai' }),
      createModel({ id: 'tts-1', owned_by: 'openai' }),
    ],
    has_more: false,
  };
}

export function createModelDeleteResponse(
  overrides?: Partial<ModelDeleteResponse>
): ModelDeleteResponse {
  return {
    id: 'ft:gpt-3.5-turbo:acme:suffix:abc123',
    object: 'model',
    deleted: true,
    ...overrides,
  };
}

export function createFineTunedModel(): Model {
  return createModel({
    id: 'ft:gpt-3.5-turbo:acme:suffix:abc123',
    owned_by: 'acme',
  });
}
