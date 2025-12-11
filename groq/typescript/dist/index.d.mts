import { Readable } from 'stream';

/**
 * Configuration options for the Groq client.
 */
interface GroqConfigOptions {
    /** API key for authentication. */
    apiKey: string;
    /** Base URL for API requests. */
    baseUrl?: string;
    /** Request timeout in milliseconds. */
    timeout?: number;
    /** Maximum retry attempts. */
    maxRetries?: number;
    /** Custom headers to include in requests. */
    customHeaders?: Record<string, string>;
}
/**
 * Configuration for the Groq client.
 */
declare class GroqConfig {
    /** API key for authentication. */
    readonly apiKey: string;
    /** Base URL for API requests. */
    readonly baseUrl: string;
    /** Request timeout in milliseconds. */
    readonly timeout: number;
    /** Maximum retry attempts. */
    readonly maxRetries: number;
    /** Custom headers. */
    readonly customHeaders: Record<string, string>;
    private constructor();
    /**
     * Creates a new configuration builder.
     */
    static builder(): GroqConfigBuilder;
    /**
     * Creates a configuration from environment variables.
     */
    static fromEnv(): GroqConfig;
    /**
     * Creates configuration from options.
     */
    static fromOptions(options: GroqConfigOptions): GroqConfig;
    /**
     * Returns a hint of the API key for debugging.
     */
    getApiKeyHint(): string;
    /**
     * Builds the full URL for an endpoint.
     */
    getEndpointUrl(path: string): string;
}
/**
 * Builder for GroqConfig.
 */
declare class GroqConfigBuilder {
    private _apiKey?;
    private _baseUrl?;
    private _timeout?;
    private _maxRetries?;
    private _customHeaders;
    /**
     * Sets the API key.
     */
    apiKey(key: string): this;
    /**
     * Sets the API key from an environment variable.
     */
    apiKeyFromEnv(varName?: string): this;
    /**
     * Sets the base URL.
     */
    baseUrl(url: string): this;
    /**
     * Sets the request timeout in milliseconds.
     */
    timeout(ms: number): this;
    /**
     * Sets the timeout in seconds.
     */
    timeoutSecs(secs: number): this;
    /**
     * Sets the maximum retry attempts.
     */
    maxRetries(retries: number): this;
    /**
     * Adds a custom header.
     */
    header(name: string, value: string): this;
    /**
     * Builds the configuration.
     */
    build(): GroqConfig;
}

/**
 * Authentication providers for the Groq client.
 */
/**
 * Authentication provider interface.
 */
interface AuthProvider {
    /**
     * Returns the authorization header value.
     */
    getAuthHeader(): string;
    /**
     * Returns a hint of the API key for debugging (last 4 chars).
     */
    getApiKeyHint(): string;
}
/**
 * Bearer token authentication provider.
 */
declare class BearerAuthProvider implements AuthProvider {
    private readonly apiKey;
    constructor(apiKey: string);
    getAuthHeader(): string;
    getApiKeyHint(): string;
}
/**
 * Creates a bearer auth provider from an API key.
 */
declare function createBearerAuth(apiKey: string): AuthProvider;

/**
 * HTTP transport layer for the Groq client.
 */

/**
 * HTTP request options.
 */
interface HttpRequest {
    /** HTTP method. */
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    /** URL path (relative to base URL). */
    path: string;
    /** Request body (JSON or FormData). */
    body?: unknown;
    /** Additional headers. */
    headers?: Record<string, string>;
    /** Request timeout override. */
    timeout?: number;
    /** Whether this is a streaming request. */
    stream?: boolean;
}
/**
 * HTTP response.
 */
interface HttpResponse<T = unknown> {
    /** HTTP status code. */
    status: number;
    /** Response headers. */
    headers: Record<string, string>;
    /** Response body. */
    data: T;
    /** Request ID from headers. */
    requestId?: string;
}
/**
 * Streaming response.
 */
interface StreamingResponse {
    /** Async iterator for SSE events. */
    events: AsyncIterable<string>;
    /** Request ID from headers. */
    requestId?: string;
}
/**
 * HTTP transport interface.
 */
interface HttpTransport {
    /**
     * Sends a request and returns the response.
     */
    request<T>(req: HttpRequest): Promise<HttpResponse<T>>;
    /**
     * Sends a streaming request.
     */
    stream(req: HttpRequest): Promise<StreamingResponse>;
}

/**
 * Tool types for function calling.
 */
/**
 * Function definition for a tool.
 */
interface FunctionDefinition {
    /** Function name. */
    name: string;
    /** Function description. */
    description?: string;
    /** JSON schema for function parameters. */
    parameters?: Record<string, unknown>;
}
/**
 * Tool definition.
 */
interface Tool {
    /** Tool type (currently only 'function'). */
    type: 'function';
    /** Function definition. */
    function: FunctionDefinition;
}
/**
 * Function call in a response.
 */
interface FunctionCall {
    /** Function name. */
    name: string;
    /** JSON-encoded arguments. */
    arguments: string;
}
/**
 * Tool call in a response.
 */
interface ToolCall {
    /** Unique ID for this tool call. */
    id: string;
    /** Tool type. */
    type: 'function';
    /** Function call details. */
    function: FunctionCall;
}
/**
 * Tool call delta in streaming response.
 */
