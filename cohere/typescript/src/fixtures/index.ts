/**
 * Test fixtures for the Cohere client.
 *
 * Provides pre-built test data for use in tests.
 */

import type { ChatResponse, ChatMessage } from '../services/chat';
import type { GenerateResponse, Generation } from '../services/generate';
import type { EmbedResponse } from '../services/embed';
import type { RerankResponse, RerankResult } from '../services/rerank';
import type { ClassifyResponse, ClassificationResult, ClassifyExample } from '../services/classify';
import type { ApiMeta, BilledUnits, ApiVersion, FinishReason } from '../types';
import type { ServerSentEvent } from '../transport';

/**
 * Create sample API metadata
 */
export function apiMeta(): ApiMeta {
  return {
    apiVersion: {
      version: '1.0',
      isDeprecated: false,
    },
    billedUnits: {
      inputTokens: 100,
      outputTokens: 50,
    },
    warnings: [],
  };
}

/**
 * Create a sample chat response
 */
export function chatResponse(): ChatResponse {
  return {
    text: 'Hello! How can I help you today?',
    generationId: 'gen-123',
    finishReason: 'COMPLETE',
    chatHistory: [
      { role: 'USER', content: 'Hello' },
      { role: 'CHATBOT', content: 'Hello! How can I help you today?' },
    ],
    meta: apiMeta(),
  };
}

/**
 * Create a sample chat response with tool calls
 */
export function chatResponseWithTools(): ChatResponse {
  return {
    text: 'I\'ll search for that information.',
    generationId: 'gen-456',
    finishReason: 'COMPLETE',
    toolCalls: [
      {
        id: 'call-1',
        name: 'search',
        parameters: { query: 'weather today' },
      },
    ],
    meta: apiMeta(),
  };
}

/**
 * Create a sample generate response
 */
export function generateResponse(): GenerateResponse {
  return {
    id: 'gen-456',
    generations: [
      {
        id: 'gen-456-0',
        text: 'Once upon a time, in a land far away...',
        finishReason: 'COMPLETE',
      },
    ],
    prompt: 'Once upon a time',
    meta: apiMeta(),
  };
}

/**
 * Create a sample generate response with multiple generations
 */
export function generateResponseMultiple(): GenerateResponse {
  return {
    id: 'gen-789',
    generations: [
      {
        id: 'gen-789-0',
        text: 'The quick brown fox jumps over the lazy dog.',
        finishReason: 'COMPLETE',
      },
      {
        id: 'gen-789-1',
        text: 'A journey of a thousand miles begins with a single step.',
        finishReason: 'COMPLETE',
      },
    ],
    prompt: 'Write a sentence',
    meta: apiMeta(),
  };
}

/**
 * Create a sample embed response
 */
export function embedResponse(): EmbedResponse {
  return {
    id: 'embed-789',
    embeddings: [
      [0.1, 0.2, 0.3, 0.4, 0.5],
      [0.2, 0.3, 0.4, 0.5, 0.6],
    ],
    texts: ['Hello', 'World'],
    meta: apiMeta(),
  };
}

/**
 * Create a sample embed response with multiple types
 */
export function embedResponseMultiType(): EmbedResponse {
  return {
    id: 'embed-multi-123',
    embeddingsByType: {
      float: [[0.1, 0.2, 0.3]],
      int8: [[10, 20, 30]],
    },
    texts: ['Test text'],
    meta: apiMeta(),
  };
}

/**
 * Create a sample rerank response
 */
export function rerankResponse(): RerankResponse {
  return {
    id: 'rerank-123',
    results: [
      { index: 2, relevanceScore: 0.95 },
      { index: 0, relevanceScore: 0.85 },
      { index: 1, relevanceScore: 0.60 },
    ],
    meta: apiMeta(),
  };
}

/**
 * Create a sample rerank response with documents
 */
export function rerankResponseWithDocs(): RerankResponse {
  return {
    id: 'rerank-456',
    results: [
      { index: 0, relevanceScore: 0.95, document: 'Most relevant document' },
      { index: 1, relevanceScore: 0.75, document: 'Second most relevant' },
    ],
    meta: apiMeta(),
  };
}

/**
 * Create a sample classify response
 */
