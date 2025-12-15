/**
 * Ollama Integration - Types Module
 *
 * Central export point for all type definitions.
 * Based on SPARC specification for Ollama integration.
 */

// Error types
export { OllamaError, OllamaErrorCode } from './errors.js';

// Message types
export type { Message, Role } from './message.js';

// Options types
export type { ModelOptions } from './options.js';

// Chat types
export type { ChatRequest, ChatResponse, ChatChunk } from './chat.js';

// Generate types
export type { GenerateRequest, GenerateResponse, GenerateChunk } from './generate.js';

// Embeddings types
export type { EmbeddingsRequest, EmbeddingsResponse } from './embeddings.js';

// Model management types
export type {
  ModelDetails,
  ModelSummary,
  ModelList,
  ModelInfo,
  RunningModel,
  RunningModelList,
} from './models.js';

// Health types
export type { HealthStatus } from './health.js';
