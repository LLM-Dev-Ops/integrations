/**
 * Error handling tests
 */

import { describe, it, expect } from 'vitest';
import {
  GeminiError,
  ValidationError,
  InvalidApiKeyError,
  TooManyRequestsError,
  InternalServerError,
  SafetyBlockedError,
  RecitationBlockedError,
  FileNotFoundError,
  mapHttpStatusToError,
  mapApiErrorToGeminiError,
  extractRetryAfter,
} from '../src/error/index.js';

describe('GeminiError', () => {
  it('should create basic error', () => {
    const error = new GeminiError({
      type: 'api_error',
      message: 'Something went wrong',
      isRetryable: false,
    });

    expect(error.message).toBe('Something went wrong');
    expect(error.type).toBe('api_error');
    expect(error.isRetryable).toBe(false);
    expect(error.name).toBe('GeminiError');
  });

  it('should include status code', () => {
    const error = new GeminiError({
      type: 'validation_error',
      message: 'Invalid request',
      status: 400,
      isRetryable: false,
    });

    expect(error.status).toBe(400);
  });

  it('should include retry after', () => {
    const error = new GeminiError({
      type: 'rate_limit_error',
      message: 'Too many requests',
      status: 429,
      retryAfter: 60,
      isRetryable: true,
    });

    expect(error.retryAfter).toBe(60);
  });

  it('should include details', () => {
    const error = new GeminiError({
      type: 'api_error',
      message: 'Error',
      isRetryable: false,
      details: { code: 'INVALID_ARGUMENT', field: 'temperature' },
    });

    expect(error.details).toEqual({ code: 'INVALID_ARGUMENT', field: 'temperature' });
  });
});

describe('Error Categories', () => {
  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input');

      expect(error.message).toBe('Validation error: Invalid input');
      expect(error.type).toBe('validation_error');
      expect(error.isRetryable).toBe(false);
      expect(error.status).toBe(400);
    });

    it('should include validation details', () => {
      const error = new ValidationError('Validation failed', [
        { field: 'temperature', message: 'Must be between 0 and 1' },
      ]);

      expect(error.validationDetails).toHaveLength(1);
      expect(error.validationDetails?.[0]?.field).toBe('temperature');
    });
  });

  describe('InvalidApiKeyError', () => {
    it('should create invalid API key error', () => {
      const error = new InvalidApiKeyError();

      expect(error.message).toContain('Invalid API key');
      expect(error.type).toBe('authentication_error');
      expect(error.isRetryable).toBe(false);
      expect(error.status).toBe(401);
    });
  });

  describe('TooManyRequestsError', () => {
    it('should create rate limit error', () => {
      const error = new TooManyRequestsError(60);

      expect(error.message).toContain('Too many requests');
      expect(error.type).toBe('rate_limit_error');
      expect(error.isRetryable).toBe(true);
      expect(error.status).toBe(429);
      expect(error.retryAfter).toBe(60);
    });

    it('should handle missing retry after', () => {
      const error = new TooManyRequestsError();

      expect(error.retryAfter).toBeUndefined();
    });
  });

  describe('InternalServerError', () => {
    it('should create server error', () => {
      const error = new InternalServerError('Server crashed');

      expect(error.message).toContain('Server crashed');
      expect(error.type).toBe('server_error');
      expect(error.isRetryable).toBe(true);
      expect(error.status).toBe(500);
    });
  });

  describe('SafetyBlockedError', () => {
    it('should create safety blocked error', () => {
      const error = new SafetyBlockedError('HARM_CATEGORY_DANGEROUS_CONTENT', 'HIGH');

      expect(error.message).toContain('HARM_CATEGORY_DANGEROUS_CONTENT');
      expect(error.message).toContain('HIGH');
      expect(error.type).toBe('content_error');
      expect(error.isRetryable).toBe(false);
      expect(error.category).toBe('HARM_CATEGORY_DANGEROUS_CONTENT');
      expect(error.probability).toBe('HIGH');
    });
  });

  describe('RecitationBlockedError', () => {
    it('should create recitation blocked error', () => {
      const error = new RecitationBlockedError();

      expect(error.message).toContain('recitation');
      expect(error.type).toBe('content_error');
      expect(error.isRetryable).toBe(false);
    });
  });

  describe('FileNotFoundError', () => {
    it('should create file not found error', () => {
      const error = new FileNotFoundError('files/abc123');

      expect(error.message).toContain('files/abc123');
      expect(error.type).toBe('resource_error');
      expect(error.isRetryable).toBe(false);
      expect(error.status).toBe(404);
    });
  });
});

