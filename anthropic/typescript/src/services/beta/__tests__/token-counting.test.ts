import { describe, it, expect, beforeEach } from 'vitest';
import { TokenCountingServiceImpl, createTokenCountingService } from '../token-counting.js';
import type { TokenCountRequest, TokenCountResponse } from '../types.js';
import { createMockHttpTransport } from '../../../__mocks__/http-transport.mock.js';
import { createMockAuthManager } from '../../../__mocks__/auth-manager.mock.js';
import { createMockResilienceOrchestrator, mockResilienceOrchestratorError } from '../../../__mocks__/resilience.mock.js';
import { ServerError } from '../../../errors/categories.js';

describe('Token Counting Service', () => {
  let service: TokenCountingServiceImpl;
  let mockTransport: ReturnType<typeof createMockHttpTransport>;
  let mockAuth: ReturnType<typeof createMockAuthManager>;
  let mockResilience: ReturnType<typeof createMockResilienceOrchestrator>;

  beforeEach(() => {
    mockTransport = createMockHttpTransport();
    mockAuth = createMockAuthManager();
    mockResilience = createMockResilienceOrchestrator();
    service = new TokenCountingServiceImpl(mockTransport, mockAuth, mockResilience);
  });

  describe('countTokens', () => {
    const validRequest: TokenCountRequest = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: 'Hello, world!' }],
    };

    it('should count tokens successfully', async () => {
      const expectedResponse: TokenCountResponse = {
        input_tokens: 10,
      };

      mockTransport.request.mockResolvedValue(expectedResponse);

      const result = await service.countTokens(validRequest);

      expect(result).toEqual(expectedResponse);
      expect(mockAuth.getHeaders).toHaveBeenCalled();
      expect(mockResilience.execute).toHaveBeenCalled();
      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/messages/count_tokens',
        validRequest,
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-beta': 'token-counting-2024-11-01',
          }),
        })
      );
    });

    it('should include beta header for token counting', async () => {
      mockTransport.request.mockResolvedValue({ input_tokens: 10 });

      await service.countTokens(validRequest);

      const callArgs = mockTransport.request.mock.calls[0];
      const options = callArgs[3];

      expect(options?.headers?.['anthropic-beta']).toBe('token-counting-2024-11-01');
    });

    it('should count tokens with system prompt', async () => {
      const requestWithSystem: TokenCountRequest = {
        ...validRequest,
        system: 'You are a helpful assistant',
      };

      mockTransport.request.mockResolvedValue({ input_tokens: 20 });

      const result = await service.countTokens(requestWithSystem);

      expect(result.input_tokens).toBe(20);
      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/messages/count_tokens',
        requestWithSystem,
        expect.anything()
      );
    });

    it('should count tokens with tools', async () => {
      const requestWithTools: TokenCountRequest = {
        ...validRequest,
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather information',
            input_schema: { type: 'object', properties: {} },
          },
        ],
      };

      mockTransport.request.mockResolvedValue({ input_tokens: 30 });

      const result = await service.countTokens(requestWithTools);

      expect(result.input_tokens).toBe(30);
    });

    it('should count tokens with multiple messages', async () => {
      const requestWithMultipleMessages: TokenCountRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' },
        ],
      };

      mockTransport.request.mockResolvedValue({ input_tokens: 15 });

      const result = await service.countTokens(requestWithMultipleMessages);

      expect(result.input_tokens).toBe(15);
    });

    it('should pass request options to transport', async () => {
      const options = {
        headers: { 'custom-header': 'value' },
        timeout: 30000,
        signal: new AbortController().signal,
      };

      mockTransport.request.mockResolvedValue({ input_tokens: 10 });

      await service.countTokens(validRequest, options);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/messages/count_tokens',
        validRequest,
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'anthropic-beta': 'token-counting-2024-11-01',
            'custom-header': 'value',
          }),
          timeout: 30000,
          signal: options.signal,
        })
      );
    });

    it('should merge custom headers with beta header', async () => {
      const options = {
        headers: { 'custom-header': 'value' },
      };

      mockTransport.request.mockResolvedValue({ input_tokens: 10 });

      await service.countTokens(validRequest, options);

      const callArgs = mockTransport.request.mock.calls[0];
      const requestOptions = callArgs[3];

      expect(requestOptions?.headers?.['anthropic-beta']).toBe('token-counting-2024-11-01');
      expect(requestOptions?.headers?.['custom-header']).toBe('value');
    });

    it('should handle API errors through resilience orchestrator', async () => {
      const apiError = new ServerError('Server error', 500);
      mockResilienceOrchestratorError(mockResilience, apiError);

      await expect(service.countTokens(validRequest)).rejects.toThrow(apiError);
    });

    it('should throw error for missing model', async () => {
      const invalidRequest = {
        ...validRequest,
        model: '',
      };

      await expect(service.countTokens(invalidRequest)).rejects.toThrow(
        'Model is required and must be a string'
      );
    });

    it('should throw error for non-string model', async () => {
      const invalidRequest = {
        ...validRequest,
        model: null as any,
      };

      await expect(service.countTokens(invalidRequest)).rejects.toThrow(
        'Model is required and must be a string'
      );
    });

    it('should throw error for empty messages array', async () => {
      const invalidRequest = {
        ...validRequest,
        messages: [],
      };

      await expect(service.countTokens(invalidRequest)).rejects.toThrow(
        'Messages array is required and must not be empty'
      );
    });

    it('should throw error for missing messages', async () => {
      const invalidRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: null as any,
      };

      await expect(service.countTokens(invalidRequest)).rejects.toThrow(
        'Messages array is required and must not be empty'
      );
    });

    it('should throw error for non-array messages', async () => {
      const invalidRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: 'not an array' as any,
      };

      await expect(service.countTokens(invalidRequest)).rejects.toThrow(
        'Messages array is required and must not be empty'
      );
    });

    it('should handle large token counts', async () => {
      const expectedResponse: TokenCountResponse = {
        input_tokens: 100000,
      };

      mockTransport.request.mockResolvedValue(expectedResponse);

      const result = await service.countTokens(validRequest);

      expect(result.input_tokens).toBe(100000);
    });

    it('should handle complex content blocks', async () => {
      const complexRequest: TokenCountRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analyze this image' },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: 'base64encodeddata',
                },
              },
            ],
          },
        ],
      };

      mockTransport.request.mockResolvedValue({ input_tokens: 50 });

      const result = await service.countTokens(complexRequest);

      expect(result.input_tokens).toBe(50);
    });
  });

  describe('createTokenCountingService', () => {
    it('should create a token counting service instance', () => {
      const service = createTokenCountingService(
        mockTransport,
        mockAuth,
        mockResilience
      );

      expect(service).toBeInstanceOf(TokenCountingServiceImpl);
    });

    it('should create a functional service', async () => {
      const service = createTokenCountingService(
        mockTransport,
        mockAuth,
        mockResilience
      );

      mockTransport.request.mockResolvedValue({ input_tokens: 10 });

      const result = await service.countTokens({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(result.input_tokens).toBe(10);
    });
  });
});
