import { describe, it, expect } from 'vitest';
import {
  createThinkingConfig,
  withThinking,
  extractThinkingBlocks,
  getThinkingText,
  hasThinkingBlocks,
  estimateThinkingTokens,
} from '../extended-thinking.js';
import type { ContentBlock, CreateMessageRequest } from '../../messages/types.js';

describe('Extended Thinking', () => {
  describe('createThinkingConfig', () => {
    it('should create thinking config with valid budget', () => {
      const config = createThinkingConfig(1024);
      expect(config).toEqual({
        type: 'enabled',
        budget_tokens: 1024,
      });
    });

    it('should throw error for zero budget', () => {
      expect(() => createThinkingConfig(0)).toThrow('Budget tokens must be greater than 0');
    });

    it('should throw error for negative budget', () => {
      expect(() => createThinkingConfig(-100)).toThrow('Budget tokens must be greater than 0');
    });

    it('should support large budget values', () => {
      const config = createThinkingConfig(10000);
      expect(config.budget_tokens).toBe(10000);
    });
  });

  describe('withThinking', () => {
    it('should add thinking config to message request', () => {
      const baseRequest: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const requestWithThinking = withThinking(baseRequest, 2048);

      expect(requestWithThinking).toEqual({
        ...baseRequest,
        thinking: {
          type: 'enabled',
          budget_tokens: 2048,
        },
      });
    });

    it('should preserve all existing request properties', () => {
      const baseRequest: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        top_p: 0.9,
        system: 'You are a helpful assistant',
      };

      const requestWithThinking = withThinking(baseRequest, 1024);

      expect(requestWithThinking.model).toBe(baseRequest.model);
      expect(requestWithThinking.max_tokens).toBe(baseRequest.max_tokens);
      expect(requestWithThinking.temperature).toBe(baseRequest.temperature);
      expect(requestWithThinking.top_p).toBe(baseRequest.top_p);
      expect(requestWithThinking.system).toBe(baseRequest.system);
    });

    it('should throw error for invalid budget', () => {
      const baseRequest: CreateMessageRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      };

      expect(() => withThinking(baseRequest, -1)).toThrow();
    });
  });

  describe('extractThinkingBlocks', () => {
    it('should extract thinking blocks from content', () => {
      const content: ContentBlock[] = [
        { type: 'text', text: 'Hello' },
        { type: 'thinking', thinking: 'Let me think about this...' },
        { type: 'text', text: 'World' },
        { type: 'thinking', thinking: 'This is the answer.' },
      ];

      const thinkingBlocks = extractThinkingBlocks(content);

      expect(thinkingBlocks).toHaveLength(2);
      expect(thinkingBlocks[0].thinking).toBe('Let me think about this...');
      expect(thinkingBlocks[1].thinking).toBe('This is the answer.');
    });

    it('should return empty array when no thinking blocks present', () => {
      const content: ContentBlock[] = [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'World' },
      ];

      const thinkingBlocks = extractThinkingBlocks(content);

      expect(thinkingBlocks).toHaveLength(0);
    });

    it('should handle empty content array', () => {
      const content: ContentBlock[] = [];
      const thinkingBlocks = extractThinkingBlocks(content);

      expect(thinkingBlocks).toHaveLength(0);
    });

    it('should only extract thinking blocks', () => {
      const content: ContentBlock[] = [
        { type: 'text', text: 'Hello' },
        { type: 'thinking', thinking: 'Thinking...' },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'base64data',
          },
        },
        {
          type: 'tool_use',
          id: '1',
          name: 'test',
          input: {},
        },
      ];

      const thinkingBlocks = extractThinkingBlocks(content);

      expect(thinkingBlocks).toHaveLength(1);
      expect(thinkingBlocks[0].type).toBe('thinking');
    });
  });

  describe('getThinkingText', () => {
    it('should combine thinking text from multiple blocks', () => {
      const content: ContentBlock[] = [
        { type: 'text', text: 'Hello' },
        { type: 'thinking', thinking: 'First thought' },
        { type: 'text', text: 'World' },
        { type: 'thinking', thinking: 'Second thought' },
      ];

      const text = getThinkingText(content);

      expect(text).toBe('First thought\n\nSecond thought');
    });

    it('should return empty string when no thinking blocks', () => {
      const content: ContentBlock[] = [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'World' },
      ];

      const text = getThinkingText(content);

      expect(text).toBe('');
    });

    it('should handle single thinking block', () => {
      const content: ContentBlock[] = [
        { type: 'thinking', thinking: 'Single thought' },
      ];

      const text = getThinkingText(content);

      expect(text).toBe('Single thought');
    });

    it('should handle empty thinking text', () => {
      const content: ContentBlock[] = [
        { type: 'thinking', thinking: '' },
      ];

      const text = getThinkingText(content);

      expect(text).toBe('');
    });
  });

  describe('hasThinkingBlocks', () => {
    it('should return true when thinking blocks present', () => {
      const content: ContentBlock[] = [
        { type: 'text', text: 'Hello' },
        { type: 'thinking', thinking: 'Thinking...' },
      ];

      expect(hasThinkingBlocks(content)).toBe(true);
    });

    it('should return false when no thinking blocks present', () => {
      const content: ContentBlock[] = [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'World' },
      ];

      expect(hasThinkingBlocks(content)).toBe(false);
    });

    it('should return false for empty content', () => {
      const content: ContentBlock[] = [];

      expect(hasThinkingBlocks(content)).toBe(false);
    });
  });

  describe('estimateThinkingTokens', () => {
    it('should estimate tokens from thinking text', () => {
      const content: ContentBlock[] = [
        { type: 'thinking', thinking: 'This is a test' }, // ~14 chars = ~4 tokens
      ];

      const tokens = estimateThinkingTokens(content);

      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(10); // Should be around 4
    });

    it('should return 0 for empty content', () => {
      const content: ContentBlock[] = [];

      const tokens = estimateThinkingTokens(content);

      expect(tokens).toBe(0);
    });

    it('should return 0 when no thinking blocks', () => {
      const content: ContentBlock[] = [
        { type: 'text', text: 'Hello' },
      ];

      const tokens = estimateThinkingTokens(content);

      expect(tokens).toBe(0);
    });

    it('should estimate tokens from multiple thinking blocks', () => {
      const content: ContentBlock[] = [
        { type: 'thinking', thinking: 'First thought with some text' },
        { type: 'thinking', thinking: 'Second thought with more text' },
      ];

      const tokens = estimateThinkingTokens(content);

      expect(tokens).toBeGreaterThan(10); // Combined text should be significant
    });

    it('should handle long thinking text', () => {
      const longText = 'a'.repeat(1000); // 1000 characters = ~250 tokens
      const content: ContentBlock[] = [
        { type: 'thinking', thinking: longText },
      ];

      const tokens = estimateThinkingTokens(content);

      expect(tokens).toBeGreaterThan(200);
      expect(tokens).toBeLessThan(300);
    });
  });
});