interface ToolCallDelta {
    /** Index of the tool call. */
    index: number;
    /** Tool call ID (only in first chunk). */
    id?: string;
    /** Tool type (only in first chunk). */
    type?: 'function';
    /** Function delta. */
    function?: {
        /** Function name (only in first chunk). */
        name?: string;
        /** Partial arguments. */
        arguments?: string;
    };
}
/**
 * Tool choice specification.
 */
type ToolChoice = 'none' | 'auto' | 'required' | {
    type: 'function';
    function: {
        name: string;
    };
};
/**
 * Creates a tool definition from a function.
 */
declare function createTool(name: string, description: string, parameters?: Record<string, unknown>): Tool;
/**
 * Parses tool call arguments as JSON.
 */
declare function parseToolArguments<T = unknown>(toolCall: ToolCall): T;

/**
 * Chat completion types for the Groq API.
 */

/**
 * Message roles.
 */
type Role = 'system' | 'user' | 'assistant' | 'tool';
/**
 * Image detail level.
 */
type ImageDetail = 'auto' | 'low' | 'high';
/**
 * Image URL in a content part.
 */
interface ImageUrl {
    /** URL of the image (can be data URL). */
    url: string;
    /** Detail level for image processing. */
    detail?: ImageDetail;
}
/**
 * Content part types.
 */
type ContentPart = {
    type: 'text';
    text: string;
} | {
    type: 'image_url';
    image_url: ImageUrl;
};
/**
 * Message content (string or array of parts).
 */
type Content = string | ContentPart[];
/**
 * Chat message.
 */
interface Message {
    /** Message role. */
    role: Role;
    /** Message content. */
    content?: Content;
    /** Name of the message author. */
    name?: string;
    /** Tool calls made by the assistant. */
    tool_calls?: ToolCall[];
    /** Tool call ID (for tool role). */
    tool_call_id?: string;
}
/**
 * Assistant message with possible tool calls.
 */
interface AssistantMessage {
    /** Role is always 'assistant'. */
    role: 'assistant';
    /** Message content. */
    content: string | null;
    /** Tool calls made by the assistant. */
    tool_calls?: ToolCall[];
}
/**
 * Response format type.
 */
type ResponseFormatType = 'text' | 'json_object';
/**
 * Response format specification.
 */
interface ResponseFormat {
    /** Format type. */
    type: ResponseFormatType;
}
/**
 * Stream options.
 */
interface StreamOptions {
    /** Include token usage in stream. */
    include_usage?: boolean;
}
/**
 * Chat completion request.
 */
interface ChatRequest {
    /** Model ID to use. */
    model: string;
    /** Messages to send. */
    messages: Message[];
    /** Maximum tokens to generate. */
    max_tokens?: number;
    /** Temperature for sampling (0-2). */
    temperature?: number;
    /** Top-p sampling parameter. */
    top_p?: number;
    /** Number of completions to generate. */
    n?: number;
    /** Stop sequences. */
    stop?: string | string[];
    /** Whether to stream the response. */
    stream?: boolean;
    /** Stream options. */
    stream_options?: StreamOptions;
    /** Presence penalty (-2 to 2). */
    presence_penalty?: number;
    /** Frequency penalty (-2 to 2). */
    frequency_penalty?: number;
    /** Seed for reproducibility. */
    seed?: number;
    /** User identifier. */
    user?: string;
    /** Response format. */
    response_format?: ResponseFormat;
    /** Tools available for the model. */
    tools?: Tool[];
    /** Tool choice strategy. */
    tool_choice?: ToolChoice;
    /** Whether to parallelize tool calls. */
    parallel_tool_calls?: boolean;
}
/**
 * Finish reason for a completion.
 */
type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
/**
 * Token usage in a response.
 */
interface Usage {
    /** Prompt tokens used. */
    prompt_tokens: number;
    /** Completion tokens used. */
    completion_tokens: number;
    /** Total tokens used. */
    total_tokens: number;
    /** Time to first token in seconds. */
    prompt_time?: number;
    /** Completion generation time in seconds. */
    completion_time?: number;
    /** Total processing time in seconds. */
    total_time?: number;
    /** Queue time in seconds. */
    queue_time?: number;
}
/**
 * Choice in a chat completion response.
 */
interface Choice {
    /** Index of this choice. */
    index: number;
    /** The generated message. */
    message: AssistantMessage;
    /** Reason for finishing. */
    finish_reason: FinishReason;
    /** Log probabilities (if requested). */
    logprobs?: unknown;
}
/**
 * Chat completion response.
 */
interface ChatResponse {
    /** Unique ID for this completion. */
    id: string;
    /** Object type (always 'chat.completion'). */
    object: 'chat.completion';
    /** Unix timestamp of creation. */
    created: number;
    /** Model used. */
    model: string;
    /** System fingerprint. */
    system_fingerprint?: string;
    /** Generated choices. */
    choices: Choice[];
    /** Token usage. */
    usage?: Usage;
    /** Groq-specific headers. */
    x_groq?: {
        id?: string;
    };
}
/**
 * Delta in a streaming chunk.
 */
