import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ConsoleLogger,
  NoopLogger,
  createDefaultLoggingConfig,
  logRequest,
  logResponse,
  logError,
  type Logger,
  type LogLevel,
} from '../logging.js';

describe('Logging', () => {
  describe('createDefaultLoggingConfig', () => {
    it('creates default configuration', () => {
      const config = createDefaultLoggingConfig();

      expect(config.level).toBe('info');
      expect(config.format).toBe('pretty');
      expect(config.includeTimestamps).toBe(true);
      expect(config.includeTarget).toBe(true);
      expect(config.includeFileLine).toBe(false);
    });
  });

  describe('ConsoleLogger', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    describe('Log levels', () => {
      it('logs trace messages', () => {
        const logger = new ConsoleLogger({ level: 'trace' });

        logger.trace('Trace message');

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[TRACE]')
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Trace message')
        );
      });

      it('logs debug messages', () => {
        const logger = new ConsoleLogger({ level: 'debug' });

        logger.debug('Debug message');

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[DEBUG]')
        );
      });

      it('logs info messages', () => {
        const logger = new ConsoleLogger({ level: 'info' });

        logger.info('Info message');

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[INFO]')
        );
      });

      it('logs warn messages', () => {
        const logger = new ConsoleLogger({ level: 'warn' });

        logger.warn('Warning message');

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[WARN]')
        );
      });

      it('logs error messages', () => {
        const logger = new ConsoleLogger({ level: 'error' });

        logger.error('Error message');

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[ERROR]')
        );
      });
    });

    describe('Log level filtering', () => {
      it('filters trace when level is debug', () => {
        const logger = new ConsoleLogger({ level: 'debug' });

        logger.trace('Should not appear');

        expect(consoleLogSpy).not.toHaveBeenCalled();
      });

      it('filters debug when level is info', () => {
        const logger = new ConsoleLogger({ level: 'info' });

        logger.debug('Should not appear');

        expect(consoleLogSpy).not.toHaveBeenCalled();
      });

      it('filters info when level is warn', () => {
        const logger = new ConsoleLogger({ level: 'warn' });

        logger.info('Should not appear');

        expect(consoleLogSpy).not.toHaveBeenCalled();
      });

      it('filters warn when level is error', () => {
        const logger = new ConsoleLogger({ level: 'error' });

        logger.warn('Should not appear');

        expect(consoleLogSpy).not.toHaveBeenCalled();
      });

      it('allows higher priority levels', () => {
        const logger = new ConsoleLogger({ level: 'warn' });

        logger.error('Should appear');

        expect(consoleLogSpy).toHaveBeenCalled();
      });
    });

    describe('Log formats', () => {
      it('formats as pretty by default', () => {
        const logger = new ConsoleLogger({ format: 'pretty' });

        logger.info('Test message', { key: 'value' });

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[INFO]')
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Test message')
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('key: "value"')
        );
      });

      it('formats as JSON', () => {
        const logger = new ConsoleLogger({ format: 'json', includeTimestamps: false });

        logger.info('Test message', { key: 'value' });

        const calls = consoleLogSpy.mock.calls[0];
        const logged = JSON.parse(calls[0] as string);

        expect(logged.level).toBe('info');
        expect(logged.message).toBe('Test message');
        expect(logged.key).toBe('value');
      });

      it('formats as compact', () => {
        const logger = new ConsoleLogger({ format: 'compact' });

        logger.info('Test message', { key: 'value' });

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringMatching(/^\[INFO\] Test message \{.*\}$/)
        );
      });
    });

    describe('Timestamps', () => {
      it('includes timestamps when enabled', () => {
        const logger = new ConsoleLogger({ includeTimestamps: true });

        logger.info('Test');

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T.*\]/)
        );
      });

      it('excludes timestamps when disabled', () => {
        const logger = new ConsoleLogger({ includeTimestamps: false });

        logger.info('Test');

        const call = consoleLogSpy.mock.calls[0][0] as string;
        expect(call).not.toMatch(/\[\d{4}-\d{2}-\d{2}T.*\]/);
      });
    });

    describe('Context', () => {
      it('logs without context', () => {
        const logger = new ConsoleLogger();

        logger.info('Simple message');

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Simple message')
        );
      });

      it('logs with context', () => {
        const logger = new ConsoleLogger({ format: 'pretty' });

        logger.info('Message with context', {
          userId: '123',
          action: 'login',
        });

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('userId')
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('action')
        );
      });

      it('handles nested context objects', () => {
        const logger = new ConsoleLogger({ format: 'json', includeTimestamps: false });

        logger.info('Nested context', {
          user: { id: '123', name: 'Alice' },
        });

        const logged = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
        expect(logged.user).toEqual({ id: '123', name: 'Alice' });
      });
    });
  });

  describe('NoopLogger', () => {
    let logger: NoopLogger;

    beforeEach(() => {
      logger = new NoopLogger();
    });

    it('implements Logger interface', () => {
      const l: Logger = logger;
      expect(l).toBeDefined();
    });

    it('does not throw on trace', () => {
      expect(() => logger.trace('message')).not.toThrow();
    });

    it('does not throw on debug', () => {
      expect(() => logger.debug('message')).not.toThrow();
    });

    it('does not throw on info', () => {
      expect(() => logger.info('message')).not.toThrow();
    });

    it('does not throw on warn', () => {
      expect(() => logger.warn('message')).not.toThrow();
    });

    it('does not throw on error', () => {
      expect(() => logger.error('message')).not.toThrow();
    });

    it('handles context without errors', () => {
      expect(() => {
        logger.info('message', { key: 'value' });
      }).not.toThrow();
    });
  });

  describe('Helper functions', () => {
    let logger: ConsoleLogger;
    let debugSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logger = new ConsoleLogger({ level: 'debug' });
      debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
      errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      debugSpy.mockRestore();
      errorSpy.mockRestore();
    });

    describe('logRequest', () => {
      it('logs request without body', () => {
        logRequest(logger, 'GET', '/api/messages');

        expect(debugSpy).toHaveBeenCalledWith(
          'Outgoing request',
          { method: 'GET', path: '/api/messages', body: undefined }
        );
      });

      it('logs request with body', () => {
        const body = { model: 'claude-3-opus-20240229', max_tokens: 1024 };

        logRequest(logger, 'POST', '/api/messages', body);

        expect(debugSpy).toHaveBeenCalledWith(
          'Outgoing request',
          { method: 'POST', path: '/api/messages', body }
        );
      });
    });

    describe('logResponse', () => {
      it('logs response without body', () => {
        logResponse(logger, 200, 150);

        expect(debugSpy).toHaveBeenCalledWith(
          'Incoming response',
          { status: 200, durationMs: 150, body: undefined }
        );
      });

      it('logs response with body', () => {
        const body = { id: 'msg_123', content: 'Hello' };

        logResponse(logger, 200, 150, body);

        expect(debugSpy).toHaveBeenCalledWith(
          'Incoming response',
          { status: 200, durationMs: 150, body }
        );
      });
    });

    describe('logError', () => {
      it('logs error with context', () => {
        const error = new Error('Connection failed');
        error.stack = 'Error: Connection failed\n  at test.ts:123';

        logError(logger, error, 'HTTP request');

        expect(errorSpy).toHaveBeenCalledWith(
          'Error occurred',
          {
            context: 'HTTP request',
            errorName: 'Error',
            errorMessage: 'Connection failed',
            stack: error.stack,
          }
        );
      });

      it('handles custom error types', () => {
        class CustomError extends Error {
          constructor(message: string) {
            super(message);
            this.name = 'CustomError';
          }
        }

        const error = new CustomError('Custom failure');

        logError(logger, error, 'Custom operation');

        expect(errorSpy).toHaveBeenCalledWith(
          'Error occurred',
          expect.objectContaining({
            errorName: 'CustomError',
            errorMessage: 'Custom failure',
          })
        );
      });
    });
  });

  describe('Integration scenarios', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('tracks API request lifecycle', () => {
      const logger = new ConsoleLogger({ level: 'debug' });

      logger.debug('Starting API request');
      logRequest(logger, 'POST', '/v1/messages', { max_tokens: 1024 });
      logResponse(logger, 200, 250, { id: 'msg_123' });
      logger.info('Request completed successfully');

      expect(consoleLogSpy).toHaveBeenCalledTimes(4);
    });

    it('logs at appropriate levels', () => {
      const logger = new ConsoleLogger({ level: 'info' });

      logger.debug('Debug info'); // Filtered
      logger.info('Operation started');
      logger.warn('Rate limit approaching');
      logger.error('Operation failed');

      expect(consoleLogSpy).toHaveBeenCalledTimes(3);
    });

    it('supports structured logging workflow', () => {
      const logger = new ConsoleLogger({ format: 'json', includeTimestamps: false });

      logger.info('User action', {
        userId: '123',
        action: 'create_message',
        duration: 150,
      });

      const logged = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
      expect(logged).toMatchObject({
        level: 'info',
        message: 'User action',
        userId: '123',
        action: 'create_message',
        duration: 150,
      });
    });
  });
});
