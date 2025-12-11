/**
 * Error types for the SMTP client.
 */

/**
 * SMTP error kinds categorizing different failure modes.
 */
export enum SmtpErrorKind {
  // Connection errors
  DnsResolution = 'dns_resolution',
  ConnectionRefused = 'connection_refused',
  ConnectionTimeout = 'connection_timeout',
  ConnectionReset = 'connection_reset',
  NetworkUnreachable = 'network_unreachable',

  // TLS errors
  TlsHandshakeFailed = 'tls_handshake_failed',
  CertificateInvalid = 'certificate_invalid',
  CertificateExpired = 'certificate_expired',
  CertificateUntrusted = 'certificate_untrusted',
  TlsVersionMismatch = 'tls_version_mismatch',
  StarttlsNotSupported = 'starttls_not_supported',

  // Authentication errors
  CredentialsInvalid = 'credentials_invalid',
  CredentialsExpired = 'credentials_expired',
  AuthMethodNotSupported = 'auth_method_not_supported',
  AuthenticationRequired = 'authentication_required',
  TooManyAuthAttempts = 'too_many_auth_attempts',

  // Protocol errors
  InvalidResponse = 'invalid_response',
  UnexpectedResponse = 'unexpected_response',
  CommandSequenceError = 'command_sequence_error',
  ServerShutdown = 'server_shutdown',
  CapabilityMismatch = 'capability_mismatch',

  // Message errors
  InvalidFromAddress = 'invalid_from_address',
  InvalidRecipientAddress = 'invalid_recipient_address',
  MessageTooLarge = 'message_too_large',
  InvalidHeader = 'invalid_header',
  EncodingFailed = 'encoding_failed',
  AttachmentError = 'attachment_error',

  // Timeout errors
  ConnectTimeout = 'connect_timeout',
  ReadTimeout = 'read_timeout',
  WriteTimeout = 'write_timeout',
  CommandTimeout = 'command_timeout',

  // Rate limit errors
  LocalRateLimitExceeded = 'local_rate_limit_exceeded',
  ServerRateLimitExceeded = 'server_rate_limit_exceeded',

  // Circuit breaker
  CircuitBreakerOpen = 'circuit_breaker_open',

  // Pool errors
  PoolExhausted = 'pool_exhausted',
  AcquireTimeout = 'acquire_timeout',
  ConnectionUnhealthy = 'connection_unhealthy',

  // Configuration errors
  ConfigurationInvalid = 'configuration_invalid',

  // Generic
  Unknown = 'unknown',
}

/**
 * Error severity levels.
 */
export enum ErrorSeverity {
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
  Critical = 'critical',
}

/**
 * Enhanced SMTP status code (RFC 2034).
 */
export interface EnhancedStatusCode {
  /** Class (2=success, 4=temporary, 5=permanent). */
  class: number;
  /** Subject. */
  subject: number;
  /** Detail code. */
  detail: number;
}

/**
 * Parses an enhanced status code from a string.
 */
export function parseEnhancedCode(s: string): EnhancedStatusCode | undefined {
  const parts = s.split('.');
  if (parts.length !== 3) {
    return undefined;
  }

  const classNum = parseInt(parts[0] ?? '', 10);
  const subject = parseInt(parts[1] ?? '', 10);
  const detail = parseInt(parts[2] ?? '', 10);

  if (isNaN(classNum) || isNaN(subject) || isNaN(detail)) {
    return undefined;
  }

  return { class: classNum, subject, detail };
}

/**
 * SMTP error with detailed information.
 */
export class SmtpError extends Error {
  /** Error kind. */
  readonly kind: SmtpErrorKind;
  /** SMTP status code if available. */
  readonly smtpCode?: number;
  /** Enhanced status code if available. */
  readonly enhancedCode?: EnhancedStatusCode;
  /** Underlying cause. */
  readonly cause?: Error;

