import type { HttpTransport, RequestOptions } from '../../transport/http-transport.js';
import type { AuthManager } from '../../auth/auth-manager.js';
import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type { MessageBatch, CreateBatchRequest, BatchListParams, BatchListResponse, BatchResultsResponse } from './types.js';
export interface BatchesService {
    create(request: CreateBatchRequest, options?: RequestOptions): Promise<MessageBatch>;
    retrieve(batchId: string, options?: RequestOptions): Promise<MessageBatch>;
    list(params?: BatchListParams, options?: RequestOptions): Promise<BatchListResponse>;
    cancel(batchId: string, options?: RequestOptions): Promise<MessageBatch>;
    results(batchId: string, options?: RequestOptions): Promise<BatchResultsResponse>;
}
export declare class BatchesServiceImpl implements BatchesService {
    private readonly transport;
    private readonly authManager;
    private readonly resilience;
    constructor(transport: HttpTransport, authManager: AuthManager, resilience: ResilienceOrchestrator);
    create(request: CreateBatchRequest, options?: RequestOptions): Promise<MessageBatch>;
    retrieve(batchId: string, options?: RequestOptions): Promise<MessageBatch>;
    list(params?: BatchListParams, options?: RequestOptions): Promise<BatchListResponse>;
    cancel(batchId: string, options?: RequestOptions): Promise<MessageBatch>;
    results(batchId: string, options?: RequestOptions): Promise<BatchResultsResponse>;
    private validateCreateBatchRequest;
    private validateListParams;
    private buildQueryParams;
}
export declare function createBatchesService(transport: HttpTransport, authManager: AuthManager, resilience: ResilienceOrchestrator): BatchesService;
//# sourceMappingURL=service.d.ts.map