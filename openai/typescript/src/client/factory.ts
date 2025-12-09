import type { OpenAIClient } from './index.js';
import type { OpenAIConfig } from './config.js';
import { OpenAIClientImpl } from './client-impl.js';
import { validateConfig, configFromEnv } from './config.js';

export function createClient(config: OpenAIConfig): OpenAIClient {
  validateConfig(config);
  return new OpenAIClientImpl(config);
}

export function createClientFromEnv(): OpenAIClient {
  const config = configFromEnv();
  return createClient(config);
}
