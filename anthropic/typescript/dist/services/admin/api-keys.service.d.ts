import { HttpTransport } from '../../transport/index.js';
import { AuthManager } from '../../auth/index.js';
import { ResilienceOrchestrator } from '../../resilience/index.js';
import { ApiKey, ApiKeyWithSecret, CreateApiKeyRequest, UpdateApiKeyRequest, ListParams, ListResponse } from './types.js';
export interface ApiKeysService {
    list(params?: ListParams): Promise<ListResponse<ApiKey>>;
    get(apiKeyId: string): Promise<ApiKey>;
    create(request: CreateApiKeyRequest): Promise<ApiKeyWithSecret>;
    update(apiKeyId: string, request: UpdateApiKeyRequest): Promise<ApiKey>;
}
export declare class ApiKeysServiceImpl implements ApiKeysService {
    private transport;
    private authManager;
    private resilience;
    constructor(transport: HttpTransport, authManager: AuthManager, resilience: ResilienceOrchestrator);
    list(params?: ListParams): Promise<ListResponse<ApiKey>>;
    get(apiKeyId: string): Promise<ApiKey>;
    create(request: CreateApiKeyRequest): Promise<ApiKeyWithSecret>;
    update(apiKeyId: string, request: UpdateApiKeyRequest): Promise<ApiKey>;
    private buildQueryParams;
}
//# sourceMappingURL=api-keys.service.d.ts.map