/**
 * Connection-related errors for Datadog APM.
 *
 * Errors related to agent connectivity, timeouts, and socket issues.
 */

import { DatadogAPMError } from './base';

/**
 * Base error for connection-related issues
 */
export class ConnectionError extends DatadogAPMError {
  constructor(
    message: string,
    options?: {
      isRetryable?: boolean;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super({
      category: 'connection',
      message,
      isRetryable: options?.isRetryable ?? true,
      details: options?.details,
      cause: options?.cause,
    });
    this.name = 'ConnectionError';
  }
}

/**
 * Error thrown when the Datadog agent is unreachable
 */
export class AgentUnreachableError extends ConnectionError {
  constructor(
    host: string,
    port: number,
    options?: { cause?: Error; details?: Record<string, unknown> }
  ) {
    super(`Datadog agent unreachable at ${host}:${port}`, {
      isRetryable: true,
      details: { host, port, ...options?.details },
      cause: options?.cause,
    });
    this.name = 'AgentUnreachableError';
  }
}

/**
 * Error thrown when connection to agent times out
 */
export class AgentTimeoutError extends ConnectionError {
  constructor(
    host: string,
    port: number,
    timeoutMs: number,
    options?: { cause?: Error; details?: Record<string, unknown> }
  ) {
    super(
      `Connection to Datadog agent at ${host}:${port} timed out after ${timeoutMs}ms`,
      {
        isRetryable: true,
        details: { host, port, timeoutMs, ...options?.details },
        cause: options?.cause,
      }
    );
    this.name = 'AgentTimeoutError';
  }
}

/**
 * Error thrown when there's a socket-level error
 */
export class SocketError extends ConnectionError {
  constructor(
    message: string,
    options?: { cause?: Error; details?: Record<string, unknown> }
  ) {
    super(`Socket error: ${message}`, {
      isRetryable: true,
      details: options?.details,
      cause: options?.cause,
    });
    this.name = 'SocketError';
  }

  /**
   * Create a SocketError for connection refused
   */
  static connectionRefused(
    host: string,
    port: number,
    cause?: Error
  ): SocketError {
    return new SocketError(`Connection refused to ${host}:${port}`, {
      details: { host, port },
      cause,
    });
  }

  /**
   * Create a SocketError for connection reset
   */
  static connectionReset(
    host: string,
    port: number,
    cause?: Error
  ): SocketError {
    return new SocketError(`Connection reset by peer at ${host}:${port}`, {
      details: { host, port },
      cause,
    });
  }

  /**
   * Create a SocketError for DNS resolution failure
   */
  static dnsResolutionFailed(host: string, cause?: Error): SocketError {
    return new SocketError(`Failed to resolve DNS for host: ${host}`, {
      details: { host },
      cause,
    });
  }
}
