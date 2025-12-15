/**
 * HuggingFace Inference Endpoints Types
 * Core type definitions as specified in SPARC documentation
 */

// ===== PROVIDER TYPES =====

export enum InferenceProvider {
  Serverless = 'serverless',
  Dedicated = 'dedicated',
  Together = 'together',
  Groq = 'groq',
  Fireworks = 'fireworks',
  Replicate = 'replicate',
  Cerebras = 'cerebras',
  Sambanova = 'sambanova',
  Nebius = 'nebius',
}

export interface InferenceTarget {
  provider: InferenceProvider;
  model: string;
  endpointName?: string;
  namespace?: string;
}

// ===== CONFIGURATION =====

export interface HfInferenceConfig {
  /** HF API token (required) */
  token: string;

  /** Default inference provider */
  defaultProvider: InferenceProvider;

  /** Default namespace for dedicated endpoints */
  defaultNamespace?: string;

  /** Cold start handling */
  autoWaitForModel: boolean;
  coldStartTimeout: number; // milliseconds

  /** Endpoint management */
  autoResumePaused: boolean;
  endpointCacheTtl: number; // milliseconds

  /** Rate limiting - requests per minute per provider */
  providerRateLimits: Partial<Record<InferenceProvider, number>>;

  /** Timeouts in milliseconds */
  connectionTimeout: number;
  requestTimeout: number;
  streamTimeout: number;

  /** Connection pooling */
  poolSizePerHost: number;
  poolIdleTimeout: number;

  /** Retry configuration */
  maxRetries: number;
  retryBaseDelay: number;
  retryMaxDelay: number;

  /** Caching */
  enableEmbeddingCache: boolean;
  embeddingCacheTtl: number;
  maxEmbeddingCacheSize: number;

  /** Multimodal settings */
  autoOptimizeImages: boolean;
  maxImageSizeBytes: number;
  autoChunkLongAudio: boolean;
  maxAudioDuration: number;

  /** Observability */
  enableMetrics: boolean;
  enableTracing: boolean;
  traceSampleRate: number;
}

export const defaultHfInferenceConfig: HfInferenceConfig = {
  token: '',
  defaultProvider: InferenceProvider.Serverless,
  defaultNamespace: undefined,
  autoWaitForModel: true,
  coldStartTimeout: 300000, // 5 minutes
  autoResumePaused: false,
  endpointCacheTtl: 300000, // 5 minutes
  providerRateLimits: {},
  connectionTimeout: 10000, // 10 seconds
  requestTimeout: 120000, // 2 minutes
  streamTimeout: 300000, // 5 minutes
  poolSizePerHost: 50,
  poolIdleTimeout: 90000, // 90 seconds
  maxRetries: 3,
  retryBaseDelay: 1000, // 1 second
  retryMaxDelay: 30000, // 30 seconds
  enableEmbeddingCache: true,
  embeddingCacheTtl: 86400000, // 24 hours
  maxEmbeddingCacheSize: 100 * 1024 * 1024, // 100MB
  autoOptimizeImages: true,
  maxImageSizeBytes: 20 * 1024 * 1024, // 20MB
  autoChunkLongAudio: true,
  maxAudioDuration: 1800000, // 30 minutes
  enableMetrics: true,
  enableTracing: true,
  traceSampleRate: 0.1,
};

// ===== CHAT TYPES =====

export type ChatMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatMessageRole;
  content: string | ContentPart[];
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  imageUrl?: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  stream?: boolean;
  tools?: Tool[];
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  provider?: InferenceProvider;
  seed?: number;
}

export interface ChatChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    toolCalls?: ToolCall[];
  };
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  logprobs?: any;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatChoice[];
  usage?: TokenUsage;
}

// ===== STREAMING TYPES =====

export interface ChatStreamDelta {
  role?: 'assistant';
  content?: string;
  toolCalls?: Partial<ToolCall>[];
}

export interface ChatStreamChoice {
  index: number;
  delta: ChatStreamDelta;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

export interface ChatStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: ChatStreamChoice[];
  usage?: TokenUsage;
}

// ===== TEXT GENERATION TYPES =====

export interface TextGenerationRequest {
  inputs: string;
  model?: string;
  parameters?: {
    maxNewTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    repetitionPenalty?: number;
    stopSequences?: string[];
    doSample?: boolean;
    returnFullText?: boolean;
    seed?: number;
  };
  options?: {
    useCache?: boolean;
    waitForModel?: boolean;
  };
}

export interface TextGenerationResponse {
  generatedText: string;
  details?: {
    finishReason: 'length' | 'eos_token' | 'stop_sequence';
    generatedTokens: number;
    seed?: number;
    tokens?: TokenInfo[];
  };
}

export interface TokenInfo {
  id: number;
  text: string;
  logprob: number;
  special: boolean;
}

// ===== EMBEDDING TYPES =====

