/**
 * Ollama Client Library
 *
 * TypeScript client for Ollama local LLM inference server.
 * Based on SPARC specification for Ollama integration.
 *
 * @packageDocumentation
 *
 * @example
 * ```typescript
 * import { OllamaClientBuilder, OllamaClient } from '@llm-devops/ollama';
 *
 * // Create client with defaults (localhost:11434)
 * const client = new OllamaClientBuilder().build();
 *
 * // Or from environment variables
 * const client = OllamaClient.fromEnv();
 *
 * // Chat completion
 * const response = await client.chat.create({
 *   model: 'llama3.2',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 *
 * // Streaming chat
 * for await (const chunk of client.chat.createStream(request)) {
 *   console.log(chunk.message.content);
 * }
 *
 * // Generate text
 * const result = await client.generate.create({
 *   model: 'llama3.2',
 *   prompt: 'Once upon a time'
 * });
 *
 * // Embeddings
 * const embeddings = await client.embeddings.create({
 *   model: 'nomic-embed-text',
 *   input: 'Hello world'
 * });
 *
 * // List models
 * const models = await client.models.list();
 * ```
 */

// Main client
export { OllamaClient } from './client.js';

// Configuration
export {
  OllamaClientBuilder,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
} from './config/index.js';

export type {
  OllamaConfig,
  SimulationMode,
  RecordStorage,
  TimingMode,
} from './config/index.js';

// Types - Errors
export { OllamaError, OllamaErrorCode } from './types/index.js';

// Types - Messages
export type { Message, Role } from './types/index.js';

// Types - Options
export type { ModelOptions } from './types/index.js';

// Types - Chat
export type { ChatRequest, ChatResponse, ChatChunk } from './types/index.js';

// Types - Generate
export type { GenerateRequest, GenerateResponse, GenerateChunk } from './types/index.js';

// Types - Embeddings
export type { EmbeddingsRequest, EmbeddingsResponse } from './types/index.js';

// Types - Models
export type {
  ModelDetails,
  ModelSummary,
  ModelList,
  ModelInfo,
  RunningModel,
  RunningModelList,
} from './types/index.js';

// Types - Health
export type { HealthStatus } from './types/index.js';

// Services (for advanced usage)
export { ChatService } from './services/chat/index.js';
export { GenerateService } from './services/generate/index.js';
export { EmbeddingsService } from './services/embeddings/index.js';
export { ModelsService } from './services/models/index.js';

// Simulation (for testing)
export {
  SimulationLayer,
  MemoryStorage,
  FileStorage,
} from './simulation/index.js';

export type {
  RecordEntry,
  RecordedResponse,
  TimingInfo,
  Recording,
} from './simulation/index.js';

// Transport (for advanced usage)
export type { HttpTransport, HttpResponse } from './transport/types.js';
export { NdjsonParser } from './transport/ndjson-parser.js';
