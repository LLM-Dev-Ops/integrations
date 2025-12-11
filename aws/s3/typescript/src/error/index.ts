/**
 * AWS S3 Error Types
 *
 * Comprehensive error hierarchy following the SPARC specification.
 */

/**
 * Base S3 error class.
 */
export class S3Error extends Error {
  public readonly code: string;
  public readonly requestId?: string;
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: string,
    options?: { requestId?: string; retryable?: boolean }
  ) {
    super(message);
    this.name = "S3Error";
    this.code = code;
    this.requestId = options?.requestId;
    this.retryable = options?.retryable ?? false;
    Object.setPrototypeOf(this, S3Error.prototype);
  }
}

/**
 * Configuration error.
 */
export class ConfigurationError extends S3Error {
  constructor(message: string) {
    super(message, "ConfigurationError");
    this.name = "ConfigurationError";
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * Credentials error.
 */
export class CredentialsError extends S3Error {
  constructor(
    message: string,
    code:
      | "NotFound"
      | "Expired"
      | "Invalid"
      | "RefreshFailed"
      | "ImdsError"
      | "ProfileError" = "NotFound"
  ) {
    super(message, `Credentials.${code}`);
    this.name = "CredentialsError";
    Object.setPrototypeOf(this, CredentialsError.prototype);
  }
}

/**
 * Signing error.
 */
export class SigningError extends S3Error {
  constructor(message: string) {
    super(message, "SigningError");
    this.name = "SigningError";
    Object.setPrototypeOf(this, SigningError.prototype);
  }
}

/**
 * Request validation error.
 */
export class RequestError extends S3Error {
  constructor(message: string, code: "Validation" | "InvalidParameter" = "Validation") {
    super(message, `Request.${code}`);
    this.name = "RequestError";
    Object.setPrototypeOf(this, RequestError.prototype);
  }
}

/**
 * Bucket operation error.
 */
export class BucketError extends S3Error {
  public readonly bucket?: string;

  constructor(
    message: string,
    code: "NotFound" | "AlreadyExists" | "AlreadyOwnedByYou" | "NotEmpty",
    options?: { bucket?: string; requestId?: string }
  ) {
    super(message, `Bucket.${code}`, { requestId: options?.requestId });
    this.name = "BucketError";
    this.bucket = options?.bucket;
    Object.setPrototypeOf(this, BucketError.prototype);
  }
}

/**
 * Object operation error.
 */
export class ObjectError extends S3Error {
  public readonly key?: string;

  constructor(
    message: string,
    code: "NotFound" | "PreconditionFailed" | "NotModified" | "InvalidRange",
    options?: { key?: string; requestId?: string }
  ) {
    super(message, `Object.${code}`, { requestId: options?.requestId });
    this.name = "ObjectError";
    this.key = options?.key;
    Object.setPrototypeOf(this, ObjectError.prototype);
  }
}

/**
 * Multipart upload error.
 */
export class MultipartError extends S3Error {
  public readonly uploadId?: string;

  constructor(
    message: string,
    code:
      | "UploadNotFound"
      | "InvalidPart"
      | "InvalidPartOrder"
      | "EntityTooSmall"
      | "EntityTooLarge",
    options?: { uploadId?: string; requestId?: string }
  ) {
    super(message, `Multipart.${code}`, { requestId: options?.requestId });
    this.name = "MultipartError";
    this.uploadId = options?.uploadId;
    Object.setPrototypeOf(this, MultipartError.prototype);
  }
}

/**
 * Access/authorization error.
 */
export class AccessError extends S3Error {
  constructor(
    message: string,
    code: "AccessDenied" | "InvalidAccessKeyId" | "SignatureDoesNotMatch" | "ExpiredToken",
    options?: { requestId?: string }
  ) {
    super(message, `Access.${code}`, { requestId: options?.requestId });
    this.name = "AccessError";
    Object.setPrototypeOf(this, AccessError.prototype);
  }
}

/**
 * Network/transport error.
 */
export class NetworkError extends S3Error {
  constructor(
    message: string,
    code: "ConnectionFailed" | "Timeout" | "DnsResolutionFailed" | "ConnectionReset",
    options?: { retryable?: boolean }
  ) {
    super(message, `Network.${code}`, { retryable: options?.retryable ?? true });
    this.name = "NetworkError";
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Server-side error.
 */
export class ServerError extends S3Error {
  public readonly retryAfter?: number;

  constructor(
    message: string,
    code: "InternalError" | "ServiceUnavailable" | "SlowDown" | "BadGateway",
    options?: { retryAfter?: number; requestId?: string }
  ) {
    super(message, `Server.${code}`, { requestId: options?.requestId, retryable: true });
    this.name = "ServerError";
    this.retryAfter = options?.retryAfter;
    Object.setPrototypeOf(this, ServerError.prototype);
  }
}

/**
 * Response parsing error.
 */
export class ResponseError extends S3Error {
  constructor(message: string, code: "InvalidResponse" | "XmlParseError" = "InvalidResponse") {
    super(message, `Response.${code}`);
    this.name = "ResponseError";
    Object.setPrototypeOf(this, ResponseError.prototype);
  }
}

/**
 * Transfer/streaming error.
 */
export class TransferError extends S3Error {
  constructor(
    message: string,
    code: "StreamInterrupted" | "ChecksumMismatch" | "PartUploadFailed",
    options?: { retryable?: boolean }
  ) {
    super(message, `Transfer.${code}`, { retryable: options?.retryable ?? true });
    this.name = "TransferError";
    Object.setPrototypeOf(this, TransferError.prototype);
  }
}

/**
 * S3 error response from XML.
 */
export interface S3ErrorResponse {
  code: string;
  message: string;
  key?: string;
  bucket?: string;
  requestId?: string;
  hostId?: string;
}

/**
 * Map S3 error code to appropriate error class.
 */
export function mapS3ErrorCode(
  code: string,
  response?: S3ErrorResponse
): S3Error {
  const message = response?.message || code;
  const requestId = response?.requestId;

  switch (code) {
    // Bucket errors
    case "NoSuchBucket":
      return new BucketError(message, "NotFound", { bucket: response?.bucket, requestId });
    case "BucketAlreadyExists":
      return new BucketError(message, "AlreadyExists", { bucket: response?.bucket, requestId });
    case "BucketAlreadyOwnedByYou":
      return new BucketError(message, "AlreadyOwnedByYou", { bucket: response?.bucket, requestId });
    case "BucketNotEmpty":
      return new BucketError(message, "NotEmpty", { bucket: response?.bucket, requestId });

    // Object errors
    case "NoSuchKey":
      return new ObjectError(message, "NotFound", { key: response?.key, requestId });
    case "PreconditionFailed":
      return new ObjectError(message, "PreconditionFailed", { requestId });
    case "NotModified":
      return new ObjectError(message, "NotModified", { requestId });
    case "InvalidRange":
      return new ObjectError(message, "InvalidRange", { requestId });

    // Multipart errors
    case "NoSuchUpload":
      return new MultipartError(message, "UploadNotFound", { requestId });
    case "InvalidPart":
      return new MultipartError(message, "InvalidPart", { requestId });
    case "InvalidPartOrder":
      return new MultipartError(message, "InvalidPartOrder", { requestId });
    case "EntityTooSmall":
      return new MultipartError(message, "EntityTooSmall", { requestId });
    case "EntityTooLarge":
      return new MultipartError(message, "EntityTooLarge", { requestId });

    // Access errors
    case "AccessDenied":
      return new AccessError(message, "AccessDenied", { requestId });
    case "InvalidAccessKeyId":
      return new AccessError(message, "InvalidAccessKeyId", { requestId });
    case "SignatureDoesNotMatch":
      return new AccessError(message, "SignatureDoesNotMatch", { requestId });
    case "ExpiredToken":
      return new AccessError(message, "ExpiredToken", { requestId });

    // Server errors
    case "InternalError":
      return new ServerError(message, "InternalError", { requestId });
    case "ServiceUnavailable":
      return new ServerError(message, "ServiceUnavailable", { requestId });
    case "SlowDown":
      return new ServerError(message, "SlowDown", { requestId });

    default:
      return new S3Error(message, code, { requestId });
  }
}