describe('mapHttpStatusToError', () => {
  it('should map 400 to validation error', () => {
    const error = mapHttpStatusToError(400, 'Invalid validation');

    expect(error).toBeInstanceOf(ValidationError);
    expect(error.status).toBe(400);
  });

  it('should map 400 with model keyword to InvalidModelError', () => {
    const error = mapHttpStatusToError(400, 'Invalid model specified');

    expect(error.message).toContain('model');
    expect(error.type).toBe('invalid_model');
  });

  it('should map 401 to invalid API key error', () => {
    const error = mapHttpStatusToError(401, 'Unauthorized');

    expect(error).toBeInstanceOf(InvalidApiKeyError);
    expect(error.status).toBe(401);
  });

  it('should map 401 with expired keyword to ExpiredApiKeyError', () => {
    const error = mapHttpStatusToError(401, 'API key expired');

    expect(error.message).toContain('expired');
    expect(error.type).toBe('authentication_error');
  });

  it('should map 403 to authentication error', () => {
    const error = mapHttpStatusToError(403, 'Forbidden');

    expect(error.type).toBe('authentication_error');
    expect(error.status).toBe(403);
  });

  it('should map 404 with file keyword to FileNotFoundError', () => {
    const error = mapHttpStatusToError(404, 'File not found');

    expect(error).toBeInstanceOf(FileNotFoundError);
  });

  it('should map 429 to rate limit error', () => {
    const error = mapHttpStatusToError(429, 'Rate limit exceeded', 60);

    expect(error).toBeInstanceOf(TooManyRequestsError);
    expect(error.retryAfter).toBe(60);
  });

  it('should map 500 to internal server error', () => {
    const error = mapHttpStatusToError(500, 'Internal error');

    expect(error).toBeInstanceOf(InternalServerError);
    expect(error.status).toBe(500);
  });

  it('should map 503 to service unavailable', () => {
    const error = mapHttpStatusToError(503, 'Service unavailable');

    expect(error.type).toBe('server_error');
    expect(error.status).toBe(503);
    expect(error.isRetryable).toBe(true);
  });

  it('should map unknown status to generic error', () => {
    const error = mapHttpStatusToError(418, "I'm a teapot");

    expect(error.type).toBe('unknown_error');
    expect(error.status).toBe(418);
    expect(error.isRetryable).toBe(false);
  });

  it('should mark 5xx errors as retryable', () => {
    const error = mapHttpStatusToError(502, 'Bad gateway');

    expect(error.isRetryable).toBe(true);
  });
});

describe('mapApiErrorToGeminiError', () => {
  it('should map INVALID_API_KEY code', () => {
    const error = mapApiErrorToGeminiError({
      code: 'INVALID_API_KEY',
      message: 'Bad key',
    });

    expect(error).toBeInstanceOf(InvalidApiKeyError);
  });

  it('should map QUOTA_EXCEEDED code', () => {
    const error = mapApiErrorToGeminiError({
      code: 'QUOTA_EXCEEDED',
      message: 'Quota exceeded',
      retryAfter: 120,
    });

    expect(error.type).toBe('rate_limit_error');
    expect(error.retryAfter).toBe(120);
  });

  it('should map VALIDATION_ERROR code', () => {
    const error = mapApiErrorToGeminiError({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
    });

    expect(error).toBeInstanceOf(ValidationError);
  });

  it('should map RESOURCE_EXHAUSTED code', () => {
    const error = mapApiErrorToGeminiError({
      code: 'RESOURCE_EXHAUSTED',
      message: 'Too many requests',
    });

    expect(error).toBeInstanceOf(TooManyRequestsError);
  });

  it('should map INTERNAL code', () => {
    const error = mapApiErrorToGeminiError({
      code: 'INTERNAL',
      message: 'Internal error',
    });

    expect(error).toBeInstanceOf(InternalServerError);
  });

  it('should map SAFETY_BLOCKED code', () => {
    const error = mapApiErrorToGeminiError({
      code: 'SAFETY_BLOCKED',
      message: 'Content blocked',
      details: { category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'HIGH' },
    });

    expect(error).toBeInstanceOf(SafetyBlockedError);
    expect((error as SafetyBlockedError).category).toBe('HARM_CATEGORY_HATE_SPEECH');
  });

  it('should map RECITATION_BLOCKED code', () => {
    const error = mapApiErrorToGeminiError({
      code: 'RECITATION_BLOCKED',
      message: 'Recitation detected',
    });

    expect(error).toBeInstanceOf(RecitationBlockedError);
  });

  it('should fall back to HTTP status mapping', () => {
    const error = mapApiErrorToGeminiError({
      status: 404,
      message: 'Not found',
    });

    expect(error.status).toBe(404);
    expect(error.type).toBe('resource_error');
  });

  it('should handle unknown error', () => {
    const error = mapApiErrorToGeminiError({
      message: 'Unknown error',
    });

    expect(error.type).toBe('unknown_error');
    expect(error.isRetryable).toBe(false);
  });

  it('should include error details', () => {
    const error = mapApiErrorToGeminiError({
      code: 'VALIDATION_ERROR',
      message: 'Invalid',
      details: { field: 'temperature', value: 2.0 },
    });

    expect(error.details).toEqual({ validationDetails: [] });
  });
});