interface Delta {
    /** Role (only in first chunk). */
    role?: Role;
    /** Content fragment. */
    content?: string | null;
    /** Tool call deltas. */
    tool_calls?: ToolCallDelta[];
}
/**
 * Choice in a streaming chunk.
 */
interface ChunkChoice {
    /** Index of this choice. */
    index: number;
    /** Delta content. */
    delta: Delta;
    /** Reason for finishing (only in final chunk). */
    finish_reason: FinishReason;
    /** Log probabilities (if requested). */
    logprobs?: unknown;
}
/**
 * Streaming chat completion chunk.
 */
interface ChatChunk {
    /** Unique ID for this completion. */
    id: string;
    /** Object type (always 'chat.completion.chunk'). */
    object: 'chat.completion.chunk';
    /** Unix timestamp of creation. */
    created: number;
    /** Model used. */
    model: string;
    /** System fingerprint. */
    system_fingerprint?: string;
    /** Chunk choices. */
    choices: ChunkChoice[];
    /** Token usage (if include_usage is set). */
    usage?: Usage;
    /** Groq-specific headers. */
    x_groq?: {
        id?: string;
        usage?: Usage;
    };
}
/**
 * Creates a system message.
 */
declare function systemMessage(content: string): Message;
/**
 * Creates a user message.
 */
declare function userMessage(content: Content): Message;
/**
 * Creates an assistant message.
 */
declare function assistantMessage(content: string, toolCalls?: ToolCall[]): Message;
/**
 * Creates a tool result message.
 */
declare function toolMessage(toolCallId: string, content: string): Message;

/**
 * Chat completion service.
 */

/**
 * Chat stream that yields chunks.
 */
declare class ChatStream implements AsyncIterable<ChatChunk> {
    private readonly response;
    constructor(response: StreamingResponse);
    /**
     * Returns the request ID.
     */
    get requestId(): string | undefined;
    [Symbol.asyncIterator](): AsyncIterator<ChatChunk>;
    /**
     * Collects all chunks and assembles the full response.
     */
    collect(): Promise<ChatResponse>;
    private accumulateToolCalls;
}
/**
 * Chat completion service interface.
 */
interface ChatService {
    /**
     * Creates a chat completion.
     */
    create(request: ChatRequest): Promise<ChatResponse>;
    /**
     * Creates a streaming chat completion.
     */
    createStream(request: ChatRequest): Promise<ChatStream>;
}

/**
 * Audio types for transcription and translation.
 */

/**
 * Supported audio formats.
 */
type AudioFormat = 'flac' | 'mp3' | 'mp4' | 'mpeg' | 'mpga' | 'm4a' | 'ogg' | 'wav' | 'webm';
/**
 * Timestamp granularity options.
 */
type Granularity = 'word' | 'segment';
/**
 * Word-level timestamp.
 */
interface Word {
    /** The word text. */
    word: string;
    /** Start time in seconds. */
    start: number;
    /** End time in seconds. */
    end: number;
}
/**
 * Segment-level timestamp.
 */
interface Segment {
    /** Segment ID. */
    id: number;
    /** Segment index. */
    seek: number;
    /** Start time in seconds. */
    start: number;
    /** End time in seconds. */
    end: number;
    /** Segment text. */
    text: string;
    /** Token IDs. */
    tokens: number[];
    /** Temperature used. */
    temperature: number;
    /** Average log probability. */
    avg_logprob: number;
    /** Compression ratio. */
    compression_ratio: number;
    /** No-speech probability. */
    no_speech_prob: number;
}
/**
 * Audio input for transcription/translation.
 */
type AudioInput = {
    type: 'path';
    path: string;
} | {
    type: 'buffer';
    buffer: Buffer;
    filename: string;
} | {
    type: 'stream';
    stream: Readable;
    filename: string;
};
/**
 * Transcription request.
 */
interface TranscriptionRequest {
    /** Audio file or buffer. */
    file: AudioInput;
    /** Model to use (e.g., 'whisper-large-v3'). */
    model: string;
    /** Language code (ISO 639-1). */
    language?: string;
    /** Prompt to guide transcription. */
    prompt?: string;
    /** Response format. */
    response_format?: 'json' | 'text' | 'verbose_json' | 'srt' | 'vtt';
    /** Temperature for sampling. */
    temperature?: number;
    /** Timestamp granularities. */
    timestamp_granularities?: Granularity[];
}
/**
 * Transcription response.
 */
interface TranscriptionResponse {
    /** Transcribed text. */
    text: string;
    /** Task type. */
    task?: string;
    /** Language detected or specified. */
    language?: string;
    /** Duration of the audio in seconds. */
    duration?: number;
    /** Segments with timestamps. */
    segments?: Segment[];
    /** Words with timestamps. */
    words?: Word[];
}
/**
 * Translation request.
 */
interface TranslationRequest {
    /** Audio file or buffer. */
    file: AudioInput;
    /** Model to use. */
    model: string;
    /** Prompt to guide translation. */
    prompt?: string;
    /** Response format. */
    response_format?: 'json' | 'text' | 'verbose_json' | 'srt' | 'vtt';
    /** Temperature for sampling. */
    temperature?: number;
}
/**
 * Translation response.
 */
