/**
 * AWS IAM Integration Module
 *
 * Provides a comprehensive TypeScript SDK for AWS IAM (Identity and Access Management)
 * and STS (Security Token Service) operations.
 *
 * Features:
 * - Role assumption (AssumeRole, AssumeRoleWithWebIdentity)
 * - Caller identity retrieval
 * - Session token generation
 * - Policy simulation
 * - Role information retrieval
 * - Credential caching with proactive refresh
 * - Role chaining for cross-account access
 *
 * @example Basic usage
 * ```typescript
 * import { IamClient, IamConfigBuilder } from '@aws/iam';
 *
 * const config = new IamConfigBuilder()
 *   .region('us-east-1')
 *   .credentials('AKIAIOSFODNN7EXAMPLE', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')
 *   .build();
 *
 * const client = new IamClient(config);
 *
 * // Get caller identity
 * const identity = await client.getCallerIdentity();
 * console.log(`Account: ${identity.account}`);
 *
 * // Assume a role
 * const credentials = await client.assumeRole({
 *   roleArn: 'arn:aws:iam::123456789012:role/MyRole',
 *   sessionName: 'my-session'
 * });
 * ```
 *
 * @module @aws/iam
 */

// =============================================================================
// Client
// =============================================================================

export {
  IamClient,
  createIamClient,
  type HttpTransport,
} from './client/index.js';

// =============================================================================
// Configuration
// =============================================================================

export {
  IamConfigBuilder,
  configBuilder,
  resolveStsEndpoint,
  resolveIamEndpoint,
  buildUserAgent,
  validateRoleArn,
  validateSessionName,
  validateSessionDuration,
  validateExternalId,
  DEFAULT_CONFIG,
  type IamConfig,
  type CacheConfig,
  type RetryConfig,
  type CircuitBreakerConfig,
  type CrossAccountRoleConfig,
  type SessionTag,
} from './config/index.js';

// =============================================================================
// Types
// =============================================================================

// Common types
export type {
  RoleInfo,
  PolicyDocument,
  Statement,
  ContextEntry,
  PermissionCheck,
} from './types/common.js';

// Request types
export type {
  AssumeRoleRequest,
  AssumeRoleWithWebIdentityRequest,
  GetSessionTokenRequest,
  SimulatePolicyRequest,
} from './types/requests.js';

// Response types
export type {
  AssumedCredentials,
  CallerIdentity,
  SessionCredentials,
  EvaluationResult,
  SimulationResult,
} from './types/responses.js';

export { EvaluationDecision } from './types/responses.js';

// =============================================================================
// Error Handling
// =============================================================================

export {
  IamError,
  mapStsError,
  mapIamError,
  configurationError,
  accessDeniedError,
  roleNotFoundError,
  credentialError,
  wrapError,
  type IamErrorCode,
} from './error/index.js';

// =============================================================================
// Credentials
// =============================================================================

export {
  AssumedRoleCredentialProvider,
  AssumedCredentialCache,
  RoleChainProvider,
  RoleChainBuilder,
  StaticCredentialProvider,
  type CredentialProvider,
  type AwsCredentials,
  type AssumedRoleProviderOptions,
  type RoleChainStep,
  type CacheStats,
} from './credentials/index.js';

// =============================================================================
// STS Service
// =============================================================================

export {
  StsService,
  StsServiceError,
  parseAssumeRoleResponse,
  parseAssumeRoleWithWebIdentityResponse,
  parseCallerIdentityResponse,
  parseSessionTokenResponse,
  parseFederationTokenResponse,
  parseStsError,
  type StsConfig,
  type HttpClient,
  type HttpRequest,
  type HttpResponse,
  type RequestSigner,
  type SigningParams,
  type SignedRequest,
  type GetFederationTokenRequest,
  type StsError,
} from './sts/index.js';

// =============================================================================
// IAM Services
// =============================================================================

export {
  PolicySimulator,
  RoleService,
  parseSimulatePolicyResponse,
  parseGetRoleResponse,
  parseListRolePoliciesResponse,
  parseListAttachedRolePoliciesResponse,
  parseIamError,
} from './iam/index.js';