describe('extractRetryAfter', () => {
  it('should extract numeric retry-after', () => {
    const retryAfter = extractRetryAfter({ 'retry-after': '60' });

    expect(retryAfter).toBe(60);
  });

  it('should handle capitalized header', () => {
    const retryAfter = extractRetryAfter({ 'Retry-After': '120' });

    expect(retryAfter).toBe(120);
  });

  it('should parse HTTP date', () => {
    const futureDate = new Date(Date.now() + 60000); // 60 seconds from now
    const retryAfter = extractRetryAfter({
      'retry-after': futureDate.toUTCString(),
    });

    expect(retryAfter).toBeGreaterThanOrEqual(55);
    expect(retryAfter).toBeLessThanOrEqual(65);
  });

  it('should handle missing header', () => {
    const retryAfter = extractRetryAfter({});

    expect(retryAfter).toBeUndefined();
  });

  it('should handle invalid value', () => {
    const retryAfter = extractRetryAfter({ 'retry-after': 'invalid' });

    expect(retryAfter).toBeUndefined();
  });

  it('should not return negative values for past dates', () => {
    const pastDate = new Date(Date.now() - 60000);
    const retryAfter = extractRetryAfter({
      'retry-after': pastDate.toUTCString(),
    });

    expect(retryAfter).toBe(0);
  });
});

describe('Error isRetryable', () => {
  it('should mark validation errors as non-retryable', () => {
    const error = new ValidationError('Invalid');

    expect(error.isRetryable).toBe(false);
  });

  it('should mark authentication errors as non-retryable', () => {
    const error = new InvalidApiKeyError();

    expect(error.isRetryable).toBe(false);
  });

  it('should mark rate limit errors as retryable', () => {
    const error = new TooManyRequestsError();

    expect(error.isRetryable).toBe(true);
  });

  it('should mark server errors as retryable', () => {
    const error = new InternalServerError();

    expect(error.isRetryable).toBe(true);
  });

  it('should mark safety errors as non-retryable', () => {
    const error = new SafetyBlockedError('HARM_CATEGORY_DANGEROUS_CONTENT', 'HIGH');

    expect(error.isRetryable).toBe(false);
  });

  it('should mark resource errors as non-retryable', () => {
    const error = new FileNotFoundError('files/test');

    expect(error.isRetryable).toBe(false);
  });
});

describe('Error serialization', () => {
  it('should be JSON serializable', () => {
    const error = new GeminiError({
      type: 'api_error',
      message: 'Test error',
      status: 500,
      isRetryable: true,
      details: { code: 'TEST' },
    });

    const json = JSON.stringify(error);
    const parsed = JSON.parse(json);

    expect(parsed.message).toBe('Test error');
    expect(parsed.type).toBe('api_error');
    expect(parsed.status).toBe(500);
  });

  it('should preserve error type in toString', () => {
    const error = new ValidationError('Invalid input');

    const str = error.toString();

    expect(str).toContain('ValidationError');
    expect(str).toContain('Invalid input');
  });
});
