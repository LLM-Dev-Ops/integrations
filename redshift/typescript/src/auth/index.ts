/**
 * Amazon Redshift Authentication Module
 *
 * Provides authentication providers for Amazon Redshift database connections.
 * Supports multiple authentication methods:
 * - IAM authentication with temporary credentials (recommended for production)
 * - AWS Secrets Manager for centralized credential management
 * - Static database username/password (for development/testing)
 *
 * The module handles credential caching, automatic refresh, and proactive
 * expiration management to ensure uninterrupted database access.
 *
 * @module @llmdevops/redshift-integration/auth
 *
 * @example
 * ```typescript
 * import { createAuthProvider } from '@llmdevops/redshift-integration/auth';
 *
 * // IAM authentication (recommended)
 * const iamProvider = createAuthProvider({
 *   type: 'iam',
 *   clusterIdentifier: 'my-cluster',
 *   region: 'us-east-1',
 *   dbUser: 'admin'
 * });
 *
 * // Secrets Manager authentication
 * const secretsProvider = createAuthProvider({
 *   type: 'secrets-manager',
 *   secretId: 'prod/redshift/credentials',
 *   region: 'us-east-1'
 * });
 *
 * // Database authentication
 * const dbProvider = createAuthProvider({
 *   type: 'database',
 *   username: 'admin',
 *   password: 'mypassword'
 * });
 *
 * // Get credentials (automatically refreshes if expired)
 * const credentials = await iamProvider.getCredentials();
 *
 * // Check expiration and manually refresh if needed
 * if (iamProvider.isExpired()) {
 *   await iamProvider.refresh();
 * }
 * ```
 */

// ============================================================================
// Core Types and Interfaces
// ============================================================================

export type {
  ConnectionCredentials,
  AuthProvider,
  CredentialSource,
  IamCredentialSource,
  SecretsManagerCredentialSource,
  DatabaseCredentialSource,
} from './provider.js';

export {
  BaseAuthProvider,
} from './provider.js';

// ============================================================================
// Authentication Providers
// ============================================================================

export {
  IamAuthProvider,
  SecretsManagerAuthProvider,
  DatabaseAuthProvider,
  AuthenticationError,
  IamAuthenticationError,
  SecretsManagerError,
} from './iam.js';

// ============================================================================
// Factory Function
// ============================================================================

import type {
  AuthProvider,
  CredentialSource,
  IamCredentialSource,
  SecretsManagerCredentialSource,
  DatabaseCredentialSource,
} from './provider.js';
import {
  IamAuthProvider,
  SecretsManagerAuthProvider,
  DatabaseAuthProvider,
  AuthenticationError,
} from './iam.js';

/**
 * Creates an authentication provider based on the credential source configuration.
 *
 * This is the primary factory function for creating authentication providers.
 * It automatically instantiates the appropriate provider class based on the
 * credential source type.
 *
 * @param credentialSource - Configuration specifying the authentication method
 * @returns An AuthProvider instance configured for the specified method
 * @throws {AuthenticationError} If configuration is invalid or unsupported
 *
 * @example
 * ```typescript
 * // IAM authentication
 * const provider = createAuthProvider({
 *   type: 'iam',
 *   clusterIdentifier: 'my-cluster',
 *   region: 'us-east-1',
 *   dbUser: 'admin',
 *   roleArn: 'arn:aws:iam::123456789012:role/RedshiftRole' // optional
 * });
 *
 * // Secrets Manager authentication
 * const provider = createAuthProvider({
 *   type: 'secrets-manager',
 *   secretId: 'prod/redshift/credentials',
 *   region: 'us-east-1',
 *   cacheTtl: 3600 // optional, default 1 hour
 * });
 *
 * // Database authentication
 * const provider = createAuthProvider({
 *   type: 'database',
 *   username: 'admin',
 *   password: 'mypassword',
 *   database: 'mydb' // optional
 * });
 * ```
 */
export function createAuthProvider(credentialSource: CredentialSource): AuthProvider {
  switch (credentialSource.type) {
    case 'iam':
      return createIamAuthProvider(credentialSource);

    case 'secrets-manager':
      return createSecretsManagerAuthProvider(credentialSource);

    case 'database':
      return createDatabaseAuthProvider(credentialSource);

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = credentialSource;
      throw new AuthenticationError(
        `Unsupported authentication type: ${(_exhaustive as CredentialSource).type}`
      );
  }
}

