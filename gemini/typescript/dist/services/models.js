/**
 * Models service for Gemini API.
 */
import { ValidationError } from '../error/index.js';
import { BaseService } from './base.js';
/**
 * Implementation of ModelsService with optional caching.
 */
export class ModelsServiceImpl extends BaseService {
    static CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    cache = new Map();
    constructor(httpClient) {
        super(httpClient);
    }
    async list(params) {
        if (params?.pageSize !== undefined && params.pageSize < 1) {
            throw new ValidationError('PageSize must be positive');
        }
        const queryParams = {};
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
        return data;
    }
    async get(model) {
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
        const modelData = data;
        // Update cache
        this.cache.set(modelName, {
            model: modelData,
            cachedAt: Date.now(),
        });
        return modelData;
    }
    async listAll() {
        const allModels = [];
        let pageToken;
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
    clearCache() {
        this.cache.clear();
    }
    /**
     * Remove expired entries from cache.
     */
    pruneCache() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.cachedAt >= ModelsServiceImpl.CACHE_TTL_MS) {
                this.cache.delete(key);
            }
        }
    }
}
//# sourceMappingURL=models.js.map