  constructor(
    kind: SmtpErrorKind,
    message: string,
    options?: {
      smtpCode?: number;
      enhancedCode?: EnhancedStatusCode;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'SmtpError';
    this.kind = kind;
    this.smtpCode = options?.smtpCode;
    this.enhancedCode = options?.enhancedCode;
    this.cause = options?.cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SmtpError);
    }
  }

  /**
   * Returns true if this error is retryable.
   */
  isRetryable(): boolean {
    // Check SMTP code first
    if (this.smtpCode !== undefined) {
      return [421, 450, 451, 452].includes(this.smtpCode);
    }

    // Fall back to kind-based detection
    return [
      SmtpErrorKind.ConnectionTimeout,
      SmtpErrorKind.ConnectionReset,
      SmtpErrorKind.ReadTimeout,
      SmtpErrorKind.WriteTimeout,
      SmtpErrorKind.CommandTimeout,
      SmtpErrorKind.ServerShutdown,
      SmtpErrorKind.PoolExhausted,
      SmtpErrorKind.AcquireTimeout,
      SmtpErrorKind.ConnectionUnhealthy,
      SmtpErrorKind.LocalRateLimitExceeded,
    ].includes(this.kind);
  }

  /**
   * Returns the error severity.
   */
  severity(): ErrorSeverity {
    switch (this.kind) {
      case SmtpErrorKind.CredentialsInvalid:
      case SmtpErrorKind.CertificateInvalid:
      case SmtpErrorKind.CertificateExpired:
      case SmtpErrorKind.CertificateUntrusted:
      case SmtpErrorKind.ConfigurationInvalid:
        return ErrorSeverity.Critical;

      case SmtpErrorKind.ConnectionTimeout:
      case SmtpErrorKind.ConnectionReset:
      case SmtpErrorKind.ReadTimeout:
      case SmtpErrorKind.WriteTimeout:
      case SmtpErrorKind.CommandTimeout:
      case SmtpErrorKind.ServerShutdown:
      case SmtpErrorKind.PoolExhausted:
      case SmtpErrorKind.AcquireTimeout:
      case SmtpErrorKind.ConnectionUnhealthy:
      case SmtpErrorKind.LocalRateLimitExceeded:
      case SmtpErrorKind.ServerRateLimitExceeded:
      case SmtpErrorKind.CircuitBreakerOpen:
        return ErrorSeverity.Warning;

      case SmtpErrorKind.CredentialsExpired:
      case SmtpErrorKind.TooManyAuthAttempts:
        return ErrorSeverity.Info;

      default:
        return ErrorSeverity.Error;
    }
  }

  /**
   * Creates a connection error.
   */
  static connection(message: string): SmtpError {
    return new SmtpError(SmtpErrorKind.ConnectionRefused, message);
  }

  /**
   * Creates a timeout error.
   */
  static timeout(kind: SmtpErrorKind, message: string): SmtpError {
    return new SmtpError(kind, message);
  }

  /**
   * Creates a TLS error.
   */
  static tls(message: string): SmtpError {
    return new SmtpError(SmtpErrorKind.TlsHandshakeFailed, message);
  }

  /**
   * Creates an authentication error.
   */
  static authentication(message: string): SmtpError {
    return new SmtpError(SmtpErrorKind.CredentialsInvalid, message);
  }

  /**
   * Creates a configuration error.
   */
  static configuration(message: string): SmtpError {
    return new SmtpError(SmtpErrorKind.ConfigurationInvalid, message);
  }

  /**
   * Creates a circuit breaker open error.
   */
  static circuitOpen(): SmtpError {
    return new SmtpError(
      SmtpErrorKind.CircuitBreakerOpen,
      'Circuit breaker is open, service temporarily unavailable'
    );
  }

  /**
   * Creates a rate limit error.
   */
  static rateLimit(message: string): SmtpError {
    return new SmtpError(SmtpErrorKind.LocalRateLimitExceeded, message);
  }

  /**
   * Creates an error from an SMTP response.
   */
  static fromSmtpResponse(code: number, message: string): SmtpError {
    let kind: SmtpErrorKind;

    switch (code) {
      case 421:
        kind = SmtpErrorKind.ServerShutdown;
        break;
      case 450:
      case 451:
      case 452:
        kind = SmtpErrorKind.UnexpectedResponse;
        break;
      case 500:
      case 501:
      case 502:
      case 503:
        kind = SmtpErrorKind.InvalidResponse;
        break;
      case 530:
        kind = SmtpErrorKind.AuthenticationRequired;
        break;
      case 535:
        kind = SmtpErrorKind.CredentialsInvalid;
        break;
      case 550:
        kind = SmtpErrorKind.InvalidRecipientAddress;
        break;
      case 552:
        kind = SmtpErrorKind.MessageTooLarge;
        break;
      case 553:
        kind = SmtpErrorKind.InvalidFromAddress;
        break;
      default:
        kind = SmtpErrorKind.UnexpectedResponse;
    }

    return new SmtpError(kind, message, { smtpCode: code });
  }

  /**
   * Converts to JSON.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      kind: this.kind,
      message: this.message,
      smtpCode: this.smtpCode,
      enhancedCode: this.enhancedCode,
      severity: this.severity(),
    };
  }
}

/**
 * Type guard for SmtpError.
 */
export function isSmtpError(error: unknown): error is SmtpError {
  return error instanceof SmtpError;
}

/**
 * Checks if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (isSmtpError(error)) {
    return error.isRetryable();
  }
  return false;
}
