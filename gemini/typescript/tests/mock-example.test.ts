/**
 * Example tests demonstrating mock usage and AAA (Arrange-Act-Assert) pattern.
 *
 * These tests showcase London-School TDD with comprehensive mocking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockHttpClient } from '../src/__mocks__/http-client.js';
import { loadFixture, loadJsonFixture, loadStreamingFixture } from '../src/__fixtures__/index.js';

describe('MockHttpClient - AAA Pattern Examples', () => {
  let mockClient: MockHttpClient;

  beforeEach(() => {
    mockClient = new MockHttpClient();
  });

  it('should handle success response with JSON fixture', async () => {
    // Arrange: Set up mock client with success response fixture
    const successResponse = loadJsonFixture('content/success-response.json');
    mockClient.enqueueJsonResponse(200, successResponse);

    // Act: Make request
    const response = await mockClient.request(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
    );
    const data = await response.json();

    // Assert: Verify response structure
    expect(response.status).toBe(200);
    expect(data).toHaveProperty('candidates');
    expect(data).toHaveProperty('usageMetadata');
    expect(data.usageMetadata.promptTokenCount).toBe(10);
    expect(data.usageMetadata.candidatesTokenCount).toBe(8);
    expect(data.usageMetadata.totalTokenCount).toBe(18);

    // Verify request was recorded
    mockClient.verifyRequestCount(1);
    mockClient.verifyRequest(0, 'POST', 'generateContent');
  });

  it('should handle safety blocked response', async () => {
    // Arrange: Set up mock with safety blocked response
    const safetyBlocked = loadJsonFixture('content/safety-blocked.json');
    mockClient.enqueueJsonResponse(400, safetyBlocked);

    // Act: Make request
    const response = await mockClient.request(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      { method: 'POST' }
    );
    const data = await response.json();

    // Assert: Verify safety block structure
    expect(response.status).toBe(400);
    expect(data).toHaveProperty('promptFeedback');
    expect(data.promptFeedback.blockReason).toBe('SAFETY');
    expect(data.promptFeedback.safetyRatings).toHaveLength(1);
    expect(data.promptFeedback.safetyRatings[0].category).toBe('HARM_CATEGORY_DANGEROUS_CONTENT');
  });

  it('should handle multiple sequential requests', async () => {
    // Arrange: Set up multiple responses
    mockClient.enqueueJsonResponse(200, { status: 'first' });
    mockClient.enqueueJsonResponse(200, { status: 'second' });
    mockClient.enqueueJsonResponse(200, { status: 'third' });

    // Act: Make multiple requests
    const responses = await Promise.all([
      mockClient.request('https://example.com/request-0', { method: 'GET' }),
      mockClient.request('https://example.com/request-1', { method: 'GET' }),
      mockClient.request('https://example.com/request-2', { method: 'GET' }),
    ]);

    const data = await Promise.all(responses.map(r => r.json()));

    // Assert: Verify all responses
    expect(data[0].status).toBe('first');
    expect(data[1].status).toBe('second');
    expect(data[2].status).toBe('third');

    mockClient.verifyRequestCount(3);
    const requests = mockClient.getRequests();
    expect(requests[0].url).toBe('https://example.com/request-0');
    expect(requests[1].url).toBe('https://example.com/request-1');
    expect(requests[2].url).toBe('https://example.com/request-2');
  });

  it('should verify request headers', async () => {
    // Arrange
    mockClient.enqueueJsonResponse(200, { ok: true });

    // Act: Make request with custom headers
    await mockClient.request('https://api.example.com/endpoint', {
      method: 'POST',
      headers: {
        'x-goog-api-key': 'test-api-key-12345',
        'Content-Type': 'application/json',
      },
    });

    // Assert: Verify headers were sent
    mockClient.verifyRequestCount(1);
    mockClient.verifyHeader(0, 'x-goog-api-key', 'test-api-key-12345');
    mockClient.verifyHeader(0, 'Content-Type', 'application/json');
  });

  it('should handle error responses', async () => {
    // Arrange: Set up error response
    mockClient.enqueueErrorResponse(404, 'Model not found');

    // Act: Make request
    const response = await mockClient.request(
      'https://generativelanguage.googleapis.com/v1beta/models/invalid-model',
      { method: 'GET' }
    );
    const data = await response.json();

    // Assert: Verify error structure
    expect(response.status).toBe(404);
    expect(data.error.message).toBe('Model not found');
  });

  it('should handle streaming responses', async () => {
    // Arrange: Set up streaming response
    mockClient.enqueueStreamingResponse([
      { value: '{"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}', done: false },
      { value: '{"candidates":[{"content":{"parts":[{"text":" world"}]}}]}', done: false },
      { value: '{"candidates":[{"content":{"parts":[{"text":"!"}]}}]}', done: false },
      { value: '', done: true },
    ]);

    // Act: Get streaming response
    const response = await mockClient.requestStream(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent',
      { method: 'POST' }
    );

    // Assert: Verify stream is readable
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');

    // Read stream chunks
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    let chunkCount = 0;
    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      chunkCount++;
      expect(value).toBeInstanceOf(Uint8Array);
    }

    expect(chunkCount).toBe(3);
  });
});

describe('Fixture Loading', () => {
  it('should load success response fixture', () => {
    // Arrange & Act
    const response = loadJsonFixture<any>('content/success-response.json');

    // Assert
    expect(response).toHaveProperty('candidates');
    expect(response).toHaveProperty('usageMetadata');
    expect(response.candidates).toHaveLength(1);
    expect(response.candidates[0].content.parts[0].text).toBe('The capital of France is Paris.');
  });

  it('should load safety blocked fixture', () => {
    // Arrange & Act
    const response = loadJsonFixture<any>('content/safety-blocked.json');

    // Assert
    expect(response).toHaveProperty('promptFeedback');
    expect(response.promptFeedback.blockReason).toBe('SAFETY');
    expect(response.promptFeedback.safetyRatings[0].probability).toBe('HIGH');
  });

  it('should load streaming fixture', () => {
    // Arrange & Act
    const chunks = loadStreamingFixture('streaming/chunked-response.txt');

    // Assert
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveProperty('candidates');
    expect(chunks[1]).toHaveProperty('candidates');
    expect(chunks[2]).toHaveProperty('candidates');
    expect(chunks[2]).toHaveProperty('usageMetadata');
  });

  it('should load raw text fixture', () => {
    // Arrange & Act
    const content = loadFixture('streaming/chunked-response.txt');

    // Assert
    expect(content).toBeTruthy();
    expect(typeof content).toBe('string');
    expect(content).toContain('Hello');
    expect(content).toContain('world');
  });
});

describe('London-School TDD Pattern', () => {
  it('should demonstrate complete isolation with mocks', async () => {
    // Arrange: Create all mocks and set expectations
    const mockClient = new MockHttpClient();
    const expectedResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: 'Mocked response' }],
            role: 'model',
          },
        },
      ],
    };
    mockClient.enqueueJsonResponse(200, expectedResponse);

    // Act: Execute the system under test
    const response = await mockClient.request('https://api.example.com/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'test' }),
    });
    const data = await response.json();

    // Assert: Verify all interactions and results
    expect(response.status).toBe(200);
    expect(data).toEqual(expectedResponse);
    mockClient.verifyRequestCount(1);

    const lastRequest = mockClient.getLastRequest();
    expect(lastRequest?.url).toBe('https://api.example.com/test');
    expect(lastRequest?.options.method).toBe('POST');
  });

  it('should verify no unexpected interactions occurred', () => {
    // Arrange
    const mockClient = new MockHttpClient();

    // Act: No actions performed

    // Assert: Verify no requests were made
    mockClient.verifyRequestCount(0);
    expect(mockClient.getRequests()).toHaveLength(0);
    expect(mockClient.getLastRequest()).toBeUndefined();
  });
});
