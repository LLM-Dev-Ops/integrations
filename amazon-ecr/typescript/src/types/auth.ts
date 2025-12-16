/**
 * Authorization types for Amazon ECR.
 *
 * This module provides TypeScript type definitions for ECR authorization,
 * including Docker credentials and login commands.
 *
 * @module types/auth
 */

/**
 * Authorization data from GetAuthorizationToken API.
 */
export interface AuthorizationData {
  /** Base64-encoded authorization token (format: "AWS:password"). */
  readonly authorizationToken: string;
  /** Token expiration timestamp. */
  readonly expiresAt: string;
  /** Docker registry endpoint URL. */
  readonly proxyEndpoint: string;
}

/**
 * Docker credentials for registry login.
 */
export interface DockerCredentials {
  /** Username for Docker login (always "AWS" for ECR). */
  readonly username: string;
  /** Password for Docker login (base64-decoded from authorization token). */
  readonly password: string;
  /** Docker registry URL. */
  readonly registry: string;
  /** Credentials expiration timestamp. */
  readonly expiresAt: string;
}

/**
 * Docker login command.
 */
export interface LoginCommand {
  /** Complete docker login command (with password via stdin for security). */
  readonly command: string;
  /** Command validity expiration timestamp. */
  readonly expiresAt: string;
}
