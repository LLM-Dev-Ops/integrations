import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createClient, createClientFromEnv } from '../factory.js';
import type { OpenAIConfig } from '../../types/common.js';

describe('OpenAI Client', () => {
  describe('createClient', () => {
    it('should create a client with valid config', () => {
      const config: OpenAIConfig = {
        apiKey: 'sk-test-key',
      };

      const client = createClient(config);

      expect(client).toBeDefined();
      expect(client.chat).toBeDefined();
      expect(client.embeddings).toBeDefined();
      expect(client.files).toBeDefined();
      expect(client.models).toBeDefined();
      expect(client.images).toBeDefined();
      expect(client.audio).toBeDefined();
      expect(client.moderations).toBeDefined();
      expect(client.batches).toBeDefined();
      expect(client.fineTuning).toBeDefined();
      expect(client.assistants).toBeDefined();
    });

    it('should expose all service APIs', () => {
      const config: OpenAIConfig = {
        apiKey: 'sk-test-key',
      };

      const client = createClient(config);

      // Check that all service methods are available
      expect(typeof client.chat.create).toBe('function');
      expect(typeof client.chat.stream).toBe('function');
      expect(typeof client.embeddings.create).toBe('function');
      expect(typeof client.files.create).toBe('function');
      expect(typeof client.models.list).toBe('function');
      expect(typeof client.images.generate).toBe('function');
      expect(typeof client.audio.transcribe).toBe('function');
      expect(typeof client.moderations.create).toBe('function');
      expect(typeof client.batches.create).toBe('function');
      expect(typeof client.fineTuning.create).toBe('function');
      expect(typeof client.assistants.create).toBe('function');
    });

    it('should throw error for invalid config', () => {
      const config = {} as OpenAIConfig;

      expect(() => createClient(config)).toThrow('API key is required');
    });

    it('should throw error for empty API key', () => {
      const config: OpenAIConfig = {
        apiKey: '',
      };

      expect(() => createClient(config)).toThrow('API key cannot be empty');
    });

    it('should throw error for negative timeout', () => {
      const config: OpenAIConfig = {
        apiKey: 'sk-test-key',
        timeout: -1,
      };

      expect(() => createClient(config)).toThrow('Timeout must be non-negative');
    });

    it('should accept custom base URL', () => {
      const config: OpenAIConfig = {
        apiKey: 'sk-test-key',
        baseURL: 'https://custom.openai.com',
      };

      const client = createClient(config);

      expect(client).toBeDefined();
      const clientConfig = client.getConfig();
      expect(clientConfig.baseURL).toBe('https://custom.openai.com');
    });

    it('should accept organization ID', () => {
      const config: OpenAIConfig = {
        apiKey: 'sk-test-key',
        organization: 'org-123',
      };

      const client = createClient(config);

      expect(client).toBeDefined();
      const clientConfig = client.getConfig();
      expect(clientConfig.organization).toBe('org-123');
    });

    it('should accept custom headers', () => {
      const config: OpenAIConfig = {
        apiKey: 'sk-test-key',
        defaultHeaders: {
          'X-Custom-Header': 'test-value',
        },
      };

      const client = createClient(config);

      expect(client).toBeDefined();
      const clientConfig = client.getConfig();
      expect(clientConfig.defaultHeaders).toEqual({
        'X-Custom-Header': 'test-value',
      });
    });

    it('should accept custom retry and timeout settings', () => {
      const config: OpenAIConfig = {
        apiKey: 'sk-test-key',
        timeout: 30000,
        maxRetries: 5,
      };

      const client = createClient(config);

      expect(client).toBeDefined();
      const clientConfig = client.getConfig();
      expect(clientConfig.timeout).toBe(30000);
      expect(clientConfig.maxRetries).toBe(5);
    });
  });

  describe('createClientFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should create client from environment variables', () => {
      process.env['OPENAI_API_KEY'] = 'sk-test-key';

      const client = createClientFromEnv();

      expect(client).toBeDefined();
      const config = client.getConfig();
      expect(config.apiKey).toBe('sk-test-key');
    });

    it('should use OPENAI_BASE_URL if provided', () => {
      process.env['OPENAI_API_KEY'] = 'sk-test-key';
      process.env['OPENAI_BASE_URL'] = 'https://custom.openai.com';

      const client = createClientFromEnv();

      const config = client.getConfig();
      expect(config.baseURL).toBe('https://custom.openai.com');
    });

    it('should use OPENAI_ORGANIZATION if provided', () => {
      process.env['OPENAI_API_KEY'] = 'sk-test-key';
      process.env['OPENAI_ORGANIZATION'] = 'org-123';

      const client = createClientFromEnv();

      const config = client.getConfig();
      expect(config.organization).toBe('org-123');
    });

    it('should throw error if OPENAI_API_KEY is not set', () => {
      delete process.env['OPENAI_API_KEY'];

      expect(() => createClientFromEnv()).toThrow(
        'OPENAI_API_KEY environment variable is not set'
      );
    });

    it('should handle all environment variables together', () => {
      process.env['OPENAI_API_KEY'] = 'sk-test-key';
      process.env['OPENAI_BASE_URL'] = 'https://custom.openai.com';
      process.env['OPENAI_ORGANIZATION'] = 'org-123';

      const client = createClientFromEnv();

      const config = client.getConfig();
      expect(config.apiKey).toBe('sk-test-key');
      expect(config.baseURL).toBe('https://custom.openai.com');
      expect(config.organization).toBe('org-123');
    });
  });

  describe('getConfig', () => {
    it('should return readonly config', () => {
      const config: OpenAIConfig = {
        apiKey: 'sk-test-key',
        baseURL: 'https://custom.openai.com',
        organization: 'org-123',
      };

      const client = createClient(config);
      const returnedConfig = client.getConfig();

      expect(returnedConfig.apiKey).toBe('sk-test-key');
      expect(returnedConfig.baseURL).toBe('https://custom.openai.com');
      expect(returnedConfig.organization).toBe('org-123');
    });
  });
});
