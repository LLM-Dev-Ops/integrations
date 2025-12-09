/**
 * Test fixtures for Anthropic API responses
 * These fixtures represent realistic API responses for testing
 */
/**
 * Sample API keys for testing (not real keys)
 */
export const FIXTURE_API_KEYS = {
    valid: 'sk-ant-api03-test-valid-key-for-testing-purposes-only',
    invalid: 'invalid-key-format',
    empty: '',
    malformed: 'not-a-real-key',
};
/**
 * Sample model IDs
 */
export const FIXTURE_MODELS = {
    sonnet35: 'claude-3-5-sonnet-20241022',
    haiku35: 'claude-3-5-haiku-20241022',
    opus3: 'claude-3-opus-20240229',
    sonnet3: 'claude-3-sonnet-20240229',
    haiku3: 'claude-3-haiku-20240307',
};
/**
 * Sample message fixtures
 */
export const FIXTURE_MESSAGES = {
    simpleUser: {
        role: 'user',
        content: 'Hello, Claude!',
    },
    simpleAssistant: {
        role: 'assistant',
        content: 'Hello! How can I help you today?',
    },
    multiBlock: {
        role: 'user',
        content: [
            { type: 'text', text: 'What is in this image?' },
            {
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: 'image/png',
                    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                },
            },
        ],
    },
    withToolUse: {
        role: 'assistant',
        content: [
            { type: 'text', text: 'I will check the weather for you.' },
            {
                type: 'tool_use',
                id: 'toolu_01A09q90qw90lq917835lq9',
                name: 'get_weather',
                input: { location: 'San Francisco, CA' },
            },
        ],
    },
    withToolResult: {
        role: 'user',
        content: [
            {
                type: 'tool_result',
                tool_use_id: 'toolu_01A09q90qw90lq917835lq9',
                content: 'The weather in San Francisco is sunny, 72°F',
            },
        ],
    },
};
/**
 * Sample usage fixtures
 */
export const FIXTURE_USAGE = {
    minimal: {
        input_tokens: 10,
        output_tokens: 20,
    },
    withCache: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 0,
    },
    withCacheHit: {
        input_tokens: 10,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 90,
    },
};
/**
 * Complete message response fixtures
 */
export const FIXTURE_MESSAGE_RESPONSES = {
    simple: {
        id: 'msg_01XFDUDYJgAACzvnptvVoYEL',
        type: 'message',
        role: 'assistant',
        content: [
            {
                type: 'text',
                text: 'Hello! How can I help you today?',
            },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: FIXTURE_USAGE.minimal,
    },
    withToolUse: {
        id: 'msg_01XFDUDYJgAACzvnptvVoYEL',
        type: 'message',
        role: 'assistant',
        content: [
            {
                type: 'text',
                text: 'I will check the weather for you.',
            },
            {
                type: 'tool_use',
                id: 'toolu_01A09q90qw90lq917835lq9',
                name: 'get_weather',
                input: { location: 'San Francisco, CA' },
            },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'tool_use',
        stop_sequence: null,
        usage: FIXTURE_USAGE.minimal,
    },
    maxTokens: {
        id: 'msg_01XFDUDYJgAACzvnptvVoYEL',
        type: 'message',
        role: 'assistant',
        content: [
            {
                type: 'text',
                text: 'This is a response that was cut off because it reached the maximum token limit...',
            },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'max_tokens',
        stop_sequence: null,
        usage: {
            input_tokens: 50,
            output_tokens: 1000,
        },
    },
};
/**
 * Streaming event fixtures
 */
export const FIXTURE_STREAM_EVENTS = {
    messageStart: {
        type: 'message_start',
        message: {
            id: 'msg_01XFDUDYJgAACzvnptvVoYEL',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'claude-3-5-sonnet-20241022',
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 0 },
        },
    },
    contentBlockStart: {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
    },
    contentBlockDelta: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
    },
    contentBlockStop: {
        type: 'content_block_stop',
        index: 0,
    },
    messageDelta: {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 20 },
    },
    messageStop: {
        type: 'message_stop',
    },
    ping: {
        type: 'ping',
    },
};
/**
 * Error response fixtures
 */
