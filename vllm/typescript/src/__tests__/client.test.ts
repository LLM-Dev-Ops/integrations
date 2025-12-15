/**
 * vLLM Client Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createVllmClient,
  createVllmClientFromUrl,
  type VllmConfig,
  type ChatRequest,
  type ChatResponse,
  VllmError,
  InvalidModelError,
  ConfigurationError,
} from '../index.js';

// Mock fetch with proper setup
const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

describe('VllmClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(async () => {
    // Allow any pending operations to complete
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  describe('createVllmClientFromUrl', () => {
    it('creates a client with default configuration', () => {
      const client = createVllmClientFromUrl('http://localhost:8000');
      expect(client).toBeDefined();
    });

    it('creates a client with auth token', () => {
      const client = createVllmClientFromUrl('http://localhost:8000', 'test-token');
      expect(client).toBeDefined();
    });
  });

  describe('createVllmClient', () => {
    it('creates a client with full configuration', () => {
      const config: VllmConfig = {
        servers: [{ url: 'http://localhost:8000' }],
        timeout: 60000,
        pool: {
          maxConnectionsPerServer: 50,
          idleTimeout: 60000,
          acquireTimeout: 5000,
          keepaliveInterval: 30000,
        },
        retry: {
          maxAttempts: 3,
          baseDelayMs: 1000,
          maxDelayMs: 30000,
          exponentialBase: 2,
        },
        circuitBreaker: {
          failureThreshold: 5,
          successThreshold: 3,
          openDurationMs: 30000,
        },
        autoDiscoverModels: false,
        modelDiscoveryIntervalMs: 30000,
      };

      const client = createVllmClient(config);
      expect(client).toBeDefined();
    });

    it('throws on invalid server URL', () => {
      expect(() => {
        createVllmClient({
          servers: [{ url: 'invalid-url' }],
          timeout: 60000,
          pool: {
            maxConnectionsPerServer: 50,
            idleTimeout: 60000,
            acquireTimeout: 5000,
            keepaliveInterval: 30000,
          },
          retry: {
            maxAttempts: 3,
            baseDelayMs: 1000,
            maxDelayMs: 30000,
            exponentialBase: 2,
          },
          circuitBreaker: {
            failureThreshold: 5,
            successThreshold: 3,
            openDurationMs: 30000,
          },
          autoDiscoverModels: false,
          modelDiscoveryIntervalMs: 30000,
        });
      }).toThrow(ConfigurationError);
    });

    it('throws when no servers configured', () => {
      expect(() => {
        createVllmClient({
          servers: [],
          timeout: 60000,
          pool: {
            maxConnectionsPerServer: 50,
            idleTimeout: 60000,
            acquireTimeout: 5000,
            keepaliveInterval: 30000,
          },
          retry: {
            maxAttempts: 3,
            baseDelayMs: 1000,
            maxDelayMs: 30000,
            exponentialBase: 2,
          },
          circuitBreaker: {
            failureThreshold: 5,
            successThreshold: 3,
            openDurationMs: 30000,
          },
          autoDiscoverModels: false,
          modelDiscoveryIntervalMs: 30000,
        });
      }).toThrow(ConfigurationError);
    });
  });

  describe('chatCompletion', () => {
    it('makes successful chat completion request', async () => {
      const mockResponse: ChatResponse = {
        id: 'cmpl-123',
        object: 'chat.completion',
        created: 1702488000,
        model: 'test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      // Mock all fetch calls
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })
      );

      const client = createVllmClientFromUrl('http://localhost:8000');

      const request: ChatRequest = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
      };

      const response = await client.chatCompletion(request);

      expect(response).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalled();

      await client.close();
    });

    it('handles server errors', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: { message: 'Internal server error' } }),
        })
      );

      const client = createVllmClientFromUrl('http://localhost:8000');

      const request: ChatRequest = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await expect(client.chatCompletion(request)).rejects.toThrow(VllmError);

      await client.close();
    });
  });

  describe('healthCheck', () => {
    it('returns healthy status on success', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        })
      );

      const client = createVllmClientFromUrl('http://localhost:8000');

      const result = await client.healthCheck();

      expect(result.status).toBe('healthy');
      expect(result.server).toBe('http://localhost:8000');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);

      await client.close();
    });

    it('returns unhealthy status on failure', async () => {
      mockFetch.mockImplementation(() =>
        Promise.reject(new Error('Connection refused'))
      );

      const client = createVllmClientFromUrl('http://localhost:8000');

      const result = await client.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.server).toBe('http://localhost:8000');

      await client.close();
    });
  });

  describe('close', () => {
    it('closes client without error', async () => {
      const client = createVllmClientFromUrl('http://localhost:8000');

      await expect(client.close()).resolves.not.toThrow();
    });

    it('throws error when using closed client', async () => {
      const client = createVllmClientFromUrl('http://localhost:8000');

      await client.close();

      await expect(
        client.chatCompletion({
          model: 'test',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow(ConfigurationError);
    });
  });

  describe('recording', () => {
    it('starts and stops recording', () => {
      const client = createVllmClientFromUrl('http://localhost:8000');

      expect(client.isRecording()).toBe(false);

      client.startRecording();
      expect(client.isRecording()).toBe(true);

      client.stopRecording();
      expect(client.isRecording()).toBe(false);
    });
  });
});

describe('Error Types', () => {
  it('VllmError has correct properties', () => {
    const error = new VllmError({
      type: 'test_error',
      message: 'Test message',
      status: 400,
      isRetryable: true,
    });

    expect(error.type).toBe('test_error');
    expect(error.message).toBe('Test message');
    expect(error.status).toBe(400);
    expect(error.isRetryable).toBe(true);
  });

  it('InvalidModelError includes model info', () => {
    const error = new InvalidModelError('bad-model', ['good-model-1', 'good-model-2']);

    expect(error.details?.['model']).toBe('bad-model');
    expect(error.details?.['availableModels']).toEqual(['good-model-1', 'good-model-2']);
  });

  it('toJSON returns correct structure', () => {
    const error = new VllmError({
      type: 'test_error',
      message: 'Test',
      status: 500,
    });

    const json = error.toJSON();

    expect(json.name).toBe('VllmError');
    expect(json.type).toBe('test_error');
    expect(json.message).toBe('Test');
    expect(json.status).toBe(500);
  });
});
