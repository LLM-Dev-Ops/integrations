import type { HttpTransport, RequestOptions } from '../../transport/http-transport.js';
import type { AuthManager } from '../../auth/auth-manager.js';
import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type { ModelInfo, ModelListResponse } from './types.js';
export interface ModelsService {
    list(options?: RequestOptions): Promise<ModelListResponse>;
    retrieve(modelId: string, options?: RequestOptions): Promise<ModelInfo>;
}
export declare class ModelsServiceImpl implements ModelsService {
    private readonly transport;
    private readonly authManager;
    private readonly resilience;
    constructor(transport: HttpTransport, authManager: AuthManager, resilience: ResilienceOrchestrator);
    list(options?: RequestOptions): Promise<ModelListResponse>;
    retrieve(modelId: string, options?: RequestOptions): Promise<ModelInfo>;
}
export declare function createModelsService(transport: HttpTransport, authManager: AuthManager, resilience: ResilienceOrchestrator): ModelsService;
//# sourceMappingURL=service.d.ts.map