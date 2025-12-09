import type { CreateMessageRequest, Message } from '../messages/types.js';
export type BatchStatus = 'in_progress' | 'ended' | 'canceling' | 'canceled';
export interface BatchRequestCounts {
    succeeded: number;
    errored: number;
    expired: number;
    canceled: number;
}
export interface MessageBatch {
    id: string;
    type: 'message_batch';
    processing_status: BatchStatus;
    request_counts: BatchRequestCounts;
    ended_at?: string;
    created_at: string;
    expires_at: string;
    cancel_initiated_at?: string;
    results_url?: string;
}
export interface BatchRequest {
    custom_id: string;
    params: CreateMessageRequest;
}
export interface CreateBatchRequest {
    requests: BatchRequest[];
}
export interface BatchListParams {
    before_id?: string;
    after_id?: string;
    limit?: number;
}
export interface BatchListResponse {
    data: MessageBatch[];
    has_more: boolean;
    first_id?: string;
    last_id?: string;
}
export interface BatchResultItem {
    custom_id: string;
    result: {
        type: 'succeeded' | 'errored' | 'expired' | 'canceled';
        message?: Message;
        error?: {
            type: string;
            message: string;
        };
    };
}
export type BatchResultsResponse = BatchResultItem[];
//# sourceMappingURL=types.d.ts.map