/**
 * Pub/Sub Error Types
 *
 * Comprehensive error hierarchy following the SPARC specification.
 */

/**
 * Base Pub/Sub error class.
 */
export class PubSubError extends Error {
  public readonly code: string;
  public readonly requestId?: string;
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: string,
    options?: { requestId?: string; retryable?: boolean }
  ) {
    super(message);
    this.name = "PubSubError";
    this.code = code;
    this.requestId = options?.requestId;
    this.retryable = options?.retryable ?? false;
    Object.setPrototypeOf(this, PubSubError.prototype);
  }

  /**
   * Get retry-after hint in milliseconds if available.
   */
  get retryAfter(): number | undefined {
    return undefined;
  }

  /**
   * gRPC status code if applicable.
   */
  get statusCode(): number | undefined {
    return undefined;
  }
}

/**
 * Configuration error.
 */
export class ConfigurationError extends PubSubError {
  constructor(
    message: string,
    code:
      | "InvalidTopic"
      | "InvalidSubscription"
      | "InvalidCredentials"
      | "MissingProject"
      | "InvalidConfig"
      | "InvalidMessage" = "InvalidConfig"
  ) {
    super(message, `Configuration.${code}`);
    this.name = "ConfigurationError";
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * Authentication error.
 */
export class AuthenticationError extends PubSubError {
  private readonly _statusCode?: number;
  private readonly _retryAfter?: number;

  constructor(
    message: string,
    code:
      | "TokenExpired"
      | "TokenRefreshFailed"
      | "InvalidServiceAccount"
      | "PermissionDenied"
      | "InvalidCredentials" = "InvalidCredentials",
    options?: { requestId?: string; statusCode?: number; retryAfter?: number }
  ) {
    super(message, `Authentication.${code}`, {
      requestId: options?.requestId,
      retryable: code === "TokenExpired",
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
 * Topic-related error.
 */
export class TopicError extends PubSubError {
  public readonly topic?: string;
  private readonly _statusCode?: number;

  constructor(
    message: string,
    code: "NotFound" | "PermissionDenied" | "AlreadyExists",
    options?: { topic?: string; requestId?: string; statusCode?: number }
  ) {
    super(message, `Topic.${code}`, { requestId: options?.requestId });
    this.name = "TopicError";
    this.topic = options?.topic;
    this._statusCode = options?.statusCode;
    Object.setPrototypeOf(this, TopicError.prototype);
  }

  override get statusCode(): number | undefined {
    return this._statusCode;
  }
}

/**
 * Subscription-related error.
 */
export class SubscriptionError extends PubSubError {
  public readonly subscription?: string;
  private readonly _statusCode?: number;

  constructor(
    message: string,
    code: "NotFound" | "PermissionDenied" | "AlreadyExists",
    options?: { subscription?: string; requestId?: string; statusCode?: number }
  ) {
    super(message, `Subscription.${code}`, { requestId: options?.requestId });
    this.name = "SubscriptionError";
    this.subscription = options?.subscription;
    this._statusCode = options?.statusCode;
    Object.setPrototypeOf(this, SubscriptionError.prototype);
  }

  override get statusCode(): number | undefined {
    return this._statusCode;
  }
}

/**
 * Message-related error.
 */
export class MessageError extends PubSubError {
  public readonly messageId?: string;

  constructor(
    message: string,
    code:
      | "TooLarge"
      | "InvalidData"
      | "TooManyAttributes"
      | "InvalidOrderingKey"
      | "OrderingKeyPaused",
    options?: { messageId?: string; requestId?: string; retryable?: boolean }
  ) {
    super(message, `Message.${code}`, {
      requestId: options?.requestId,
      retryable: options?.retryable ?? false,
    });
    this.name = "MessageError";
    this.messageId = options?.messageId;
    Object.setPrototypeOf(this, MessageError.prototype);
  }
}

/**
 * Acknowledgment error.
 */
export class AcknowledgmentError extends PubSubError {
  public readonly ackIds?: string[];

  constructor(
    message: string,
    code: "InvalidAckId" | "AckDeadlineExpired" | "AckFailed",
    options?: { ackIds?: string[]; requestId?: string; retryable?: boolean }
  ) {
    super(message, `Acknowledgment.${code}`, {
      requestId: options?.requestId,
      retryable: options?.retryable ?? (code === "AckFailed"),
    });
    this.name = "AcknowledgmentError";
    this.ackIds = options?.ackIds;
    Object.setPrototypeOf(this, AcknowledgmentError.prototype);
  }
}

/**
 * Network/transport error.
 */
export class NetworkError extends PubSubError {
  constructor(
    message: string,
    code: "ConnectionFailed" | "Timeout" | "DnsResolutionFailed" | "TlsError" | "StreamClosed",
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
export class ServerError extends PubSubError {
  private readonly _statusCode?: number;
  private readonly _retryAfter?: number;

  constructor(
    message: string,
    code: "InternalError" | "ServiceUnavailable" | "RateLimited" | "QuotaExceeded" | "DeadlineExceeded",
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
 * Simulation error.
 */
export class SimulationError extends PubSubError {
  public readonly cause?: SimulationErrorCause;

  constructor(
    message: string,
    cause: SimulationErrorCause = "NoRecordingFound"
  ) {
    super(message, `Simulation.${cause}`);
    this.name = "SimulationError";
    this.cause = cause;
    Object.setPrototypeOf(this, SimulationError.prototype);
  }
}

/**
 * Simulation error causes.
 */
export type SimulationErrorCause =
  | "NoRecordingFound"
  | "RequestMismatch"
  | "CorruptedRecording"
  | "StorageError";

/**
 * gRPC status codes.
 */
export enum GrpcStatus {
  OK = 0,
  CANCELLED = 1,
  UNKNOWN = 2,
  INVALID_ARGUMENT = 3,
  DEADLINE_EXCEEDED = 4,
  NOT_FOUND = 5,
  ALREADY_EXISTS = 6,
  PERMISSION_DENIED = 7,
  RESOURCE_EXHAUSTED = 8,
  FAILED_PRECONDITION = 9,
  ABORTED = 10,
  OUT_OF_RANGE = 11,
  UNIMPLEMENTED = 12,
  INTERNAL = 13,
  UNAVAILABLE = 14,
  DATA_LOSS = 15,
  UNAUTHENTICATED = 16,
}

/**
 * Parse error from gRPC status.
 */
export function parseGrpcError(
  status: GrpcStatus,
  message: string,
  requestId?: string
): PubSubError {
  switch (status) {
    case GrpcStatus.OK:
      return new PubSubError(message, "OK", { requestId });

    case GrpcStatus.CANCELLED:
      return new NetworkError("Request cancelled", "StreamClosed");

    case GrpcStatus.INVALID_ARGUMENT:
      return new ConfigurationError(message, "InvalidConfig");

    case GrpcStatus.DEADLINE_EXCEEDED:
      return new ServerError(message, "DeadlineExceeded", { requestId });

    case GrpcStatus.NOT_FOUND:
      // Could be topic or subscription - caller should specify
      return new TopicError(message, "NotFound", { requestId });

    case GrpcStatus.ALREADY_EXISTS:
      return new TopicError(message, "AlreadyExists", { requestId });

    case GrpcStatus.PERMISSION_DENIED:
      return new AuthenticationError(message, "PermissionDenied", { requestId });

    case GrpcStatus.RESOURCE_EXHAUSTED:
      return new ServerError(message, "QuotaExceeded", { requestId });

    case GrpcStatus.FAILED_PRECONDITION:
      return new ConfigurationError(message, "InvalidConfig");

    case GrpcStatus.ABORTED:
      return new ServerError(message, "InternalError", { requestId });

    case GrpcStatus.UNAVAILABLE:
      return new ServerError(message, "ServiceUnavailable", { requestId });

    case GrpcStatus.UNAUTHENTICATED:
      return new AuthenticationError(message, "TokenExpired", { requestId });

    case GrpcStatus.INTERNAL:
    case GrpcStatus.UNKNOWN:
    case GrpcStatus.DATA_LOSS:
    default:
      return new ServerError(message, "InternalError", { requestId });
  }
}
