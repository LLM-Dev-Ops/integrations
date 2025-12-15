/**
 * Azure OpenAI Client Implementation
 *
 * Main client for interacting with Azure OpenAI services.
 */

import type { AzureOpenAIConfig, NormalizedAzureConfig } from './config.js';
import type { ChatCompletionService } from '../services/chat/index.js';
import type { EmbeddingService } from '../services/embedding/index.js';
import type { DeploymentRegistry } from '../deployment/index.js';
import type { AuthProvider } from '../auth/index.js';
import { normalizeConfig } from './config.js';
import { ChatCompletionServiceImpl } from '../services/chat/index.js';
import { EmbeddingServiceImpl } from '../services/embedding/index.js';
import { DeploymentRegistryImpl } from '../deployment/index.js';
import { createAuthProvider } from '../auth/index.js';

/** Azure OpenAI client interface */
export interface AzureOpenAIClient {
  /** Chat completions service */
  readonly chat: ChatCompletionService;
  /** Embeddings service */
  readonly embeddings: EmbeddingService;
  /** Deployment registry */
  readonly deployments: DeploymentRegistry;
  /** Get current configuration */
  getConfig(): Readonly<NormalizedAzureConfig>;
}

/**
 * Azure OpenAI client implementation
 */
export class AzureOpenAIClientImpl implements AzureOpenAIClient {
  public readonly chat: ChatCompletionService;
  public readonly embeddings: EmbeddingService;
  public readonly deployments: DeploymentRegistry;

  private readonly config: NormalizedAzureConfig;
  private readonly authProvider: AuthProvider;

  constructor(config: AzureOpenAIConfig) {
    this.config = normalizeConfig(config);

    // Initialize deployment registry
    this.deployments = new DeploymentRegistryImpl(this.config.deployments);

    // Initialize auth provider
    this.authProvider = createAuthProvider(
      this.config.apiKey,
      this.config.azureAdCredentials
    );

    // Initialize services
    const serviceDeps = {
      authProvider: this.authProvider,
      deploymentRegistry: this.deployments,
      defaultTimeout: this.config.timeout,
    };

    this.chat = new ChatCompletionServiceImpl(serviceDeps);
    this.embeddings = new EmbeddingServiceImpl(serviceDeps);
  }

  getConfig(): Readonly<NormalizedAzureConfig> {
    return { ...this.config };
  }
}

/**
 * Creates an Azure OpenAI client with the given configuration
 */
export function createClient(config: AzureOpenAIConfig): AzureOpenAIClient {
  return new AzureOpenAIClientImpl(config);
}
