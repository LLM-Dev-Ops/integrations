/**
 * Type exports for the Groq client.
 */

// Chat types
export type {
  ChatRequest,
  ChatResponse,
  ChatChunk,
  Message,
  Role,
  Content,
  ContentPart,
  ImageUrl,
  ImageDetail,
  Choice,
  ChunkChoice,
  Delta,
  AssistantMessage,
  Usage,
  FinishReason,
  ResponseFormat,
  ResponseFormatType,
  StreamOptions,
} from './chat';

export { systemMessage, userMessage, assistantMessage, toolMessage } from './chat';

// Audio types
export type {
  TranscriptionRequest,
  TranscriptionResponse,
  TranslationRequest,
  TranslationResponse,
  AudioFormat,
  Granularity,
  Segment,
  Word,
  AudioInput,
} from './audio';

export { audioFromPath, audioFromBuffer, audioFromStream } from './audio';

// Tool types
export type {
  Tool,
  ToolCall,
  ToolChoice,
  FunctionDefinition,
  FunctionCall,
  ToolCallDelta,
} from './tools';

export { createTool, parseToolArguments } from './tools';

// Model types
export type { Model, ModelList, KnownModel } from './models';

export {
  KnownModels,
  isKnownModel,
  supportsVision,
  isWhisperModel,
  getContextWindow,
} from './models';

// Common types
export type { GroqMetadata, GroqUsage, RateLimitInfo } from './common';

export { parseRateLimitInfo } from './common';
