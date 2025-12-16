/**
 * Buildkite Error Types
 * @module errors
 */

/** Error kinds for categorizing Buildkite errors */
export enum BuildkiteErrorKind {
  // Resource errors
  OrganizationNotFound = 'organization_not_found',
  PipelineNotFound = 'pipeline_not_found',
  BuildNotFound = 'build_not_found',
  JobNotFound = 'job_not_found',
  ArtifactNotFound = 'artifact_not_found',
  ClusterNotFound = 'cluster_not_found',
  AgentNotFound = 'agent_not_found',

  // Permission errors
  AccessDenied = 'access_denied',
  Unauthorized = 'unauthorized',

  // State errors
  BuildAlreadyFinished = 'build_already_finished',
  JobNotBlockable = 'job_not_blockable',
  InvalidOperation = 'invalid_operation',

  // Validation errors
  InvalidBuildRequest = 'invalid_build_request',
  InvalidAnnotation = 'invalid_annotation',

  // Artifact errors
  ArtifactCorrupted = 'artifact_corrupted',

  // Rate limiting
  RateLimited = 'rate_limited',

  // Service errors
  ServiceUnavailable = 'service_unavailable',
  Timeout = 'timeout',

  // Webhook errors
  InvalidWebhookToken = 'invalid_webhook_token',

  // Parse errors
  ParseError = 'parse_error',

  // Transport errors
  TransportError = 'transport_error',

  // Internal errors
  InternalError = 'internal_error',

  // Unknown
  Unknown = 'unknown',
}

/** Rate limit information */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

/** Buildkite API error */
export class BuildkiteError extends Error {
  public readonly kind: BuildkiteErrorKind;
  public readonly statusCode?: number;
  public readonly requestId?: string;
  public readonly documentationUrl?: string;
  public readonly rateLimitInfo?: RateLimitInfo;
  public readonly cause?: Error;

  constructor(
    kind: BuildkiteErrorKind,
    message: string,
    options?: {
      statusCode?: number;
      requestId?: string;
      documentationUrl?: string;
      rateLimitInfo?: RateLimitInfo;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'BuildkiteError';
    this.kind = kind;
    this.statusCode = options?.statusCode;
    this.requestId = options?.requestId;
    this.documentationUrl = options?.documentationUrl;
    this.rateLimitInfo = options?.rateLimitInfo;
    this.cause = options?.cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BuildkiteError);
    }
  }

  /** Returns the retry-after duration in seconds */
  retryAfter(): number | undefined {
    if (this.rateLimitInfo?.retryAfter !== undefined) {
      return this.rateLimitInfo.retryAfter;
    }
    if (this.rateLimitInfo?.resetAt) {
      const now = new Date();
      if (this.rateLimitInfo.resetAt > now) {
        return Math.ceil((this.rateLimitInfo.resetAt.getTime() - now.getTime()) / 1000);
      }
    }
    return undefined;
  }

  /** Returns true if this error is retryable */
  isRetryable(): boolean {
    return [
      BuildkiteErrorKind.RateLimited,
      BuildkiteErrorKind.ServiceUnavailable,
      BuildkiteErrorKind.Timeout,
      BuildkiteErrorKind.TransportError,
    ].includes(this.kind);
  }

  /** Creates an error from HTTP status code */
  static fromResponse(status: number, message: string, body?: any): BuildkiteError {
    const kind = BuildkiteError.kindFromStatus(status, message, body);
    return new BuildkiteError(kind, message, { statusCode: status });
  }

  /** Maps HTTP status code to error kind */
  private static kindFromStatus(status: number, message: string, _body?: unknown): BuildkiteErrorKind {
    switch (status) {
      case 401:
        return BuildkiteErrorKind.Unauthorized;
      case 403:
        return BuildkiteErrorKind.AccessDenied;
      case 404:
        if (message.toLowerCase().includes('pipeline')) return BuildkiteErrorKind.PipelineNotFound;
        if (message.toLowerCase().includes('build')) return BuildkiteErrorKind.BuildNotFound;
        if (message.toLowerCase().includes('job')) return BuildkiteErrorKind.JobNotFound;
        if (message.toLowerCase().includes('artifact')) return BuildkiteErrorKind.ArtifactNotFound;
        if (message.toLowerCase().includes('organization')) return BuildkiteErrorKind.OrganizationNotFound;
        return BuildkiteErrorKind.Unknown;
      case 422:
        if (message.toLowerCase().includes('finished')) return BuildkiteErrorKind.BuildAlreadyFinished;
        if (message.toLowerCase().includes('block')) return BuildkiteErrorKind.JobNotBlockable;
        return BuildkiteErrorKind.InvalidBuildRequest;
      case 429:
        return BuildkiteErrorKind.RateLimited;
      case 500:
      case 502:
      case 503:
      case 504:
        return BuildkiteErrorKind.ServiceUnavailable;
      default:
        return BuildkiteErrorKind.Unknown;
    }
  }

  // Factory methods
  static unauthorized(message: string): BuildkiteError {
    return new BuildkiteError(BuildkiteErrorKind.Unauthorized, message, { statusCode: 401 });
  }

  static accessDenied(message: string): BuildkiteError {
    return new BuildkiteError(BuildkiteErrorKind.AccessDenied, message, { statusCode: 403 });
  }

  static pipelineNotFound(slug: string): BuildkiteError {
    return new BuildkiteError(BuildkiteErrorKind.PipelineNotFound, `Pipeline not found: ${slug}`, { statusCode: 404 });
  }

  static buildNotFound(pipelineSlug: string, buildNumber: number): BuildkiteError {
    return new BuildkiteError(BuildkiteErrorKind.BuildNotFound, `Build not found: ${pipelineSlug}#${buildNumber}`, { statusCode: 404 });
  }

  static jobNotFound(jobId: string): BuildkiteError {
    return new BuildkiteError(BuildkiteErrorKind.JobNotFound, `Job not found: ${jobId}`, { statusCode: 404 });
  }

  static rateLimited(retryAfter: number): BuildkiteError {
    return new BuildkiteError(BuildkiteErrorKind.RateLimited, `Rate limited, retry after ${retryAfter} seconds`, {
      statusCode: 429,
      rateLimitInfo: { limit: 0, remaining: 0, resetAt: new Date(Date.now() + retryAfter * 1000), retryAfter },
    });
  }

  static timeout(message: string): BuildkiteError {
    return new BuildkiteError(BuildkiteErrorKind.Timeout, message);
  }

  static invalidWebhookToken(): BuildkiteError {
    return new BuildkiteError(BuildkiteErrorKind.InvalidWebhookToken, 'Invalid webhook token');
  }

  toString(): string {
    let result = `[${this.kind}] ${this.message}`;
    if (this.statusCode) {
      result += ` (HTTP ${this.statusCode})`;
    }
    return result;
  }
}

/** Type guard for BuildkiteError */
export function isBuildkiteError(error: unknown): error is BuildkiteError {
  return error instanceof BuildkiteError;
}

/** Check if an error is a rate limit error */
export function isRateLimitError(error: BuildkiteError): boolean {
  return error.kind === BuildkiteErrorKind.RateLimited;
}
