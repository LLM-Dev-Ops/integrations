export class ModelsServiceImpl {
    transport;
    authManager;
    resilience;
    constructor(transport, authManager, resilience) {
        this.transport = transport;
        this.authManager = authManager;
        this.resilience = resilience;
    }
    async list(options) {
        return this.resilience.execute(async () => {
            const headers = this.authManager.getHeaders();
            return this.transport.request('GET', '/v1/models', undefined, {
                ...options,
                headers: {
                    ...headers,
                    ...options?.headers,
                },
            });
        });
    }
    async retrieve(modelId, options) {
        if (!modelId || typeof modelId !== 'string' || modelId.trim() === '') {
            throw new Error('Model ID is required and must be a non-empty string');
        }
        return this.resilience.execute(async () => {
            const headers = this.authManager.getHeaders();
            return this.transport.request('GET', `/v1/models/${modelId}`, undefined, {
                ...options,
                headers: {
                    ...headers,
                    ...options?.headers,
                },
            });
        });
    }
}
export function createModelsService(transport, authManager, resilience) {
    return new ModelsServiceImpl(transport, authManager, resilience);
}
//# sourceMappingURL=service.js.map