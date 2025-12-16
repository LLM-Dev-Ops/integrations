/**
 * Error types for the Databricks Delta Lake client.
 */

/**
 * Error category for classification
 */
export type ErrorCategory =
  | 'configuration'
  | 'authentication'
  | 'job'
  | 'sql'
  | 'delta'
  | 'catalog'
  | 'service';

/**
 * Base error class for all Databricks errors
 */
export abstract class DatabricksError extends Error {
  abstract readonly category: ErrorCategory;
  abstract readonly isRetryable: boolean;
  readonly statusCode?: number;
  readonly retryAfter?: number;

  constructor(
    message: string,
    options?: { statusCode?: number; retryAfter?: number; cause?: Error }
  ) {
    super(message, { cause: options?.cause });
    this.name = this.constructor.name;
    this.statusCode = options?.statusCode;
    this.retryAfter = options?.retryAfter;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

// ============================================================================
// Configuration Errors
// ============================================================================

/**
 * Configuration error - invalid or missing configuration
 */
export class ConfigurationError extends DatabricksError {
  readonly category = 'configuration' as const;
  readonly isRetryable = false;

  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
  }
}

/**
 * Invalid workspace URL error
 */
export class InvalidWorkspaceUrl extends ConfigurationError {
  constructor(url: string, options?: { cause?: Error }) {
    super(`Invalid workspace URL: ${url}`, options);
  }
}

/**
 * Invalid credentials error
 */
export class InvalidCredentials extends ConfigurationError {
  constructor(message: string = 'Invalid credentials provided', options?: { cause?: Error }) {
    super(message, options);
  }
}

/**
 * Missing configuration error
 */
export class MissingConfiguration extends ConfigurationError {
  readonly field: string;

  constructor(field: string, options?: { cause?: Error }) {
    super(`Missing required configuration: ${field}`, options);
    this.field = field;
  }
}

// ============================================================================
// Authentication Errors
// ============================================================================

/**
 * Authentication error - invalid or expired credentials
 */
export class AuthenticationError extends DatabricksError {
  readonly category = 'authentication' as const;
  readonly isRetryable = false;

  constructor(message: string, options?: { statusCode?: number; cause?: Error }) {
    super(message, { ...options, statusCode: options?.statusCode ?? 401 });
  }
}

/**
 * Token expired error - refresh required
 */
export class TokenExpired extends AuthenticationError {
  override readonly isRetryable = true; // Retryable after token refresh

  constructor(message: string = 'Access token has expired', options?: { statusCode?: number; cause?: Error }) {
    super(message, options);
  }
}

/**
 * Invalid token error
 */
export class InvalidToken extends AuthenticationError {
  constructor(message: string = 'Invalid access token', options?: { statusCode?: number; cause?: Error }) {
    super(message, options);
  }
}

/**
 * Service principal error
 */
export class ServicePrincipalError extends AuthenticationError {
  constructor(message: string, options?: { statusCode?: number; cause?: Error }) {
    super(message, options);
  }
}

/**
 * OAuth flow failed error
 */
export class OAuthFlowFailed extends AuthenticationError {
  readonly flowType?: string;

  constructor(message: string, flowType?: string, options?: { statusCode?: number; cause?: Error }) {
    super(message, options);
    this.flowType = flowType;
  }
}

// ============================================================================
// Job Errors
// ============================================================================

/**
 * Job error - job execution failures
 */
export class JobError extends DatabricksError {
  readonly category = 'job' as const;
  readonly isRetryable = false;
  readonly runId?: string;

  constructor(message: string, runId?: string, options?: { statusCode?: number; cause?: Error }) {
    super(message, options);
    this.runId = runId;
  }
}

/**
 * Job not found error
 */
export class JobNotFound extends JobError {
  constructor(jobId: string, options?: { statusCode?: number; cause?: Error }) {
    super(`Job not found: ${jobId}`, jobId, { ...options, statusCode: options?.statusCode ?? 404 });
  }
}

/**
 * Run failed error
 */
export class RunFailed extends JobError {
  readonly failureReason?: string;

