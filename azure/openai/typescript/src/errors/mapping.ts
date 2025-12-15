/**
 * Error Mapping
 *
 * Maps HTTP responses to typed Azure OpenAI errors.
 */

import type { AzureErrorResponse, ContentFilterResults } from '../types/index.js';
import {
  AzureOpenAIError,
  AuthenticationError,
  AuthorizationError,
  DeploymentNotFoundError,
  RateLimitError,
  ContentFilterError,
  ContextLengthExceededError,
  ValidationError,
  ServiceError,
  NetworkError,
  TimeoutError,
} from './error.js';

/** Common error codes from Azure OpenAI */
const ERROR_CODES = {
  CONTENT_FILTER: 'content_filter',
  CONTEXT_LENGTH_EXCEEDED: 'context_length_exceeded',
  INVALID_REQUEST: 'invalid_request_error',
  RATE_LIMIT: 'rate_limit_exceeded',
  QUOTA_EXCEEDED: 'quota_exceeded',
  DEPLOYMENT_NOT_FOUND: 'DeploymentNotFound',
  MODEL_NOT_FOUND: 'model_not_found',
};

/**
 * Extracts request ID from response headers
 */
function extractRequestId(headers: Headers): string | undefined {
  return headers.get('x-request-id') ?? headers.get('x-ms-request-id') ?? undefined;
}

/**
 * Extracts Retry-After header value in milliseconds
 */
function extractRetryAfter(headers: Headers): number | undefined {
  const retryAfter = headers.get('retry-after');
  if (!retryAfter) return undefined;

  // Try parsing as seconds
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try parsing as HTTP date
  const date = Date.parse(retryAfter);
  if (!isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return undefined;
}

/**
 * Extracts content filter results from error response
 */
function extractContentFilterResults(
  errorData: AzureErrorResponse
): ContentFilterResults | undefined {
  return errorData.error?.innerError?.contentFilterResults;
}

/**
 * Maps HTTP response to appropriate error type
 */
export async function mapResponseToError(
  response: Response,
  deploymentId?: string
): Promise<AzureOpenAIError> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const requestId = extractRequestId(response.headers);
  const retryAfterMs = extractRetryAfter(response.headers);

  let errorData: AzureErrorResponse | null = null;
  try {
    errorData = await response.json() as AzureErrorResponse;
  } catch {
    // Response may not be JSON
  }

  const message = errorData?.error?.message ?? response.statusText ?? 'Unknown error';
  const code = errorData?.error?.code;
  const param = errorData?.error?.param;
  const type = errorData?.error?.type;

  const baseOptions = {
    message,
    statusCode: response.status,
    code,
    param,
    type,
    headers,
    requestId,
    deploymentId,
  };

  // Handle specific status codes
  switch (response.status) {
    case 400: {
      // Check for specific error codes
      if (code === ERROR_CODES.CONTENT_FILTER) {
        const contentFilterResults = extractContentFilterResults(errorData!);
        return new ContentFilterError({
          ...baseOptions,
          contentFilterResults: contentFilterResults ?? {
            hate: { filtered: true, severity: 'high' },
          },
        });
      }

      if (code === ERROR_CODES.CONTEXT_LENGTH_EXCEEDED) {
        // Try to extract token counts from message
        const tokenMatch = message.match(/(\d+)\s*tokens.*maximum.*?(\d+)/i);
        const requestedTokens = tokenMatch?.[1] ? parseInt(tokenMatch[1], 10) : undefined;
        const maxTokens = tokenMatch?.[2] ? parseInt(tokenMatch[2], 10) : undefined;
        return new ContextLengthExceededError({
          ...baseOptions,
          requestedTokens,
          maxTokens,
        });
      }

      return new ValidationError(baseOptions);
    }

    case 401:
      return new AuthenticationError({
        ...baseOptions,
        refreshAndRetry: true,
      });

    case 403:
      return new AuthorizationError(baseOptions);

    case 404:
      return new DeploymentNotFoundError(baseOptions);

    case 429:
      return new RateLimitError({
        ...baseOptions,
        retryAfterMs,
      });

    case 408:
      return new TimeoutError(baseOptions);

    default:
      if (response.status >= 500) {
        return new ServiceError(baseOptions);
      }
      return new ValidationError(baseOptions);
  }
}

/**
 * Wraps a fetch error into an appropriate error type
 */
export function mapFetchError(error: unknown, deploymentId?: string): AzureOpenAIError {
  if (error instanceof AzureOpenAIError) {
    return error;
  }

  if (error instanceof TypeError) {
    // Network errors typically throw TypeError
    return new NetworkError({
      message: error.message,
      cause: error,
      deploymentId,
    });
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new TimeoutError({
      message: 'Request was aborted',
      cause: error as Error,
      deploymentId,
    });
  }

  const message = error instanceof Error ? error.message : String(error);
  return new NetworkError({
    message,
    cause: error instanceof Error ? error : undefined,
    deploymentId,
  });
}
