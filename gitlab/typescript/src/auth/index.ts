/**
 * GitLab Pipelines Authentication Module
 *
 * Provides token-based authentication for GitLab API with support for multiple
 * token types and scope validation. Implements secure token handling using the
 * SecretString pattern to prevent accidental exposure in logs or serialization.
 *
 * @module auth
 */

import { SecretString } from '../auth.js';

// ============================================================================
// Token Types
// ============================================================================

/**
 * GitLab token types supported by the API.
 *
 * Different token types have different authentication mechanisms:
 * - PersonalAccessToken: User-scoped, uses PRIVATE-TOKEN header
 * - ProjectAccessToken: Project-scoped, uses PRIVATE-TOKEN header
 * - GroupAccessToken: Group-scoped, uses PRIVATE-TOKEN header
 * - TriggerToken: Pipeline trigger only, passed in request body
 * - CIJobToken: CI/CD job context, uses JOB-TOKEN header
 */
export enum TokenType {
  /**
   * Personal Access Token - user-scoped with configurable scopes.
   * Can access any resource the user has permissions for.
   */
  PersonalAccessToken = 'personal',

  /**
   * Project Access Token - project-scoped access.
   * Limited to a specific project and its resources.
   */
  ProjectAccessToken = 'project',

  /**
   * Group Access Token - group-scoped access.
   * Limited to a specific group and its projects.
   */
  GroupAccessToken = 'group',

  /**
   * Trigger Token - pipeline trigger only.
   * Can only trigger pipelines, passed in request body.
   */
  TriggerToken = 'trigger',

  /**
   * CI Job Token - available within CI/CD jobs.
   * Automatically provided in GitLab CI/CD context.
   */
  CIJobToken = 'ci_job',
}

// ============================================================================
// GitLab Token Class
// ============================================================================

/**
 * Request headers type.
 */
export type Headers = Record<string, string>;

/**
 * GitLab token with type awareness and scope validation.
 *
 * This class wraps a GitLab access token and provides:
 * - Secure storage using SecretString to prevent accidental exposure
 * - Token type awareness for correct authentication header selection
 * - Scope validation to ensure tokens have required permissions
 * - Safe serialization that never exposes the token value
 *
 * @example
 * ```typescript
 * // Create a Personal Access Token with API scope
 * const token = new GitLabToken(
 *   'glpat-xxxxxxxxxxxxxxxxxxxx',
 *   TokenType.PersonalAccessToken,
 *   ['api', 'read_repository']
 * );
 *
 * // Add authentication to request headers
 * const headers = token.addToRequest({});
 *
 * // Validate token has required scope
 * token.validateScopesForOperation('create_pipeline'); // throws if insufficient
 *
 * // Safe serialization
 * console.log(token.toString()); // "[REDACTED]"
 * JSON.stringify(token); // "[REDACTED]"
 * ```
 */
export class GitLabToken {
  /**
   * The secret token value, wrapped to prevent accidental exposure.
   * Never access this directly in logs or serialization.
   */
  private readonly token: SecretString;

  /**
   * The type of token, determines authentication mechanism.
   */
  public readonly tokenType: TokenType;

  /**
   * The scopes granted to this token.
   * Used for validating permissions before operations.
   */
  public readonly scopes: readonly string[];

  /**
   * Creates a new GitLab token instance.
   *
   * @param token - The raw token value (will be wrapped in SecretString)
   * @param tokenType - The type of token (determines auth header)
   * @param scopes - The scopes granted to this token (default: ['api'])
   *
   * @throws {Error} If token is empty or invalid
   */
  constructor(
    token: string,
    tokenType: TokenType = TokenType.PersonalAccessToken,
    scopes: string[] = ['api']
  ) {
    if (!token || token.trim().length === 0) {
      throw new Error('Token cannot be empty');
    }

    this.token = new SecretString(token);
    this.tokenType = tokenType;
    this.scopes = Object.freeze([...scopes]); // Immutable copy
  }