  constructor(runId: string, failureReason?: string, options?: { statusCode?: number; cause?: Error }) {
    super(`Job run failed: ${runId}${failureReason ? ` - ${failureReason}` : ''}`, runId, options);
    this.failureReason = failureReason;
  }
}

/**
 * Run canceled error
 */
export class RunCanceled extends JobError {
  constructor(runId: string, options?: { statusCode?: number; cause?: Error }) {
    super(`Job run was canceled: ${runId}`, runId, options);
  }
}

/**
 * Cluster not available error
 */
export class ClusterNotAvailable extends JobError {
  override readonly isRetryable = true;
  readonly clusterId?: string;

  constructor(clusterId?: string, options?: { statusCode?: number; cause?: Error }) {
    super(`Cluster not available${clusterId ? `: ${clusterId}` : ''}`, undefined, options);
    this.clusterId = clusterId;
  }
}

/**
 * Resource quota exceeded error
 */
export class ResourceQuotaExceeded extends JobError {
  readonly resourceType?: string;

  constructor(resourceType?: string, options?: { statusCode?: number; cause?: Error }) {
    super(`Resource quota exceeded${resourceType ? ` for ${resourceType}` : ''}`, undefined, options);
    this.resourceType = resourceType;
  }
}

// ============================================================================
// SQL Errors
// ============================================================================

/**
 * SQL error - SQL execution failures
 */
export class SqlError extends DatabricksError {
  readonly category = 'sql' as const;
  readonly isRetryable = false;
  readonly statementId?: string;

  constructor(message: string, statementId?: string, options?: { statusCode?: number; cause?: Error }) {
    super(message, options);
    this.statementId = statementId;
  }
}

/**
 * Statement failed error
 */
export class StatementFailed extends SqlError {
  readonly failureReason?: string;

  constructor(statementId: string, failureReason?: string, options?: { statusCode?: number; cause?: Error }) {
    super(`SQL statement failed: ${statementId}${failureReason ? ` - ${failureReason}` : ''}`, statementId, options);
    this.failureReason = failureReason;
  }
}

/**
 * Statement canceled error
 */
export class StatementCanceled extends SqlError {
  constructor(statementId: string, options?: { statusCode?: number; cause?: Error }) {
    super(`SQL statement was canceled: ${statementId}`, statementId, options);
  }
}

/**
 * Warehouse not running error
 */
export class WarehouseNotRunning extends SqlError {
  override readonly isRetryable = true;
  readonly warehouseId?: string;

  constructor(warehouseId?: string, options?: { statusCode?: number; cause?: Error }) {
    super(`SQL warehouse not running${warehouseId ? `: ${warehouseId}` : ''}`, undefined, options);
    this.warehouseId = warehouseId;
  }
}

/**
 * SQL syntax error
 */
export class SyntaxError extends SqlError {
  readonly sqlStatement?: string;

  constructor(message: string, sqlStatement?: string, options?: { statusCode?: number; cause?: Error }) {
    super(message, undefined, { ...options, statusCode: options?.statusCode ?? 400 });
    this.sqlStatement = sqlStatement;
  }
}

/**
 * Permission denied error
 */
export class PermissionDenied extends SqlError {
  readonly resource?: string;

  constructor(message: string, resource?: string, options?: { statusCode?: number; cause?: Error }) {
    super(message, undefined, { ...options, statusCode: options?.statusCode ?? 403 });
    this.resource = resource;
  }
}

// ============================================================================
// Delta Errors
// ============================================================================

/**
 * Delta error - Delta Lake operation failures
 */
export class DeltaError extends DatabricksError {
  readonly category = 'delta' as const;
  readonly isRetryable = false;
  readonly tableName?: string;

  constructor(message: string, tableName?: string, options?: { statusCode?: number; cause?: Error }) {
    super(message, options);
    this.tableName = tableName;
  }
}

/**
 * Table not found error
 */
export class TableNotFound extends DeltaError {
  constructor(tableName: string, options?: { statusCode?: number; cause?: Error }) {
    super(`Delta table not found: ${tableName}`, tableName, { ...options, statusCode: options?.statusCode ?? 404 });
  }
}

/**
 * Schema evolution conflict error
 */
export class SchemaEvolutionConflict extends DeltaError {
  readonly conflictDetails?: string;

  constructor(tableName: string, conflictDetails?: string, options?: { statusCode?: number; cause?: Error }) {
    super(
      `Schema evolution conflict for table ${tableName}${conflictDetails ? `: ${conflictDetails}` : ''}`,
      tableName,
      options
    );
    this.conflictDetails = conflictDetails;
  }
}

/**
 * Concurrent modification error - retryable with backoff
 */
export class ConcurrentModification extends DeltaError {
  override readonly isRetryable = true;
  readonly version?: number;

