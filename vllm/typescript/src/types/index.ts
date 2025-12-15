/**
 * vLLM Integration Types
 * Core type definitions as specified in SPARC documentation
 */

export * from './errors.js';

// ===== CHAT MESSAGE TYPES =====

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  name?: string;
}

// ===== REQUEST TYPES =====

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  repetition_penalty?: number;
  stop?: string[];
  stream?: boolean;
  seed?: number;
  n?: number;
  best_of?: number;
  logprobs?: number | null;
  echo?: boolean;
  skip_special_tokens?: boolean;
  spaces_between_special_tokens?: boolean;
  // vLLM-specific guided generation
  guided_json?: object | string;
  guided_regex?: string;
  guided_choice?: string[];
  guided_grammar?: string;
  // vLLM-specific parameters
  use_beam_search?: boolean;
  min_p?: number;
  length_penalty?: number;
  early_stopping?: boolean;
  ignore_eos?: boolean;
  min_tokens?: number;
}

export interface CompletionRequest {
  model: string;
  prompt: string | string[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  repetition_penalty?: number;
  stop?: string[];
  stream?: boolean;
  seed?: number;
  n?: number;
  best_of?: number;
  logprobs?: number | null;
  echo?: boolean;
}

export interface EmbeddingRequest {
  model: string;
  input: string | string[];
  encoding_format?: 'float' | 'base64';
}

export interface TokenizeRequest {
  prompt: string;
  add_special_tokens?: boolean;
}

export interface DetokenizeRequest {
  tokens: number[];
}

// ===== RESPONSE TYPES =====

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string;
  };
  finish_reason: 'stop' | 'length' | 'content_filter' | null;
  logprobs?: unknown;
}

export interface ChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatChoice[];
  usage: TokenUsage;
}

export interface ChatChunkChoice {
  index: number;
  delta: {
    role?: 'assistant';
    content?: string;
  };
  finish_reason: 'stop' | 'length' | 'content_filter' | null;
  logprobs?: unknown;
}

export interface ChatChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: ChatChunkChoice[];
}

export interface CompletionChoice {
  index: number;
  text: string;
  finish_reason: 'stop' | 'length' | null;
  logprobs?: unknown;
}

export interface CompletionResponse {
  id: string;
  object: 'text_completion';
  created: number;
  model: string;
  choices: CompletionChoice[];
  usage: TokenUsage;
}

export interface EmbeddingData {
  object: 'embedding';
  embedding: number[];
  index: number;
}

export interface EmbeddingResponse {
  object: 'list';
  data: EmbeddingData[];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface TokenizeResponse {
  tokens: number[];
  count: number;
}

export interface DetokenizeResponse {
  prompt: string;
}

export interface ModelInfo {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  max_model_len?: number;
}

export interface ModelList {
  object: 'list';
  data: ModelInfo[];
}

// ===== HEALTH TYPES =====

export type HealthStatus = 'healthy' | 'unhealthy' | 'unknown';

export interface HealthCheckResult {
  status: HealthStatus;
  server: string;
  latencyMs: number;
  timestamp: number;
}

// ===== METRICS TYPES =====

export interface VllmMetrics {
  num_requests_running: number;
  num_requests_waiting: number;
  gpu_cache_usage_perc: number;
  cpu_cache_usage_perc: number;
  avg_prompt_throughput_toks_per_s: number;
  avg_generation_throughput_toks_per_s: number;
}

// ===== CONFIGURATION TYPES =====

export interface ServerConfig {
  url: string;
  authToken?: string;
  weight?: number;
  models?: string[];
}

export interface PoolConfig {
  maxConnectionsPerServer: number;
  idleTimeout: number;
  acquireTimeout: number;
  keepaliveInterval: number;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBase: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  openDurationMs: number;
}

export interface RateLimitConfig {
  requestsPerSecond: number;
  burstSize: number;
}

export interface BatchConfig {
  maxBatchSize: number;
  batchTimeoutMs: number;
  maxQueueDepth: number;
  maxConcurrentBatches: number;
}

export interface VllmConfig {
  servers: ServerConfig[];
  timeout: number;
  pool: PoolConfig;
  retry: RetryConfig;
  circuitBreaker: CircuitBreakerConfig;
  rateLimit?: RateLimitConfig;
  batch?: BatchConfig;
  autoDiscoverModels: boolean;
  modelDiscoveryIntervalMs: number;
  defaultModel?: string;
}

export const defaultPoolConfig: PoolConfig = {
  maxConnectionsPerServer: 100,
  idleTimeout: 90000,
  acquireTimeout: 5000,
  keepaliveInterval: 30000,
};

export const defaultRetryConfig: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  exponentialBase: 2,
};

export const defaultCircuitBreakerConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  openDurationMs: 30000,
};

export const defaultBatchConfig: BatchConfig = {
  maxBatchSize: 32,
  batchTimeoutMs: 50,
  maxQueueDepth: 1000,
  maxConcurrentBatches: 8,
};

export const defaultVllmConfig: Partial<VllmConfig> = {
  timeout: 120000,
  pool: defaultPoolConfig,
  retry: defaultRetryConfig,
  circuitBreaker: defaultCircuitBreakerConfig,
  autoDiscoverModels: true,
  modelDiscoveryIntervalMs: 30000,
};

// ===== SIMULATION TYPES =====

export interface InferenceRecord {
  timestamp: number;
  request: ChatRequest;
  response: ChatResponse;
  latencyMs: number;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export interface ReplayConfig {
  speedMultiplier: number;
  skipWaits: boolean;
  stopOnError: boolean;
}

export interface ReplayResult {
  success: boolean;
  expectedLatencyMs: number;
  actualLatencyMs: number;
  tokensMatch: boolean;
  error?: string;
}

export interface ReplayReport {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  throughputRequestsPerSec: number;
  results: ReplayResult[];
}

export interface LoadGenConfig {
  targetRps: number;
  durationMs: number;
  warmupMs: number;
  rampUpMs: number;
  model: string;
  promptTemplate: string;
  maxTokens: number;
}

export interface LoadGenReport {
  actualRps: number;
  totalRequests: number;
  successRate: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errors: Record<string, number>;
}