  /**
   * Adds appropriate authentication header to request headers.
   *
   * The header type depends on the token type:
   * - Personal/Project/Group tokens: PRIVATE-TOKEN header
   * - CI Job tokens: JOB-TOKEN header
   * - Trigger tokens: Not added to headers (passed in request body)
   *
   * @param headers - Existing request headers
   * @returns New headers object with authentication added
   *
   * @example
   * ```typescript
   * const token = new GitLabToken('glpat-xxx', TokenType.PersonalAccessToken);
   * const headers = token.addToRequest({ 'Content-Type': 'application/json' });
   * // headers = { 'Content-Type': 'application/json', 'PRIVATE-TOKEN': 'glpat-xxx' }
   * ```
   */
  addToRequest(headers: Headers): Headers {
    const newHeaders = { ...headers };

    switch (this.tokenType) {
      case TokenType.PersonalAccessToken:
      case TokenType.ProjectAccessToken:
      case TokenType.GroupAccessToken:
        newHeaders['PRIVATE-TOKEN'] = this.token.expose();
        break;

      case TokenType.CIJobToken:
        newHeaders['JOB-TOKEN'] = this.token.expose();
        break;

      case TokenType.TriggerToken:
        // Trigger tokens are passed in the request body, not headers
        // Intentionally do nothing here
        break;

      default:
        // Exhaustiveness check - TypeScript will error if new token types are added
        const _exhaustive: never = this.tokenType;
        throw new Error(`Unknown token type: ${_exhaustive}`);
    }

    return newHeaders;
  }

  /**
   * Checks if the token has a specific scope.
   *
   * The 'api' scope grants full access and satisfies any scope requirement.
   *
   * @param required - The scope to check for
   * @returns True if token has the required scope or 'api' scope
   *
   * @example
   * ```typescript
   * const token = new GitLabToken('xxx', TokenType.PersonalAccessToken, ['read_api']);
   * token.hasScope('read_api'); // true
   * token.hasScope('api'); // false
   *
   * const fullToken = new GitLabToken('xxx', TokenType.PersonalAccessToken, ['api']);
   * fullToken.hasScope('read_api'); // true (api scope grants all)
   * fullToken.hasScope('write_repository'); // true (api scope grants all)
   * ```
   */
  hasScope(required: string): boolean {
    return this.scopes.includes(required) || this.scopes.includes('api');
  }

  /**
   * Validates that the token has the required scope for an operation.
   *
   * Scope requirements:
   * - Read operations (read_pipeline, read_job, read_artifact): 'read_api'
   * - Write operations (create_pipeline, cancel_pipeline, retry_pipeline,
   *   play_job, cancel_job): 'api'
   *
   * @param operation - The operation name to validate scopes for
   * @throws {Error} If token lacks the required scope
   *
   * @example
   * ```typescript
   * const token = new GitLabToken('xxx', TokenType.PersonalAccessToken, ['read_api']);
   *
   * token.validateScopesForOperation('read_pipeline'); // OK
   * token.validateScopesForOperation('create_pipeline'); // throws Error
   * ```
   */
  validateScopesForOperation(operation: string): void {
    const required = this.getRequiredScope(operation);

    if (!this.hasScope(required)) {
      throw new Error(
        `Insufficient scopes for operation '${operation}'. ` +
        `Required: '${required}', Available: [${this.scopes.join(', ')}]`
      );
    }
  }

  /**
   * Gets the required scope for a specific operation.
   *
   * @param operation - The operation name
   * @returns The required scope string
   */
  private getRequiredScope(operation: string): string {
    // Read operations require read_api scope
    if ((READ_OPERATIONS as readonly string[]).includes(operation)) {
      return 'read_api';
    }

    // Write operations require api scope
    if ((WRITE_OPERATIONS as readonly string[]).includes(operation)) {
      return 'api';
    }

    // Unknown operations default to api scope (most permissive)
    return 'api';
  }