export interface EmbeddingRequest {
  model: string;
  inputs: string | string[];
  normalize?: boolean;
  truncate?: boolean;
  truncationDirection?: 'left' | 'right';
}

export interface EmbeddingResponse {
  model: string;
  embeddings: number[][];
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

// ===== ENDPOINT TYPES =====

export type EndpointStatus =
  | 'pending'
  | 'initializing'
  | 'updating'
  | 'running'
  | 'paused'
  | 'failed'
  | 'scaledToZero';

export type EndpointType = 'protected' | 'public' | 'private';

export interface EndpointScaling {
  minReplicas: number;
  maxReplicas: number;
  scaleToZeroTimeout: number; // minutes
}

export interface EndpointInstance {
  size: string;
  type: string;
  numGpus?: number;
}

export interface EndpointConfig {
  name: string;
  namespace: string;
  type: EndpointType;
  model: {
    repository: string;
    revision?: string;
    task: string;
    framework?: string;
  };
  compute: {
    accelerator: string;
    instanceType: string;
    instanceSize: string;
    scaling: EndpointScaling;
  };
  provider?: {
    region: string;
    vendor: string;
  };
}

export interface EndpointInfo {
  name: string;
  namespace: string;
  status: {
    state: EndpointStatus;
    message?: string;
    createdAt: Date;
    updatedAt: Date;
    url?: string;
    private?: {
      serviceName?: string;
    };
  };
  model: {
    repository: string;
    revision: string;
    task: string;
    framework: string;
    image: {
      custom?: { url: string };
      huggingface?: { framework: string };
    };
  };
  compute: {
    accelerator: string;
    instanceType: string;
    instanceSize: string;
    scaling: EndpointScaling;
  };
  provider: {
    region: string;
    vendor: string;
  };
}

// ===== IMAGE TYPES =====

export type ImageInput = string | Buffer | Blob;

export interface ImageGenerationRequest {
  model: string;
  prompt: string;
  negativePrompt?: string;
  height?: number;
  width?: number;
  numInferenceSteps?: number;
  guidanceScale?: number;
  seed?: number;
}

export interface ImageClassificationRequest {
  model: string;
  image: ImageInput;
  topK?: number;
}

export interface ImageClassificationResult {
  label: string;
  score: number;
}

export interface ObjectDetectionRequest {
  model: string;
  image: ImageInput;
  threshold?: number;
}

export interface ObjectDetectionResult {
  label: string;
  score: number;
  box: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
}

// ===== AUDIO TYPES =====

export type AudioInput = string | Buffer | Blob;

export interface TranscriptionRequest {
  model: string;
  audio: AudioInput;
  language?: string;
  task?: 'transcribe' | 'translate';
  returnTimestamps?: boolean;
}

export interface TranscriptionResponse {
  text: string;
  chunks?: TranscriptionChunk[];
}

export interface TranscriptionChunk {
  timestamp: [number, number];
  text: string;
}

export interface SynthesisRequest {
  model: string;
  text: string;
  speakerId?: number;
}

// ===== PROVIDER RESOLUTION =====

export interface ProviderUrl {
  baseUrl: string;
  chatPath: string;
  embeddingsPath?: string;
  modelsPath?: string;
}

export const PROVIDER_URLS: Record<InferenceProvider, ProviderUrl> = {
  [InferenceProvider.Serverless]: {
    baseUrl: 'https://api-inference.huggingface.co',
    chatPath: '/v1/chat/completions',
    embeddingsPath: '/pipeline/feature-extraction',
  },
  [InferenceProvider.Dedicated]: {
    baseUrl: '', // Set per-endpoint
    chatPath: '/v1/chat/completions',
  },
  [InferenceProvider.Together]: {
    baseUrl: 'https://api.together.xyz',
    chatPath: '/v1/chat/completions',
    embeddingsPath: '/v1/embeddings',
  },
  [InferenceProvider.Groq]: {
    baseUrl: 'https://api.groq.com/openai',
    chatPath: '/v1/chat/completions',
  },
  [InferenceProvider.Fireworks]: {
    baseUrl: 'https://api.fireworks.ai/inference',
    chatPath: '/v1/chat/completions',
    embeddingsPath: '/v1/embeddings',
  },
  [InferenceProvider.Replicate]: {
    baseUrl: 'https://api.replicate.com',
    chatPath: '/v1/chat/completions',
  },
  [InferenceProvider.Cerebras]: {
    baseUrl: 'https://api.cerebras.ai',
    chatPath: '/v1/chat/completions',
  },
  [InferenceProvider.Sambanova]: {
    baseUrl: 'https://api.sambanova.ai',
    chatPath: '/v1/chat/completions',
  },
  [InferenceProvider.Nebius]: {
    baseUrl: 'https://api.studio.nebius.ai',
    chatPath: '/v1/chat/completions',
  },
};
