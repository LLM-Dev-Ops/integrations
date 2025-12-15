export {
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
export type { AzureOpenAIErrorOptions } from './error.js';
export { mapResponseToError, mapFetchError } from './mapping.js';