export function classifyResponse(): ClassifyResponse {
  return {
    id: 'classify-123',
    classifications: [
      {
        input: 'This product is amazing!',
        prediction: 'positive',
        confidence: 0.92,
        labels: [
          { label: 'positive', confidence: 0.92 },
          { label: 'negative', confidence: 0.08 },
        ],
      },
    ],
    meta: apiMeta(),
  };
}

/**
 * Create sample classification examples
 */
export function classifyExamples(): ClassifyExample[] {
  return [
    { text: 'This is wonderful!', label: 'positive' },
    { text: 'This is terrible!', label: 'negative' },
    { text: 'I love this product', label: 'positive' },
    { text: 'I hate this product', label: 'negative' },
  ];
}

/**
 * Create sample SSE data for chat streaming
 */
export function sseChatStreamData(): ServerSentEvent[] {
  return [
    {
      event: 'stream-start',
      data: JSON.stringify({
        event_type: 'stream-start',
        generation_id: 'gen-stream-123',
      }),
    },
    {
      event: 'text-generation',
      data: JSON.stringify({
        event_type: 'text-generation',
        text: 'Hello',
      }),
    },
    {
      event: 'text-generation',
      data: JSON.stringify({
        event_type: 'text-generation',
        text: ' World',
      }),
    },
    {
      event: 'stream-end',
      data: JSON.stringify({
        event_type: 'stream-end',
        finish_reason: 'COMPLETE',
      }),
    },
  ];
}

/**
 * Create sample SSE data for generate streaming
 */
export function sseGenerateStreamData(): ServerSentEvent[] {
  return [
    {
      data: JSON.stringify({
        text: 'Once',
        is_finished: false,
      }),
    },
    {
      data: JSON.stringify({
        text: ' upon',
        is_finished: false,
      }),
    },
    {
      data: JSON.stringify({
        text: ' a',
        is_finished: false,
      }),
    },
    {
      data: JSON.stringify({
        text: ' time',
        is_finished: true,
        finish_reason: 'COMPLETE',
      }),
    },
  ];
}

/**
 * Create a sample summarize response
 */
export function summarizeResponse() {
  return {
    id: 'summarize-123',
    summary: 'This is a concise summary of the provided text.',
    meta: apiMeta(),
  };
}

/**
 * Create a sample tokenize response
 */
export function tokenizeResponse() {
  return {
    tokens: [1, 2, 3, 4, 5],
    tokenStrings: ['Hello', ',', ' ', 'world', '!'],
    meta: apiMeta(),
  };
}

/**
 * Create a sample detokenize response
 */
export function detokenizeResponse() {
  return {
    text: 'Hello, world!',
    meta: apiMeta(),
  };
}

/**
 * Create a sample models list response
 */
export function modelsListResponse() {
  return {
    models: [
      {
        name: 'command',
        endpoints: ['chat', 'generate'],
        contextLength: 4096,
        default: true,
      },
      {
        name: 'command-light',
        endpoints: ['chat', 'generate'],
        contextLength: 4096,
      },
      {
        name: 'embed-english-v3.0',
        endpoints: ['embed'],
        contextLength: 512,
      },
      {
        name: 'rerank-english-v3.0',
        endpoints: ['rerank'],
      },
    ],
  };
}

/**
 * Create a sample dataset response
 */
export function datasetResponse() {
  return {
    id: 'dataset-123',
    name: 'my-dataset',
    datasetType: 'embed-input',
    status: 'complete',
    validationStatus: 'validated',
    createdAt: '2024-01-01T00:00:00Z',
    totalCount: 1000,
    meta: apiMeta(),
  };
}

/**
 * Create a sample connector response
 */
export function connectorResponse() {
  return {
    id: 'connector-123',
    name: 'my-connector',
    url: 'https://example.com/search',
    active: true,
    createdAt: '2024-01-01T00:00:00Z',
    meta: apiMeta(),
  };
}

/**
 * Create a sample fine-tune response
 */
export function finetuneResponse() {
  return {
    id: 'finetune-123',
    name: 'my-finetuned-model',
    status: 'READY',
    settings: {
      baseModel: { baseType: 'command' },
      datasetId: 'dataset-123',
    },
    createdAt: '2024-01-01T00:00:00Z',
    completedAt: '2024-01-02T00:00:00Z',
    modelId: 'ft-command-123',
    meta: apiMeta(),
  };
}
