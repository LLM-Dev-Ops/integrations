/**
 * vLLM Error Types
 * Implements the error hierarchy defined in SPARC specification
 */

/**
 * Base error class for all vLLM-related errors
 */
export class VllmError extends Error {
  public readonly type: string;
  public readonly status?: number;
  public readonly retryAfter?: number;
  public readonly isRetryable: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(options: {
    type: string;
    message: string;
    status?: number;
    retryAfter?: number;
    isRetryable?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = 'VllmError';
    this.type = options.type;
    this.status = options.status;
    this.retryAfter = options.retryAfter;
    this.isRetryable = options.isRetryable ?? false;
    this.details = options.details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      status: this.status,
      retryAfter: this.retryAfter,
      isRetryable: this.isRetryable,
      details: this.details,
    };
  }
}

// ===== CONFIGURATION ERRORS =====

export class ConfigurationError extends VllmError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      type: 'configuration_error',
      message,
      isRetryable: false,
      details,
    });
    this.name = 'ConfigurationError';
  }
}

export class InvalidServerUrlError extends ConfigurationError {
  constructor(url: string) {
    super(`Invalid server URL: ${url}`, { url });
    this.name = 'InvalidServerUrlError';
  }
}

export class InvalidTimeoutError extends ConfigurationError {
  constructor(timeout: number) {
    super(`Invalid timeout value: ${timeout}ms`, { timeout });
    this.name = 'InvalidTimeoutError';
  }
}

export class InvalidBatchConfigError extends ConfigurationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
    this.name = 'InvalidBatchConfigError';
  }
}

// ===== CONNECTION ERRORS =====

export class ConnectionError extends VllmError {
  constructor(
    message: string,
    options?: { status?: number; isRetryable?: boolean; details?: Record<string, unknown> }
  ) {
    super({
      type: 'connection_error',
      message,
      status: options?.status,
      isRetryable: options?.isRetryable ?? true,
      details: options?.details,
    });
    this.name = 'ConnectionError';
  }
}

export class ServerUnreachableError extends ConnectionError {
  constructor(server: string, cause?: Error) {
    super(`Server unreachable: ${server}`, {
      isRetryable: true,
      details: { server, cause: cause?.message },
    });
    this.name = 'ServerUnreachableError';
  }
}

export class DnsResolutionFailedError extends ConnectionError {
  constructor(hostname: string) {
    super(`DNS resolution failed for: ${hostname}`, {
      isRetryable: true,
      details: { hostname },
    });
    this.name = 'DnsResolutionFailedError';
  }
}

export class TlsError extends ConnectionError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(`TLS error: ${message}`, { isRetryable: false, details });
    this.name = 'TlsError';
  }
}

export class ConnectionPoolExhaustedError extends ConnectionError {
  constructor(server: string) {
    super(`Connection pool exhausted for server: ${server}`, {
      isRetryable: true,
      details: { server },
    });
    this.name = 'ConnectionPoolExhaustedError';
  }
}

// ===== REQUEST ERRORS =====

export class RequestError extends VllmError {
  constructor(
    message: string,
    options?: { status?: number; details?: Record<string, unknown> }
  ) {
    super({
      type: 'request_error',
      message,
      status: options?.status ?? 400,
      isRetryable: false,
      details: options?.details,
    });
    this.name = 'RequestError';
  }
}

export class InvalidModelError extends RequestError {
  constructor(model: string, availableModels?: string[]) {
    super(`Invalid model: ${model}`, {
      status: 404,
      details: { model, availableModels },
    });
    this.name = 'InvalidModelError';
  }
}

export class InvalidParametersError extends RequestError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { status: 400, details });
    this.name = 'InvalidParametersError';
  }
}

export class PromptTooLongError extends RequestError {
  constructor(tokenCount: number, maxTokens: number) {
    super(`Prompt too long: ${tokenCount} tokens exceeds maximum ${maxTokens}`, {
      status: 400,
      details: { tokenCount, maxTokens },
    });
    this.name = 'PromptTooLongError';
  }
}

export class SerializationFailedError extends RequestError {
  constructor(message: string, cause?: Error) {
    super(`Serialization failed: ${message}`, {
      details: { cause: cause?.message },
    });
    this.name = 'SerializationFailedError';
  }
}

// ===== SERVER ERRORS =====

export class ServerError extends VllmError {
  constructor(
    message: string,
    options?: { status?: number; isRetryable?: boolean; details?: Record<string, unknown> }
  ) {
    super({
      type: 'server_error',
      message,
      status: options?.status ?? 500,
      isRetryable: options?.isRetryable ?? true,
      details: options?.details,
    });
    this.name = 'ServerError';
  }
}

export class InternalServerError extends ServerError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { status: 500, isRetryable: true, details });
    this.name = 'InternalServerError';
  }
}

export class ModelNotLoadedError extends ServerError {
  constructor(model: string) {
    super(`Model not loaded: ${model}`, {
      status: 503,
      isRetryable: true,
      details: { model },
    });
    this.name = 'ModelNotLoadedError';
  }
}

export class OutOfMemoryError extends ServerError {
  constructor(details?: Record<string, unknown>) {
    super('Server out of memory (GPU/CPU)', {
      status: 507,
      isRetryable: false,
      details,
    });
    this.name = 'OutOfMemoryError';
  }
}

