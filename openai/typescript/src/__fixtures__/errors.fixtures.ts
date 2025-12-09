import type { ApiErrorResponse, HttpResponse } from '../types/common.js';

export function createApiError(
  message: string,
  type: string,
  code?: string | null,
  param?: string | null
): ApiErrorResponse {
  return {
    error: {
      message,
      type,
      code: code ?? null,
      param: param ?? null,
    },
  };
}

export function create401UnauthorizedError(): HttpResponse<ApiErrorResponse> {
  return {
    status: 401,
    headers: { 'content-type': 'application/json' },
    data: createApiError(
      'Incorrect API key provided: sk-****. You can find your API key at https://platform.openai.com/account/api-keys.',
      'invalid_request_error',
      null,
      null
    ),
  };
}

export function create403ForbiddenError(): HttpResponse<ApiErrorResponse> {
  return {
    status: 403,
    headers: { 'content-type': 'application/json' },
    data: createApiError(
      'You do not have permission to access this resource.',
      'permission_error',
      null,
      null
    ),
  };
}

export function create404NotFoundError(): HttpResponse<ApiErrorResponse> {
  return {
    status: 404,
    headers: { 'content-type': 'application/json' },
    data: createApiError(
      'The requested resource was not found.',
      'invalid_request_error',
      null,
      null
    ),
  };
}

export function create429RateLimitError(): HttpResponse<ApiErrorResponse> {
  return {
    status: 429,
    headers: {
      'content-type': 'application/json',
      'x-ratelimit-limit-requests': '5000',
      'x-ratelimit-remaining-requests': '0',
      'x-ratelimit-reset-requests': '2s',
    },
    data: createApiError(
      'Rate limit reached for requests',
      'rate_limit_error',
      'rate_limit_exceeded',
      null
    ),
  };
}

export function create500InternalServerError(): HttpResponse<ApiErrorResponse> {
  return {
    status: 500,
    headers: { 'content-type': 'application/json' },
    data: createApiError(
      'The server had an error while processing your request',
      'server_error',
      null,
      null
    ),
  };
}

export function create502BadGatewayError(): HttpResponse<ApiErrorResponse> {
  return {
    status: 502,
    headers: { 'content-type': 'application/json' },
    data: createApiError(
      'Bad gateway',
      'server_error',
      null,
      null
    ),
  };
}

export function create503ServiceUnavailableError(): HttpResponse<ApiErrorResponse> {
  return {
    status: 503,
    headers: { 'content-type': 'application/json' },
    data: createApiError(
      'The engine is currently overloaded, please try again later',
      'server_error',
      'overloaded',
      null
    ),
  };
}

export function createValidationError(
  param: string,
  message?: string
): HttpResponse<ApiErrorResponse> {
  return {
    status: 400,
    headers: { 'content-type': 'application/json' },
    data: createApiError(
      message ?? `Invalid value for '${param}'`,
      'invalid_request_error',
      null,
      param
    ),
  };
}

export function createTimeoutError(): Error {
  const error = new Error('Request timeout');
  error.name = 'TimeoutError';
  return error;
}

export function createNetworkError(): Error {
  const error = new Error('Network request failed');
  error.name = 'NetworkError';
  return error;
}

export function createAbortError(): Error {
  const error = new Error('Request was aborted');
  error.name = 'AbortError';
  return error;
}
