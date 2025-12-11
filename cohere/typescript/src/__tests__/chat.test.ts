/**
 * Tests for the Chat service.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ChatServiceImpl } from '../services/chat';
import { CohereConfig } from '../config';
import { MockHttpTransport, assertRequestMade } from '../mocks';
import { chatResponse, sseChatStreamData } from '../fixtures';
import { ValidationError } from '../errors';

describe('ChatService', () => {
  let transport: MockHttpTransport;
  let config: CohereConfig;
  let service: ChatServiceImpl;

  beforeEach(() => {
    transport = new MockHttpTransport();
    config = CohereConfig.create({
      apiKey: 'test-api-key',
      baseUrl: 'https://api.cohere.ai',
    });
    service = new ChatServiceImpl(transport, config);
  });

  describe('chat', () => {
    it('should send a chat message and return response', async () => {
      const mockResponse = chatResponse();
      transport.addJsonResponse(mockResponse);

      const result = await service.chat({
        message: 'Hello',
      });

      expect(result.text).toBe(mockResponse.text);
      expect(result.generationId).toBe(mockResponse.generationId);
      expect(result.finishReason).toBe(mockResponse.finishReason);

      assertRequestMade(transport, {
        method: 'POST',
        url: '/chat',
        bodyContains: { message: 'Hello' },
      });
    });

    it('should include chat history in request', async () => {
      transport.addJsonResponse(chatResponse());

      await service.chat({
        message: 'How are you?',
        chatHistory: [
          { role: 'USER', content: 'Hello' },
          { role: 'CHATBOT', content: 'Hi there!' },
        ],
      });

      const request = transport.getLastRequest();
      expect(request?.body).toHaveProperty('chat_history');
    });

    it('should include generation options', async () => {
      transport.addJsonResponse(chatResponse());

      await service.chat({
        message: 'Hello',
        temperature: 0.7,
        maxTokens: 100,
        topP: 0.9,
        topK: 50,
      });

      const request = transport.getLastRequest();
      const body = request?.body as Record<string, unknown>;
      expect(body['temperature']).toBe(0.7);
      expect(body['max_tokens']).toBe(100);
      expect(body['p']).toBe(0.9);
      expect(body['k']).toBe(50);
    });

    it('should throw validation error for empty message', async () => {
      await expect(service.chat({ message: '' })).rejects.toThrow(ValidationError);
    });

    it('should throw validation error for invalid temperature', async () => {
      await expect(
        service.chat({ message: 'Hello', temperature: 5 })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('chatStream', () => {
    it('should stream chat responses', async () => {
      transport.addStreamResponse(sseChatStreamData());

      const events: unknown[] = [];
      for await (const event of service.chatStream({ message: 'Hello' })) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toHaveProperty('eventType', 'stream-start');
    });

    it('should include stream=true in request', async () => {
      transport.addStreamResponse(sseChatStreamData());

      // Consume the stream
      for await (const _ of service.chatStream({ message: 'Hello' })) {
        // Just consume
      }

      const request = transport.getLastRequest();
      const body = request?.body as Record<string, unknown>;
      expect(body['stream']).toBe(true);
    });
  });
});