export class KvCacheExhaustedError extends ServerError {
  constructor(details?: Record<string, unknown>) {
    super('KV cache exhausted', {
      status: 507,
      isRetryable: true,
      details,
    });
    this.name = 'KvCacheExhaustedError';
  }
}

export class ServerOverloadedError extends ServerError {
  constructor(retryAfter?: number, details?: Record<string, unknown>) {
    super('Server overloaded', { status: 503, isRetryable: true, details });
    this.name = 'ServerOverloadedError';
  }
}

// ===== RESPONSE ERRORS =====

export class ResponseError extends VllmError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      type: 'response_error',
      message,
      isRetryable: false,
      details,
    });
    this.name = 'ResponseError';
  }
}

export class DeserializationFailedError extends ResponseError {
  constructor(message: string, cause?: Error) {
    super(`Deserialization failed: ${message}`, { cause: cause?.message });
    this.name = 'DeserializationFailedError';
  }
}

export class UnexpectedFormatError extends ResponseError {
  constructor(expected: string, received: string) {
    super(`Unexpected response format: expected ${expected}, received ${received}`, {
      expected,
      received,
    });
    this.name = 'UnexpectedFormatError';
  }
}

export class StreamInterruptedError extends ResponseError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(`Stream interrupted: ${message}`, details);
    this.name = 'StreamInterruptedError';
  }
}

export class MalformedSseError extends ResponseError {
  constructor(message: string, rawData?: string) {
    super(`Malformed SSE: ${message}`, { rawData });
    this.name = 'MalformedSseError';
  }
}

// ===== TIMEOUT ERRORS =====

export class TimeoutError extends VllmError {
  constructor(
    message: string,
    options?: { timeoutMs?: number; isRetryable?: boolean; details?: Record<string, unknown> }
  ) {
    super({
      type: 'timeout_error',
      message,
      status: 408,
      isRetryable: options?.isRetryable ?? true,
      details: { ...options?.details, timeoutMs: options?.timeoutMs },
    });
    this.name = 'TimeoutError';
  }
}

export class ConnectionTimeoutError extends TimeoutError {
  constructor(timeoutMs: number, server?: string) {
    super(`Connection timeout after ${timeoutMs}ms`, {
      timeoutMs,
      isRetryable: true,
      details: { server },
    });
    this.name = 'ConnectionTimeoutError';
  }
}

export class ReadTimeoutError extends TimeoutError {
  constructor(timeoutMs: number) {
    super(`Read timeout after ${timeoutMs}ms`, { timeoutMs, isRetryable: true });
    this.name = 'ReadTimeoutError';
  }
}

export class GenerationTimeoutError extends TimeoutError {
  constructor(timeoutMs: number, tokensGenerated?: number) {
    super(`Generation timeout after ${timeoutMs}ms`, {
      timeoutMs,
      isRetryable: true,
      details: { tokensGenerated },
    });
    this.name = 'GenerationTimeoutError';
  }
}

// ===== RATE LIMIT ERRORS =====

export class RateLimitError extends VllmError {
  constructor(
    message: string,
    options?: { retryAfter?: number; details?: Record<string, unknown> }
  ) {
    super({
      type: 'rate_limit_error',
      message,
      status: 429,
      retryAfter: options?.retryAfter,
      isRetryable: true,
      details: options?.details,
    });
    this.name = 'RateLimitError';
  }
}

export class QueueFullError extends RateLimitError {
  constructor(queueDepth: number, maxDepth: number) {
    super(`Queue full: ${queueDepth}/${maxDepth}`, {
      details: { queueDepth, maxDepth },
    });
    this.name = 'QueueFullError';
  }
}

export class ConcurrencyExceededError extends RateLimitError {
  constructor(current: number, max: number) {
    super(`Concurrency exceeded: ${current}/${max}`, {
      details: { current, max },
    });
    this.name = 'ConcurrencyExceededError';
  }
}

// ===== CIRCUIT BREAKER ERRORS =====

export class CircuitOpenError extends VllmError {
  constructor(server: string, timeUntilHalfOpen?: number) {
    super({
      type: 'circuit_open_error',
      message: `Circuit breaker is open for server: ${server}`,
      isRetryable: false,
      details: { server, timeUntilHalfOpen },
    });
    this.name = 'CircuitOpenError';
  }
}

// ===== ERROR FACTORY FUNCTIONS =====

export function createErrorFromHttpStatus(
  status: number,
  message: string,
  details?: Record<string, unknown>
): VllmError {
  switch (status) {
    case 400:
      return new InvalidParametersError(message, details);
    case 404:
      return new InvalidModelError(details?.['model'] as string ?? 'unknown');
    case 408:
      return new TimeoutError(message, { details });
    case 422:
      return new InvalidParametersError(message, details);
    case 429:
      return new RateLimitError(message, { details });
    case 500:
      return new InternalServerError(message, details);
    case 503:
      return new ServerOverloadedError(undefined, details);
    case 507:
      return new OutOfMemoryError(details);
    default:
      return new ServerError(message, { status, details });
  }
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof VllmError) {
    return error.isRetryable;
  }
  return false;
}
