/**
 * Lifecycle policy types for Amazon ECR.
 *
 * This module provides TypeScript type definitions for ECR lifecycle policies,
 * matching the structure defined in the SPARC specification.
 *
 * @module types/lifecycle
 */

/**
 * Tag status for lifecycle policy rules.
 */
export enum TagStatus {
  /** Images with at least one tag. */
  Tagged = 'tagged',
  /** Images with no tags. */
  Untagged = 'untagged',
  /** Any image (tagged or untagged). */
  Any = 'any',
}

/**
 * Count type for lifecycle policy selection.
 */
export enum CountType {
  /** Select images by count threshold. */
  ImageCountMoreThan = 'imageCountMoreThan',
  /** Select images by age since push. */
  SinceImagePushed = 'sinceImagePushed',
}

/**
 * Time unit for lifecycle policy count.
 */
export enum CountUnit {
  /** Days. */
  Days = 'days',
}

/**
 * Rule selection criteria for lifecycle policy.
 */
export interface RuleSelection {
  /** Tag status filter. */
  readonly tagStatus: TagStatus;
  /** Tag prefixes to match (for tagged images). */
  readonly tagPrefixList?: string[];
  /** Count type. */
  readonly countType: CountType;
  /** Count threshold. */
  readonly countNumber: number;
  /** Count unit (required for SinceImagePushed). */
  readonly countUnit?: CountUnit;
}

/**
 * Lifecycle policy rule.
 */
export interface LifecyclePolicyRule {
  /** Rule priority (lower numbers are evaluated first). */
  readonly rulePriority: number;
  /** Rule description. */
  readonly description?: string;
  /** Selection criteria. */
  readonly selection: RuleSelection;
  /** Action to take (typically "expire"). */
  readonly action: {
    readonly type: string;
  };
}

/**
 * Lifecycle policy for automatic image cleanup.
 */
export interface LifecyclePolicy {
  /** AWS account ID that owns the repository. */
  readonly registryId: string;
  /** Repository name. */
  readonly repositoryName: string;
  /** Lifecycle policy as JSON string. */
  readonly lifecyclePolicyText: string;
  /** When the policy was last evaluated. */
  readonly lastEvaluatedAt?: string;
}
