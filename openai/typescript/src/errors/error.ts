import type { ApiError } from '../types/common.js';

export interface OpenAIErrorOptions {
  message: string;
  statusCode?: number;
  code?: string;
  param?: string | null;
  type?: string;
  headers?: Record<string, string>;
  requestId?: string;
  cause?: Error;
}

export abstract class OpenAIError extends Error {
  public readonly statusCode?: number;
  public readonly code?: string;
  public readonly param?: string | null;
  public readonly type?: string;
  public readonly headers?: Record<string, string>;
  public readonly requestId?: string;
  public override readonly cause?: Error;

  constructor(options: OpenAIErrorOptions) {
    super(options.message);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.param = options.param;
    this.type = options.type;
    this.headers = options.headers;
    this.requestId = options.requestId;
    this.cause = options.cause;

    Error.captureStackTrace(this, this.constructor);
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
    };
  }
}

export interface ApiErrorData {
  error: ApiError;
}
