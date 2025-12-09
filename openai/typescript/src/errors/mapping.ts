import type { ApiErrorResponse } from '../types/common.js';
import { OpenAIError } from './error.js';
import {
  AuthenticationError,
  RateLimitError,
  InvalidRequestError,
  NotFoundError,
  PermissionDeniedError,
  ConflictError,
  UnprocessableEntityError,
  APIError,
  APIConnectionError,
  InternalServerError,
} from './categories.js';

export function mapHttpError(
  status: number,
  body: string,
  headers: Headers
): OpenAIError {
  const requestId = headers.get('x-request-id') ?? undefined;
  const retryAfter = parseRetryAfter(headers.get('retry-after'));

  let errorData: ApiErrorResponse | undefined;
  try {
    errorData = JSON.parse(body);
  } catch {}

  const message = errorData?.error?.message ?? `HTTP ${status} error`;
  const code = errorData?.error?.code ?? undefined;
  const param = errorData?.error?.param ?? undefined;
  const type = errorData?.error?.type ?? undefined;

  switch (status) {
    case 400: return new InvalidRequestError(message, { param, code, requestId });
    case 401: return new AuthenticationError(message, { code, requestId });
    case 403: return new PermissionDeniedError(message, { requestId });
    case 404: return new NotFoundError(message, { requestId });
    case 409: return new ConflictError(message, { requestId });
    case 422: return new UnprocessableEntityError(message, { requestId });
    case 429: return new RateLimitError(message, { retryAfter, requestId });
    case 500: return new InternalServerError(message, { requestId });
    case 502:
    case 503:
    case 504: return new APIError(message, status, { type, code, requestId });
    default: return new APIError(message, status, { type, code, requestId });
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = parseInt(value, 10);
  return isNaN(seconds) ? undefined : seconds;
}

// Legacy support for existing ErrorMapper
export class ErrorMapper {
  static fromResponse(response: { status: number; headers: Record<string, string>; data: unknown }): OpenAIError {
    const headers = new Headers(response.headers);
    const body = JSON.stringify(response.data);
    return mapHttpError(response.status, body, headers);
  }

  static fromNetworkError(error: Error): APIConnectionError {
    return new APIConnectionError(`Network error: ${error.message}`, { cause: error });
  }
}