  /**
   * Returns a safe string representation that never exposes the token.
   *
   * @returns "[REDACTED]" string
   */
  toString(): string {
    return '[REDACTED]';
  }

  /**
   * Custom JSON serialization that never exposes the token.
   * Prevents accidental token exposure in JSON.stringify() calls.
   *
   * @returns "[REDACTED]" string
   */
  toJSON(): string {
    return '[REDACTED]';
  }
}

// ============================================================================
// Scope Definitions
// ============================================================================

/**
 * Operations that require read_api scope.
 * These operations only read data and don't modify resources.
 */
const READ_OPERATIONS = [
  'read_pipeline',
  'read_job',
  'read_artifact',
] as const;

/**
 * Operations that require api scope.
 * These operations modify resources or trigger actions.
 */
const WRITE_OPERATIONS = [
  'create_pipeline',
  'cancel_pipeline',
  'retry_pipeline',
  'play_job',
  'cancel_job',
] as const;

// ============================================================================
// Token Validation Utilities
// ============================================================================

/**
 * Validates a GitLab token format.
 *
 * Performs basic format validation:
 * - Token is not empty
 * - Token has reasonable length (typically 20+ characters)
 * - Personal access tokens start with 'glpat-' (recommended format)
 *
 * Note: This is a basic format check and doesn't verify the token is valid
 * with GitLab API. Invalid tokens will fail when making API requests.
 *
 * @param token - The token string to validate
 * @returns True if token format appears valid
 *
 * @example
 * ```typescript
 * validateToken(''); // false
 * validateToken('abc'); // false (too short)
 * validateToken('glpat-xxxxxxxxxxxxxxxxxxxx'); // true
 * validateToken('valid-looking-token-string'); // true
 * ```
 */
export function validateToken(token: string): boolean {
  // Check token is not empty
  if (!token || token.trim().length === 0) {
    return false;
  }

  // Check minimum length (GitLab tokens are typically 20+ characters)
  if (token.length < 20) {
    return false;
  }

  // If it claims to be a personal access token, verify prefix
  // (but don't require it as older tokens may not have prefix)
  if (token.startsWith('glpat-') && token.length < 26) {
    return false; // glpat- prefix but too short
  }

  return true;
}

/**
 * Creates a GitLab token from environment variables.
 *
 * Looks for token in environment variables (default: GITLAB_TOKEN).
 * Optionally validates the token format.
 *
 * @param options - Configuration options
 * @param options.envVar - Environment variable name (default: 'GITLAB_TOKEN')
 * @param options.tokenType - Token type (default: PersonalAccessToken)
 * @param options.scopes - Token scopes (default: ['api'])
 * @param options.validate - Whether to validate token format (default: true)
 * @returns GitLabToken instance
 * @throws {Error} If environment variable is not set or token is invalid
 *
 * @example
 * ```typescript
 * // Using default GITLAB_TOKEN environment variable
 * const token = createTokenFromEnv();
 *
 * // Using custom environment variable
 * const token = createTokenFromEnv({
 *   envVar: 'CI_JOB_TOKEN',
 *   tokenType: TokenType.CIJobToken
 * });
 * ```
 */
export function createTokenFromEnv(options: {
  envVar?: string;
  tokenType?: TokenType;
  scopes?: string[];
  validate?: boolean;
} = {}): GitLabToken {
  const {
    envVar = 'GITLAB_TOKEN',
    tokenType = TokenType.PersonalAccessToken,
    scopes = ['api'],
    validate = true,
  } = options;

  const token = process.env[envVar];

  if (!token) {
    throw new Error(`Environment variable ${envVar} is not set`);
  }

  if (validate && !validateToken(token)) {
    throw new Error(`Invalid token format in environment variable ${envVar}`);
  }

  return new GitLabToken(token, tokenType, scopes);
}

// ============================================================================
// Exports
// ============================================================================

export { SecretString } from '../auth.js';
