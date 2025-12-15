/**
 * AWS IAM TypeScript Types
 *
 * This module exports all type definitions for AWS IAM and STS API.
 *
 * @module @aws/iam/types
 */

// Common types
export type {
  RoleInfo,
  PolicyDocument,
  Statement,
  ContextEntry,
  PermissionCheck,
} from './common.js';

// Request types
export type {
  SessionTag,
  AssumeRoleRequest,
  AssumeRoleWithWebIdentityRequest,
  GetSessionTokenRequest,
  SimulatePolicyRequest,
} from './requests.js';

// Response types
export type {
  AssumedCredentials,
  CallerIdentity,
  SessionCredentials,
  EvaluationResult,
  SimulationResult,
} from './responses.js';

export {
  EvaluationDecision,
} from './responses.js';
