/**
 * Azure OpenAI Client Configuration
 *
 * Configuration types and normalization for Azure OpenAI client.
 */

import type { ApiVersion, AzureDeployment, AuthMethod } from '../types/index.js';

/** Azure OpenAI client configuration options */
export interface AzureOpenAIConfig {
  /** Azure resource name (subdomain of openai.azure.com) */
  resourceName: string;
  /** Default API version for requests */
  apiVersion?: ApiVersion;
  /** API key for authentication */
  apiKey?: string;
  /** Azure AD credentials for token-based auth */
  azureAdCredentials?: {
    tenantId: string;
    clientId: string;
    clientSecret?: string;
    useManagedIdentity?: boolean;
  };
  /** Pre-configured deployments */
  deployments?: AzureDeployment[];
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Custom base URL (for private endpoints) */
  baseUrl?: string;
}

/** Normalized configuration with defaults applied */
export interface NormalizedAzureConfig {
  resourceName: string;
  apiVersion: ApiVersion;
  authMethod: AuthMethod;
  apiKey?: string;
  azureAdCredentials?: {
    tenantId: string;
    clientId: string;
    clientSecret?: string;
    useManagedIdentity?: boolean;
  };
  deployments: AzureDeployment[];
  timeout: number;
  maxRetries: number;
  baseUrl: string;
}

/** Default configuration values */
const DEFAULTS = {
  apiVersion: '2024-06-01' as ApiVersion,
  timeout: 120000,
  maxRetries: 3,
};

/**
 * Constructs the base URL for Azure OpenAI endpoint
 */
function buildBaseUrl(resourceName: string): string {
  return `https://${resourceName}.openai.azure.com`;
}

/**
 * Determines authentication method from config
 */
function determineAuthMethod(config: AzureOpenAIConfig): AuthMethod {
  if (config.azureAdCredentials?.useManagedIdentity) {
    return 'managed-identity';
  }
  if (config.azureAdCredentials?.tenantId) {
    return 'azure-ad';
  }
  return 'api-key';
}

/**
 * Normalizes configuration with defaults
 */
export function normalizeConfig(config: AzureOpenAIConfig): NormalizedAzureConfig {
  const authMethod = determineAuthMethod(config);

  if (authMethod === 'api-key' && !config.apiKey) {
    throw new Error('API key is required when using api-key authentication');
  }

  return {
    resourceName: config.resourceName,
    apiVersion: config.apiVersion ?? DEFAULTS.apiVersion,
    authMethod,
    apiKey: config.apiKey,
    azureAdCredentials: config.azureAdCredentials,
    deployments: config.deployments ?? [],
    timeout: config.timeout ?? DEFAULTS.timeout,
    maxRetries: config.maxRetries ?? DEFAULTS.maxRetries,
    baseUrl: config.baseUrl ?? buildBaseUrl(config.resourceName),
  };
}

/**
 * Creates configuration from environment variables
 */
export function configFromEnv(): AzureOpenAIConfig {
  const resourceName = process.env.AZURE_OPENAI_RESOURCE_NAME;
  if (!resourceName) {
    throw new Error('AZURE_OPENAI_RESOURCE_NAME environment variable is required');
  }

  const config: AzureOpenAIConfig = {
    resourceName,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    apiVersion: (process.env.AZURE_OPENAI_API_VERSION as ApiVersion) ?? DEFAULTS.apiVersion,
    timeout: process.env.AZURE_OPENAI_TIMEOUT
      ? parseInt(process.env.AZURE_OPENAI_TIMEOUT, 10)
      : undefined,
    maxRetries: process.env.AZURE_OPENAI_MAX_RETRIES
      ? parseInt(process.env.AZURE_OPENAI_MAX_RETRIES, 10)
      : undefined,
  };

  // Azure AD configuration
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  if (tenantId && clientId) {
    config.azureAdCredentials = {
      tenantId,
      clientId,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
      useManagedIdentity: process.env.AZURE_USE_MANAGED_IDENTITY === 'true',
    };
  }

  return config;
}
