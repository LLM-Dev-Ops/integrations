import { OpenAIError } from './error.js';

export class AuthenticationError extends OpenAIError {
  constructor(message: string, options?: { code?: string; requestId?: string }) {
    super({ message, statusCode: 401, ...options });
  }
}

export class RateLimitError extends OpenAIError {
  public readonly retryAfter?: number;

  constructor(message: string, options?: { retryAfter?: number; requestId?: string }) {
    super({ message, statusCode: 429, ...options });
    this.retryAfter = options?.retryAfter;
  }
}

export class InvalidRequestError extends OpenAIError {
  constructor(message: string, options?: { param?: string; code?: string; requestId?: string }) {
    super({ message, statusCode: 400, param: options?.param, code: options?.code, ...options });
  }
}

export class NotFoundError extends OpenAIError {
  constructor(message: string, options?: { requestId?: string }) {
    super({ message, statusCode: 404, ...options });
  }
}

export class PermissionDeniedError extends OpenAIError {
  constructor(message: string, options?: { requestId?: string }) {
    super({ message, statusCode: 403, ...options });
  }
}

export class ConflictError extends OpenAIError {
  constructor(message: string, options?: { requestId?: string }) {
    super({ message, statusCode: 409, ...options });
  }
}

export class UnprocessableEntityError extends OpenAIError {
  constructor(message: string, options?: { requestId?: string }) {
    super({ message, statusCode: 422, ...options });
  }
}

export class APIError extends OpenAIError {
  constructor(message: string, statusCode: number, options?: { type?: string; code?: string; requestId?: string }) {
    super({ message, statusCode, ...options });
  }
}

export class APIConnectionError extends OpenAIError {
  constructor(message: string, options?: { cause?: Error }) {
    super({ message, cause: options?.cause });
  }
}

export class TimeoutError extends OpenAIError {
  constructor(message: string = 'Request timed out') {
    super({ message });
  }
}

export class InternalServerError extends OpenAIError {
  constructor(message: string, options?: { requestId?: string }) {
    super({ message, statusCode: 500, ...options });
  }
}
