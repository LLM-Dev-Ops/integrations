/**
 * AWS IAM Response Types
 *
 * This module contains type definitions for all API response types in AWS IAM/STS.
 */

import type { Statement } from './common.js';

/**
 * Evaluation decision enum
 */
export enum EvaluationDecision {
  /** The action is allowed */
  Allowed = 'allowed',
  /** The action is denied implicitly (no matching allow) */
  ImplicitDeny = 'implicitDeny',
  /** The action is explicitly denied */
  ExplicitDeny = 'explicitDeny',
}

/**
 * Assumed role credentials
 */
export interface AssumedCredentials {
  /** Access key ID */
  accessKeyId: string;
  /** Secret access key */
  secretAccessKey: string;
  /** Session token */
  sessionToken: string;
  /** Credential expiration time */
  expiration: Date;
  /** Assumed role ARN */
  assumedRoleArn: string;
  /** Assumed role ID */
  assumedRoleId: string;
}

/**
 * Caller identity information
 */
export interface CallerIdentity {
  /** AWS account ID */
  account: string;
  /** Caller ARN */
  arn: string;
  /** User/role ID */
  userId: string;
}

/**
 * Session credentials (from GetSessionToken)
 */
export interface SessionCredentials {
  /** Access key ID */
  accessKeyId: string;
  /** Secret access key */
  secretAccessKey: string;
  /** Session token */
  sessionToken: string;
  /** Credential expiration time */
  expiration: Date;
}

/**
 * Single evaluation result
 */
export interface EvaluationResult {
  /** Action evaluated */
  actionName: string;
  /** Resource evaluated */
  resourceName?: string;
  /** Decision (allowed, implicitDeny, explicitDeny) */
  decision: EvaluationDecision;
  /** Matching statements */
  matchedStatements: Statement[];
  /** Missing context keys */
  missingContextValues: string[];
  /** Organizations decision detail (optional) */
  organizationsDecisionDetail?: {
    /** Whether allowed by organizations */
    allowedByOrganizations?: boolean;
  };
  /** Resource-specific results (optional) */
  resourceSpecificResults?: Array<{
    /** Evaluated resource name */
    evalResourceName: string;
    /** Decision for this resource */
    evalResourceDecision: EvaluationDecision;
  }>;
}

/**
 * Policy simulation result
 */
export interface SimulationResult {
  /** Evaluation results per action/resource */
  evaluationResults: EvaluationResult[];
  /** Whether the simulation is truncated */
  isTruncated?: boolean;
  /** Marker for pagination */
  marker?: string;
}