  constructor(tableName: string, version?: number, options?: { statusCode?: number; cause?: Error }) {
    super(
      `Concurrent modification detected for table ${tableName}${version !== undefined ? ` at version ${version}` : ''}`,
      tableName,
      { ...options, statusCode: options?.statusCode ?? 409 }
    );
    this.version = version;
  }
}

/**
 * Version not found error
 */
export class VersionNotFound extends DeltaError {
  readonly version: number;

  constructor(tableName: string, version: number, options?: { statusCode?: number; cause?: Error }) {
    super(`Version ${version} not found for table ${tableName}`, tableName, { ...options, statusCode: options?.statusCode ?? 404 });
    this.version = version;
  }
}

/**
 * Constraint violation error
 */
export class ConstraintViolation extends DeltaError {
  readonly constraintName?: string;
  readonly violationDetails?: string;

  constructor(
    tableName: string,
    constraintName?: string,
    violationDetails?: string,
    options?: { statusCode?: number; cause?: Error }
  ) {
    super(
      `Constraint violation for table ${tableName}${constraintName ? ` (${constraintName})` : ''}${violationDetails ? `: ${violationDetails}` : ''}`,
      tableName,
      options
    );
    this.constraintName = constraintName;
    this.violationDetails = violationDetails;
  }
}

// ============================================================================
// Catalog Errors
// ============================================================================

/**
 * Catalog error - Unity Catalog failures
 */
export class CatalogError extends DatabricksError {
  readonly category = 'catalog' as const;
  readonly isRetryable = false;

  constructor(message: string, options?: { statusCode?: number; cause?: Error }) {
    super(message, options);
  }
}

/**
 * Catalog not found error
 */
export class CatalogNotFound extends CatalogError {
  readonly catalogName: string;

  constructor(catalogName: string, options?: { statusCode?: number; cause?: Error }) {
    super(`Catalog not found: ${catalogName}`, { ...options, statusCode: options?.statusCode ?? 404 });
    this.catalogName = catalogName;
  }
}

/**
 * Schema not found error
 */
export class SchemaNotFound extends CatalogError {
  readonly schemaName: string;

  constructor(schemaName: string, options?: { statusCode?: number; cause?: Error }) {
    super(`Schema not found: ${schemaName}`, { ...options, statusCode: options?.statusCode ?? 404 });
    this.schemaName = schemaName;
  }
}

/**
 * Access denied error
 */
export class AccessDenied extends CatalogError {
  readonly resource?: string;

  constructor(message: string, resource?: string, options?: { statusCode?: number; cause?: Error }) {
    super(message, { ...options, statusCode: options?.statusCode ?? 403 });
    this.resource = resource;
  }
}

// ============================================================================
// Service Errors
// ============================================================================

/**
 * Service error - Databricks service failures
 */
export class ServiceError extends DatabricksError {
  readonly category = 'service' as const;
  readonly isRetryable = true;

  constructor(message: string, options?: { statusCode?: number; retryAfter?: number; cause?: Error }) {
    super(message, options);
  }
}

/**
 * Rate limited error - respect Retry-After header
 */
export class RateLimited extends ServiceError {
  constructor(message: string = 'Rate limit exceeded', retryAfter?: number, options?: { statusCode?: number; cause?: Error }) {
    super(message, {
      ...options,
      statusCode: options?.statusCode ?? 429,
      retryAfter,
    });
  }
}

/**
 * Service unavailable error
 */
export class ServiceUnavailable extends ServiceError {
  constructor(message: string = 'Service temporarily unavailable', options?: { statusCode?: number; retryAfter?: number; cause?: Error }) {
    super(message, { ...options, statusCode: options?.statusCode ?? 503 });
  }
}

/**
 * Internal error - server-side failure
 */
export class InternalError extends ServiceError {
  constructor(message: string = 'Internal server error', options?: { statusCode?: number; cause?: Error }) {
    super(message, { ...options, statusCode: options?.statusCode ?? 500 });
  }
}

/**
 * Network error - connection or transport failure
 */
export class NetworkError extends ServiceError {
  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof DatabricksError) {
    return error.isRetryable;
  }
  // Network errors are generally retryable
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  return false;
}

