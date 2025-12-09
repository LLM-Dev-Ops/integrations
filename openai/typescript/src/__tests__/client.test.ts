import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '../client/factory.js';
import type { OpenAIClient } from '../client/index.js';

describe('OpenAIClient', () => {
  let client: OpenAIClient;

  beforeEach(() => {
    client = createClient({
      apiKey: 'test-api-key',
      baseURL: 'https://api.openai.com',
    });
  });

  it('should create client with valid config', () => {
    expect(client).toBeDefined();
    expect(client.chat).toBeDefined();
    expect(client.embeddings).toBeDefined();
    expect(client.files).toBeDefined();
    expect(client.models).toBeDefined();
    expect(client.batches).toBeDefined();
    expect(client.images).toBeDefined();
    expect(client.audio).toBeDefined();
    expect(client.moderations).toBeDefined();
    expect(client.fineTuning).toBeDefined();
    expect(client.assistants).toBeDefined();
  });

  it('should expose config', () => {
    const config = client.getConfig();
    expect(config.apiKey).toBe('test-api-key');
    expect(config.baseURL).toBe('https://api.openai.com');
  });

  it('should throw error for missing API key', () => {
    expect(() => {
      createClient({ apiKey: '' });
    }).toThrow('API key cannot be empty');
  });

  it('should throw error for invalid timeout', () => {
    expect(() => {
      createClient({ apiKey: 'test-key', timeout: -1 });
    }).toThrow('Timeout must be non-negative');
  });
});
