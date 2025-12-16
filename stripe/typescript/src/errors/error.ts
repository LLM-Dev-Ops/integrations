/**
 * Base error class for Stripe integration errors
 */
export interface StripeErrorParams {
  type: string;
  message: string;
  status?: number;
  code?: string;
  param?: string;
  declineCode?: string;
  retryAfter?: number;
  isRetryable: boolean;
  requestId?: string;
  details?: Record<string, unknown>;
}

/**
 * Base error class for all Stripe integration errors
 */
export class StripeError extends Error {
  readonly type: string;
  readonly status?: number;
  readonly code?: string;
  readonly param?: string;
  readonly declineCode?: string;
  readonly retryAfter?: number;
  readonly isRetryable: boolean;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;

  constructor(params: StripeErrorParams) {
    super(params.message);
    this.name = 'StripeError';
    this.type = params.type;
    this.status = params.status;
    this.code = params.code;
    this.param = params.param;
    this.declineCode = params.declineCode;
    this.retryAfter = params.retryAfter;
    this.isRetryable = params.isRetryable;
    this.requestId = params.requestId;
    this.details = params.details;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, StripeError);
    }
  }

  /**
   * Returns a JSON representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      status: this.status,
      code: this.code,
      param: this.param,
      declineCode: this.declineCode,
      retryAfter: this.retryAfter,
      isRetryable: this.isRetryable,
      requestId: this.requestId,
      details: this.details,
    };
  }
}
