/**
 * Cached content service for Gemini API.
 */
import type { CachedContent, CreateCachedContentRequest, UpdateCachedContentRequest, ListCachedContentsParams, ListCachedContentsResponse } from '../types/index.js';
import type { HttpClient } from '../client/index.js';
import { BaseService } from './base.js';
/**
 * Service for cached content management.
 */
export interface CachedContentService {
    /**
     * Create cached content.
     * @param request - The creation request
     * @returns The created cached content
     */
    create(request: CreateCachedContentRequest): Promise<CachedContent>;
    /**
     * List cached contents.
     * @param params - Optional pagination parameters
     * @returns The list of cached contents
     */
    list(params?: ListCachedContentsParams): Promise<ListCachedContentsResponse>;
    /**
     * Get cached content by name.
     * @param name - The cached content name
     * @returns The cached content
     */
    get(name: string): Promise<CachedContent>;
    /**
     * Update cached content TTL.
     * @param name - The cached content name
     * @param request - The update request
     * @returns The updated cached content
     */
    update(name: string, request: UpdateCachedContentRequest): Promise<CachedContent>;
    /**
     * Delete cached content.
     * @param name - The cached content name
     */
    delete(name: string): Promise<void>;
}
/**
 * Implementation of CachedContentService.
 */
export declare class CachedContentServiceImpl extends BaseService implements CachedContentService {
    constructor(httpClient: HttpClient);
    create(request: CreateCachedContentRequest): Promise<CachedContent>;
    list(params?: ListCachedContentsParams): Promise<ListCachedContentsResponse>;
    get(name: string): Promise<CachedContent>;
    update(name: string, request: UpdateCachedContentRequest): Promise<CachedContent>;
    delete(name: string): Promise<void>;
}
//# sourceMappingURL=cached-content.d.ts.map