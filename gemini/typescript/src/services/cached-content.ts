/**
 * Cached content service for Gemini API.
 */

import type {
  CachedContent,
  CreateCachedContentRequest,
  UpdateCachedContentRequest,
  ListCachedContentsParams,
  ListCachedContentsResponse,
} from '../types/index.js';
import type { HttpClient } from '../client/index.js';
import { ValidationError } from '../error/index.js';
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
 * Validate create cached content request.
 */
function validateCreateRequest(request: CreateCachedContentRequest): void {
  if (!request.model) {
    throw new ValidationError('Model is required');
  }

  if (!request.contents || request.contents.length === 0) {
    throw new ValidationError('Contents array is required and must not be empty');
  }

  if (request.ttl && request.expireTime) {
    throw new ValidationError('Cannot specify both ttl and expireTime');
  }

  if (!request.ttl && !request.expireTime) {
    throw new ValidationError('Must specify either ttl or expireTime');
  }
}

/**
 * Validate update cached content request.
 */
function validateUpdateRequest(request: UpdateCachedContentRequest): void {
  if (request.ttl && request.expireTime) {
    throw new ValidationError('Cannot specify both ttl and expireTime');
  }

  if (!request.ttl && !request.expireTime) {
    throw new ValidationError('Must specify either ttl or expireTime');
  }
}

/**
 * Implementation of CachedContentService.
 */
export class CachedContentServiceImpl extends BaseService implements CachedContentService {
  constructor(httpClient: HttpClient) {
    super(httpClient);
  }

  async create(request: CreateCachedContentRequest): Promise<CachedContent> {
    validateCreateRequest(request);

    const url = this.buildUrl('cachedContents');
    const headers = this.getHeaders('application/json');

    const response = await this.fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    const data = await response.json();
    return data as CachedContent;
  }

  async list(params?: ListCachedContentsParams): Promise<ListCachedContentsResponse> {
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

    const url = this.buildUrl('cachedContents', queryParams);
    const headers = this.getHeaders();

    const response = await this.fetch(url, {
      method: 'GET',
      headers,
    });

    const data = await response.json();
    return data as ListCachedContentsResponse;
  }

  async get(name: string): Promise<CachedContent> {
    if (!name) {
      throw new ValidationError('Name cannot be empty');
    }

    // Normalize name
    const contentName = name.startsWith('cachedContents/') ? name : `cachedContents/${name}`;

    const url = this.buildUrl(contentName);
    const headers = this.getHeaders();

    const response = await this.fetch(url, {
      method: 'GET',
      headers,
    });

    const data = await response.json();
    return data as CachedContent;
  }

  async update(name: string, request: UpdateCachedContentRequest): Promise<CachedContent> {
    if (!name) {
      throw new ValidationError('Name cannot be empty');
    }

    validateUpdateRequest(request);

    // Normalize name
    const contentName = name.startsWith('cachedContents/') ? name : `cachedContents/${name}`;

    // Build update mask
    const updateMask: string[] = [];
    if (request.ttl !== undefined) {
      updateMask.push('ttl');
    }
    if (request.expireTime !== undefined) {
      updateMask.push('expireTime');
    }

    const queryParams: Record<string, string> = {};
    if (updateMask.length > 0) {
      queryParams.updateMask = updateMask.join(',');
    }

    const url = this.buildUrl(contentName, queryParams);
    const headers = this.getHeaders('application/json');

    const response = await this.fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(request),
    });

    const data = await response.json();
    return data as CachedContent;
  }

  async delete(name: string): Promise<void> {
    if (!name) {
      throw new ValidationError('Name cannot be empty');
    }

    // Normalize name
    const contentName = name.startsWith('cachedContents/') ? name : `cachedContents/${name}`;

    const url = this.buildUrl(contentName);
    const headers = this.getHeaders();

    await this.fetch(url, {
      method: 'DELETE',
      headers,
    });
  }
}
