export interface OpenAIConfig {
  apiKey: string;
  baseUrl?: string;
  organizationId?: string;
  projectId?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface NormalizedConfig {
  apiKey: string;
  baseUrl: string;
  organizationId?: string;
  projectId?: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
}

export const DEFAULT_CONFIG: Omit<NormalizedConfig, 'apiKey'> = {
  baseUrl: 'https://api.openai.com/v1',
  timeout: 60000,
  maxRetries: 3,
  retryDelay: 1000,
};

export function normalizeConfig(config: OpenAIConfig): NormalizedConfig {
  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? DEFAULT_CONFIG.baseUrl,
    organizationId: config.organizationId,
    projectId: config.projectId,
    timeout: config.timeout ?? DEFAULT_CONFIG.timeout,
    maxRetries: config.maxRetries ?? DEFAULT_CONFIG.maxRetries,
    retryDelay: config.retryDelay ?? DEFAULT_CONFIG.retryDelay,
  };
}

export function validateConfig(config: OpenAIConfig): void {
  if (!config.apiKey) {
    throw new Error('API key is required');
  }
  if (config.timeout !== undefined && config.timeout <= 0) {
    throw new Error('Timeout must be positive');
  }
  if (config.maxRetries !== undefined && config.maxRetries < 0) {
    throw new Error('Max retries must be non-negative');
  }
}

export function configFromEnv(): OpenAIConfig {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return {
    apiKey,
    organizationId: process.env.OPENAI_ORG_ID,
    baseUrl: process.env.OPENAI_BASE_URL,
  };
}
