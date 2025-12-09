import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatCompletionServiceImpl } from '../service.js';
import {
  createMockResilienceOrchestrator,
  mockResilienceOrchestratorResponse,
  mockResilienceOrchestratorError,
  mockResilienceOrchestratorStream,
} from '../../../__mocks__/index.js';
import type { MockResilienceOrchestrator } from '../../../__mocks__/index.js';
import {
  createChatCompletionRequest,
  createChatCompletionResponse,
  createStreamChunks,
  createToolCallResponse,
  createFunctionCallResponse,
  create401UnauthorizedError,
  create429RateLimitError,
  create500InternalServerError,
  createTimeoutError,
  createAbortError,
} from '../../../__fixtures__/index.js';
import type { ChatCompletionRequest } from '../types.js';

describe('ChatCompletionService', () => {
  let mockOrchestrator: MockResilienceOrchestrator;
  let service: ChatCompletionServiceImpl;

  beforeEach(() => {
    mockOrchestrator = createMockResilienceOrchestrator();
    service = new ChatCompletionServiceImpl(mockOrchestrator);
  });

  describe('create', () => {
    describe('happy path', () => {
      it('should create a chat completion successfully', async () => {
        const request = createChatCompletionRequest();
        const response = createChatCompletionResponse();

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.create(request);

        expect(result).toEqual(response);
        expect(result.choices).toHaveLength(1);
        expect(result.choices[0].message.role).toBe('assistant');
        expect(mockOrchestrator.request).toHaveBeenCalledOnce();
      });

      it('should include model in request', async () => {
        const request = createChatCompletionRequest({ model: 'gpt-4-turbo' });
        const response = createChatCompletionResponse({ model: 'gpt-4-turbo' });

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.create(request);

        expect(result.model).toBe('gpt-4-turbo');
        expect(mockOrchestrator.request).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'POST',
            path: '/v1/chat/completions',
            body: expect.objectContaining({ model: 'gpt-4-turbo' }),
          })
        );
      });

      it('should handle multiple messages', async () => {
        const request = createChatCompletionRequest({
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'What is TypeScript?' },
          ],
        });
        const response = createChatCompletionResponse();

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.create(request);

        expect(result).toEqual(response);
        expect(mockOrchestrator.request).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({
              messages: expect.arrayContaining([
                expect.objectContaining({ role: 'system' }),
                expect.objectContaining({ role: 'user' }),
              ]),
            }),
          })
        );
      });

      it('should handle tool calls in response', async () => {
        const request = createChatCompletionRequest({
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_current_weather',
                description: 'Get the current weather',
                parameters: {
                  type: 'object',
                  properties: {
                    location: { type: 'string' },
                  },
                },
              },
            },
          ],
        });
        const response = createToolCallResponse();

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.create(request);

        expect(result.choices[0].finish_reason).toBe('tool_calls');
        expect(result.choices[0].message.tool_calls).toHaveLength(1);
        expect(result.choices[0].message.tool_calls![0].function.name).toBe(
          'get_current_weather'
        );
      });

      it('should handle function calls in response', async () => {
        const request = createChatCompletionRequest({
          functions: [
            {
              name: 'get_current_weather',
              description: 'Get the current weather',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
              },
            },
          ],
        });
        const response = createFunctionCallResponse();

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        const result = await service.create(request);

        expect(result.choices[0].finish_reason).toBe('function_call');
        expect(result.choices[0].message.function_call?.name).toBe(
          'get_current_weather'
        );
      });

      it('should pass request options through', async () => {
        const request = createChatCompletionRequest();
        const response = createChatCompletionResponse();
        const options = {
          headers: { 'X-Custom-Header': 'test' },
          timeout: 5000,
        };

        mockResilienceOrchestratorResponse(mockOrchestrator, {
          status: 200,
          headers: { 'content-type': 'application/json' },
          data: response,
        });

        await service.create(request, options);

        expect(mockOrchestrator.request).toHaveBeenCalledWith(
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-Custom-Header': 'test',
            }),
          })
        );
      });
    });

    describe('parameter validation', () => {
      it('should validate model is required', async () => {
        const request = { messages: [{ role: 'user' as const, content: 'Hi' }] } as ChatCompletionRequest;

        await expect(service.create(request)).rejects.toThrow();
      });

      it('should validate messages are required', async () => {
        const request = { model: 'gpt-4' } as ChatCompletionRequest;

        await expect(service.create(request)).rejects.toThrow();
      });

      it('should validate messages is not empty', async () => {
        const request = createChatCompletionRequest({ messages: [] });

        await expect(service.create(request)).rejects.toThrow();
      });

      it('should validate temperature range', async () => {
        const request = createChatCompletionRequest({ temperature: 3.0 });

        await expect(service.create(request)).rejects.toThrow();
      });

      it('should validate max_tokens is positive', async () => {
        const request = createChatCompletionRequest({ max_tokens: -1 });

        await expect(service.create(request)).rejects.toThrow();
      });
    });

    describe('error handling', () => {
      it('should handle 401 unauthorized errors', async () => {
        const request = createChatCompletionRequest();
        const errorResponse = create401UnauthorizedError();

        mockResilienceOrchestratorError(
          mockOrchestrator,
          new Error('Unauthorized')
        );

        await expect(service.create(request)).rejects.toThrow('Unauthorized');
      });

      it('should handle 429 rate limit errors', async () => {
        const request = createChatCompletionRequest();

        mockResilienceOrchestratorError(
          mockOrchestrator,
          new Error('Rate limit reached')
        );

        await expect(service.create(request)).rejects.toThrow(
          'Rate limit reached'
        );
      });

      it('should handle 500 server errors', async () => {
        const request = createChatCompletionRequest();

        mockResilienceOrchestratorError(
          mockOrchestrator,
          new Error('Internal server error')
        );

        await expect(service.create(request)).rejects.toThrow(
          'Internal server error'
        );
      });

      it('should handle timeout errors', async () => {
        const request = createChatCompletionRequest();
        const timeoutError = createTimeoutError();

        mockResilienceOrchestratorError(mockOrchestrator, timeoutError);

        await expect(service.create(request)).rejects.toThrow('Request timeout');
      });

      it('should handle abort errors', async () => {
        const request = createChatCompletionRequest();
        const abortError = createAbortError();

        mockResilienceOrchestratorError(mockOrchestrator, abortError);

        await expect(service.create(request)).rejects.toThrow(
          'Request was aborted'
        );
      });
    });
  });

  describe('stream', () => {
    describe('happy path', () => {
      it('should stream chat completion chunks', async () => {
        const request = createChatCompletionRequest();
        const chunks = createStreamChunks();

        mockResilienceOrchestratorStream(mockOrchestrator, chunks);

        const results = [];
        for await (const chunk of service.stream(request)) {
          results.push(chunk);
        }

        expect(results).toHaveLength(4);
        expect(results[0].choices[0].delta.role).toBe('assistant');
        expect(results[1].choices[0].delta.content).toBe('Hello');
        expect(results[3].choices[0].finish_reason).toBe('stop');
      });

      it('should set stream: true in request', async () => {
        const request = createChatCompletionRequest();
        const chunks = createStreamChunks();

        mockResilienceOrchestratorStream(mockOrchestrator, chunks);

        const iterator = service.stream(request);
        await iterator.next();

        expect(mockOrchestrator.stream).toHaveBeenCalledWith(
          expect.objectContaining({
            body: expect.objectContaining({ stream: true }),
          })
        );
      });

      it('should handle empty streams', async () => {
        const request = createChatCompletionRequest();

        mockResilienceOrchestratorStream(mockOrchestrator, []);

        const results = [];
        for await (const chunk of service.stream(request)) {
          results.push(chunk);
        }

        expect(results).toHaveLength(0);
      });

      it('should pass request options through', async () => {
        const request = createChatCompletionRequest();
        const chunks = createStreamChunks();
        const options = {
          headers: { 'X-Custom-Header': 'test' },
        };

        mockResilienceOrchestratorStream(mockOrchestrator, chunks);

        const iterator = service.stream(request, options);
        await iterator.next();

        expect(mockOrchestrator.stream).toHaveBeenCalledWith(
          expect.objectContaining({
            headers: expect.objectContaining({
              'X-Custom-Header': 'test',
            }),
          })
        );
      });
    });

    describe('parameter validation', () => {
      it('should validate model is required', async () => {
        const request = { messages: [{ role: 'user' as const, content: 'Hi' }] } as ChatCompletionRequest;

        const iterator = service.stream(request);
        await expect(iterator.next()).rejects.toThrow();
      });

      it('should validate messages are required', async () => {
        const request = { model: 'gpt-4' } as ChatCompletionRequest;

        const iterator = service.stream(request);
        await expect(iterator.next()).rejects.toThrow();
      });
    });

    describe('error handling', () => {
      it('should handle stream errors', async () => {
        const request = createChatCompletionRequest();

        mockOrchestrator.stream.mockImplementation(async function* () {
          yield createStreamChunks()[0];
          throw new Error('Stream error');
        });

        const iterator = service.stream(request);
        await iterator.next();

        await expect(iterator.next()).rejects.toThrow('Stream error');
      });

      it('should handle timeout errors in stream', async () => {
        const request = createChatCompletionRequest();
        const timeoutError = createTimeoutError();

        mockOrchestrator.stream.mockImplementation(async function* () {
          yield createStreamChunks()[0];
          throw timeoutError;
        });

        const iterator = service.stream(request);
        await iterator.next();

        await expect(iterator.next()).rejects.toThrow('Request timeout');
      });

      it('should handle abort errors in stream', async () => {
        const request = createChatCompletionRequest();
        const abortError = createAbortError();

        mockOrchestrator.stream.mockImplementation(async function* () {
          yield createStreamChunks()[0];
          throw abortError;
        });

        const iterator = service.stream(request);
        await iterator.next();

        await expect(iterator.next()).rejects.toThrow('Request was aborted');
      });
    });
  });
});
