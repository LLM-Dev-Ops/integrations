import { describe, it, expect } from 'vitest';
import {
  createCacheControl,
  createCacheableSystemPrompt,
  createCacheableSystemPrompts,
  hasCacheUsage,
  getCacheEfficiency,
  calculateTokensSaved,
  calculateCostSavings,
  getCacheStats,
  isCachingEffective,
} from '../prompt-caching.js';
import type { Usage } from '../../messages/types.js';
import type { CacheUsage } from '../types.js';

describe('Prompt Caching', () => {
  describe('createCacheControl', () => {
    it('should create ephemeral cache control', () => {
      const control = createCacheControl();

      expect(control).toEqual({ type: 'ephemeral' });
    });
  });

  describe('createCacheableSystemPrompt', () => {
    it('should create system prompt with cache control', () => {
      const prompt = createCacheableSystemPrompt('You are a helpful assistant');

      expect(prompt).toEqual({
        text: 'You are a helpful assistant',
        cache_control: { type: 'ephemeral' },
      });
    });

    it('should throw error for empty text', () => {
      expect(() => createCacheableSystemPrompt('')).toThrow('System prompt text cannot be empty');
    });

    it('should throw error for whitespace-only text', () => {
      expect(() => createCacheableSystemPrompt('   ')).toThrow('System prompt text cannot be empty');
    });

    it('should handle long system prompts', () => {
      const longPrompt = 'a'.repeat(10000);
      const prompt = createCacheableSystemPrompt(longPrompt);

      expect(prompt.text).toBe(longPrompt);
      expect(prompt.cache_control).toEqual({ type: 'ephemeral' });
    });
  });

  describe('createCacheableSystemPrompts', () => {
    it('should create multiple prompts with caching on last', () => {
      const prompts = createCacheableSystemPrompts([
        'First prompt',
        'Second prompt',
        'Third prompt',
      ]);

      expect(prompts).toHaveLength(3);
      expect(prompts[0]).toEqual({ text: 'First prompt' });
      expect(prompts[1]).toEqual({ text: 'Second prompt' });
      expect(prompts[2]).toEqual({
        text: 'Third prompt',
        cache_control: { type: 'ephemeral' },
      });
    });

    it('should handle single prompt', () => {
      const prompts = createCacheableSystemPrompts(['Only prompt']);

      expect(prompts).toHaveLength(1);
      expect(prompts[0]).toEqual({
        text: 'Only prompt',
        cache_control: { type: 'ephemeral' },
      });
    });

    it('should throw error for empty array', () => {
      expect(() => createCacheableSystemPrompts([])).toThrow('At least one system prompt is required');
    });

    it('should handle two prompts', () => {
      const prompts = createCacheableSystemPrompts(['First', 'Second']);

      expect(prompts).toHaveLength(2);
      expect(prompts[0]).toEqual({ text: 'First' });
      expect(prompts[1]).toEqual({
        text: 'Second',
        cache_control: { type: 'ephemeral' },
      });
    });
  });

  describe('hasCacheUsage', () => {
    it('should return true for usage with cache info', () => {
      const usage: Usage = {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 20,
        cache_read_input_tokens: 80,
      };

      expect(hasCacheUsage(usage)).toBe(true);
    });

    it('should return false for usage without cache info', () => {
      const usage: Usage = {
        input_tokens: 100,
        output_tokens: 50,
      };

      expect(hasCacheUsage(usage)).toBe(false);
    });

    it('should return false for null', () => {
      expect(hasCacheUsage(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(hasCacheUsage(undefined)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(hasCacheUsage('string')).toBe(false);
      expect(hasCacheUsage(123)).toBe(false);
    });

    it('should return false for partial cache info', () => {
      const usage = {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 20,
      };

      expect(hasCacheUsage(usage)).toBe(false);
    });
  });

  describe('getCacheEfficiency', () => {
    it('should calculate efficiency with cache reads', () => {
      const usage: CacheUsage = {
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 300,
      };

      const efficiency = getCacheEfficiency(usage);

      expect(efficiency).toBe(0.75); // 300 / (100 + 300)
    });

    it('should return 0 for no cache activity', () => {
      const usage: CacheUsage = {
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      };

      const efficiency = getCacheEfficiency(usage);

      expect(efficiency).toBe(0);
    });

    it('should return 0 for only cache creation', () => {
      const usage: CacheUsage = {
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 0,
      };

      const efficiency = getCacheEfficiency(usage);

      expect(efficiency).toBe(0);
    });

    it('should return 1 for only cache reads', () => {
      const usage: CacheUsage = {
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 100,
      };

      const efficiency = getCacheEfficiency(usage);

      expect(efficiency).toBe(1);
    });

    it('should handle equal creation and reads', () => {
      const usage: CacheUsage = {
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 100,
      };

      const efficiency = getCacheEfficiency(usage);

      expect(efficiency).toBe(0.5);
    });
  });

  describe('calculateTokensSaved', () => {
    it('should calculate tokens saved (90% of cache reads)', () => {
      const usage: CacheUsage = {
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 1000,
      };

      const saved = calculateTokensSaved(usage);

      expect(saved).toBe(900); // 1000 * 0.9
    });

    it('should return 0 for no cache reads', () => {
      const usage: CacheUsage = {
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 0,
      };

      const saved = calculateTokensSaved(usage);

      expect(saved).toBe(0);
    });

    it('should handle large numbers', () => {
      const usage: CacheUsage = {
        cache_creation_input_tokens: 10000,
        cache_read_input_tokens: 100000,
      };

      const saved = calculateTokensSaved(usage);

      expect(saved).toBe(90000);
    });

    it('should floor the result', () => {
      const usage: CacheUsage = {
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 11,
      };

      const saved = calculateTokensSaved(usage);

      expect(saved).toBe(9); // floor(11 * 0.9)
    });
  });

  describe('calculateCostSavings', () => {
    it('should calculate cost savings with default rate', () => {
      const usage: CacheUsage = {
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 1000000,
      };

      const savings = calculateCostSavings(usage);

      // 900k tokens saved at $3/M = $2.70
      expect(savings).toBeCloseTo(2.7, 2);
    });

    it('should calculate cost savings with custom rate', () => {
      const usage: CacheUsage = {
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 1000000,
      };

      const savings = calculateCostSavings(usage, 5.0);

      // 900k tokens saved at $5/M = $4.50
      expect(savings).toBeCloseTo(4.5, 2);
    });

    it('should return 0 for no cache reads', () => {
      const usage: CacheUsage = {
        cache_creation_input_tokens: 100000,
        cache_read_input_tokens: 0,
      };

      const savings = calculateCostSavings(usage);

      expect(savings).toBe(0);
    });

    it('should handle small savings', () => {
      const usage: CacheUsage = {
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 1000,
      };

      const savings = calculateCostSavings(usage);

      // 900 tokens saved at $3/M = $0.0027
      expect(savings).toBeCloseTo(0.0027, 4);
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', () => {
      const usage: Usage = {
        input_tokens: 500,
        output_tokens: 200,
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 400,
      };

      const stats = getCacheStats(usage);

      expect(stats).not.toBeNull();
      expect(stats!.cacheCreation).toBe(100);
      expect(stats!.cacheReads).toBe(400);
      expect(stats!.cacheHitRate).toBe(0.8); // 400 / 500
      expect(stats!.tokensSaved).toBe(360); // 400 * 0.9
      expect(stats!.efficiency).toBe(0.8);
    });

    it('should return null for usage without cache info', () => {
      const usage: Usage = {
        input_tokens: 500,
        output_tokens: 200,
      };

      const stats = getCacheStats(usage);

      expect(stats).toBeNull();
    });

    it('should handle zero cache activity', () => {
      const usage: Usage = {
        input_tokens: 500,
        output_tokens: 200,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      };

      const stats = getCacheStats(usage);

      expect(stats).not.toBeNull();
      expect(stats!.cacheHitRate).toBe(0);
      expect(stats!.tokensSaved).toBe(0);
      expect(stats!.efficiency).toBe(0);
    });

    it('should calculate correct hit rate', () => {
      const usage: Usage = {
        input_tokens: 1000,
        output_tokens: 200,
        cache_creation_input_tokens: 200,
        cache_read_input_tokens: 800,
      };

      const stats = getCacheStats(usage);

      expect(stats).not.toBeNull();
      expect(stats!.cacheHitRate).toBe(0.8);
    });
  });

  describe('isCachingEffective', () => {
    it('should return true for effective caching (>= 50%)', () => {
      const usage: CacheUsage = {
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 100,
      };

      expect(isCachingEffective(usage)).toBe(true);
    });

    it('should return true for high efficiency', () => {
      const usage: CacheUsage = {
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 900,
      };

      expect(isCachingEffective(usage)).toBe(true);
    });

    it('should return false for ineffective caching (< 50%)', () => {
      const usage: CacheUsage = {
        cache_creation_input_tokens: 600,
        cache_read_input_tokens: 400,
      };

      expect(isCachingEffective(usage)).toBe(false);
    });

    it('should return false for no cache reads', () => {
      const usage: CacheUsage = {
        cache_creation_input_tokens: 1000,
        cache_read_input_tokens: 0,
      };

      expect(isCachingEffective(usage)).toBe(false);
    });

    it('should return false for no cache activity', () => {
      const usage: CacheUsage = {
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      };

      expect(isCachingEffective(usage)).toBe(false);
    });

    it('should handle edge case at exactly 50%', () => {
      const usage: CacheUsage = {
        cache_creation_input_tokens: 500,
        cache_read_input_tokens: 500,
      };

      expect(isCachingEffective(usage)).toBe(true);
    });
  });
});