/**
 * Get retry-after duration from an error
 */
export function getRetryAfter(error: unknown): number | undefined {
  if (error instanceof DatabricksError) {
    return error.retryAfter;
  }
  return undefined;
}

/**
 * Parse an API error response
 */
export function parseApiError(
  statusCode: number,
  body: unknown,
  headers?: Headers
): DatabricksError {
  const message =
    typeof body === 'object' && body !== null && 'message' in body
      ? String((body as { message: unknown }).message)
      : typeof body === 'object' && body !== null && 'error' in body
        ? String((body as { error: unknown }).error)
        : 'Unknown error';

  const errorCode =
    typeof body === 'object' && body !== null && 'error_code' in body
      ? String((body as { error_code: unknown }).error_code)
      : undefined;

  const retryAfter = headers?.get('retry-after')
    ? parseInt(headers.get('retry-after')!, 10)
    : undefined;

  // HTTP status code mapping per SPARC specification
  switch (statusCode) {
    case 400:
      // Syntax error for SQL operations
      if (errorCode?.includes('PARSE_SYNTAX_ERROR') || message.toLowerCase().includes('syntax')) {
        return new SyntaxError(message);
      }
      return new ConfigurationError(message, { statusCode });

    case 401:
      // Authentication error - check if token expired
      if (errorCode === 'TOKEN_EXPIRED' || message.toLowerCase().includes('expired')) {
        return new TokenExpired(message, { statusCode });
      }
      if (errorCode === 'INVALID_TOKEN' || message.toLowerCase().includes('invalid token')) {
        return new InvalidToken(message, { statusCode });
      }
      return new AuthenticationError(message, { statusCode });

    case 403:
      // Permission denied
      if (errorCode?.includes('CATALOG') || message.toLowerCase().includes('catalog')) {
        return new AccessDenied(message, undefined, { statusCode });
      }
      return new PermissionDenied(message, undefined, { statusCode });

    case 404:
      // Not found - determine resource type
      if (errorCode === 'TABLE_OR_VIEW_NOT_FOUND' || message.toLowerCase().includes('table')) {
        const tableName = extractResourceName(message, 'table');
        return new TableNotFound(tableName || 'unknown', { statusCode });
      }
      if (errorCode === 'CATALOG_NOT_FOUND' || message.toLowerCase().includes('catalog')) {
        const catalogName = extractResourceName(message, 'catalog');
        return new CatalogNotFound(catalogName || 'unknown', { statusCode });
      }
      if (errorCode === 'SCHEMA_NOT_FOUND' || message.toLowerCase().includes('schema')) {
        const schemaName = extractResourceName(message, 'schema');
        return new SchemaNotFound(schemaName || 'unknown', { statusCode });
      }
      if (errorCode === 'JOB_NOT_FOUND' || message.toLowerCase().includes('job')) {
        const jobId = extractResourceName(message, 'job');
        return new JobNotFound(jobId || 'unknown', { statusCode });
      }
      return new TableNotFound('unknown', { statusCode });

    case 409:
      // Concurrent modification - retryable with backoff
      const tableName = extractResourceName(message, 'table');
      return new ConcurrentModification(tableName || 'unknown', undefined, { statusCode });

    case 429:
      // Rate limited - respect Retry-After
      return new RateLimited(message, retryAfter, { statusCode });

    case 500:
      // Internal error - retryable
      return new InternalError(message, { statusCode });

    case 503:
      // Service unavailable - retryable
      return new ServiceUnavailable(message, { statusCode, retryAfter });

    default:
      if (statusCode >= 500) {
        return new InternalError(message, { statusCode });
      }
      return new ServiceError(message, { statusCode, retryAfter });
  }
}

/**
 * Extract resource name from error message
 */
function extractResourceName(message: string, resourceType: string): string | undefined {
  // Try to extract quoted resource name
  const quotedMatch = message.match(/['"`]([^'"`]+)['"`]/);
  if (quotedMatch) {
    return quotedMatch[1];
  }

  // Try to extract after resource type
  const typeMatch = message.match(new RegExp(`${resourceType}\\s+(?:named\\s+)?([\\w.-]+)`, 'i'));
  if (typeMatch) {
    return typeMatch[1];
  }

  return undefined;
}
