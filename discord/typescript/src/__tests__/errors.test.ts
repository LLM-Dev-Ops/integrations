/**
 * Tests for Discord error types.
 */

import {
  DiscordError,
  DiscordErrorCode,
  RateLimitedError,
  RateLimitTimeoutError,
  QueueFullError,
  QueueTimeoutError,
  NoAuthenticationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  InvalidWebhookUrlError,
  UnknownChannelRouteError,
  BadRequestError,
  ValidationError,
  ServerError,
  NetworkError,
  SimulationNoMatchError,
  SimulationLoadError,
  ConfigurationError,
  parseDiscordApiError,
  isDiscordError,
  isRetryableError,
} from '../index.js';

describe('DiscordError', () => {
  describe('base error', () => {
    it('should create a basic error', () => {
      const error = new DiscordError({
        code: DiscordErrorCode.BadRequest,
        message: 'Test error',
      });

      expect(error.code).toBe(DiscordErrorCode.BadRequest);
      expect(error.message).toBe('Test error');
      expect(error.retryable).toBe(false);
    });

    it('should serialize to JSON', () => {
      const error = new DiscordError({
        code: DiscordErrorCode.RateLimited,
        message: 'Rate limited',
        statusCode: 429,
        retryable: true,
        retryAfterMs: 5000,
      });

      const json = error.toJSON();
      expect(json.code).toBe(DiscordErrorCode.RateLimited);
      expect(json.statusCode).toBe(429);
      expect(json.retryable).toBe(true);
      expect(json.retryAfterMs).toBe(5000);
    });
  });
});

describe('Rate Limit Errors', () => {
  describe('RateLimitedError', () => {
    it('should create a rate limited error', () => {
      const error = new RateLimitedError(5000, false);
      expect(error.code).toBe(DiscordErrorCode.RateLimited);
      expect(error.statusCode).toBe(429);
      expect(error.retryable).toBe(true);
      expect(error.retryAfterMs).toBe(5000);
    });

    it('should indicate global rate limit', () => {
      const error = new RateLimitedError(5000, true);
      expect(error.message).toContain('global');
      expect(error.details?.isGlobal).toBe(true);
    });
  });

  describe('RateLimitTimeoutError', () => {
    it('should create a timeout error', () => {
      const error = new RateLimitTimeoutError(60000, 30000);
      expect(error.code).toBe(DiscordErrorCode.RateLimitTimeout);
      expect(error.retryable).toBe(false);
      expect(error.details?.waitTime).toBe(60000);
      expect(error.details?.maxWait).toBe(30000);
    });
  });

  describe('QueueFullError', () => {
    it('should create a queue full error', () => {
      const error = new QueueFullError(1000, 1000);
      expect(error.code).toBe(DiscordErrorCode.QueueFull);
      expect(error.retryable).toBe(false);
    });
  });

  describe('QueueTimeoutError', () => {
    it('should create a queue timeout error', () => {
      const error = new QueueTimeoutError(30000);
      expect(error.code).toBe(DiscordErrorCode.QueueTimeout);
      expect(error.retryable).toBe(false);
    });
  });
});

describe('Authentication Errors', () => {
  describe('NoAuthenticationError', () => {
    it('should create a no auth error', () => {
      const error = new NoAuthenticationError();
      expect(error.code).toBe(DiscordErrorCode.NoAuthentication);
      expect(error.retryable).toBe(false);
    });
  });

  describe('UnauthorizedError', () => {
    it('should create an unauthorized error', () => {
      const error = new UnauthorizedError('Token expired');
      expect(error.code).toBe(DiscordErrorCode.Unauthorized);
      expect(error.statusCode).toBe(401);
      expect(error.retryable).toBe(false);
    });
  });

  describe('ForbiddenError', () => {
    it('should create a forbidden error', () => {
      const error = new ForbiddenError('Cannot send to this channel');
      expect(error.code).toBe(DiscordErrorCode.Forbidden);
      expect(error.statusCode).toBe(403);
      expect(error.retryable).toBe(false);
    });
  });
});

describe('Resource Errors', () => {
  describe('NotFoundError', () => {
    it('should create a not found error', () => {
      const error = new NotFoundError('channel');
      expect(error.code).toBe(DiscordErrorCode.NotFound);
      expect(error.statusCode).toBe(404);
      expect(error.retryable).toBe(false);
      expect(error.message).toContain('channel');
    });
  });

  describe('InvalidWebhookUrlError', () => {
    it('should create an invalid webhook URL error', () => {
      const error = new InvalidWebhookUrlError();
      expect(error.code).toBe(DiscordErrorCode.InvalidWebhookUrl);
      expect(error.retryable).toBe(false);
    });
  });

  describe('UnknownChannelRouteError', () => {
    it('should create an unknown route error', () => {
      const error = new UnknownChannelRouteError('alerts');
      expect(error.code).toBe(DiscordErrorCode.UnknownChannelRoute);
      expect(error.retryable).toBe(false);
      expect(error.details?.routeName).toBe('alerts');
    });
  });
});