interface TranslationResponse {
    /** Translated text (in English). */
    text: string;
    /** Task type. */
    task?: string;
    /** Source language detected. */
    language?: string;
    /** Duration of the audio in seconds. */
    duration?: number;
    /** Segments with timestamps. */
    segments?: Segment[];
}
/**
 * Creates an audio input from a file path.
 */
declare function audioFromPath(path: string): AudioInput;
/**
 * Creates an audio input from a buffer.
 */
declare function audioFromBuffer(buffer: Buffer, filename: string): AudioInput;
/**
 * Creates an audio input from a stream.
 */
declare function audioFromStream(stream: Readable, filename: string): AudioInput;

/**
 * Audio transcription and translation service.
 */

/**
 * Audio service interface.
 */
interface AudioService {
    /**
     * Transcribes audio to text.
     */
    transcribe(request: TranscriptionRequest): Promise<TranscriptionResponse>;
    /**
     * Translates audio to English text.
     */
    translate(request: TranslationRequest): Promise<TranslationResponse>;
}

/**
 * Model types for the Groq API.
 */
/**
 * Model information.
 */
interface Model {
    /** Model ID. */
    id: string;
    /** Object type (always 'model'). */
    object: 'model';
    /** Unix timestamp of creation. */
    created: number;
    /** Model owner. */
    owned_by: string;
    /** Whether the model is active. */
    active?: boolean;
    /** Context window size. */
    context_window?: number;
    /** Public applications info. */
    public_apps?: unknown;
}
/**
 * List of models response.
 */
interface ModelList {
    /** Object type (always 'list'). */
    object: 'list';
    /** List of models. */
    data: Model[];
}
/**
 * Known Groq models.
 */
declare const KnownModels: {
    readonly LLAMA_3_3_70B_VERSATILE: "llama-3.3-70b-versatile";
    readonly LLAMA_3_3_70B_SPECDEC: "llama-3.3-70b-specdec";
    readonly LLAMA_3_2_90B_VISION: "llama-3.2-90b-vision-preview";
    readonly LLAMA_3_2_11B_VISION: "llama-3.2-11b-vision-preview";
    readonly LLAMA_3_2_3B: "llama-3.2-3b-preview";
    readonly LLAMA_3_2_1B: "llama-3.2-1b-preview";
    readonly LLAMA_3_1_70B_VERSATILE: "llama-3.1-70b-versatile";
    readonly LLAMA_3_1_8B_INSTANT: "llama-3.1-8b-instant";
    readonly LLAMA_GUARD_3_8B: "llama-guard-3-8b";
    readonly MIXTRAL_8X7B: "mixtral-8x7b-32768";
    readonly GEMMA_2_9B: "gemma2-9b-it";
    readonly GEMMA_7B: "gemma-7b-it";
    readonly WHISPER_LARGE_V3: "whisper-large-v3";
    readonly WHISPER_LARGE_V3_TURBO: "whisper-large-v3-turbo";
    readonly DISTIL_WHISPER: "distil-whisper-large-v3-en";
    readonly LLAVA_V1_5_7B: "llava-v1.5-7b-4096-preview";
};
/**
 * Type for known model IDs.
 */
type KnownModel = (typeof KnownModels)[keyof typeof KnownModels];
/**
 * Checks if a model ID is a known model.
 */
declare function isKnownModel(modelId: string): modelId is KnownModel;
/**
 * Checks if a model supports vision.
 */
declare function supportsVision(modelId: string): boolean;
/**
 * Checks if a model is a Whisper model.
 */
declare function isWhisperModel(modelId: string): boolean;
/**
 * Gets the context window size for known models.
 */
declare function getContextWindow(modelId: string): number | undefined;

/**
 * Models service for listing and retrieving model information.
 */

/**
 * Models service interface.
 */
interface ModelsService {
    /**
     * Lists all available models.
     */
    list(): Promise<ModelList>;
    /**
     * Gets information about a specific model.
     */
    get(modelId: string): Promise<Model>;
}

/**
 * Retry logic with exponential backoff.
 */
/**
 * Retry configuration.
 */
interface RetryConfig {
    /** Maximum number of retry attempts. */
    maxRetries: number;
    /** Initial delay in milliseconds. */
    initialDelayMs: number;
    /** Maximum delay in milliseconds. */
    maxDelayMs: number;
    /** Multiplier for exponential backoff. */
    multiplier: number;
    /** Jitter factor (0-1) for randomizing delays. */
    jitterFactor: number;
}
/**
 * Retry policy for handling transient failures.
 */
declare class RetryPolicy {
    private readonly config;
    constructor(config?: Partial<RetryConfig>);
    /**
     * Executes a function with retry logic.
     */
    execute<T>(fn: () => Promise<T>): Promise<T>;
    /**
     * Determines if a request should be retried.
     */
    private shouldRetry;
    /**
     * Calculates the delay before the next retry.
     */
    private getDelay;
    /**
     * Sleeps for the specified duration.
     */
    private sleep;
    /**
     * Creates a new retry policy with updated config.
     */
    withConfig(config: Partial<RetryConfig>): RetryPolicy;
}

/**
 * Circuit breaker pattern implementation.
 */
/**
 * Circuit breaker states.
 */