/**
 * Creates an IAM authentication provider.
 *
 * IAM authentication generates temporary database credentials using AWS IAM.
 * This is the recommended authentication method for production environments
 * as it provides:
 * - Short-lived credentials (15-minute default TTL)
 * - No password storage required
 * - Integration with AWS IAM policies and roles
 * - Support for both provisioned clusters and Serverless workgroups
 *
 * @param config - IAM credential source configuration
 * @returns A configured IamAuthProvider instance
 *
 * @example
 * ```typescript
 * // Basic IAM authentication
 * const provider = createIamAuthProvider({
 *   type: 'iam',
 *   clusterIdentifier: 'my-cluster',
 *   region: 'us-east-1',
 *   dbUser: 'admin'
 * });
 *
 * // With role assumption for cross-account access
 * const provider = createIamAuthProvider({
 *   type: 'iam',
 *   clusterIdentifier: 'my-cluster',
 *   region: 'us-east-1',
 *   dbUser: 'admin',
 *   roleArn: 'arn:aws:iam::123456789012:role/RedshiftRole'
 * });
 *
 * // For Redshift Serverless
 * const provider = createIamAuthProvider({
 *   type: 'iam',
 *   clusterIdentifier: 'my-workgroup',
 *   region: 'us-east-1',
 *   dbUser: 'admin',
 *   isServerless: true
 * });
 * ```
 */
export function createIamAuthProvider(config: IamCredentialSource): IamAuthProvider {
  return new IamAuthProvider(config);
}

/**
 * Creates a Secrets Manager authentication provider.
 *
 * Secrets Manager authentication fetches database credentials from AWS
 * Secrets Manager. This method is useful for:
 * - Centralized credential management
 * - Automatic credential rotation
 * - Sharing credentials across multiple applications
 * - Compliance requirements for secret storage
 *
 * The secret should be stored as JSON with the following structure:
 * ```json
 * {
 *   "username": "dbuser",
 *   "password": "dbpassword",
 *   "database": "mydb",
 *   "host": "cluster.region.redshift.amazonaws.com",
 *   "port": 5439
 * }
 * ```
 *
 * @param config - Secrets Manager credential source configuration
 * @returns A configured SecretsManagerAuthProvider instance
 *
 * @example
 * ```typescript
 * const provider = createSecretsManagerAuthProvider({
 *   type: 'secrets-manager',
 *   secretId: 'prod/redshift/credentials',
 *   region: 'us-east-1',
 *   cacheTtl: 3600 // Cache for 1 hour (default)
 * });
 *
 * // Using secret ARN
 * const provider = createSecretsManagerAuthProvider({
 *   type: 'secrets-manager',
 *   secretId: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:prod/redshift/creds-AbCdEf',
 *   region: 'us-east-1'
 * });
 * ```
 */
export function createSecretsManagerAuthProvider(
  config: SecretsManagerCredentialSource
): SecretsManagerAuthProvider {
  return new SecretsManagerAuthProvider(config);
}

/**
 * Creates a database authentication provider.
 *
 * Database authentication uses static username and password credentials.
 * This is the simplest authentication method but is less secure than
 * IAM or Secrets Manager authentication. Use this method for:
 * - Development and testing environments
 * - Legacy applications
 * - Scenarios where AWS IAM is not available
 *
 * For production environments, prefer IAM or Secrets Manager authentication.
 *
 * @param config - Database credential source configuration
 * @returns A configured DatabaseAuthProvider instance
 * @throws {AuthenticationError} If username or password is missing
 *
 * @example
 * ```typescript
 * const provider = createDatabaseAuthProvider({
 *   type: 'database',
 *   username: 'admin',
 *   password: 'mypassword',
 *   database: 'mydb'
 * });
 *
 * // Minimal configuration
 * const provider = createDatabaseAuthProvider({
 *   type: 'database',
 *   username: 'admin',
 *   password: 'mypassword'
 * });
 * ```
 */
export function createDatabaseAuthProvider(
  config: DatabaseCredentialSource
): DatabaseAuthProvider {
  return new DatabaseAuthProvider(config);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Type guard to check if a credential source is IAM-based.
 *
 * @param source - Credential source to check
 * @returns true if source is IAM credential source
 *
 * @example
 * ```typescript
 * if (isIamCredentialSource(source)) {
 *   console.log(`Using IAM for cluster: ${source.clusterIdentifier}`);
 * }
 * ```
 */
export function isIamCredentialSource(
  source: CredentialSource
): source is IamCredentialSource {
  return source.type === 'iam';
}

/**
 * Type guard to check if a credential source is Secrets Manager-based.
 *
 * @param source - Credential source to check
 * @returns true if source is Secrets Manager credential source
 *
 * @example
 * ```typescript
 * if (isSecretsManagerCredentialSource(source)) {
 *   console.log(`Using Secrets Manager: ${source.secretId}`);
 * }
 * ```
 */
export function isSecretsManagerCredentialSource(
  source: CredentialSource
): source is SecretsManagerCredentialSource {
  return source.type === 'secrets-manager';
}

/**
 * Type guard to check if a credential source is database-based.
 *
 * @param source - Credential source to check
 * @returns true if source is database credential source
 *
 * @example
 * ```typescript
 * if (isDatabaseCredentialSource(source)) {
 *   console.log(`Using database auth for user: ${source.username}`);
 * }
 * ```
 */
export function isDatabaseCredentialSource(
  source: CredentialSource
): source is DatabaseCredentialSource {
  return source.type === 'database';
}
