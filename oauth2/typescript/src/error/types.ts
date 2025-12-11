/**
 * OAuth2 Error Types
 *
 * Error class hierarchy for OAuth2 operations.
 */

/**
 * Base OAuth2 error class.
 */
export class OAuth2Error extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly requestId?: string;

  constructor(
    message: string,
    code: string,
    options?: { retryable?: boolean; requestId?: string }
  ) {
    super(message);
    this.name = "OAuth2Error";
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.requestId = options?.requestId;
    Object.setPrototypeOf(this, OAuth2Error.prototype);
  }
}

/**
 * Configuration error - invalid setup or parameters.
 */
export class ConfigurationError extends OAuth2Error {
  constructor(
    message: string,
    code:
      | "InvalidConfig"
      | "MissingRequired"
      | "InvalidEndpoint"
      | "DiscoveryFailed" = "InvalidConfig"
  ) {
    super(message, `Configuration.${code}`);
    this.name = "ConfigurationError";
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * Authorization flow error.
 */
export class AuthorizationError extends OAuth2Error {
  public readonly errorCode?: string;
  public readonly errorUri?: string;

  constructor(
    message: string,
    code:
      | "StateMismatch"
      | "StateExpired"
      | "AccessDenied"
      | "InvalidRequest"
      | "InvalidScope"
      | "ServerError"
      | "TemporarilyUnavailable"
      | "DeviceCodeExpired"
      | "SlowDown",
    options?: { errorCode?: string; errorUri?: string; requestId?: string }
  ) {
    super(message, `Authorization.${code}`, { requestId: options?.requestId });
    this.name = "AuthorizationError";
    this.errorCode = options?.errorCode;
    this.errorUri = options?.errorUri;
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

/**
 * Token-related error.
 */
export class TokenError extends OAuth2Error {
  public readonly key?: string;

  constructor(
    message: string,
    code:
      | "NotFound"
      | "Expired"
      | "RefreshFailed"
      | "NoRefreshToken"
      | "InvalidToken"
      | "StorageFailed",
    options?: { key?: string; requestId?: string; retryable?: boolean }
  ) {
    super(message, `Token.${code}`, {
      retryable: options?.retryable,
      requestId: options?.requestId,
    });
    this.name = "TokenError";
    this.key = options?.key;
    Object.setPrototypeOf(this, TokenError.prototype);
  }
}

/**
 * Provider (OAuth2 server) error.
 */
export class ProviderError extends OAuth2Error {
  public readonly errorCode?: string;
  public readonly errorDescription?: string;

  constructor(
    message: string,
    code:
      | "InvalidClient"
      | "InvalidGrant"
      | "InvalidRequest"
      | "InvalidScope"
      | "UnauthorizedClient"
      | "UnsupportedGrantType"
      | "ServerError"
      | "TemporarilyUnavailable",
    options?: {
      errorCode?: string;
      errorDescription?: string;
      requestId?: string;
      retryable?: boolean;
    }
  ) {
    const retryable =
      options?.retryable ??
      (code === "ServerError" || code === "TemporarilyUnavailable");
    super(message, `Provider.${code}`, {
      retryable,
      requestId: options?.requestId,
    });
    this.name = "ProviderError";
    this.errorCode = options?.errorCode;
    this.errorDescription = options?.errorDescription;
    Object.setPrototypeOf(this, ProviderError.prototype);
  }
}

/**
 * Network/transport error.
 */
export class NetworkError extends OAuth2Error {
  public readonly retryAfter?: number;

  constructor(
    message: string,
    code:
      | "ConnectionFailed"
      | "Timeout"
      | "DnsResolutionFailed"
      | "TlsError"
      | "RateLimited"
      | "CircuitOpen",
    options?: { retryAfter?: number; retryable?: boolean }
  ) {
    const retryable =
      options?.retryable ??
      (code !== "TlsError" && code !== "CircuitOpen");
    super(message, `Network.${code}`, { retryable });
    this.name = "NetworkError";
    this.retryAfter = options?.retryAfter;
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Protocol/response parsing error.
 */
export class ProtocolError extends OAuth2Error {
  constructor(
    message: string,
    code:
      | "InvalidResponse"
      | "MissingField"
      | "UnexpectedRedirect"
      | "ResponseTooLarge" = "InvalidResponse"
  ) {
    super(message, `Protocol.${code}`);
    this.name = "ProtocolError";
    Object.setPrototypeOf(this, ProtocolError.prototype);
  }
}

/**
 * Storage error.
 */
export class StorageError extends OAuth2Error {
  constructor(
    message: string,
    code:
      | "ReadFailed"
      | "WriteFailed"
      | "DeleteFailed"
      | "CorruptedData"
      | "PermissionDenied"
      | "EncryptionFailed"
      | "DecryptionFailed" = "ReadFailed"
  ) {
    super(message, `Storage.${code}`);
    this.name = "StorageError";
    Object.setPrototypeOf(this, StorageError.prototype);
  }
}

/**
 * Check if error is retryable.
 */
export function isRetryable(error: OAuth2Error): boolean {
  return error.retryable;
}

/**
 * Check if error requires re-authentication.
 */
export function needsReauth(error: OAuth2Error): boolean {
  return (
    error instanceof TokenError &&
    (error.code === "Token.Expired" ||
      error.code === "Token.NoRefreshToken" ||
      error.code === "Token.RefreshFailed")
  ) || (
    error instanceof ProviderError &&
    error.code === "Provider.InvalidGrant"
  ) || (
    error instanceof AuthorizationError &&
    error.code === "Authorization.AccessDenied"
  );
}

/**
 * Get user-friendly error message.
 */
export function getUserMessage(error: OAuth2Error): string {
  if (error instanceof TokenError) {
    switch (error.code) {
      case "Token.Expired":
        return "Your session has expired. Please sign in again.";
      case "Token.NoRefreshToken":
        return "Your session cannot be renewed. Please sign in again.";
      case "Token.RefreshFailed":
        return "Failed to refresh your session. Please sign in again.";
      default:
        return "An authentication error occurred.";
    }
  }

  if (error instanceof AuthorizationError) {
    switch (error.code) {
      case "Authorization.AccessDenied":
        return "Access was denied. Please try signing in again and grant the requested permissions.";
      case "Authorization.StateMismatch":
        return "Security validation failed. Please restart the sign-in process.";
      default:
        return "Authorization failed.";
    }
  }

  if (error instanceof NetworkError) {
    switch (error.code) {
      case "Network.Timeout":
        return "The request timed out. Please check your connection and try again.";
      case "Network.RateLimited":
        return "Too many requests. Please wait a moment and try again.";
      default:
        return "A network error occurred. Please try again.";
    }
  }

  if (error instanceof ProviderError) {
    switch (error.code) {
      case "Provider.ServerError":
      case "Provider.TemporarilyUnavailable":
        return "The authentication service is temporarily unavailable. Please try again later.";
      default:
        return "Authentication failed.";
    }
  }

  return "An authentication error occurred. Please try again.";
}