declare enum CircuitState {
    /** Circuit is closed, requests flow normally. */
    Closed = "closed",
    /** Circuit is open, requests are rejected. */
    Open = "open",
    /** Circuit is half-open, allowing test requests. */
    HalfOpen = "half_open"
}
/**
 * Circuit breaker configuration.
 */
interface CircuitBreakerConfig {
    /** Number of failures before opening the circuit. */
    failureThreshold: number;
    /** Duration in milliseconds to keep the circuit open. */
    resetTimeoutMs: number;
    /** Number of successes in half-open state to close circuit. */
    successThreshold: number;
    /** Minimum requests before calculating failure rate. */
    minimumRequests: number;
}
/**
 * Circuit breaker for protecting against cascading failures.
 */
declare class CircuitBreaker {
    private readonly config;
    private state;
    private failureCount;
    private successCount;
    private requestCount;
    private lastFailureTime;
    private openedAt;
    constructor(config?: Partial<CircuitBreakerConfig>);
    /**
     * Gets the current circuit state.
     */
    getState(): CircuitState;
    /**
     * Checks if the circuit allows requests.
     */
    isAllowed(): boolean;
    /**
     * Executes a function with circuit breaker protection.
     */
    execute<T>(fn: () => Promise<T>): Promise<T>;
    /**
     * Records a successful request.
     */
    recordSuccess(): void;
    /**
     * Records a failed request.
     */
    recordFailure(error: unknown): void;
    /**
     * Manually resets the circuit breaker.
     */
    reset(): void;
    /**
     * Gets circuit breaker statistics.
     */
    getStats(): {
        state: CircuitState;
        failureCount: number;
        successCount: number;
        requestCount: number;
        lastFailureTime: number | null;
    };
    private open;
    private close;
    private halfOpen;
    private checkStateTransition;
    private shouldCountFailure;
}

/**
 * Common types shared across the Groq client.
 */
/**
 * Token usage information.
 */
interface GroqUsage {
    /** Number of tokens in the prompt. */
    promptTokens: number;
    /** Number of tokens in the completion. */
    completionTokens: number;
    /** Total number of tokens used. */
    totalTokens: number;
    /** Time to first token in seconds. */
    timeToFirstToken?: number;
    /** Total processing time in seconds. */
    totalTime?: number;
}
/**
 * Request metadata.
 */
interface GroqMetadata {
    /** Unique request ID. */
    requestId?: string;
    /** Model used for the request. */
    model: string;
    /** Request timestamp. */
    timestamp: Date;
    /** Processing duration in milliseconds. */
    durationMs?: number;
}
/**
 * Rate limit information from response headers.
 */
interface RateLimitInfo {
    /** Maximum requests allowed per window. */
    limitRequests?: number;
    /** Remaining requests in current window. */
    remainingRequests?: number;
    /** Maximum tokens allowed per window. */
    limitTokens?: number;
    /** Remaining tokens in current window. */
    remainingTokens?: number;
    /** Time until rate limit resets (seconds). */
    resetRequests?: number;
    /** Time until token limit resets (seconds). */
    resetTokens?: number;
}

/**
 * Rate limit tracking and management.
 */

/**
 * Rate limit state for tracking API limits.
 */
interface RateLimitState {
    /** Request limit info. */
    requests: {
        limit?: number;
        remaining?: number;
        resetAt?: Date;
    };
    /** Token limit info. */
    tokens: {
        limit?: number;
        remaining?: number;
        resetAt?: Date;
    };
    /** Last update time. */
    updatedAt: Date;
}
/**
 * Rate limit manager for tracking and respecting API limits.
 */
declare class RateLimitManager {
    private state;
    /**
     * Updates rate limit state from response headers.
     */
    updateFromHeaders(headers: Record<string, string>): void;
    /**
     * Updates rate limit state from parsed info.
     */
    updateFromInfo(info: RateLimitInfo): void;
    /**
     * Checks if a request should be allowed based on current limits.
     */
    shouldAllowRequest(): boolean;
    /**
     * Gets the time until the rate limit resets in milliseconds.
     */
    getTimeUntilReset(): number | undefined;
    /**
     * Gets the current rate limit state.
     */
    getState(): RateLimitState;
    /**
     * Gets remaining requests, if known.
     */
    getRemainingRequests(): number | undefined;
    /**
     * Gets remaining tokens, if known.
     */
    getRemainingTokens(): number | undefined;
    /**
     * Resets the rate limit state.
     */
    reset(): void;
    /**
     * Estimates token usage for a request.
     * This is a rough estimate based on character count.
     */
    static estimateTokens(text: string): number;
}

/**
 * Resilience layer exports.
 */

/**
 * Combined resilience configuration.
 */
interface ResilienceConfig {
    /** Retry configuration. */
    retry?: Partial<RetryConfig>;
    /** Circuit breaker configuration. */
    circuitBreaker?: Partial<CircuitBreakerConfig>;
    /** Whether to enable rate limit tracking. */
    enableRateLimitTracking?: boolean;
}
/**
 * Resilience orchestrator that combines retry, circuit breaker, and rate limiting.
 */
