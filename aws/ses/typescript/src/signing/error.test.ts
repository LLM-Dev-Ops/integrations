/**
 * Tests for signing error types
 */

import { describe, it, expect } from 'vitest';
import { SigningError, isSigningError } from './error';

describe('SigningError', () => {
  it('should create error with message and code', () => {
    const error = new SigningError('Test error', 'SIGNING_FAILED');

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('SIGNING_FAILED');
    expect(error.name).toBe('SigningError');
  });

  it('should be instance of Error', () => {
    const error = new SigningError('Test error', 'SIGNING_FAILED');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SigningError);
  });

  it('should support all error codes', () => {
    const codes: Array<SigningError['code']> = [
      'MISSING_HEADER',
      'INVALID_URL',
      'INVALID_TIMESTAMP',
      'SIGNING_FAILED',
    ];

    for (const code of codes) {
      const error = new SigningError('Test', code);
      expect(error.code).toBe(code);
    }
  });

  it('should have proper stack trace', () => {
    const error = new SigningError('Test error', 'SIGNING_FAILED');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('SigningError');
  });

  it('should format toString correctly', () => {
    const error = new SigningError('Test error', 'SIGNING_FAILED');

    expect(error.toString()).toBe('SigningError [SIGNING_FAILED]: Test error');
  });

  it('should preserve prototype chain for instanceof checks', () => {
    const error = new SigningError('Test error', 'SIGNING_FAILED');

    // Should work with instanceof
    expect(error instanceof SigningError).toBe(true);
    expect(error instanceof Error).toBe(true);

    // Should work after serialization/deserialization
    const serialized = JSON.parse(JSON.stringify(error));
    const recreated = Object.assign(new SigningError('', 'SIGNING_FAILED'), serialized);

    expect(recreated instanceof SigningError).toBe(true);
  });
});

describe('isSigningError', () => {
  it('should return true for SigningError instances', () => {
    const error = new SigningError('Test error', 'SIGNING_FAILED');

    expect(isSigningError(error)).toBe(true);
  });

  it('should return false for regular Error instances', () => {
    const error = new Error('Regular error');

    expect(isSigningError(error)).toBe(false);
  });

  it('should return false for other types', () => {
    expect(isSigningError(null)).toBe(false);
    expect(isSigningError(undefined)).toBe(false);
    expect(isSigningError('string')).toBe(false);
    expect(isSigningError(123)).toBe(false);
    expect(isSigningError({})).toBe(false);
    expect(isSigningError({ message: 'test', code: 'TEST' })).toBe(false);
  });

  it('should work in type narrowing', () => {
    const error: unknown = new SigningError('Test', 'SIGNING_FAILED');

    if (isSigningError(error)) {
      // TypeScript should know error is SigningError here
      expect(error.code).toBe('SIGNING_FAILED');
      expect(error.message).toBe('Test');
    } else {
      throw new Error('Type guard failed');
    }
  });
});

describe('Error scenarios', () => {
  it('should create MISSING_HEADER error', () => {
    const error = new SigningError('Missing required header: host', 'MISSING_HEADER');

    expect(error.code).toBe('MISSING_HEADER');
    expect(error.message).toContain('host');
  });

  it('should create INVALID_URL error', () => {
    const error = new SigningError('Invalid request URL: not a valid URL', 'INVALID_URL');

    expect(error.code).toBe('INVALID_URL');
    expect(error.message).toContain('URL');
  });

  it('should create INVALID_TIMESTAMP error', () => {
    const error = new SigningError('Invalid timestamp format', 'INVALID_TIMESTAMP');

    expect(error.code).toBe('INVALID_TIMESTAMP');
    expect(error.message).toContain('timestamp');
  });

  it('should create SIGNING_FAILED error', () => {
    const error = new SigningError('Failed to sign request: crypto error', 'SIGNING_FAILED');

    expect(error.code).toBe('SIGNING_FAILED');
    expect(error.message).toContain('Failed to sign');
  });
});

describe('Error handling patterns', () => {
  it('should work with try-catch', () => {
    try {
      throw new SigningError('Test error', 'SIGNING_FAILED');
    } catch (error) {
      expect(isSigningError(error)).toBe(true);

      if (isSigningError(error)) {
        expect(error.code).toBe('SIGNING_FAILED');
      }
    }
  });

  it('should work with Promise rejection', async () => {
    const promise = Promise.reject(new SigningError('Test error', 'SIGNING_FAILED'));

    await expect(promise).rejects.toThrow(SigningError);
    await expect(promise).rejects.toThrow('Test error');

    try {
      await promise;
    } catch (error) {
      expect(isSigningError(error)).toBe(true);
    }
  });

  it('should work with async/await', async () => {
    async function failingOperation(): Promise<void> {
      throw new SigningError('Operation failed', 'SIGNING_FAILED');
    }

    try {
      await failingOperation();
      throw new Error('Should have thrown');
    } catch (error) {
      expect(isSigningError(error)).toBe(true);

      if (isSigningError(error)) {
        expect(error.code).toBe('SIGNING_FAILED');
      }
    }
  });
});
