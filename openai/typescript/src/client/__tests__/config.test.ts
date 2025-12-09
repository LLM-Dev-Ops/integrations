import { describe, it, expect } from 'vitest';
import {
  validateConfig,
  normalizeConfig,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT,
  DEFAULT_MAX_RETRIES,
} from '../config.js';
import type { OpenAIConfig } from '../../types/common.js';

describe('Client Config', () => {
  describe('validateConfig', () => {
    describe('happy path', () => {
      it('should validate a valid minimal config', () => {
        const config: OpenAIConfig = {
          apiKey: 'sk-test-key',
        };

        expect(() => validateConfig(config)).not.toThrow();
      });

      it('should validate a complete config', () => {
        const config: OpenAIConfig = {
          apiKey: 'sk-test-key',
          baseURL: 'https://custom.openai.com',
          organization: 'org-123',
          timeout: 30000,
          maxRetries: 5,
          defaultHeaders: { 'X-Custom': 'test' },
        };

        expect(() => validateConfig(config)).not.toThrow();
      });

      it('should allow zero timeout', () => {
        const config: OpenAIConfig = {
          apiKey: 'sk-test-key',
          timeout: 0,
        };

        expect(() => validateConfig(config)).not.toThrow();
      });

      it('should allow zero max retries', () => {
        const config: OpenAIConfig = {
          apiKey: 'sk-test-key',
          maxRetries: 0,
        };

        expect(() => validateConfig(config)).not.toThrow();
      });
    });

    describe('validation errors', () => {
      it('should throw if apiKey is missing', () => {
        const config = {} as OpenAIConfig;

        expect(() => validateConfig(config)).toThrow('API key is required');
      });

      it('should throw if apiKey is empty string', () => {
        const config: OpenAIConfig = {
          apiKey: '',
        };

        expect(() => validateConfig(config)).toThrow('API key cannot be empty');
      });

      it('should throw if apiKey is only whitespace', () => {
        const config: OpenAIConfig = {
          apiKey: '   ',
        };

        expect(() => validateConfig(config)).toThrow('API key cannot be empty');
      });

      it('should throw if timeout is negative', () => {
        const config: OpenAIConfig = {
          apiKey: 'sk-test-key',
          timeout: -1,
        };

        expect(() => validateConfig(config)).toThrow(
          'Timeout must be non-negative'
        );
      });

      it('should throw if maxRetries is negative', () => {
        const config: OpenAIConfig = {
          apiKey: 'sk-test-key',
          maxRetries: -1,
        };

        expect(() => validateConfig(config)).toThrow(
          'Max retries must be non-negative'
        );
      });
    });
  });

  describe('normalizeConfig', () => {
    it('should apply default values to minimal config', () => {
      const config: OpenAIConfig = {
        apiKey: 'sk-test-key',
      };

      const normalized = normalizeConfig(config);

      expect(normalized.apiKey).toBe('sk-test-key');
      expect(normalized.baseURL).toBe(DEFAULT_BASE_URL);
      expect(normalized.organization).toBe('');
      expect(normalized.timeout).toBe(DEFAULT_TIMEOUT);
      expect(normalized.maxRetries).toBe(DEFAULT_MAX_RETRIES);
      expect(normalized.defaultHeaders).toEqual({});
    });

    it('should preserve custom values', () => {
      const config: OpenAIConfig = {
        apiKey: 'sk-test-key',
        baseURL: 'https://custom.openai.com',
        organization: 'org-123',
        timeout: 30000,
        maxRetries: 5,
        defaultHeaders: { 'X-Custom': 'test' },
      };

      const normalized = normalizeConfig(config);

      expect(normalized.apiKey).toBe('sk-test-key');
      expect(normalized.baseURL).toBe('https://custom.openai.com');
      expect(normalized.organization).toBe('org-123');
      expect(normalized.timeout).toBe(30000);
      expect(normalized.maxRetries).toBe(5);
      expect(normalized.defaultHeaders).toEqual({ 'X-Custom': 'test' });
    });

    it('should handle partial config with some defaults', () => {
      const config: OpenAIConfig = {
        apiKey: 'sk-test-key',
        organization: 'org-123',
      };

      const normalized = normalizeConfig(config);

      expect(normalized.apiKey).toBe('sk-test-key');
      expect(normalized.baseURL).toBe(DEFAULT_BASE_URL);
      expect(normalized.organization).toBe('org-123');
      expect(normalized.timeout).toBe(DEFAULT_TIMEOUT);
      expect(normalized.maxRetries).toBe(DEFAULT_MAX_RETRIES);
    });

    it('should handle zero values without applying defaults', () => {
      const config: OpenAIConfig = {
        apiKey: 'sk-test-key',
        timeout: 0,
        maxRetries: 0,
      };

      const normalized = normalizeConfig(config);

      expect(normalized.timeout).toBe(0);
      expect(normalized.maxRetries).toBe(0);
    });
  });
});