export const FIXTURE_ERROR_RESPONSES = {
    invalidApiKey: {
        type: 'error',
        error: {
            type: 'authentication_error',
            message: 'invalid x-api-key',
        },
    },
    invalidRequest: {
        type: 'error',
        error: {
            type: 'invalid_request_error',
            message: 'messages: field required',
        },
    },
    rateLimitExceeded: {
        type: 'error',
        error: {
            type: 'rate_limit_error',
            message: 'Rate limit exceeded',
        },
    },
    overloaded: {
        type: 'error',
        error: {
            type: 'overloaded_error',
            message: 'Overloaded',
        },
    },
    serverError: {
        type: 'error',
        error: {
            type: 'api_error',
            message: 'Internal server error',
        },
    },
    notFound: {
        type: 'error',
        error: {
            type: 'not_found_error',
            message: 'The requested resource was not found',
        },
    },
};
/**
 * Tool definition fixtures
 */
export const FIXTURE_TOOLS = {
    getWeather: {
        name: 'get_weather',
        description: 'Get the current weather in a given location',
        input_schema: {
            type: 'object',
            properties: {
                location: {
                    type: 'string',
                    description: 'The city and state, e.g. San Francisco, CA',
                },
                unit: {
                    type: 'string',
                    enum: ['celsius', 'fahrenheit'],
                    description: 'The unit of temperature, either "celsius" or "fahrenheit"',
                },
            },
            required: ['location'],
        },
    },
    calculator: {
        name: 'calculator',
        description: 'Perform basic arithmetic operations',
        input_schema: {
            type: 'object',
            properties: {
                operation: {
                    type: 'string',
                    enum: ['add', 'subtract', 'multiply', 'divide'],
                    description: 'The arithmetic operation to perform',
                },
                a: {
                    type: 'number',
                    description: 'The first number',
                },
                b: {
                    type: 'number',
                    description: 'The second number',
                },
            },
            required: ['operation', 'a', 'b'],
        },
    },
};
/**
 * Model info fixtures
 */
export const FIXTURE_MODEL_INFO = {
    sonnet35: {
        id: 'claude-3-5-sonnet-20241022',
        display_name: 'Claude 3.5 Sonnet',
        created_at: '2024-10-22T00:00:00Z',
        type: 'model',
    },
    haiku35: {
        id: 'claude-3-5-haiku-20241022',
        display_name: 'Claude 3.5 Haiku',
        created_at: '2024-10-22T00:00:00Z',
        type: 'model',
    },
    opus3: {
        id: 'claude-3-opus-20240229',
        display_name: 'Claude 3 Opus',
        created_at: '2024-02-29T00:00:00Z',
        type: 'model',
    },
};
/**
 * Batch API fixtures
 */
export const FIXTURE_BATCH_REQUESTS = {
    createBatch: {
        requests: [
            {
                custom_id: 'request-1',
                params: {
                    model: 'claude-3-5-sonnet-20241022',
                    max_tokens: 1024,
                    messages: [{ role: 'user', content: 'Hello, world' }],
                },
            },
            {
                custom_id: 'request-2',
                params: {
                    model: 'claude-3-5-sonnet-20241022',
                    max_tokens: 1024,
                    messages: [{ role: 'user', content: 'What is AI?' }],
                },
            },
        ],
    },
    batchResponse: {
        id: 'batch_01234567890abcdef',
        type: 'message_batch',
        processing_status: 'in_progress',
        request_counts: {
            processing: 2,
            succeeded: 0,
            errored: 0,
            canceled: 0,
            expired: 0,
        },
        ended_at: null,
        created_at: '2024-01-01T00:00:00Z',
        expires_at: '2024-01-02T00:00:00Z',
        cancel_initiated_at: null,
        results_url: null,
    },
};
/**
 * System prompt fixtures
 */
export const FIXTURE_SYSTEM_PROMPTS = {
    simple: 'You are a helpful assistant.',
    withCaching: [
        {
            type: 'text',
            text: 'You are an expert on ancient Rome.',
        },
        {
            type: 'text',
            text: 'Here is a large document about Roman history...',
            cache_control: { type: 'ephemeral' },
        },
    ],
};
//# sourceMappingURL=index.js.map