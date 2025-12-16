import { DynamoDBError } from './error.js';

/**
 * Error thrown when the client is misconfigured
 * (e.g., invalid table name, invalid region, invalid credentials)
 */
export class ConfigurationError extends DynamoDBError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'ConfigurationError',
      message,
      isRetryable: false,
      details,
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * Error for invalid table configuration
 */
export class InvalidTableError extends ConfigurationError {
  constructor(tableName: string) {
    super(`Invalid table name: ${tableName}`);
    this.name = 'InvalidTableError';
  }
}

/**
 * Error for invalid region configuration
 */
export class InvalidRegionError extends ConfigurationError {
  constructor(region: string) {
    super(`Invalid region: ${region}`);
    this.name = 'InvalidRegionError';
  }
}

/**
 * Error for invalid credentials configuration
 */
export class InvalidCredentialsError extends ConfigurationError {
  constructor(message: string = 'Invalid AWS credentials') {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthenticationError extends DynamoDBError {
  constructor(message: string, httpStatusCode?: number, details?: Record<string, unknown>) {
    super({
      code: 'AuthenticationError',
      message,
      httpStatusCode: httpStatusCode ?? 401,
      isRetryable: false,
      details,
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Error for missing credentials
 */
export class CredentialsNotFoundError extends AuthenticationError {
  constructor() {
    super('AWS credentials not found. Please configure credentials.');
    this.name = 'CredentialsNotFoundError';
  }
}

/**
 * Error for expired authentication token
 */
export class TokenExpiredError extends AuthenticationError {
  constructor() {
    super('Authentication token has expired');
    this.name = 'TokenExpiredError';
  }
}

/**
 * Error for access denied
 */
export class AccessDeniedError extends AuthenticationError {
  constructor(resource: string) {
    super(`Access denied to resource: ${resource}`, 403);
    this.name = 'AccessDeniedError';
  }
}

/**
 * Error for failed role assumption
 */
export class AssumeRoleFailedError extends AuthenticationError {
  constructor(roleArn: string, reason?: string) {
    super(`Failed to assume role ${roleArn}${reason ? `: ${reason}` : ''}`);
    this.name = 'AssumeRoleFailedError';
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends DynamoDBError {
  constructor(message: string, httpStatusCode?: number, details?: Record<string, unknown>) {
    super({
      code: 'ValidationException',
      message,
      httpStatusCode: httpStatusCode ?? 400,
      isRetryable: false,
      details,
    });
    this.name = 'ValidationError';
  }
}

/**
 * Error for invalid key
 */
export class InvalidKeyError extends ValidationError {
  constructor(message: string) {
    super(`Invalid key: ${message}`);
    this.name = 'InvalidKeyError';
  }
}

/**
 * Error for invalid expression
 */
export class InvalidExpressionError extends ValidationError {
  constructor(expression: string, reason?: string) {
    super(`Invalid expression: ${expression}${reason ? ` - ${reason}` : ''}`);
    this.name = 'InvalidExpressionError';
  }
}

/**
 * Error for missing required key
 */
export class MissingRequiredKeyError extends ValidationError {
  constructor(keyName: string) {
    super(`Missing required key: ${keyName}`);
    this.name = 'MissingRequiredKeyError';
  }
}

/**
 * Error for type mismatch
 */
export class TypeMismatchError extends ValidationError {
  constructor(field: string, expected: string, actual: string) {
    super(`Type mismatch for field '${field}': expected ${expected}, got ${actual}`);
    this.name = 'TypeMismatchError';
  }
}

/**
 * Error thrown when conditional check fails
 */
export class ConditionalCheckError extends DynamoDBError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'ConditionalCheckFailedException',
      message,
      httpStatusCode: 400,
      isRetryable: false,
      details,
    });
    this.name = 'ConditionalCheckError';
  }
}

/**
 * Error for condition check failure
 */
export class ConditionFailedError extends ConditionalCheckError {
  constructor(condition?: string) {
    super(condition ? `Condition check failed: ${condition}` : 'Condition check failed');
    this.name = 'ConditionFailedError';
  }
}

/**
 * Error for transaction conflict
 */
export class TransactionConflictError extends ConditionalCheckError {
  constructor(message: string = 'Transaction conflict detected') {
    super(message);
    this.name = 'TransactionConflictError';
  }
}

/**
 * Error thrown when throughput limits are exceeded
 */
export class ThroughputError extends DynamoDBError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super({
      code,
      message,
      httpStatusCode: 400,
      isRetryable: true,
      details,
    });
    this.name = 'ThroughputError';
  }
}

/**
 * Error for provisioned throughput exceeded
 */
export class ProvisionedThroughputExceededError extends ThroughputError {
  constructor(tableName?: string) {
    super(
      tableName
        ? `Provisioned throughput exceeded for table: ${tableName}`
        : 'Provisioned throughput exceeded',
      'ProvisionedThroughputExceededException'
    );
    this.name = 'ProvisionedThroughputExceededError';
  }
}

/**
 * Error for request limit exceeded
 */
export class RequestLimitExceededError extends ThroughputError {
  constructor() {
    super('Request rate limit exceeded', 'RequestLimitExceeded');
    this.name = 'RequestLimitExceededError';
  }
}

/**
 * Error for throttling
 */
export class ThrottlingExceptionError extends ThroughputError {
  constructor(message: string = 'Request throttled') {
    super(message, 'ThrottlingException');
    this.name = 'ThrottlingExceptionError';
  }
}

/**
 * Error thrown for item-related issues
 */
export class ItemError extends DynamoDBError {
  constructor(message: string, code: string, httpStatusCode?: number, details?: Record<string, unknown>) {
    super({
      code,
      message,
      httpStatusCode,
      isRetryable: false,
      details,
    });
    this.name = 'ItemError';
  }
}

/**
 * Error for item not found
 */
export class ItemNotFoundError extends ItemError {
  constructor(key: Record<string, unknown>) {
    super(`Item not found with key: ${JSON.stringify(key)}`, 'ItemNotFound', 404);
    this.name = 'ItemNotFoundError';
  }
}

/**
 * Error for item too large
 */
export class ItemTooLargeError extends ItemError {
  constructor(size: number, maxSize: number = 400) {
    super(
      `Item size (${size} KB) exceeds maximum allowed size (${maxSize} KB)`,
      'ItemSizeLimitExceededException',
      400
    );
    this.name = 'ItemTooLargeError';
  }
}

/**
 * Error for item collection size limit exceeded
 */
export class ItemCollectionSizeLimitExceededError extends ItemError {
  constructor(partitionKey: string) {
    super(
      `Item collection size limit exceeded for partition key: ${partitionKey}`,
      'ItemCollectionSizeLimitExceededException',
      400
    );
    this.name = 'ItemCollectionSizeLimitExceededError';
  }
}

/**
 * Error thrown for transaction failures
 */
export class TransactionError extends DynamoDBError {
  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super({
      code,
      message,
      httpStatusCode: 400,
      isRetryable: false,
      details,
    });
    this.name = 'TransactionError';
  }
}

/**
 * Error for transaction canceled
 */
export class TransactionCanceledError extends TransactionError {
  constructor(reasons?: string[]) {
    const message = reasons && reasons.length > 0
      ? `Transaction canceled: ${reasons.join(', ')}`
      : 'Transaction canceled';
    super(message, 'TransactionCanceledException');
    this.name = 'TransactionCanceledError';
  }
}

/**
 * Error for idempotent parameter mismatch
 */
export class IdempotentParameterMismatchError extends TransactionError {
  constructor() {
    super(
      'Idempotent request parameters do not match previous request',
      'IdempotentParameterMismatchException'
    );
    this.name = 'IdempotentParameterMismatchError';
  }
}

/**
 * Error thrown for service-level issues
 */
export class ServiceError extends DynamoDBError {
  constructor(message: string, code: string, httpStatusCode?: number, details?: Record<string, unknown>) {
    super({
      code,
      message,
      httpStatusCode,
      isRetryable: true,
      details,
    });
    this.name = 'ServiceError';
  }
}

/**
 * Error for internal server error
 */
export class InternalServerError extends ServiceError {
  constructor(message: string = 'Internal server error occurred') {
    super(message, 'InternalServerError', 500);
    this.name = 'InternalServerError';
  }
}

/**
 * Error for service unavailable
 */
export class ServiceUnavailableError extends ServiceError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 'ServiceUnavailable', 503);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Error for resource not found
 */
export class ResourceNotFoundError extends ServiceError {
  constructor(resourceType: string, resourceName: string) {
    super(
      `${resourceType} not found: ${resourceName}`,
      'ResourceNotFoundException',
      404
    );
    // Resource not found is generally not retryable
    Object.defineProperty(this, 'isRetryable', { value: false });
    this.name = 'ResourceNotFoundError';
  }
}
