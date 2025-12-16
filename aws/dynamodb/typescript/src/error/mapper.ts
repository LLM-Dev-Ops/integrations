/**
 * Error mapping utilities for converting AWS SDK errors to appropriate DynamoDBError instances.
 */

import { DynamoDBError } from './error.js';
import {
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

/**
 * AWS SDK error interface
 */
interface AwsError extends Error {
  name?: string;
  code?: string;
  statusCode?: number;
  $metadata?: {
    httpStatusCode?: number;
    requestId?: string;
  };
  $fault?: 'client' | 'server';
}

/**
 * Type guard to check if error is an AWS SDK error
 */
function isAwsError(error: unknown): error is AwsError {
  return (
    error instanceof Error &&
    (('code' in error && typeof error.code === 'string') ||
      ('name' in error && typeof error.name === 'string') ||
      ('$metadata' in error))
  );
}

/**
 * Maps AWS SDK errors to appropriate DynamoDBError instances
 */
export function mapAwsError(error: unknown): DynamoDBError {
  // If it's already a DynamoDBError, return it as-is
  if (error instanceof DynamoDBError) {
    return error;
  }

  // If it's not an AWS error, wrap it in a generic DynamoDBError
  if (!isAwsError(error)) {
    return new DynamoDBError({
      code: 'UnknownError',
      message: error instanceof Error ? error.message : String(error),
      isRetryable: false,
      originalError: error instanceof Error ? error : undefined,
    });
  }

  const errorCode = error.code || error.name || 'UnknownError';
  const message = error.message;
  const httpStatusCode = error.$metadata?.httpStatusCode ?? error.statusCode;

  // Map specific AWS DynamoDB error codes to our error classes
  switch (errorCode) {
    // Configuration errors
    case 'InvalidTableNameException':
    case 'TableNotFoundException':
      return new InvalidTableError(extractTableName(message));

    case 'InvalidRegionException':
      return new InvalidRegionError(extractRegion(message));

    case 'InvalidCredentialsException':
      return new InvalidCredentialsError(message);

    case 'ConfigurationException':
      return new ConfigurationError(message);

    // Authentication errors
    case 'CredentialsNotFound':
    case 'MissingAuthenticationTokenException':
      return new CredentialsNotFoundError();

    case 'ExpiredTokenException':
    case 'TokenRefreshRequired':
      return new TokenExpiredError();

    case 'AccessDeniedException':
    case 'UnauthorizedException':
      return new AccessDeniedError(extractResourceName(message));

    case 'AssumeRoleException':
      return new AssumeRoleFailedError(extractRoleArn(message), message);

    case 'UnrecognizedClientException':
    case 'InvalidSignatureException':
    case 'SignatureDoesNotMatchException':
      return new AuthenticationError(message, httpStatusCode);

    // Validation errors
    case 'ValidationException':
      return mapValidationError(message, httpStatusCode);

    // Conditional check errors
    case 'ConditionalCheckFailedException':
      return new ConditionFailedError(extractCondition(message));

    // Throughput errors
    case 'ProvisionedThroughputExceededException':
      return new ProvisionedThroughputExceededError(extractTableName(message));

    case 'RequestLimitExceeded':
      return new RequestLimitExceededError();

    case 'ThrottlingException':
      return new ThrottlingExceptionError(message);

    // Item errors
    case 'ItemNotFound':
      return new ItemNotFoundError({});

    case 'ItemSizeLimitExceededException':
      return new ItemTooLargeError(extractItemSize(message));

    case 'ItemCollectionSizeLimitExceededException':
      return new ItemCollectionSizeLimitExceededError(extractPartitionKey(message));

    // Transaction errors
    case 'TransactionCanceledException':
      return new TransactionCanceledError(extractCancellationReasons(message));

    case 'TransactionConflictException':
      return new TransactionConflictError(message);

    case 'IdempotentParameterMismatchException':
      return new IdempotentParameterMismatchError();

    case 'TransactionInProgressException':
      return new TransactionError(message, errorCode);

    // Service errors
    case 'InternalServerError':
    case 'InternalFailure':
      return new InternalServerError(message);

    case 'ServiceUnavailable':
    case 'ServiceUnavailableException':
      return new ServiceUnavailableError(message);

    case 'ResourceNotFoundException':
      return new ResourceNotFoundError(
        extractResourceType(message),
        extractResourceName(message)
      );

    case 'ResourceInUseException':
      return new ServiceError(message, errorCode, 400);

    // Network/timeout errors - retryable
    case 'RequestTimeout':
    case 'RequestTimeoutException':
      return new DynamoDBError({
        code: errorCode,
        message: message || 'Request timeout',
        httpStatusCode: 408,
        isRetryable: true,
        originalError: error,
      });

    // Default handling based on HTTP status code or fault type
    default:
      return mapByStatusOrFault(error, errorCode, message, httpStatusCode);
  }
}

/**
 * Maps validation errors to more specific error types
 */
function mapValidationError(message: string, httpStatusCode?: number): ValidationError {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('key') && lowerMessage.includes('missing')) {
    return new MissingRequiredKeyError(extractKeyName(message));
  }

  if (lowerMessage.includes('key') && lowerMessage.includes('invalid')) {
    return new InvalidKeyError(message);
  }

  if (lowerMessage.includes('expression') || lowerMessage.includes('syntax')) {
    return new InvalidExpressionError(extractExpression(message), message);
  }

  if (lowerMessage.includes('type')) {
    return new TypeMismatchError('unknown', 'unknown', 'unknown');
  }

  return new ValidationError(message, httpStatusCode);
}

