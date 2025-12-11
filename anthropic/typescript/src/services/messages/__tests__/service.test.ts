import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessagesServiceImpl } from '../service.js';
import type { CreateMessageRequest, CountTokensRequest, Message, TokenCount } from '../types.js';
import { createMockHttpTransport, mockHttpTransportResponse, mockHttpTransportError, mockHttpTransportStream } from '../../../__mocks__/http-transport.mock.js';
import { createMockAuthManager } from '../../../__mocks__/auth-manager.mock.js';
import { createMockResilienceOrchestrator, mockResilienceOrchestratorError } from '../../../__mocks__/resilience.mock.js';
import { ValidationError, ServerError } from '../../../errors/categories.js';

describe('MessagesServiceImpl', () => {
  let service: MessagesServiceImpl;
  let mockTransport: ReturnType<typeof createMockHttpTransport>;
  let mockAuth: ReturnType<typeof createMockAuthManager>;
  let mockResilience: ReturnType<typeof createMockResilienceOrchestrator>;

  beforeEach(() => {
    mockTransport = createMockHttpTransport();
    mockAuth = createMockAuthManager();
    mockResilience = createMockResilienceOrchestrator();
    service = new MessagesServiceImpl(mockTransport, mockAuth, mockResilience);
  });

  describe('create', () => {
    it('should create a message successfully', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const expectedResponse: Message = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hi there!' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
      };

      mockTransport.request.mockResolvedValue(expectedResponse);

      const result = await service.create(request);

      expect(result).toEqual(expectedResponse);
      expect(mockAuth.getHeaders).toHaveBeenCalled();
      expect(mockResilience.execute).toHaveBeenCalled();
      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/messages',
        { ...request, stream: false },
        {
          headers: {
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
        }
      );
    });

    it('should pass request options to transport', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const options = {
        headers: { 'custom-header': 'value' },
        timeout: 30000,
        signal: new AbortController().signal,
      };

      mockTransport.request.mockResolvedValue({} as Message);

      await service.create(request, options);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/messages',
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'custom-header': 'value',
          }),
          timeout: 30000,
          signal: options.signal,
        })
      );
    });

    it('should throw ValidationError for missing model', async () => {
      const request = {
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      } as CreateMessageRequest;

      await expect(service.create(request)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing max_tokens', async () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
      } as CreateMessageRequest;

      await expect(service.create(request)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for zero max_tokens', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 0,
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await expect(service.create(request)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty messages array', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [],
      };

      await expect(service.create(request)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid temperature', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 1.5,
      };

      await expect(service.create(request)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid top_p', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
        top_p: -0.1,
      };

      await expect(service.create(request)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative top_k', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
        top_k: -1,
      };

      await expect(service.create(request)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for consecutive assistant messages', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi' },
          { role: 'assistant', content: 'How are you?' },
        ],
      };

      await expect(service.create(request)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError if first message is not from user', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'assistant', content: 'Hello' }],
      };

      await expect(service.create(request)).rejects.toThrow(ValidationError);
    });

    it('should handle API errors through resilience orchestrator', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const apiError = new ServerError('Server error', 500);
      mockResilienceOrchestratorError(mockResilience, apiError);

      await expect(service.create(request)).rejects.toThrow(apiError);
    });

    it('should support system messages', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
        system: 'You are a helpful assistant.',
      };

      mockTransport.request.mockResolvedValue({} as Message);

      await service.create(request);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/messages',
        expect.objectContaining({
          system: 'You are a helpful assistant.',
        }),
        expect.anything()
      );
    });

    it('should support tools', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'What is the weather?' }],
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather information',
            input_schema: {
              type: 'object',
              properties: {
                location: { type: 'string' },
              },
            },
          },
        ],
      };

      mockTransport.request.mockResolvedValue({} as Message);

      await service.create(request);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/messages',
        expect.objectContaining({
          tools: request.tools,
        }),
        expect.anything()
      );
    });

    it('should support thinking config', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Solve this problem' }],
        thinking: {
          type: 'enabled',
          budget_tokens: 2048, // Must be >= 1024 per SPARC spec
        },
      };

      mockTransport.request.mockResolvedValue({} as Message);

      await service.create(request);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/messages',
        expect.objectContaining({
          thinking: request.thinking,
        }),
        expect.anything()
      );
    });

    it('should throw ValidationError for thinking budget_tokens below 1024', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Solve this problem' }],
        thinking: {
          type: 'enabled',
          budget_tokens: 500, // Below minimum of 1024
        },
      };

      await expect(service.create(request)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for thinking with unsupported model', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-2.1', // Not supported for thinking
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Solve this problem' }],
        thinking: {
          type: 'enabled',
          budget_tokens: 2048,
        },
      };

      await expect(service.create(request)).rejects.toThrow(ValidationError);
    });

    it('should accept thinking with supported model', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Solve this problem' }],
        thinking: {
          type: 'enabled',
          budget_tokens: 1024, // Exactly at minimum
        },
      };

      mockTransport.request.mockResolvedValue({} as Message);

      await service.create(request);

      expect(mockTransport.request).toHaveBeenCalled();
    });

    it('should support metadata', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
        metadata: {
          user_id: 'user-123',
        },
      };

      mockTransport.request.mockResolvedValue({} as Message);

      await service.create(request);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/messages',
        expect.objectContaining({
          metadata: request.metadata,
        }),
        expect.anything()
      );
    });
  });

  describe('createStream', () => {
    it('should create a streaming message successfully', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const events = [
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" there!"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":5}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ];

      mockHttpTransportStream(mockTransport, events);

      const stream = await service.createStream(request);

      expect(stream).toBeDefined();
      expect(mockAuth.getHeaders).toHaveBeenCalled();
      expect(mockTransport.requestStream).toHaveBeenCalledWith(
        'POST',
        '/v1/messages',
        { ...request, stream: true },
        {
          headers: {
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
        }
      );

      // Verify we can iterate over the stream
      const streamEvents: any[] = [];
      for await (const event of stream) {
        streamEvents.push(event);
      }

      expect(streamEvents.length).toBeGreaterThan(0);
      expect(streamEvents[0].type).toBe('message_start');
    });

    it('should pass request options to transport', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const options = {
        headers: { 'custom-header': 'value' },
        timeout: 30000,
        signal: new AbortController().signal,
      };

      mockHttpTransportStream(mockTransport, []);

      await service.createStream(request, options);

      expect(mockTransport.requestStream).toHaveBeenCalledWith(
        'POST',
        '/v1/messages',
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'custom-header': 'value',
          }),
          timeout: 30000,
          signal: options.signal,
        })
      );
    });

    it('should throw ValidationError for invalid request', async () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
      } as CreateMessageRequest;

      await expect(service.createStream(request)).rejects.toThrow(ValidationError);
    });

    it('should collect stream into complete message', async () => {
      const request: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const events = [
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ];

      mockHttpTransportStream(mockTransport, events);

      const stream = await service.createStream(request);
      const message = await stream.collect();

      expect(message.id).toBe('msg_123');
      expect(message.model).toBe('claude-3-5-sonnet-20241022');
      expect(message.stop_reason).toBe('end_turn');
      expect(message.content[0]).toEqual({ type: 'text', text: 'Hello' });
    });
  });

  describe('countTokens', () => {
    it('should count tokens successfully', async () => {
      const request: CountTokensRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello, how are you?' }],
      };

      const expectedResponse: TokenCount = {
        input_tokens: 15,
      };

      mockTransport.request.mockResolvedValue(expectedResponse);

      const result = await service.countTokens(request);

      expect(result).toEqual(expectedResponse);
      expect(mockAuth.getHeaders).toHaveBeenCalled();
      expect(mockResilience.execute).toHaveBeenCalled();
      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/messages/count_tokens',
        request,
        {
          headers: {
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
        }
      );
    });

    it('should pass request options to transport', async () => {
      const request: CountTokensRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const options = {
        headers: { 'custom-header': 'value' },
        timeout: 10000,
      };

      mockTransport.request.mockResolvedValue({ input_tokens: 10 });

      await service.countTokens(request, options);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/messages/count_tokens',
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'custom-header': 'value',
          }),
          timeout: 10000,
        })
      );
    });

    it('should throw ValidationError for missing model', async () => {
      const request = {
        messages: [{ role: 'user', content: 'Hello' }],
      } as CountTokensRequest;

      await expect(service.countTokens(request)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty messages', async () => {
      const request: CountTokensRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
      };

      await expect(service.countTokens(request)).rejects.toThrow(ValidationError);
    });

    it('should support system messages', async () => {
      const request: CountTokensRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
        system: 'You are a helpful assistant.',
      };

      mockTransport.request.mockResolvedValue({ input_tokens: 20 });

      await service.countTokens(request);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/messages/count_tokens',
        expect.objectContaining({
          system: 'You are a helpful assistant.',
        }),
        expect.anything()
      );
    });

    it('should support tools in token counting', async () => {
      const request: CountTokensRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'What is the weather?' }],
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather information',
            input_schema: { type: 'object' },
          },
        ],
      };

      mockTransport.request.mockResolvedValue({ input_tokens: 50 });

      await service.countTokens(request);

      expect(mockTransport.request).toHaveBeenCalledWith(
        'POST',
        '/v1/messages/count_tokens',
        expect.objectContaining({
          tools: request.tools,
        }),
        expect.anything()
      );
    });

    it('should handle API errors through resilience orchestrator', async () => {
      const request: CountTokensRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const apiError = new ServerError('Server error', 500);
      mockResilienceOrchestratorError(mockResilience, apiError);

      await expect(service.countTokens(request)).rejects.toThrow(apiError);
    });
  });
});
