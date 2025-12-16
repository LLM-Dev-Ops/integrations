/**
 * DynamoDB Error Handling
 *
 * Error classes and error handling utilities for DynamoDB operations.
 */

export { DynamoDBError } from './error.js';

// Error categories
export {
  ConfigurationError,
  InvalidTableError,
  InvalidRegionError,
  InvalidCredentialsError,
  AuthenticationError,
  CredentialsNotFoundError,
  TokenExpiredError,
  AccessDeniedError,
  AssumeRoleFailedError,
  ValidationError,
  InvalidKeyError,
  InvalidExpressionError,
  MissingRequiredKeyError,
  TypeMismatchError,
  ConditionalCheckError,
  ConditionFailedError,
  TransactionConflictError,
  ThroughputError,
  ProvisionedThroughputExceededError,
  RequestLimitExceededError,
  ThrottlingExceptionError,
  ItemError,
  ItemNotFoundError,
  ItemTooLargeError,
  ItemCollectionSizeLimitExceededError,
  TransactionError,
  TransactionCanceledError,
  IdempotentParameterMismatchError,
  ServiceError,
  InternalServerError,
  ServiceUnavailableError,
  ResourceNotFoundError,
} from './categories.js';

// Error mapping
export { mapAwsError } from './mapper.js';