/**
 * Maps errors based on HTTP status code or fault type
 */
function mapByStatusOrFault(
  error: AwsError,
  errorCode: string,
  message: string,
  httpStatusCode?: number
): DynamoDBError {
  // Determine if error is retryable based on fault type
  const isRetryable = error.$fault === 'server';

  if (httpStatusCode) {
    switch (httpStatusCode) {
      case 400:
        return new ValidationError(message, httpStatusCode);
      case 401:
        return new AuthenticationError(message, httpStatusCode);
      case 403:
        return new AccessDeniedError(extractResourceName(message));
      case 404:
        return new ResourceNotFoundError('Resource', extractResourceName(message));
      case 408:
      case 429:
        return new DynamoDBError({
          code: errorCode,
          message,
          httpStatusCode,
          isRetryable: true,
          originalError: error,
        });
      case 500:
        return new InternalServerError(message);
      case 503:
        return new ServiceUnavailableError(message);
    }
  }

  // Generic error with retryability based on fault type
  return new DynamoDBError({
    code: errorCode,
    message: message || 'An error occurred',
    httpStatusCode,
    isRetryable,
    originalError: error,
  });
}

// Helper functions to extract information from error messages

function extractTableName(message: string): string {
  const match = message.match(/table[:\s]+['"]?([a-zA-Z0-9_-]+)['"]?/i);
  return match?.[1] ?? 'unknown';
}

function extractRegion(message: string): string {
  const match = message.match(/region[:\s]+['"]?([a-z0-9-]+)['"]?/i);
  return match?.[1] ?? 'unknown';
}

function extractResourceName(message: string): string {
  const match = message.match(/resource[:\s]+['"]?([a-zA-Z0-9_/-]+)['"]?/i);
  return match?.[1] ?? 'unknown';
}

function extractResourceType(message: string): string {
  const match = message.match(/([A-Z][a-z]+)(?:\s+not found|\s+does not exist)/i);
  return match?.[1] ?? 'Resource';
}

function extractRoleArn(message: string): string {
  const match = message.match(/arn:aws:iam::[0-9]+:role\/[a-zA-Z0-9_-]+/);
  return match?.[0] ?? 'unknown';
}

function extractKeyName(message: string): string {
  const match = message.match(/key[:\s]+['"]?([a-zA-Z0-9_]+)['"]?/i);
  return match?.[1] ?? 'unknown';
}

function extractExpression(message: string): string {
  const match = message.match(/expression[:\s]+['"]?([^'"]+)['"]?/i);
  return match?.[1] ?? message;
}

function extractCondition(message: string): string | undefined {
  const match = message.match(/condition[:\s]+['"]?([^'"]+)['"]?/i);
  return match?.[1];
}

function extractItemSize(message: string): number {
  const match = message.match(/(\d+)\s*(?:KB|bytes)/i);
  if (match) {
    const size = parseInt(match[1], 10);
    return message.toLowerCase().includes('kb') ? size : Math.ceil(size / 1024);
  }
  return 0;
}

function extractPartitionKey(message: string): string {
  const match = message.match(/partition\s+key[:\s]+['"]?([^'"]+)['"]?/i);
  return match?.[1] ?? 'unknown';
}

function extractCancellationReasons(message: string): string[] | undefined {
  // Try to extract reasons from transaction cancellation message
  const match = message.match(/reasons?[:\s]+\[([^\]]+)\]/i);
  if (match) {
    return match[1].split(',').map(r => r.trim());
  }
  return undefined;
}
