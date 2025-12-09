export type { OpenAIClient } from './client/index.js';
export { OpenAIClientImpl, createClient, createClientFromEnv } from './client/index.js';

export type { OpenAIConfig, RequestOptions, PaginationParams, PaginatedResponse } from './types/index.js';

export {
  OpenAIError,
  AuthenticationError,
  RateLimitError,
  InvalidRequestError,
  APIError,
  APIConnectionError,
  TimeoutError,
  ConflictError,
  NotFoundError,
  UnprocessableEntityError,
  PermissionDeniedError,
  InternalServerError,
} from './errors/index.js';

export type { HttpTransport } from './transport/index.js';
export { FetchHttpTransport, RequestBuilder, ResponseParser, StreamReader } from './transport/index.js';

export type { AuthManager } from './auth/index.js';
export { createAuthManager } from './auth/index.js';

export type { RequestHook, ResponseHook, ErrorHook, RetryHook } from './resilience/index.js';
export { DefaultRetryHook, ResilienceOrchestrator } from './resilience/index.js';

export type {
  ChatCompletionService,
  ChatRole,
  ChatMessage,
  ChatToolCall,
  ChatFunctionCall,
  ChatCompletionRequest,
  ChatFunction,
  ChatTool,
  ChatCompletionResponse,
  ChatChoice,
  ChatUsage,
  ChatCompletionChunk,
  ChatChunkChoice,
  ChatDelta,
} from './services/chat/index.js';
export { ChatCompletionServiceImpl, ChatCompletionStreamAccumulator, transformChatStream } from './services/chat/index.js';

export type {
  EmbeddingsService,
  EmbeddingEncodingFormat,
  EmbeddingRequest,
  EmbeddingResponse,
  Embedding,
  EmbeddingUsage,
} from './services/embeddings/index.js';
export { EmbeddingsServiceImpl } from './services/embeddings/index.js';

export type {
  FilesService,
  FilePurpose,
  FileObject,
  FileCreateRequest,
  FileListParams,
  FileListResponse,
  FileDeleteResponse,
} from './services/files/index.js';
export { FilesServiceImpl } from './services/files/index.js';

export type {
  ModelsService,
  ModelObject,
  ModelListResponse,
  ModelDeleteResponse,
} from './services/models/index.js';
export { ModelsServiceImpl } from './services/models/index.js';

export type {
  BatchesService,
  BatchStatus,
  BatchObject,
  BatchCreateRequest,
  BatchListParams,
  BatchListResponse,
} from './services/batches/index.js';
export { BatchesServiceImpl } from './services/batches/index.js';

export type {
  ImagesService,
  ImageSize,
  ImageQuality,
  ImageStyle,
  ImageResponseFormat,
  ImageGenerateRequest,
  ImageEditRequest,
  ImageVariationRequest,
  ImageResponse,
  ImageData,
} from './services/images/index.js';
export { ImagesServiceImpl } from './services/images/index.js';

export type {
  AudioService,
  AudioModel,
  AudioResponseFormat,
  SpeechResponseFormat,
  VoiceType,
  AudioTranscriptionRequest,
  AudioTranslationRequest,
  SpeechRequest,
  AudioTranscription,
  AudioTranslation,
} from './services/audio/index.js';
export { AudioServiceImpl } from './services/audio/index.js';

export type {
  ModerationsService,
  ModerationRequest,
  ModerationResponse,
  ModerationResult,
  ModerationCategories,
  ModerationCategoryScores,
} from './services/moderations/index.js';
export { ModerationsServiceImpl } from './services/moderations/index.js';

export type {
  FineTuningService,
  FineTuningJobStatus,
  FineTuningJob,
  FineTuningHyperparameters,
  FineTuningJobCreateRequest,
  FineTuningJobListParams,
  FineTuningJobListResponse,
  FineTuningJobEvent,
  FineTuningJobEventListResponse,
} from './services/fine-tuning/index.js';
export { FineTuningServiceImpl } from './services/fine-tuning/index.js';

export type {
  AssistantsService,
  Assistant,
  AssistantTool,
  AssistantFunction,
  AssistantToolResources,
  AssistantCreateRequest,
  AssistantUpdateRequest,
  AssistantListParams,
  AssistantListResponse,
  AssistantDeleteResponse,
  Thread,
  ThreadCreateRequest,
  ThreadUpdateRequest,
  ThreadDeleteResponse,
  MessageRole,
  MessageStatus,
  Message,
  MessageContent,
  MessageCreateRequest,
  MessageUpdateRequest,
  MessageListParams,
  MessageListResponse,
  RunStatus,
  Run,
  RunRequiredAction,
  RunToolCall,
  RunCreateRequest,
  RunUpdateRequest,
  RunSubmitToolOutputsRequest,
  RunToolOutput,
  RunListParams,
  RunListResponse,
  RunStep,
  RunStepListResponse,
  VectorStore,
  VectorStoreCreateRequest,
  VectorStoreUpdateRequest,
  VectorStoreListParams,
  VectorStoreListResponse,
  VectorStoreDeleteResponse,
  VectorStoreFile,
  VectorStoreFileCreateRequest,
  VectorStoreFileListParams,
  VectorStoreFileListResponse,
  VectorStoreFileDeleteResponse,
} from './services/assistants/index.js';
export { AssistantsServiceImpl } from './services/assistants/index.js';
