import { ValidationError } from '../../errors/categories.js';
export class BatchesServiceImpl {
    transport;
    authManager;
    resilience;
    constructor(transport, authManager, resilience) {
        this.transport = transport;
        this.authManager = authManager;
        this.resilience = resilience;
    }
    async create(request, options) {
        this.validateCreateBatchRequest(request);
        return this.resilience.execute(async () => {
            const headers = this.authManager.getHeaders();
            return this.transport.request('POST', '/v1/messages/batches', request, {
                ...options,
                headers: {
                    ...headers,
                    ...options?.headers,
                },
            });
        });
    }
    async retrieve(batchId, options) {
        if (!batchId || typeof batchId !== 'string' || batchId.trim() === '') {
            throw new ValidationError('Batch ID is required and must be a non-empty string');
        }
        return this.resilience.execute(async () => {
            const headers = this.authManager.getHeaders();
            return this.transport.request('GET', `/v1/messages/batches/${batchId}`, undefined, {
                ...options,
                headers: {
                    ...headers,
                    ...options?.headers,
                },
            });
        });
    }
    async list(params, options) {
        if (params) {
            this.validateListParams(params);
        }
        return this.resilience.execute(async () => {
            const headers = this.authManager.getHeaders();
            const queryParams = this.buildQueryParams(params);
            const path = queryParams ? `/v1/messages/batches?${queryParams}` : '/v1/messages/batches';
            return this.transport.request('GET', path, undefined, {
                ...options,
                headers: {
                    ...headers,
                    ...options?.headers,
                },
            });
        });
    }
    async cancel(batchId, options) {
        if (!batchId || typeof batchId !== 'string' || batchId.trim() === '') {
            throw new ValidationError('Batch ID is required and must be a non-empty string');
        }
        return this.resilience.execute(async () => {
            const headers = this.authManager.getHeaders();
            return this.transport.request('POST', `/v1/messages/batches/${batchId}/cancel`, undefined, {
                ...options,
                headers: {
                    ...headers,
                    ...options?.headers,
                },
            });
        });
    }
    async results(batchId, options) {
        if (!batchId || typeof batchId !== 'string' || batchId.trim() === '') {
            throw new ValidationError('Batch ID is required and must be a non-empty string');
        }
        return this.resilience.execute(async () => {
            const headers = this.authManager.getHeaders();
            return this.transport.request('GET', `/v1/messages/batches/${batchId}/results`, undefined, {
                ...options,
                headers: {
                    ...headers,
                    ...options?.headers,
                },
            });
        });
    }
    validateCreateBatchRequest(request) {
        if (!request) {
            throw new ValidationError('Request is required');
        }
        if (!request.requests || !Array.isArray(request.requests)) {
            throw new ValidationError('Requests must be an array');
        }
        if (request.requests.length === 0) {
            throw new ValidationError('Requests array cannot be empty');
        }
        for (let i = 0; i < request.requests.length; i++) {
            const batchRequest = request.requests[i];
            if (!batchRequest || !batchRequest.custom_id || typeof batchRequest.custom_id !== 'string') {
                throw new ValidationError(`Request at index ${i} must have a valid custom_id`);
            }
            if (!batchRequest.params) {
                throw new ValidationError(`Request at index ${i} must have params`);
            }
            const params = batchRequest.params;
            // Basic validation of message params
            if (!params.model || typeof params.model !== 'string') {
                throw new ValidationError(`Request at index ${i}: model is required`);
            }
            if (!params.max_tokens || typeof params.max_tokens !== 'number' || params.max_tokens <= 0) {
                throw new ValidationError(`Request at index ${i}: max_tokens must be a positive number`);
            }
            if (!params.messages || !Array.isArray(params.messages) || params.messages.length === 0) {
                throw new ValidationError(`Request at index ${i}: messages must be a non-empty array`);
            }
        }
    }
    validateListParams(params) {
        if (params.before_id && params.after_id) {
            throw new ValidationError('Cannot specify both before_id and after_id');
        }
        if (params.limit !== undefined) {
            if (typeof params.limit !== 'number' || params.limit <= 0) {
                throw new ValidationError('Limit must be a positive number');
            }
        }
    }
    buildQueryParams(params) {
        if (!params) {
            return '';
        }
        const queryParts = [];
        if (params.before_id) {
            queryParts.push(`before_id=${encodeURIComponent(params.before_id)}`);
        }
        if (params.after_id) {
            queryParts.push(`after_id=${encodeURIComponent(params.after_id)}`);
        }
        if (params.limit !== undefined) {
            queryParts.push(`limit=${params.limit}`);
        }
        return queryParts.join('&');
    }
}
export function createBatchesService(transport, authManager, resilience) {
    return new BatchesServiceImpl(transport, authManager, resilience);
}
//# sourceMappingURL=service.js.map