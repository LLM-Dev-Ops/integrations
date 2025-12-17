import { startTelemetryContext, emitRequestComplete, emitError, } from '../../observability/telemetry.js';
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
        // Start telemetry context
        const telemetryContext = startTelemetryContext({
            operation: 'models.list',
        });
        try {
            const result = await this.resilience.execute(async () => {
                const headers = this.authManager.getHeaders();
                return this.transport.request('GET', '/v1/models', undefined, {
                    ...options,
                    headers: {
                        ...headers,
                        ...options?.headers,
                    },
                });
            });
            // Emit completion event with model count
            emitRequestComplete(telemetryContext, {
                modelCount: result.data?.length,
                hasMore: result.has_more,
            });
            return result;
        }
        catch (error) {
            // Emit error event
            emitError(telemetryContext, error);
            throw error;
        }
    }
    async retrieve(modelId, options) {
        if (!modelId || typeof modelId !== 'string' || modelId.trim() === '') {
            throw new Error('Model ID is required and must be a non-empty string');
        }
        // Start telemetry context
        const telemetryContext = startTelemetryContext({
            operation: 'models.retrieve',
            model: modelId,
            provider: modelId,
        });
        try {
            const result = await this.resilience.execute(async () => {
                const headers = this.authManager.getHeaders();
                return this.transport.request('GET', `/v1/models/${modelId}`, undefined, {
                    ...options,
                    headers: {
                        ...headers,
                        ...options?.headers,
                    },
                });
            });
            // Emit completion event
            emitRequestComplete(telemetryContext, {
                modelId: result.id,
                modelType: result.type,
            });
            return result;
        }
        catch (error) {
            // Emit error event
            emitError(telemetryContext, error);
            throw error;
        }
    }
}
export function createModelsService(transport, authManager, resilience) {
    return new ModelsServiceImpl(transport, authManager, resilience);
}
//# sourceMappingURL=service.js.map