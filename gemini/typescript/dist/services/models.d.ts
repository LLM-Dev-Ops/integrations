/**
 * Models service for Gemini API.
 */
import type { Model, ListModelsParams, ListModelsResponse } from '../types/index.js';
import type { HttpClient } from '../client/index.js';
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
 * Implementation of ModelsService with optional caching.
 */
export declare class ModelsServiceImpl extends BaseService implements ModelsService {
    private static readonly CACHE_TTL_MS;
    private readonly cache;
    constructor(httpClient: HttpClient);
    list(params?: ListModelsParams): Promise<ListModelsResponse>;
    get(model: string): Promise<Model>;
    listAll(): Promise<Model[]>;
    /**
     * Clear the model cache.
     */
    clearCache(): void;
    /**
     * Remove expired entries from cache.
     */
    pruneCache(): void;
}
//# sourceMappingURL=models.d.ts.map