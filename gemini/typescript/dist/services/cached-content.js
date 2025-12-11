/**
 * Cached content service for Gemini API.
 */
import { ValidationError } from '../error/index.js';
import { BaseService } from './base.js';
/**
 * Validate create cached content request.
 */
function validateCreateRequest(request) {
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
function validateUpdateRequest(request) {
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
export class CachedContentServiceImpl extends BaseService {
    constructor(httpClient) {
        super(httpClient);
    }
    async create(request) {
        validateCreateRequest(request);
        const url = this.buildUrl('cachedContents');
        const headers = this.getHeaders('application/json');
        const response = await this.fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(request),
        });
        const data = await response.json();
        return data;
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
        const url = this.buildUrl('cachedContents', queryParams);
        const headers = this.getHeaders();
        const response = await this.fetch(url, {
            method: 'GET',
            headers,
        });
        const data = await response.json();
        return data;
    }
    async get(name) {
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
        return data;
    }
    async update(name, request) {
        if (!name) {
            throw new ValidationError('Name cannot be empty');
        }
        validateUpdateRequest(request);
        // Normalize name
        const contentName = name.startsWith('cachedContents/') ? name : `cachedContents/${name}`;
        // Build update mask
        const updateMask = [];
        if (request.ttl !== undefined) {
            updateMask.push('ttl');
        }
        if (request.expireTime !== undefined) {
            updateMask.push('expireTime');
        }
        const queryParams = {};
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
        return data;
    }
    async delete(name) {
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
//# sourceMappingURL=cached-content.js.map