describe('Server Errors', () => {
  describe('ServerError', () => {
    it('should create a retryable server error', () => {
      const error = new ServerError(500, 'Internal server error');
      expect(error.code).toBe(DiscordErrorCode.ServerError);
      expect(error.statusCode).toBe(500);
      expect(error.retryable).toBe(true);
    });
  });

  describe('NetworkError', () => {
    it('should create a retryable network error', () => {
      const cause = new Error('Connection refused');
      const error = new NetworkError('Connection refused', cause);
      expect(error.code).toBe(DiscordErrorCode.NetworkError);
      expect(error.retryable).toBe(true);
      expect(error.cause).toBe(cause);
    });
  });
});

describe('Simulation Errors', () => {
  describe('SimulationNoMatchError', () => {
    it('should create a no match error', () => {
      const error = new SimulationNoMatchError('webhook:execute:POST');
      expect(error.code).toBe(DiscordErrorCode.SimulationNoMatch);
      expect(error.retryable).toBe(false);
      expect(error.details?.key).toBe('webhook:execute:POST');
    });
  });

  describe('SimulationLoadError', () => {
    it('should create a load error', () => {
      const cause = new Error('File not found');
      const error = new SimulationLoadError('/path/to/recordings.json', cause);
      expect(error.code).toBe(DiscordErrorCode.SimulationLoadError);
      expect(error.retryable).toBe(false);
      expect(error.details?.path).toBe('/path/to/recordings.json');
    });
  });
});

describe('parseDiscordApiError', () => {
  it('should parse 400 as BadRequestError', () => {
    const error = parseDiscordApiError(400, { message: 'Invalid body', code: 50035 });
    expect(error).toBeInstanceOf(BadRequestError);
    expect(error.statusCode).toBe(400);
    expect(error.discordCode).toBe(50035);
  });

  it('should parse 401 as UnauthorizedError', () => {
    const error = parseDiscordApiError(401, { message: 'Invalid token' });
    expect(error).toBeInstanceOf(UnauthorizedError);
  });

  it('should parse 403 as ForbiddenError', () => {
    const error = parseDiscordApiError(403, { message: 'Missing permissions' });
    expect(error).toBeInstanceOf(ForbiddenError);
  });

  it('should parse 404 as NotFoundError', () => {
    const error = parseDiscordApiError(404, { message: 'Unknown message' });
    expect(error).toBeInstanceOf(NotFoundError);
  });

  it('should parse 429 as RateLimitedError', () => {
    const error = parseDiscordApiError(429, { retry_after: 5, global: false });
    expect(error).toBeInstanceOf(RateLimitedError);
    expect(error.retryAfterMs).toBe(5000);
  });

  it('should parse 429 with Retry-After header', () => {
    const error = parseDiscordApiError(429, null, '10');
    expect(error).toBeInstanceOf(RateLimitedError);
    expect(error.retryAfterMs).toBe(10000);
  });

  it('should parse 5xx as ServerError', () => {
    const error = parseDiscordApiError(500, { message: 'Internal error' });
    expect(error).toBeInstanceOf(ServerError);
    expect(error.retryable).toBe(true);
  });
});

describe('isDiscordError', () => {
  it('should return true for Discord errors', () => {
    expect(isDiscordError(new RateLimitedError(1000))).toBe(true);
    expect(isDiscordError(new NotFoundError('channel'))).toBe(true);
    expect(isDiscordError(new ConfigurationError('bad config'))).toBe(true);
  });

  it('should return false for non-Discord errors', () => {
    expect(isDiscordError(new Error('generic'))).toBe(false);
    expect(isDiscordError('string')).toBe(false);
    expect(isDiscordError(null)).toBe(false);
  });
});

describe('isRetryableError', () => {
  it('should return true for retryable errors', () => {
    expect(isRetryableError(new RateLimitedError(1000))).toBe(true);
    expect(isRetryableError(new ServerError(500))).toBe(true);
    expect(isRetryableError(new NetworkError('timeout'))).toBe(true);
  });

  it('should return false for non-retryable errors', () => {
    expect(isRetryableError(new UnauthorizedError())).toBe(false);
    expect(isRetryableError(new NotFoundError('channel'))).toBe(false);
    expect(isRetryableError(new ValidationError(['too long']))).toBe(false);
  });

  it('should return true for fetch TypeErrors', () => {
    const fetchError = new TypeError('fetch failed');
    expect(isRetryableError(fetchError)).toBe(true);
  });
});
