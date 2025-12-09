import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '../../client/factory.js';
import type { OpenAIClient } from '../../client/index.js';
import {
  mockChatCompletion,
  mockUnauthorizedError,
  mockRateLimitError,
  mockServerError,
  mockStreamingResponse,
} from './setup.js';
import {
  createChatCompletionResponse,
  createChatCompletionChunk,
  createToolCallResponse,
} from '../../__fixtures__/index.js';

describe('Chat Integration Tests', () => {
  let client: OpenAIClient;

  beforeEach(() => {
    client = createClient({
      apiKey: 'sk-test-key',
      baseURL: 'https://api.openai.com',
    });
  });

  describe('create', () => {
    it('should create a chat completion successfully', async () => {
      const response = createChatCompletionResponse();
      mockChatCompletion(response);

      const result = await client.chat.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.id).toBe(response.id);
      expect(result.choices).toHaveLength(1);
      expect(result.choices[0].message.role).toBe('assistant');
    });

    it('should handle multiple messages', async () => {
      const response = createChatCompletionResponse();
      mockChatCompletion(response);

      const result = await client.chat.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello' },
        ],
      });

      expect(result).toBeDefined();
      expect(result.choices[0].message.content).toBeDefined();
    });

    it('should handle tool calls', async () => {
      const response = createToolCallResponse();
      mockChatCompletion(response);

      const result = await client.chat.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'What is the weather?' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_current_weather',
              description: 'Get the current weather',
            },
          },
        ],
      });

      expect(result.choices[0].finish_reason).toBe('tool_calls');
      expect(result.choices[0].message.tool_calls).toHaveLength(1);
    });

    it('should handle 401 unauthorized errors', async () => {
      mockUnauthorizedError();

      await expect(
        client.chat.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow();
    });

    it('should handle 429 rate limit errors', async () => {
      mockRateLimitError();

      await expect(
        client.chat.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow();
    });

    it('should handle 500 server errors', async () => {
      mockServerError();

      await expect(
        client.chat.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow();
    });
  });

  describe('stream', () => {
    it('should stream chat completion chunks', async () => {
      const chunk1 = createChatCompletionChunk({
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: '' },
            finish_reason: null,
            logprobs: null,
          },
        ],
      });
      const chunk2 = createChatCompletionChunk({
        choices: [
          {
            index: 0,
            delta: { content: 'Hello' },
            finish_reason: null,
            logprobs: null,
          },
        ],
      });
      const chunk3 = createChatCompletionChunk({
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
            logprobs: null,
          },
        ],
      });

      mockStreamingResponse([
        JSON.stringify(chunk1),
        JSON.stringify(chunk2),
        JSON.stringify(chunk3),
      ]);

      const results = [];
      for await (const chunk of client.chat.stream({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      })) {
        results.push(chunk);
      }

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].object).toBe('chat.completion.chunk');
    });

    it('should accumulate content from stream', async () => {
      const chunks = [
        createChatCompletionChunk({
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: '' },
              finish_reason: null,
              logprobs: null,
            },
          ],
        }),
        createChatCompletionChunk({
          choices: [
            {
              index: 0,
              delta: { content: 'Hello' },
              finish_reason: null,
              logprobs: null,
            },
          ],
        }),
        createChatCompletionChunk({
          choices: [
            {
              index: 0,
              delta: { content: ' world' },
              finish_reason: null,
              logprobs: null,
            },
          ],
        }),
        createChatCompletionChunk({
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: 'stop',
              logprobs: null,
            },
          ],
        }),
      ];

      mockStreamingResponse(chunks.map((c) => JSON.stringify(c)));

      let fullContent = '';
      for await (const chunk of client.chat.stream({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      })) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          fullContent += content;
        }
      }

      expect(fullContent).toBe('Hello world');
    });
  });
});
