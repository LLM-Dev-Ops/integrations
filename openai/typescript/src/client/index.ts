import type { NormalizedConfig } from './config.js';
import type { ChatCompletionService } from '../services/chat/index.js';
import type { EmbeddingsService } from '../services/embeddings/index.js';
import type { FilesService } from '../services/files/index.js';
import type { ModelsService } from '../services/models/index.js';
import type { BatchesService } from '../services/batches/index.js';
import type { ImagesService } from '../services/images/index.js';
import type { AudioService } from '../services/audio/index.js';
import type { ModerationsService } from '../services/moderations/index.js';
import type { FineTuningService } from '../services/fine-tuning/index.js';
import type { AssistantsService } from '../services/assistants/index.js';

export interface OpenAIClient {
  readonly chat: ChatCompletionService;
  readonly embeddings: EmbeddingsService;
  readonly files: FilesService;
  readonly models: ModelsService;
  readonly batches: BatchesService;
  readonly images: ImagesService;
  readonly audio: AudioService;
  readonly moderations: ModerationsService;
  readonly fineTuning: FineTuningService;
  readonly assistants: AssistantsService;

  getConfig(): Readonly<NormalizedConfig>;
}

export { OpenAIClientImpl } from './client-impl.js';
export { createClient, createClientFromEnv } from './factory.js';
export { validateConfig, normalizeConfig, configFromEnv, DEFAULT_CONFIG } from './config.js';
export type { OpenAIConfig, NormalizedConfig } from './config.js';
