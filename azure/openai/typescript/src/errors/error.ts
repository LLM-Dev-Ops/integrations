/**
 * Azure OpenAI Error Types
 *
 * Error handling specific to Azure OpenAI with content filter support.
 */

import type { ContentFilterResults } from '../types/index.js';

/** Base error options */
export interface AzureOpenAIErrorOptions {
  message: string;
  statusCode?: number;
  code?: string;
  param?: string | null;
  type?: string;
  headers?: Record<string, string>;
  requestId?: string;
  deploymentId?: string;
  contentFilterResults?: ContentFilterResults;
  retryable?: boolean;
  retryAfterMs?: number;
  cause?: Error;
}

/**
 * Base class for all Azure OpenAI errors
 */
export abstract class AzureOpenAIError extends Error {
  public readonly statusCode?: number;
  public readonly code?: string;
  public readonly param?: string | null;
  public readonly type?: string;
  public readonly headers?: Record<string, string>;
  public readonly requestId?: string;
  public readonly deploymentId?: string;
  public readonly contentFilterResults?: ContentFilterResults;
  public readonly retryable: boolean;
  public readonly retryAfterMs?: number;
  public override readonly cause?: Error;

  constructor(options: AzureOpenAIErrorOptions) {
    super(options.message);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.param = options.param;
    this.type = options.type;
    this.headers = options.headers;
    this.requestId = options.requestId;
    this.deploymentId = options.deploymentId;
    this.contentFilterResults = options.contentFilterResults;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.cause = options.cause;

    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      param: this.param,
      type: this.type,
      requestId: this.requestId,
      deploymentId: this.deploymentId,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
      contentFilterResults: this.contentFilterResults,
    };
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends AzureOpenAIError {
  constructor(options: Omit<AzureOpenAIErrorOptions, 'retryable'> & { refreshAndRetry?: boolean }) {
    super({ ...options, retryable: options.refreshAndRetry ?? false });
  }
}

/**
 * Authorization/permission error (403)
 */
export class AuthorizationError extends AzureOpenAIError {
  constructor(options: Omit<AzureOpenAIErrorOptions, 'retryable'>) {
    super({ ...options, retryable: false });
  }
}

/**
 * Deployment not found error (404)
 */
export class DeploymentNotFoundError extends AzureOpenAIError {
  constructor(options: Omit<AzureOpenAIErrorOptions, 'retryable'>) {
    super({ ...options, retryable: false });
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends AzureOpenAIError {
  constructor(options: Omit<AzureOpenAIErrorOptions, 'retryable'>) {
    super({ ...options, retryable: true });
  }
}

/**
 * Content filter error - request blocked by Azure AI Content Safety
 */
export class ContentFilterError extends AzureOpenAIError {
  constructor(options: AzureOpenAIErrorOptions & { contentFilterResults: ContentFilterResults }) {
    super({ ...options, retryable: false, code: 'content_filter' });
  }

  /**
   * Gets the categories that triggered the filter
   */
  getFilteredCategories(): string[] {
    const filtered: string[] = [];
    if (!this.contentFilterResults) return filtered;

    const categories = ['hate', 'selfHarm', 'sexual', 'violence', 'profanity'] as const;
    for (const category of categories) {
      const result = this.contentFilterResults[category];
      if (result?.filtered) {
        filtered.push(category);
      }
    }

    if (this.contentFilterResults.jailbreak?.filtered) {
      filtered.push('jailbreak');
    }
    if (this.contentFilterResults.protectedMaterialText?.filtered) {
      filtered.push('protectedMaterialText');
    }
    if (this.contentFilterResults.protectedMaterialCode?.filtered) {
      filtered.push('protectedMaterialCode');
    }

    return filtered;
  }
}

/**
 * Context length exceeded error
 */
export class ContextLengthExceededError extends AzureOpenAIError {
  public readonly maxTokens?: number;
  public readonly requestedTokens?: number;

  constructor(
    options: Omit<AzureOpenAIErrorOptions, 'retryable'> & {
      maxTokens?: number;
      requestedTokens?: number;
    }
  ) {
    super({ ...options, retryable: false, code: 'context_length_exceeded' });
    this.maxTokens = options.maxTokens;
    this.requestedTokens = options.requestedTokens;
  }
}

/**
 * Validation error for invalid requests
 */
export class ValidationError extends AzureOpenAIError {
  constructor(options: Omit<AzureOpenAIErrorOptions, 'retryable'>) {
    super({ ...options, retryable: false });
  }
}

/**
 * Server error (5xx)
 */
export class ServiceError extends AzureOpenAIError {
  constructor(options: Omit<AzureOpenAIErrorOptions, 'retryable'>) {
    super({ ...options, retryable: true });
  }
}

/**
 * Network/connection error
 */
export class NetworkError extends AzureOpenAIError {
  constructor(options: Omit<AzureOpenAIErrorOptions, 'retryable'>) {
    super({ ...options, retryable: true });
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends AzureOpenAIError {
  constructor(options: Omit<AzureOpenAIErrorOptions, 'retryable'>) {
    super({ ...options, retryable: true });
  }
}
