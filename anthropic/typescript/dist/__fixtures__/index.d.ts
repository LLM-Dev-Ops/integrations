/**
 * Test fixtures for Anthropic API responses
 * These fixtures represent realistic API responses for testing
 */
import type { Message, Usage, ModelInfo } from '../types/common.js';
/**
 * Sample API keys for testing (not real keys)
 */
export declare const FIXTURE_API_KEYS: {
    valid: string;
    invalid: string;
    empty: string;
    malformed: string;
};
/**
 * Sample model IDs
 */
export declare const FIXTURE_MODELS: {
    sonnet35: string;
    haiku35: string;
    opus3: string;
    sonnet3: string;
    haiku3: string;
};
/**
 * Sample message fixtures
 */
export declare const FIXTURE_MESSAGES: Record<string, Message>;
/**
 * Sample usage fixtures
 */
export declare const FIXTURE_USAGE: Record<string, Usage>;
/**
 * Complete message response fixtures
 */
export declare const FIXTURE_MESSAGE_RESPONSES: {
    simple: {
        id: string;
        type: string;
        role: string;
        content: {
            type: string;
            text: string;
        }[];
        model: string;
        stop_reason: string;
        stop_sequence: null;
        usage: Usage | undefined;
    };
    withToolUse: {
        id: string;
        type: string;
        role: string;
        content: ({
            type: string;
            text: string;
            id?: never;
            name?: never;
            input?: never;
        } | {
            type: string;
            id: string;
            name: string;
            input: {
                location: string;
            };
            text?: never;
        })[];
        model: string;
        stop_reason: string;
        stop_sequence: null;
        usage: Usage | undefined;
    };
    maxTokens: {
        id: string;
        type: string;
        role: string;
        content: {
            type: string;
            text: string;
        }[];
        model: string;
        stop_reason: string;
        stop_sequence: null;
        usage: {
            input_tokens: number;
            output_tokens: number;
        };
    };
};
/**
 * Streaming event fixtures
 */
export declare const FIXTURE_STREAM_EVENTS: {
    messageStart: {
        type: string;
        message: {
            id: string;
            type: string;
            role: string;
            content: never[];
            model: string;
            stop_reason: null;
            stop_sequence: null;
            usage: {
                input_tokens: number;
                output_tokens: number;
            };
        };
    };
    contentBlockStart: {
        type: string;
        index: number;
        content_block: {
            type: string;
            text: string;
        };
    };
    contentBlockDelta: {
        type: string;
        index: number;
        delta: {
            type: string;
            text: string;
        };
    };
    contentBlockStop: {
        type: string;
        index: number;
    };
    messageDelta: {
        type: string;
        delta: {
            stop_reason: string;
            stop_sequence: null;
        };
        usage: {
            output_tokens: number;
        };
    };
    messageStop: {
        type: string;
    };
    ping: {
        type: string;
    };
};
/**
 * Error response fixtures
 */
export declare const FIXTURE_ERROR_RESPONSES: {
    invalidApiKey: {
        type: string;
        error: {
            type: string;
            message: string;
        };
    };
    invalidRequest: {
        type: string;
        error: {
            type: string;
            message: string;
        };
    };
    rateLimitExceeded: {
        type: string;
        error: {
            type: string;
            message: string;
        };
    };
    overloaded: {
        type: string;
        error: {
            type: string;
            message: string;
        };
    };
    serverError: {
        type: string;
        error: {
            type: string;
            message: string;
        };
    };
    notFound: {
        type: string;
        error: {
            type: string;
            message: string;
        };
    };
};
/**
 * Tool definition fixtures
 */
export declare const FIXTURE_TOOLS: {
    getWeather: {
        name: string;
        description: string;
        input_schema: {
            type: string;
            properties: {
                location: {
                    type: string;
                    description: string;
                };
                unit: {
                    type: string;
                    enum: string[];
                    description: string;
                };
            };
            required: string[];
        };
    };
    calculator: {
        name: string;
        description: string;
        input_schema: {
            type: string;
            properties: {
                operation: {
                    type: string;
                    enum: string[];
                    description: string;
                };
                a: {
                    type: string;
                    description: string;
                };
                b: {
                    type: string;
                    description: string;
                };
            };
            required: string[];
        };
    };
};
/**
 * Model info fixtures
 */
export declare const FIXTURE_MODEL_INFO: Record<string, ModelInfo>;
/**
 * Batch API fixtures
 */
export declare const FIXTURE_BATCH_REQUESTS: {
    createBatch: {
        requests: {
            custom_id: string;
            params: {
                model: string;
                max_tokens: number;
                messages: {
                    role: string;
                    content: string;
                }[];
            };
        }[];
    };
    batchResponse: {
        id: string;
        type: string;
        processing_status: string;
        request_counts: {
            processing: number;
            succeeded: number;
            errored: number;
            canceled: number;
            expired: number;
        };
        ended_at: null;
        created_at: string;
        expires_at: string;
        cancel_initiated_at: null;
        results_url: null;
    };
};
/**
 * System prompt fixtures
 */
export declare const FIXTURE_SYSTEM_PROMPTS: {
    simple: string;
    withCaching: ({
        type: "text";
        text: string;
        cache_control?: never;
    } | {
        type: "text";
        text: string;
        cache_control: {
            type: "ephemeral";
        };
    })[];
};
//# sourceMappingURL=index.d.ts.map