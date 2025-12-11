/**
 * Models service for Gemini API.
 */

import type { Model, ListModelsParams, ListModelsResponse } from '../types/index.js';
import type { HttpClient } from '../client/index.js';
import { ValidationError } from '../error/index.js';
import { BaseService } from './base.js';

/**
 * Service for listing and retrieving model information.
 */
export interface ModelsService {
  /**
   * List all available models.
   * @param params - Optional pagination parameters
   * @returns The list of models
   */
  list(params?: ListModelsParams): Promise<ListModelsResponse>;

  /**
   * Get a specific model by name.
   * @param model - The model name
   * @returns The model information
   */
  get(model: string): Promise<Model>;

  /**
   * List all models across all pages.
   * @returns All available models
   */
  listAll(): Promise<Model[]>;
}

/**
 * Cache entry for model information.
 */
interface ModelCacheEntry {
  model: Model;
  cachedAt: number;
}

/**
 * Implementation of ModelsService with optional caching.
 */
export class ModelsServiceImpl extends BaseService implements ModelsService {
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly cache: Map<string, ModelCacheEntry> = new Map();

  constructor(httpClient: HttpClient) {
    super(httpClient);
  }

  async list(params?: ListModelsParams): Promise<ListModelsResponse> {
    if (params?.pageSize !== undefined && params.pageSize < 1) {
      throw new ValidationError('PageSize must be positive');
    }

    const queryParams: Record<string, string> = {};
    if (params?.pageSize !== undefined) {
      queryParams.pageSize = params.pageSize.toString();
    }
    if (params?.pageToken) {
      queryParams.pageToken = params.pageToken;
    }

    const url = this.buildUrl('models', queryParams);
    const headers = this.getHeaders();

    const response = await this.fetch(url, {
      method: 'GET',
      headers,
    });

    const data = await response.json();
    return data as ListModelsResponse;
  }

  async get(model: string): Promise<Model> {
    if (!model) {
      throw new ValidationError('Model name cannot be empty');
    }

    // Normalize model name (remove "models/" prefix if present)
    const modelName = model.startsWith('models/') ? model : `models/${model}`;

    // Check cache
    const cached = this.cache.get(modelName);
    if (cached && Date.now() - cached.cachedAt < ModelsServiceImpl.CACHE_TTL_MS) {
      return cached.model;
    }

    const url = this.buildUrl(modelName);
    const headers = this.getHeaders();

    const response = await this.fetch(url, {
      method: 'GET',
      headers,
    });

    const data = await response.json();
    const modelData = data as Model;

    // Update cache
    this.cache.set(modelName, {
      model: modelData,
      cachedAt: Date.now(),
    });

    return modelData;
  }

  async listAll(): Promise<Model[]> {
    const allModels: Model[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.list({ pageToken });
      allModels.push(...response.models);
      pageToken = response.nextPageToken;
    } while (pageToken);

    return allModels;
  }

  /**
   * Clear the model cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Remove expired entries from cache.
   */
  pruneCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.cachedAt >= ModelsServiceImpl.CACHE_TTL_MS) {
        this.cache.delete(key);
      }
    }
  }
}
