/**
 * AWS IAM Request Types
 *
 * This module contains type definitions for all API request types in AWS IAM/STS.
 */

import type { ContextEntry } from './common.js';

/**
 * Session tag for role assumption
 */
export interface SessionTag {
  /** The tag key */
  key: string;
  /** The tag value */
  value: string;
}

/**
 * Request to assume an IAM role
 */
export interface AssumeRoleRequest {
  /** ARN of the role to assume */
  roleArn: string;
  /** Session name (2-64 characters) */
  sessionName: string;
  /** Session duration in seconds (900-43200) */
  durationSeconds?: number;
  /** External ID for cross-account trust */
  externalId?: string;
  /** Session policy (JSON) to scope down permissions */
  sessionPolicy?: string;
  /** Managed policy ARNs to attach to session */
  policyArns?: string[];
  /** Session tags for audit */
  sessionTags?: SessionTag[];
  /** Transitive tag keys */
  transitiveTagKeys?: string[];
  /** Source identity for audit trail */
  sourceIdentity?: string;
  /** MFA device serial number */
  mfaSerial?: string;
  /** MFA token code */
  mfaToken?: string;
}

/**
 * Request to assume a role with web identity (OIDC)
 */
export interface AssumeRoleWithWebIdentityRequest {
  /** ARN of the role to assume */
  roleArn: string;
  /** Session name (2-64 characters) */
  sessionName: string;
  /** OIDC web identity token */
  webIdentityToken: string;
  /** Identity provider URL (optional) */
  providerId?: string;
  /** Session duration in seconds (900-43200) */
  durationSeconds?: number;
  /** Session policy (JSON) to scope down permissions */
  sessionPolicy?: string;
  /** Managed policy ARNs to attach to session */
  policyArns?: string[];
}

/**
 * Request to get a session token (for MFA)
 */
export interface GetSessionTokenRequest {
  /** Session duration in seconds (900-129600) */
  durationSeconds?: number;
  /** MFA device serial number */
  mfaSerial?: string;
  /** MFA token code */
  mfaToken?: string;
}

/**
 * Request to simulate principal policy
 */
export interface SimulatePolicyRequest {
  /** Principal ARN to simulate */
  principalArn: string;
  /** Actions to simulate */
  actionNames: string[];
  /** Resource ARNs (optional) */
  resourceArns?: string[];
  /** Context entries (conditions) */
  contextEntries?: ContextEntry[];
  /** Resource policy (optional) */
  resourcePolicy?: string;
  /** Calling principal ARN (optional) */
  callerArn?: string;
}
