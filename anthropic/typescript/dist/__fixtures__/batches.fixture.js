/**
 * Mock factory for creating batch request counts
 */
export function mockBatchRequestCounts(overrides) {
    return {
        succeeded: 0,
        errored: 0,
        expired: 0,
        canceled: 0,
        ...overrides,
    };
}
/**
 * Mock factory for creating test message batch
 */
export function mockMessageBatch(overrides) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
    return {
        id: 'msgbatch_01ABC123DEF456',
        type: 'message_batch',
        processing_status: 'in_progress',
        request_counts: mockBatchRequestCounts(),
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        ...overrides,
    };
}
/**
 * Mock factory for creating batch request
 */
export function mockBatchRequest(overrides) {
    return {
        custom_id: 'request-1',
        params: {
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            messages: [{ role: 'user', content: 'Hello, Claude!' }],
        },
        ...overrides,
    };
}
/**
 * Mock factory for creating create batch request
 */
export function mockCreateBatchRequest(overrides) {
    return {
        requests: [
            mockBatchRequest({ custom_id: 'request-1' }),
            mockBatchRequest({ custom_id: 'request-2' }),
        ],
        ...overrides,
    };
}
/**
 * Mock factory for creating batch list response
 */
export function mockBatchListResponse(overrides) {
    return {
        data: [
            mockMessageBatch({ id: 'msgbatch_01ABC123', processing_status: 'ended' }),
            mockMessageBatch({ id: 'msgbatch_01DEF456', processing_status: 'in_progress' }),
        ],
        has_more: false,
        first_id: 'msgbatch_01ABC123',
        last_id: 'msgbatch_01DEF456',
        ...overrides,
    };
}
/**
 * Mock factory for creating batch result item
 */
export function mockBatchResultItem(overrides) {
    return {
        custom_id: 'request-1',
        result: {
            type: 'succeeded',
            message: {
                id: 'msg_01XYZ',
                type: 'message',
                role: 'assistant',
                content: [{ type: 'text', text: 'Hello! How can I help you today?' }],
                model: 'claude-3-5-sonnet-20241022',
                stop_reason: 'end_turn',
                stop_sequence: null,
                usage: {
                    input_tokens: 10,
                    output_tokens: 12,
                },
            },
        },
        ...overrides,
    };
}
/**
 * Mock factory for creating batch results response
 */
export function mockBatchResultsResponse(count = 2) {
    const results = [];
    for (let i = 0; i < count; i++) {
        results.push(mockBatchResultItem({
            custom_id: `request-${i + 1}`,
        }));
    }
    return results;
}
/**
 * Predefined batch status fixtures
 */
export const BATCH_IN_PROGRESS = mockMessageBatch({
    id: 'msgbatch_01INPROGRESS',
    processing_status: 'in_progress',
    request_counts: mockBatchRequestCounts({
        succeeded: 5,
        errored: 1,
    }),
});
export const BATCH_ENDED = mockMessageBatch({
    id: 'msgbatch_01ENDED',
    processing_status: 'ended',
    request_counts: mockBatchRequestCounts({
        succeeded: 10,
        errored: 0,
    }),
    ended_at: new Date().toISOString(),
    results_url: 'https://api.anthropic.com/v1/messages/batches/msgbatch_01ENDED/results',
});
export const BATCH_CANCELING = mockMessageBatch({
    id: 'msgbatch_01CANCELING',
    processing_status: 'canceling',
    request_counts: mockBatchRequestCounts({
        succeeded: 3,
        canceled: 2,
    }),
    cancel_initiated_at: new Date().toISOString(),
});
export const BATCH_CANCELED = mockMessageBatch({
    id: 'msgbatch_01CANCELED',
    processing_status: 'canceled',
    request_counts: mockBatchRequestCounts({
        succeeded: 2,
        canceled: 8,
    }),
    ended_at: new Date().toISOString(),
    cancel_initiated_at: new Date(Date.now() - 60000).toISOString(),
});
/**
 * Predefined batch result fixtures
 */
export const BATCH_RESULT_SUCCEEDED = mockBatchResultItem({
    custom_id: 'request-success',
    result: {
        type: 'succeeded',
        message: {
            id: 'msg_01SUCCESS',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'This is a successful response.' }],
            model: 'claude-3-5-sonnet-20241022',
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: {
                input_tokens: 15,
                output_tokens: 8,
            },
        },
    },
});
export const BATCH_RESULT_ERRORED = {
    custom_id: 'request-error',
    result: {
        type: 'errored',
        error: {
            type: 'invalid_request_error',
            message: 'The request was invalid',
        },
    },
};
export const BATCH_RESULT_EXPIRED = {
    custom_id: 'request-expired',
    result: {
        type: 'expired',
    },
};
export const BATCH_RESULT_CANCELED = {
    custom_id: 'request-canceled',
    result: {
        type: 'canceled',
    },
};
/**
 * Helper to create a batch request with specific message params
 */
export function createBatchRequestWithParams(customId, params) {
    return {
        custom_id: customId,
        params,
    };
}
/**
 * Helper to create a batch with specific status and counts
 */
export function createBatchWithStatus(status, counts) {
    return mockMessageBatch({
        processing_status: status,
        request_counts: mockBatchRequestCounts(counts),
        ...(status === 'ended' || status === 'canceled'
            ? { ended_at: new Date().toISOString() }
            : {}),
        ...(status === 'canceling' || status === 'canceled'
            ? { cancel_initiated_at: new Date(Date.now() - 30000).toISOString() }
            : {}),
        ...(status === 'ended'
            ? { results_url: 'https://api.anthropic.com/v1/messages/batches/msgbatch_01ABC123/results' }
            : {}),
    });
}
/**
 * Helper to create mixed batch results
 */
export function createMixedBatchResults() {
    return [
        BATCH_RESULT_SUCCEEDED,
        BATCH_RESULT_ERRORED,
        BATCH_RESULT_EXPIRED,
        BATCH_RESULT_CANCELED,
    ];
}
//# sourceMappingURL=batches.fixture.js.map