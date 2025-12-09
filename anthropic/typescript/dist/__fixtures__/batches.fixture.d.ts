import type { MessageBatch, BatchRequest, CreateBatchRequest, BatchListResponse, BatchResultItem, BatchResultsResponse, BatchStatus, BatchRequestCounts } from '../services/batches/types.js';
import type { CreateMessageRequest } from '../services/messages/types.js';
/**
 * Mock factory for creating batch request counts
 */
export declare function mockBatchRequestCounts(overrides?: Partial<BatchRequestCounts>): BatchRequestCounts;
/**
 * Mock factory for creating test message batch
 */
export declare function mockMessageBatch(overrides?: Partial<MessageBatch>): MessageBatch;
/**
 * Mock factory for creating batch request
 */
export declare function mockBatchRequest(overrides?: Partial<BatchRequest>): BatchRequest;
/**
 * Mock factory for creating create batch request
 */
export declare function mockCreateBatchRequest(overrides?: Partial<CreateBatchRequest>): CreateBatchRequest;
/**
 * Mock factory for creating batch list response
 */
export declare function mockBatchListResponse(overrides?: Partial<BatchListResponse>): BatchListResponse;
/**
 * Mock factory for creating batch result item
 */
export declare function mockBatchResultItem(overrides?: Partial<BatchResultItem>): BatchResultItem;
/**
 * Mock factory for creating batch results response
 */
export declare function mockBatchResultsResponse(count?: number): BatchResultsResponse;
/**
 * Predefined batch status fixtures
 */
export declare const BATCH_IN_PROGRESS: MessageBatch;
export declare const BATCH_ENDED: MessageBatch;
export declare const BATCH_CANCELING: MessageBatch;
export declare const BATCH_CANCELED: MessageBatch;
/**
 * Predefined batch result fixtures
 */
export declare const BATCH_RESULT_SUCCEEDED: BatchResultItem;
export declare const BATCH_RESULT_ERRORED: BatchResultItem;
export declare const BATCH_RESULT_EXPIRED: BatchResultItem;
export declare const BATCH_RESULT_CANCELED: BatchResultItem;
/**
 * Helper to create a batch request with specific message params
 */
export declare function createBatchRequestWithParams(customId: string, params: CreateMessageRequest): BatchRequest;
/**
 * Helper to create a batch with specific status and counts
 */
export declare function createBatchWithStatus(status: BatchStatus, counts?: Partial<BatchRequestCounts>): MessageBatch;
/**
 * Helper to create mixed batch results
 */
export declare function createMixedBatchResults(): BatchResultsResponse;
//# sourceMappingURL=batches.fixture.d.ts.map