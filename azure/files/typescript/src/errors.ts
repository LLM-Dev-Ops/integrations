/**
 * Azure Files Error Types
 *
 * Comprehensive error hierarchy following the SPARC specification
 * for Azure Files integration.
 */

/**
 * Base Azure Files error class.
 */
export class AzureFilesError extends Error {
  public readonly code: string;
  public readonly requestId?: string;
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: string,
    options?: { requestId?: string; retryable?: boolean }
  ) {
    super(message);
    this.name = "AzureFilesError";
    this.code = code;
    this.requestId = options?.requestId;
    this.retryable = options?.retryable ?? false;
    Object.setPrototypeOf(this, AzureFilesError.prototype);
  }

  /**
   * Get retry-after hint in milliseconds if available.
   */
  get retryAfter(): number | undefined {
    return undefined;
  }

  /**
   * HTTP status code if applicable.
   */
  get statusCode(): number | undefined {
    return undefined;
  }
}

/**
 * Configuration error.
 */
export class ConfigurationError extends AzureFilesError {
  constructor(
    message: string,
    code:
      | "InvalidAccountName"
      | "InvalidShareName"
      | "InvalidPath"
      | "MissingCredentials"
      | "InvalidConfig" = "InvalidConfig"
  ) {
    super(message, `Configuration.${code}`);
    this.name = "ConfigurationError";
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * Authentication error.
 */
export class AuthenticationError extends AzureFilesError {
  private readonly _statusCode?: number;
  private readonly _retryAfter?: number;

  constructor(
    message: string,
    code:
      | "InvalidKey"
      | "ExpiredSas"
      | "PermissionDenied"
      | "AuthorizationFailure" = "AuthorizationFailure",
    options?: { requestId?: string; statusCode?: number; retryAfter?: number }
  ) {
    super(message, `Authentication.${code}`, {
      requestId: options?.requestId,
      retryable: false,
    });
    this.name = "AuthenticationError";
    this._statusCode = options?.statusCode;
    this._retryAfter = options?.retryAfter;
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }

  override get statusCode(): number | undefined {
    return this._statusCode;
  }

  override get retryAfter(): number | undefined {
    return this._retryAfter;
  }
}

/**
 * File operation error.
 */
export class FileError extends AzureFilesError {
  public readonly share?: string;
  public readonly path?: string;
  private readonly _statusCode?: number;

  constructor(
    message: string,
    code:
      | "FileNotFound"
      | "FileAlreadyExists"
      | "FileLocked"
      | "InvalidRange"
      | "FileTooLarge"
      | "PreconditionFailed",
    options?: { share?: string; path?: string; requestId?: string; statusCode?: number }
  ) {
    super(message, `File.${code}`, {
      requestId: options?.requestId,
      retryable: code === "FileLocked",
    });
    this.name = "FileError";
    this.share = options?.share;
    this.path = options?.path;
    this._statusCode = options?.statusCode;
    Object.setPrototypeOf(this, FileError.prototype);
  }

  override get statusCode(): number | undefined {
    return this._statusCode;
  }
}

/**
 * Directory operation error.
 */
export class DirectoryError extends AzureFilesError {
  public readonly share?: string;
  public readonly path?: string;
  private readonly _statusCode?: number;

  constructor(
    message: string,
    code: "DirectoryNotFound" | "DirectoryNotEmpty" | "ParentNotFound",
    options?: { share?: string; path?: string; requestId?: string; statusCode?: number }
  ) {
    super(message, `Directory.${code}`, { requestId: options?.requestId });
    this.name = "DirectoryError";
    this.share = options?.share;
    this.path = options?.path;
    this._statusCode = options?.statusCode;
    Object.setPrototypeOf(this, DirectoryError.prototype);
  }

  override get statusCode(): number | undefined {
    return this._statusCode;
  }
}

/**
 * Lease operation error.
 */
export class LeaseError extends AzureFilesError {
  public readonly share?: string;
  public readonly path?: string;
  private readonly _statusCode?: number;

  constructor(
    message: string,
    code:
      | "LeaseNotPresent"
      | "LeaseAlreadyPresent"
      | "LeaseIdMismatch"
      | "LeaseExpired"
      | "LeaseLost",
    options?: { share?: string; path?: string; requestId?: string; statusCode?: number }
  ) {
    super(message, `Lease.${code}`, {
      requestId: options?.requestId,
      retryable: code === "LeaseLost",
    });
    this.name = "LeaseError";
    this.share = options?.share;
    this.path = options?.path;
    this._statusCode = options?.statusCode;
    Object.setPrototypeOf(this, LeaseError.prototype);
  }

  override get statusCode(): number | undefined {
    return this._statusCode;
  }
}

/**
 * Network/transport error.
 */
export class NetworkError extends AzureFilesError {
  constructor(
    message: string,
    code: "ConnectionFailed" | "Timeout" | "DnsResolutionFailed" | "TlsError",
    options?: { retryable?: boolean }
  ) {
    super(message, `Network.${code}`, {
      retryable: options?.retryable ?? (code !== "TlsError"),
    });
    this.name = "NetworkError";
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Server-side error.
 */
export class ServerError extends AzureFilesError {
  private readonly _statusCode?: number;
  private readonly _retryAfter?: number;

  constructor(
    message: string,
    code: "InternalError" | "ServiceUnavailable" | "ServerBusy" | "OperationTimedOut",
    options?: { statusCode?: number; retryAfter?: number; requestId?: string }
  ) {
    super(message, `Server.${code}`, { requestId: options?.requestId, retryable: true });
    this.name = "ServerError";
    this._statusCode = options?.statusCode;
    this._retryAfter = options?.retryAfter;
    Object.setPrototypeOf(this, ServerError.prototype);
  }

  override get statusCode(): number | undefined {
    return this._statusCode;
  }

  override get retryAfter(): number | undefined {
    return this._retryAfter;
  }
}

/**
 * Azure error response structure.
 */
export interface AzureErrorResponse {
  Code: string;
  Message: string;
}

/**
 * Parse Azure Files error from HTTP response.
 */
export function parseAzureFilesError(
  status: number,
  body: string,
  headers?: Record<string, string>,
  requestId?: string
): AzureFilesError {
  let errorCode = headers?.["x-ms-error-code"];
  let errorMessage = `HTTP ${status}`;

  // Try to parse XML error response
  if (body && body.includes("<Error>")) {
    const codeMatch = body.match(/<Code>([^<]+)<\/Code>/);
    const messageMatch = body.match(/<Message>([^<]+)<\/Message>/);
    if (codeMatch) errorCode = codeMatch[1];
    if (messageMatch) errorMessage = messageMatch[1];
  }

  // Parse retry-after header
  let retryAfter: number | undefined;
  if (headers?.["retry-after"]) {
    retryAfter = parseInt(headers["retry-after"], 10) * 1000;
  }

  // Map HTTP status codes to error types
  switch (status) {
    case 400:
      return new ConfigurationError(errorMessage, "InvalidConfig");

    case 401:
      return new AuthenticationError(errorMessage, "InvalidKey", {
        requestId,
        statusCode: status,
      });

    case 403:
      return new AuthenticationError(errorMessage, "PermissionDenied", {
        requestId,
        statusCode: status,
      });

    case 404:
      if (errorCode === "ParentNotFound") {
        return new DirectoryError(errorMessage, "ParentNotFound", {
          requestId,
          statusCode: status,
        });
      }
      if (errorCode === "ShareNotFound" || errorCode === "ResourceNotFound") {
        return new FileError(errorMessage, "FileNotFound", {
          requestId,
          statusCode: status,
        });
      }
      return new FileError(errorMessage, "FileNotFound", {
        requestId,
        statusCode: status,
      });

    case 409:
      if (errorCode === "LeaseAlreadyPresent") {
        return new LeaseError(errorMessage, "LeaseAlreadyPresent", {
          requestId,
          statusCode: status,
        });
      }
      if (errorCode === "LeaseNotPresent") {
        return new LeaseError(errorMessage, "LeaseNotPresent", {
          requestId,
          statusCode: status,
        });
      }
      if (errorCode === "DirectoryNotEmpty") {
        return new DirectoryError(errorMessage, "DirectoryNotEmpty", {
          requestId,
          statusCode: status,
        });
      }
      return new FileError(errorMessage, "FileLocked", {
        requestId,
        statusCode: status,
      });

    case 412:
      if (errorCode === "LeaseIdMismatch" || errorCode === "LeaseIdMissing") {
        return new LeaseError(errorMessage, "LeaseIdMismatch", {
          requestId,
          statusCode: status,
        });
      }
      return new FileError(errorMessage, "PreconditionFailed", {
        requestId,
        statusCode: status,
      });

    case 416:
      return new FileError(errorMessage, "InvalidRange", {
        requestId,
        statusCode: status,
      });

    case 429:
      return new ServerError(errorMessage, "ServerBusy", {
        requestId,
        statusCode: status,
        retryAfter,
      });

    case 500:
      return new ServerError(errorMessage, "InternalError", {
        requestId,
        statusCode: status,
      });

    case 503:
      return new ServerError(errorMessage, "ServiceUnavailable", {
        requestId,
        statusCode: status,
        retryAfter,
      });

    default:
      if (status >= 500) {
        return new ServerError(errorMessage, "InternalError", {
          requestId,
          statusCode: status,
        });
      }
      return new AzureFilesError(errorMessage, `HTTP_${status}`, { requestId });
  }
}

/**
 * Check if an error is retryable.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof AzureFilesError) {
    return error.retryable;
  }
  return false;
}