declare class ResilienceOrchestrator {
    private readonly retryPolicy;
    private readonly circuitBreaker;
    private readonly rateLimitManager;
    private readonly enableRateLimitTracking;
    constructor(config?: ResilienceConfig);
    /**
     * Executes a function with full resilience protection.
     */
    execute<T>(fn: () => Promise<T>): Promise<T>;
    /**
     * Updates rate limits from response headers.
     */
    updateRateLimits(headers: Record<string, string>): void;
    /**
     * Gets the rate limit manager.
     */
    getRateLimitManager(): RateLimitManager;
    /**
     * Gets the circuit breaker.
     */
    getCircuitBreaker(): CircuitBreaker;
    /**
     * Resets all resilience state.
     */
    reset(): void;
    private sleep;
}

/**
 * Logging infrastructure for the Groq client.
 */
/**
 * Log levels.
 */
declare enum LogLevel {
    Debug = "debug",
    Info = "info",
    Warn = "warn",
    Error = "error"
}
/**
 * Logger interface.
 */
interface Logger {
    /** Logs a debug message. */
    debug(message: string, context?: Record<string, unknown>): void;
    /** Logs an info message. */
    info(message: string, context?: Record<string, unknown>): void;
    /** Logs a warning message. */
    warn(message: string, context?: Record<string, unknown>): void;
    /** Logs an error message. */
    error(message: string, error?: Error, context?: Record<string, unknown>): void;
    /** Creates a child logger with additional context. */
    child(context: Record<string, unknown>): Logger;
}
/**
 * Log configuration.
 */
interface LogConfig {
    /** Minimum log level. */
    level: LogLevel;
    /** Whether to include timestamps. */
    timestamps: boolean;
    /** Whether to output JSON. */
    json: boolean;
    /** Additional context for all logs. */
    context?: Record<string, unknown>;
}
/**
 * Console logger implementation.
 */
declare class ConsoleLogger implements Logger {
    private readonly config;
    private readonly baseContext;
    constructor(config?: Partial<LogConfig>, baseContext?: Record<string, unknown>);
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, error?: Error, context?: Record<string, unknown>): void;
    child(context: Record<string, unknown>): Logger;
    private log;
    private shouldLog;
    private outputJson;
    private outputText;
    private getLogFunction;
}

/**
 * Metrics collection for the Groq client.
 */
/**
 * Request metrics data.
 */
interface RequestMetrics {
    /** Request ID. */
    requestId?: string;
    /** API endpoint. */
    endpoint: string;
    /** HTTP method. */
    method: string;
    /** HTTP status code. */
    statusCode?: number;
    /** Request duration in milliseconds. */
    durationMs: number;
    /** Tokens used (prompt). */
    promptTokens?: number;
    /** Tokens used (completion). */
    completionTokens?: number;
    /** Total tokens used. */
    totalTokens?: number;
    /** Whether the request succeeded. */
    success: boolean;
    /** Error code if failed. */
    errorCode?: string;
    /** Whether the request was retried. */
    retried: boolean;
    /** Number of retry attempts. */
    retryCount: number;
    /** Model used. */
    model?: string;
    /** Time to first token (for streaming). */
    timeToFirstTokenMs?: number;
}
/**
 * Aggregated metrics.
 */
interface AggregatedMetrics {
    /** Total number of requests. */
    totalRequests: number;
    /** Successful requests. */
    successfulRequests: number;
    /** Failed requests. */
    failedRequests: number;
    /** Total tokens used. */
    totalTokens: number;
    /** Average latency in milliseconds. */
    averageLatencyMs: number;
    /** 50th percentile latency. */
    p50LatencyMs: number;
    /** 95th percentile latency. */
    p95LatencyMs: number;
    /** 99th percentile latency. */
    p99LatencyMs: number;
    /** Requests by endpoint. */
    byEndpoint: Record<string, number>;
    /** Requests by model. */
    byModel: Record<string, number>;
    /** Errors by code. */
    byErrorCode: Record<string, number>;
}
/**
 * Metrics collector interface.
 */
interface MetricsCollector {
    /** Records request metrics. */
    record(metrics: RequestMetrics): void;
    /** Gets aggregated metrics. */
    getAggregated(): AggregatedMetrics;
    /** Resets all metrics. */
    reset(): void;
}
/**
 * Default metrics collector implementation.
 */
declare class DefaultMetricsCollector implements MetricsCollector {
    private readonly metrics;
    private readonly maxEntries;
    constructor(maxEntries?: number);
    record(metrics: RequestMetrics): void;
    getAggregated(): AggregatedMetrics;
    reset(): void;
    private average;
    private percentile;
    private countBy;
}

/**
 * Main Groq client implementation.
 */

/**
 * Options for creating a Groq client.
 */
interface GroqClientOptions {
    /** API key for authentication. */
    apiKey?: string;
    /** Base URL for API requests. */
    baseUrl?: string;
    /** Request timeout in milliseconds. */
    timeout?: number;
    /** Maximum retry attempts. */
    maxRetries?: number;
    /** Custom headers. */
    customHeaders?: Record<string, string>;
    /** Resilience configuration. */
    resilience?: ResilienceConfig;
    /** Logger instance. */
    logger?: Logger;
    /** Metrics collector. */
    metrics?: MetricsCollector;
    /** Custom transport (for testing). */
    transport?: HttpTransport;
    /** Custom auth provider. */
    authProvider?: AuthProvider;
}
/**
 * Main Groq client.
 */
