/**
 * Client Factory
 *
 * Factory functions for creating Azure OpenAI clients.
 */

import type { AzureOpenAIClient } from './client-impl.js';
import type { AzureOpenAIConfig } from './config.js';
import { AzureOpenAIClientImpl, createClient } from './client-impl.js';
import { configFromEnv } from './config.js';

/**
 * Creates a client from environment variables
 *
 * Required env vars:
 * - AZURE_OPENAI_RESOURCE_NAME: Azure resource name
 * - AZURE_OPENAI_API_KEY: API key (or use Azure AD)
 *
 * Optional env vars:
 * - AZURE_OPENAI_API_VERSION: API version
 * - AZURE_OPENAI_TIMEOUT: Request timeout in ms
 * - AZURE_OPENAI_MAX_RETRIES: Max retry attempts
 * - AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET: For Azure AD auth
 * - AZURE_USE_MANAGED_IDENTITY: Use managed identity auth
 * - AZURE_OPENAI_DEPLOYMENTS: Deployment configuration
 */
export function createClientFromEnv(): AzureOpenAIClient {
  const config = configFromEnv();
  return createClient(config);
}

/**
 * Client builder for fluent configuration
 */
export class AzureOpenAIClientBuilder {
  private config: Partial<AzureOpenAIConfig> = {};

  /**
   * Sets the Azure resource name
   */
  resourceName(name: string): this {
    this.config.resourceName = name;
    return this;
  }

  /**
   * Sets the API key for authentication
   */
  apiKey(key: string): this {
    this.config.apiKey = key;
    return this;
  }

  /**
   * Sets Azure AD credentials
   */
  azureAdCredentials(credentials: AzureOpenAIConfig['azureAdCredentials']): this {
    this.config.azureAdCredentials = credentials;
    return this;
  }

  /**
   * Sets the default API version
   */
  apiVersion(version: AzureOpenAIConfig['apiVersion']): this {
    this.config.apiVersion = version;
    return this;
  }

  /**
   * Sets the request timeout
   */
  timeout(ms: number): this {
    this.config.timeout = ms;
    return this;
  }

  /**
   * Sets the maximum retry attempts
   */
  maxRetries(count: number): this {
    this.config.maxRetries = count;
    return this;
  }

  /**
   * Sets deployments configuration
   */
  deployments(deployments: AzureOpenAIConfig['deployments']): this {
    this.config.deployments = deployments;
    return this;
  }

  /**
   * Sets a custom base URL (for private endpoints)
   */
  baseUrl(url: string): this {
    this.config.baseUrl = url;
    return this;
  }

  /**
   * Builds the client
   */
  build(): AzureOpenAIClient {
    if (!this.config.resourceName) {
      throw new Error('Resource name is required');
    }
    return new AzureOpenAIClientImpl(this.config as AzureOpenAIConfig);
  }
}

/**
 * Creates a client builder
 */
export function builder(): AzureOpenAIClientBuilder {
  return new AzureOpenAIClientBuilder();
}

export { createClient };
