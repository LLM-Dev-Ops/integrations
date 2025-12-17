import type { OpenAIClient } from './index.js';
import type { OpenAIConfig, NormalizedConfig } from './config.js';
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
import { ChatCompletionServiceImpl } from '../services/chat/index.js';
import { EmbeddingsServiceImpl } from '../services/embeddings/index.js';
import { FilesServiceImpl } from '../services/files/index.js';
import { ModelsServiceImpl } from '../services/models/index.js';
import { BatchesServiceImpl } from '../services/batches/index.js';
import { ImagesServiceImpl } from '../services/images/index.js';
import { AudioServiceImpl } from '../services/audio/index.js';
import { ModerationsServiceImpl } from '../services/moderations/index.js';
import { FineTuningServiceImpl } from '../services/fine-tuning/index.js';
import { AssistantsServiceImpl } from '../services/assistants/index.js';
import { FetchHttpTransport } from '../transport/http-transport.js';
import { DefaultResilienceOrchestrator, DEFAULT_RESILIENCE_CONFIG } from '../resilience/orchestrator.js';
import { DefaultRetryHook, TelemetryHooks } from '../resilience/hooks.js';
import { createAuthManager } from '../auth/auth-manager.js';
import { normalizeConfig } from './config.js';

export class OpenAIClientImpl implements OpenAIClient {
  public readonly chat: ChatCompletionService;
  public readonly embeddings: EmbeddingsService;
  public readonly files: FilesService;
  public readonly models: ModelsService;
  public readonly batches: BatchesService;
  public readonly images: ImagesService;
  public readonly audio: AudioService;
  public readonly moderations: ModerationsService;
  public readonly fineTuning: FineTuningService;
  public readonly assistants: AssistantsService;

  private readonly config: NormalizedConfig;
  private readonly orchestrator: DefaultResilienceOrchestrator;

  constructor(config: OpenAIConfig) {
    this.config = normalizeConfig(config);

    const authManager = createAuthManager({
      apiKey: this.config.apiKey,
      organizationId: this.config.organizationId,
      projectId: this.config.projectId,
    });

    const defaultHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    authManager.applyAuth(defaultHeaders);

    const transport = new FetchHttpTransport(
      this.config.baseUrl,
      defaultHeaders,
      this.config.timeout
    );

    this.orchestrator = new DefaultResilienceOrchestrator(transport, {
      ...DEFAULT_RESILIENCE_CONFIG,
      maxRetries: this.config.maxRetries,
    });

    // Register telemetry hooks for observability
    const telemetryHooks = new TelemetryHooks();
    this.orchestrator.addRequestHook(telemetryHooks.onRequest);
    this.orchestrator.addResponseHook(telemetryHooks.onResponse);
    this.orchestrator.addErrorHook(telemetryHooks.onError);

    this.chat = new ChatCompletionServiceImpl(this.orchestrator);
    this.embeddings = new EmbeddingsServiceImpl(this.orchestrator);
    this.files = new FilesServiceImpl(this.orchestrator);
    this.models = new ModelsServiceImpl(this.orchestrator);
    this.batches = new BatchesServiceImpl(this.orchestrator);
    this.images = new ImagesServiceImpl(this.orchestrator);
    this.audio = new AudioServiceImpl(this.orchestrator);
    this.moderations = new ModerationsServiceImpl(this.orchestrator);
    this.fineTuning = new FineTuningServiceImpl(this.orchestrator);
    this.assistants = new AssistantsServiceImpl(this.orchestrator);
  }

  getConfig(): Readonly<NormalizedConfig> {
    return { ...this.config };
  }
}