declare class GroqClient {
    /** Chat completions service. */
    readonly chat: ChatService;
    /** Audio transcription/translation service. */
    readonly audio: AudioService;
    /** Models service. */
    readonly models: ModelsService;
    private readonly config;
    private readonly transport;
    private readonly auth;
    private readonly resilience;
    private readonly logger;
    private readonly metrics;
    constructor(options?: GroqClientOptions);
    /**
     * Gets the configuration.
     */
    getConfig(): GroqConfig;
    /**
     * Gets the resilience orchestrator.
     */
    getResilience(): ResilienceOrchestrator;
    /**
     * Gets the logger.
     */
    getLogger(): Logger;
    /**
     * Gets the metrics collector.
     */
    getMetrics(): MetricsCollector;
    /**
     * Creates a new client builder.
     */
    static builder(): GroqClientBuilder;
    /**
     * Creates a client from environment variables.
     */
    static fromEnv(): GroqClient;
}
/**
 * Builder for creating GroqClient instances.
 */
declare class GroqClientBuilder {
    private options;
    /**
     * Sets the API key.
     */
    apiKey(key: string): this;
    /**
     * Sets the API key from an environment variable.
     */
    apiKeyFromEnv(varName?: string): this;
    /**
     * Sets the base URL.
     */
    baseUrl(url: string): this;
    /**
     * Sets the request timeout in milliseconds.
     */
    timeout(ms: number): this;
    /**
     * Sets the timeout in seconds.
     */
    timeoutSecs(secs: number): this;
    /**
     * Sets the maximum retry attempts.
     */
    maxRetries(retries: number): this;
    /**
     * Adds a custom header.
     */
    header(name: string, value: string): this;
    /**
     * Sets the resilience configuration.
     */
    resilience(config: ResilienceConfig): this;
    /**
     * Sets the logger.
     */
    logger(logger: Logger): this;
    /**
     * Enables console logging at the specified level.
     */
    withConsoleLogging(level?: LogLevel): this;
    /**
     * Sets the metrics collector.
     */
    metrics(collector: MetricsCollector): this;
    /**
     * Enables default metrics collection.
     */
    withMetrics(maxEntries?: number): this;
    /**
     * Sets a custom transport (for testing).
     */
    transport(transport: HttpTransport): this;
    /**
     * Sets a custom auth provider.
     */
    authProvider(provider: AuthProvider): this;
    /**
     * Builds the client.
     */
    build(): GroqClient;
}

/**
 * Error types for the Groq client.
 */
/**
 * Error codes for Groq errors.
 */
declare enum GroqErrorCode {
    /** Configuration error. */
    Configuration = "configuration_error",
    /** Authentication error. */
    Authentication = "authentication_error",
    /** Authorization error. */
    Authorization = "authorization_error",
    /** Validation error. */
    Validation = "validation_error",
    /** Model not found or unavailable. */
    Model = "model_error",
    /** Context length exceeded. */
    ContextLength = "context_length_exceeded",
    /** Content filter triggered. */
    ContentFilter = "content_filter_error",
    /** Rate limit exceeded. */
    RateLimit = "rate_limit_error",
    /** Server error. */
    Server = "server_error",
    /** Network error. */
    Network = "network_error",
    /** Timeout error. */
    Timeout = "timeout_error",
    /** Stream error. */
    Stream = "stream_error",
    /** Circuit breaker open. */
    CircuitOpen = "circuit_open",
    /** Unknown error. */
    Unknown = "unknown_error"
}
/**
 * Additional error details.
 */
interface GroqErrorDetails {
    /** HTTP status code. */
    statusCode?: number;
    /** Request ID for debugging. */
    requestId?: string;
    /** Parameter that caused the error. */
    param?: string;
    /** Invalid value. */
    value?: string;
    /** Retry after duration in seconds. */
    retryAfter?: number;
    /** API key hint (last 4 chars). */
    apiKeyHint?: string;
    /** Model ID. */
    model?: string;
    /** Original error. */
    cause?: Error;
}
/**
 * Groq API error.
 */
declare class GroqError extends Error {
    /** Error code. */
    readonly code: GroqErrorCode;
    /** Additional error details. */
    readonly details: GroqErrorDetails;
    constructor(code: GroqErrorCode, message: string, details?: GroqErrorDetails);
    /**
     * Returns true if this error is retryable.
     */
    isRetryable(): boolean;
    /**
     * Returns the retry-after duration in seconds if available.
     */
    getRetryAfter(): number | undefined;
    /**
     * Returns true if this error should trigger circuit breaker.
     */
    shouldCircuitBreak(): boolean;
    /**
     * Creates a configuration error.
     */
    static configuration(message: string): GroqError;
    /**
     * Creates an authentication error.
     */
    static authentication(message: string, apiKeyHint?: string): GroqError;
    /**
     * Creates a validation error.
     */
    static validation(message: string, param?: string, value?: string): GroqError;
    /**
     * Creates a model error.
     */
    static model(message: string, model?: string): GroqError;
    /**
     * Creates a rate limit error.
     */
    static rateLimit(message: string, retryAfter?: number): GroqError;
    /**
     * Creates a server error.
     */
    static server(message: string, statusCode: number, requestId?: string): GroqError;
    /**
     * Creates a network error.
     */
    static network(message: string, cause?: Error): GroqError;
    /**
     * Creates a timeout error.
     */
    static timeout(message: string): GroqError;
    /**
     * Creates a stream error.
     */
    static stream(message: string): GroqError;
    /**
     * Creates a circuit open error.
     */
    static circuitOpen(): GroqError;
    /**
     * Converts to JSON.
     */
    toJSON(): Record<string, unknown>;
}
/**
 * API error response from Groq.
 */
