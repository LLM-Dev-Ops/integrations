export { OpenAIError, type OpenAIErrorOptions, type ApiErrorData } from './error.js';
export {
  AuthenticationError,
  RateLimitError,
  InvalidRequestError,
  APIError,
  APIConnectionError,
  TimeoutError,
  ConflictError,
  NotFoundError,
  UnprocessableEntityError,
  PermissionDeniedError,
  InternalServerError,
} from './categories.js';
export { ErrorMapper, mapHttpError } from './mapping.js';
