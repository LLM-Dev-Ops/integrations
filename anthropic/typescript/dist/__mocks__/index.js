/**
 * Mock factory for creating test configurations
 */
export function mockConfig(overrides) {
    return {
        apiKey: 'sk-ant-test-key-123',
        baseUrl: 'https://api.anthropic.com',
        apiVersion: '2023-06-01',
        timeout: 60000,
        maxRetries: 2,
        betaFeatures: [],
        headers: {},
        ...overrides,
    };
}
/**
 * Mock factory for creating test messages
 */
export function mockMessage(overrides) {
    return {
        role: 'user',
        content: 'Hello, Claude!',
        ...overrides,
    };
}
/**
 * Mock factory for creating usage statistics
 */
export function mockUsage(overrides) {
    return {
        input_tokens: 10,
        output_tokens: 20,
        ...overrides,
    };
}
/**
 * Mock factory for text content blocks
 */
export function mockTextBlock(text = 'Sample text') {
    return {
        type: 'text',
        text,
    };
}
/**
 * Mock factory for image content blocks
 */
export function mockImageBlock(overrides) {
    return {
        type: 'image',
        source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        },
        ...overrides,
    };
}
/**
 * Mock factory for tool use blocks
 */
export function mockToolUseBlock(overrides) {
    return {
        type: 'tool_use',
        id: 'toolu_01A09q90qw90lq917835lq9',
        name: 'get_weather',
        input: { location: 'San Francisco, CA' },
        ...overrides,
    };
}
/**
 * Mock factory for tool result blocks
 */
export function mockToolResultBlock(overrides) {
    return {
        type: 'tool_result',
        tool_use_id: 'toolu_01A09q90qw90lq917835lq9',
        content: 'The weather in San Francisco is sunny, 72°F',
        ...overrides,
    };
}
/**
 * Mock factory for tool definitions
 */
export function mockTool(overrides) {
    return {
        name: 'get_weather',
        description: 'Get the current weather in a given location',
        input_schema: {
            type: 'object',
            properties: {
                location: {
                    type: 'string',
                    description: 'The city and state, e.g. San Francisco, CA',
                },
            },
            required: ['location'],
        },
        ...overrides,
    };
}
/**
 * Mock factory for model info
 */
export function mockModelInfo(overrides) {
    return {
        id: 'claude-3-5-sonnet-20241022',
        display_name: 'Claude 3.5 Sonnet',
        created_at: '2024-10-22T00:00:00Z',
        type: 'model',
        ...overrides,
    };
}
/**
 * Mock factory for creating a complete message response
 */
export function mockMessageResponse(overrides) {
    return {
        id: 'msg_01XFDUDYJgAACzvnptvVoYEL',
        type: 'message',
        role: 'assistant',
        content: [mockTextBlock('Hello! How can I help you today?')],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: mockUsage(),
        ...overrides,
    };
}
/**
 * Mock factory for streaming events
 */
export function mockStreamEvent(type, data) {
    const baseEvents = {
        message_start: {
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
        content_block_start: {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
        },
        content_block_delta: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Hello' },
        },
        content_block_stop: {
            type: 'content_block_stop',
            index: 0,
        },
        message_delta: {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: 20 },
        },
        message_stop: {
            type: 'message_stop',
        },
        ping: {
            type: 'ping',
        },
    };
    return {
        ...baseEvents[type],
        ...data,
    };
}
/**
 * Mock fetch implementation for testing
 */
export class MockFetch {
    responses = new Map();
    defaultResponse = null;
    /**
     * Sets a mock response for a specific URL pattern
     */
    setResponse(urlPattern, response) {
        const key = urlPattern instanceof RegExp ? urlPattern.source : urlPattern;
        this.responses.set(key, response);
    }
    /**
     * Sets a default response for all unmatched URLs
     */
    setDefaultResponse(response) {
        this.defaultResponse = response;
    }
    /**
     * Mock fetch function
     */
    fetch = async (url, init) => {
        const urlString = url.toString();
        // Find matching response
        let mockResponse = this.defaultResponse;
        for (const [pattern, response] of this.responses.entries()) {
            if (urlString.includes(pattern) || new RegExp(pattern).test(urlString)) {
                mockResponse = response;
                break;
            }
        }
        if (!mockResponse) {
            mockResponse = {
                ok: false,
                status: 404,
                statusText: 'Not Found',
                json: async () => ({ error: { message: 'Not Found' } }),
            };
        }
        // If response is a function, call it with the request
        if (typeof mockResponse === 'function') {
            mockResponse = await mockResponse(urlString, init);
        }
        return {
            ok: mockResponse.ok ?? true,
            status: mockResponse.status ?? 200,
            statusText: mockResponse.statusText ?? 'OK',
            headers: new Headers(mockResponse.headers ?? {}),
            json: async () => mockResponse.body ?? mockResponse.json?.() ?? mockResponse,
            text: async () => JSON.stringify(mockResponse.body ?? mockResponse),
            body: mockResponse.stream ?? null,
        };
    };
    /**
     * Resets all mock responses
     */
    reset() {
        this.responses.clear();
        this.defaultResponse = null;
    }
}
/**
 * Creates a new mock fetch instance
 */
export function createMockFetch() {
    return new MockFetch();
}
//# sourceMappingURL=index.js.map