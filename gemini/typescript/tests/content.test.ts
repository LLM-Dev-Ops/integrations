/**
 * Content generation service tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockHttpClient } from '../src/__mocks__/index.js';
import { ContentServiceImpl } from '../src/services/content.js';
import type { GenerateContentRequest, GenerateContentResponse } from '../src/types/index.js';
import { ValidationError, SafetyBlockedError } from '../src/error/index.js';

describe('ContentService', () => {
  let mockClient: MockHttpClient;
  let service: ContentServiceImpl;

  beforeEach(() => {
    mockClient = new MockHttpClient();
    // Create a minimal HTTP client wrapper
    const httpClient = {
      buildUrl: (endpoint: string) => `https://generativelanguage.googleapis.com/v1/${endpoint}?key=test-key`,
      getHeaders: () => ({ 'Content-Type': 'application/json' }),
      fetch: (url: string, init?: RequestInit) => mockClient.request(url, init),
    };
    service = new ContentServiceImpl(httpClient as any);
  });

  describe('generate', () => {
    it('should generate content successfully', async () => {
      const request: GenerateContentRequest = {
        contents: [{ parts: [{ text: 'Hello, Gemini!' }] }],
      };

      const mockResponse: GenerateContentResponse = {
        candidates: [
          {
            content: { parts: [{ text: 'Hello! How can I help you today?' }], role: 'model' },
            finishReason: 'STOP',
            index: 0,
          },
        ],
        usageMetadata: {
          promptTokenCount: 3,
          candidatesTokenCount: 8,
          totalTokenCount: 11,
        },
      };

      mockClient.enqueueJsonResponse(200, mockResponse);

      const response = await service.generate('gemini-2.0-flash', request);

      expect(response).toEqual(mockResponse);
      expect(response.candidates?.[0]?.content?.parts[0]).toEqual({ text: 'Hello! How can I help you today?' });
      mockClient.verifyRequestCount(1);
    });

    it('should throw validation error for empty model name', async () => {
      const request: GenerateContentRequest = {
        contents: [{ parts: [{ text: 'test' }] }],
      };

      await expect(service.generate('', request)).rejects.toThrow(ValidationError);
    });

    it('should throw validation error for empty contents', async () => {
      const request: GenerateContentRequest = {
        contents: [],
      };

      await expect(service.generate('gemini-2.0-flash', request)).rejects.toThrow(ValidationError);
    });

    it('should handle safety blocks', async () => {
      const request: GenerateContentRequest = {
        contents: [{ parts: [{ text: 'unsafe content' }] }],
      };

      const mockResponse: GenerateContentResponse = {
        candidates: [
          {
            content: { parts: [], role: 'model' },
            finishReason: 'SAFETY',
            index: 0,
            safetyRatings: [
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'HIGH' },
            ],
          },
        ],
      };

      mockClient.enqueueJsonResponse(200, mockResponse);

      await expect(service.generate('gemini-2.0-flash', request)).rejects.toThrow(SafetyBlockedError);
    });

    it('should handle prompt feedback blocking', async () => {
      const request: GenerateContentRequest = {
        contents: [{ parts: [{ text: 'blocked prompt' }] }],
      };

      const mockResponse: GenerateContentResponse = {
        promptFeedback: {
          blockReason: 'SAFETY',
          safetyRatings: [
            { category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'HIGH' },
          ],
        },
      };

      mockClient.enqueueJsonResponse(200, mockResponse);

      await expect(service.generate('gemini-2.0-flash', request)).rejects.toThrow(SafetyBlockedError);
    });

    it('should include generation config', async () => {
      const request: GenerateContentRequest = {
        contents: [{ parts: [{ text: 'test' }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 100,
          topP: 0.9,
        },
      };

      const mockResponse: GenerateContentResponse = {
        candidates: [
          {
            content: { parts: [{ text: 'response' }], role: 'model' },
            finishReason: 'STOP',
            index: 0,
          },
        ],
      };

      mockClient.enqueueJsonResponse(200, mockResponse);

      await service.generate('gemini-2.0-flash', request);

      const lastRequest = mockClient.getLastRequest();
      expect(lastRequest).toBeDefined();
      const body = JSON.parse(lastRequest!.options.body as string);
      expect(body.generationConfig).toEqual({
        temperature: 0.7,
        maxOutputTokens: 100,
        topP: 0.9,
      });
    });
  });

  describe('generateStream', () => {
    it('should stream content successfully', async () => {
      const request: GenerateContentRequest = {
        contents: [{ parts: [{ text: 'Tell me a story' }] }],
      };

      // Mock streaming response
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode('[{"candidates":[{"content":{"parts":[{"text":"Once upon"}],"role":"model"},"index":0}]},')
          );
          controller.enqueue(
            new TextEncoder().encode('{"candidates":[{"content":{"parts":[{"text":" a time"}],"role":"model"},"index":0}]}]')
          );
          controller.close();
        },
      });

      mockClient.enqueueResponse({
        status: 200,
        body: '',
        headers: { 'content-type': 'text/event-stream' },
      });

      // Override the request method to return a streaming response
      const originalRequest = mockClient.request.bind(mockClient);
      mockClient.request = async (url: string, options?: RequestInit) => {
        return new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      };

      const chunks: GenerateContentResponse[] = [];
      for await (const chunk of service.generateStream('gemini-2.0-flash', request)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0].candidates?.[0]?.content?.parts[0]).toEqual({ text: 'Once upon' });
      expect(chunks[1].candidates?.[0]?.content?.parts[0]).toEqual({ text: ' a time' });

      // Restore original request
      mockClient.request = originalRequest;
    });

    it('should handle safety blocks in stream', async () => {
      const request: GenerateContentRequest = {
        contents: [{ parts: [{ text: 'test' }] }],
      };

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode('[{"candidates":[{"content":{"parts":[]},"finishReason":"SAFETY","safetyRatings":[{"category":"HARM_CATEGORY_DANGEROUS_CONTENT","probability":"HIGH"}],"index":0}]}]')
          );
          controller.close();
        },
      });

      const originalRequest = mockClient.request.bind(mockClient);
      mockClient.request = async () => {
        return new Response(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      };

      const generator = service.generateStream('gemini-2.0-flash', request);
      await expect(generator.next()).rejects.toThrow(SafetyBlockedError);

      mockClient.request = originalRequest;
    });

    it('should validate model name for streaming', async () => {
      const request: GenerateContentRequest = {
        contents: [{ parts: [{ text: 'test' }] }],
      };

      const generator = service.generateStream('', request);
      await expect(generator.next()).rejects.toThrow(ValidationError);
    });
  });

  describe('countTokens', () => {
    it('should count tokens for contents', async () => {
      const request = {
        contents: [{ parts: [{ text: 'How many tokens is this?' }] }],
      };

      mockClient.enqueueJsonResponse(200, {
        totalTokens: 5,
      });

      const response = await service.countTokens('gemini-2.0-flash', request);

      expect(response.totalTokens).toBe(5);
      mockClient.verifyRequestCount(1);
    });

    it('should count tokens for generateContentRequest', async () => {
      const request = {
        generateContentRequest: {
          contents: [{ parts: [{ text: 'test' }] }],
          generationConfig: { maxOutputTokens: 100 },
        },
      };

      mockClient.enqueueJsonResponse(200, {
        totalTokens: 1,
      });

      const response = await service.countTokens('gemini-2.0-flash', request);

      expect(response.totalTokens).toBe(1);
    });

    it('should throw error if neither contents nor generateContentRequest provided', async () => {
      const request = {};

      await expect(service.countTokens('gemini-2.0-flash', request)).rejects.toThrow(
        'CountTokensRequest must have either contents or generateContentRequest'
      );
    });

    it('should validate model name', async () => {
      const request = {
        contents: [{ parts: [{ text: 'test' }] }],
      };

      await expect(service.countTokens('', request)).rejects.toThrow(ValidationError);
    });
  });
});