interface ApiErrorResponse {
    error: {
        type?: string;
        message: string;
        param?: string;
        code?: string;
    };
}
/**
 * Type guard for GroqError.
 */
declare function isGroqError(error: unknown): error is GroqError;
/**
 * Checks if an error is retryable.
 */
declare function isRetryableError(error: unknown): boolean;

/**
 * Mock infrastructure for testing.
 */

/**
 * Recorded request for verification.
 */
interface RecordedRequest {
    /** The request that was made. */
    request: HttpRequest;
    /** Timestamp of the request. */
    timestamp: Date;
}
/**
 * Mock response configuration.
 */
interface MockResponse<T = unknown> {
    /** HTTP status code. */
    status: number;
    /** Response headers. */
    headers?: Record<string, string>;
    /** Response body. */
    data: T;
    /** Optional delay in milliseconds. */
    delay?: number;
    /** Optional error to throw. */
    error?: Error;
}
/**
 * Mock transport for testing.
 */
declare class MockTransport implements HttpTransport {
    private readonly responses;
    private readonly defaultResponse;
    private readonly recordedRequests;
    constructor(defaultResponse?: MockResponse);
    /**
     * Configures a response for a specific path.
     */
    onPath(path: string, response: MockResponse): this;
    /**
     * Clears all configured responses.
     */
    clearResponses(): this;
    /**
     * Gets recorded requests.
     */
    getRecordedRequests(): RecordedRequest[];
    /**
     * Clears recorded requests.
     */
    clearRecordedRequests(): this;
    request<T>(req: HttpRequest): Promise<HttpResponse<T>>;
    stream(req: HttpRequest): Promise<StreamingResponse>;
    private getNextResponse;
    private createChunkIterator;
    private sleep;
}
/**
 * Creates a mock transport.
 */
declare function createMockTransport(defaultResponse?: MockResponse): MockTransport;
/**
 * Creates a JSON response mock.
 */
declare function jsonResponse<T>(data: T, status?: number): MockResponse<T>;
/**
 * Creates an error response mock.
 */
declare function errorResponse(message: string, status?: number, code?: string): MockResponse;
/**
 * Creates a mock chat response.
 */
declare function mockChatResponse(content: string, model?: "llama-3.3-70b-versatile"): ChatResponse;
/**
 * Creates mock chat stream chunks.
 */
declare function mockChatChunks(content: string, model?: "llama-3.3-70b-versatile"): ChatChunk[];
/**
 * Creates a mock transcription response.
 */
declare function mockTranscriptionResponse(text: string): TranscriptionResponse;
/**
 * Creates a mock translation response.
 */
declare function mockTranslationResponse(text: string): TranslationResponse;
/**
 * Creates a mock model.
 */
declare function mockModel(id: string): Model;
/**
 * Creates a mock model list.
 */
declare function mockModelList(): ModelList;

export { type ApiErrorResponse, type AssistantMessage, type AudioFormat, type AudioService, type AuthProvider, BearerAuthProvider, type ChatChunk, type ChatRequest, type ChatResponse, type ChatService, ChatStream, type Choice, type ChunkChoice, CircuitBreaker, type CircuitBreakerConfig, CircuitState, ConsoleLogger, type Content, type ContentPart, DefaultMetricsCollector, type Delta, type FinishReason, type FunctionCall, type FunctionDefinition, type Granularity, GroqClient, GroqClientBuilder, type GroqClientOptions, GroqConfig, GroqConfigBuilder, type GroqConfigOptions, GroqError, GroqErrorCode, type GroqErrorDetails, type GroqMetadata, type GroqUsage, type HttpRequest, type HttpResponse, type HttpTransport, type ImageDetail, type ImageUrl, KnownModels, type LogConfig, LogLevel, type Logger, type Message, type MetricsCollector, type MockResponse, MockTransport, type Model, type ModelList, type ModelsService, type RateLimitInfo, RateLimitManager, type RecordedRequest, type RequestMetrics, type ResilienceConfig, ResilienceOrchestrator, type ResponseFormat, type ResponseFormatType, type RetryConfig, RetryPolicy, type Role, type Segment, type StreamOptions, type Tool, type ToolCall, type ToolCallDelta, type ToolChoice, type TranscriptionRequest, type TranscriptionResponse, type TranslationRequest, type TranslationResponse, type Usage, type Word, assistantMessage, audioFromBuffer, audioFromPath, audioFromStream, createBearerAuth, createMockTransport, createTool, errorResponse, getContextWindow, isGroqError, isKnownModel, isRetryableError, isWhisperModel, jsonResponse, mockChatChunks, mockChatResponse, mockModel, mockModelList, mockTranscriptionResponse, mockTranslationResponse, parseToolArguments, supportsVision, systemMessage, toolMessage, userMessage };
