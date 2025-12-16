/**
 * Scan types for Amazon ECR.
 *
 * This module provides TypeScript type definitions for vulnerability scanning,
 * matching the structure defined in the SPARC specification.
 *
 * @module types/scan
 */

/**
 * Finding severity levels.
 */
export enum Severity {
  /** Informational finding. */
  Informational = 'INFORMATIONAL',
  /** Low severity. */
  Low = 'LOW',
  /** Medium severity. */
  Medium = 'MEDIUM',
  /** High severity. */
  High = 'HIGH',
  /** Critical severity. */
  Critical = 'CRITICAL',
  /** Undefined severity. */
  Undefined = 'UNDEFINED',
}

/**
 * Remediation recommendation.
 */
export interface Recommendation {
  /** Recommendation text. */
  readonly text: string;
  /** Reference URL for remediation. */
  readonly url?: string;
}

/**
 * Remediation information for a vulnerability.
 */
export interface Remediation {
  /** Recommendation details. */
  readonly recommendation: Recommendation;
}

/**
 * Individual vulnerability finding.
 */
export interface Finding {
  /** Vulnerability name/ID */
  readonly name: string;
  /** Description of the vulnerability */
  readonly description?: string;
  /** Reference URI for more information */
  readonly uri?: string;
  /** Severity level */
  readonly severity: Severity;
  /** Additional attributes */
  readonly attributes?: Array<{ readonly key: string; readonly value?: string }>;
}

/**
 * Enhanced vulnerability finding (with AWS Inspector).
 */
export interface EnhancedFinding {
  /** AWS account ID */
  readonly awsAccountId: string;
  /** Finding description */
  readonly description: string;
  /** Finding ARN */
  readonly findingArn: string;
  /** First observation timestamp */
  readonly firstObservedAt: string;
  /** Last observation timestamp */
  readonly lastObservedAt: string;
  /** Package vulnerability details */
  readonly packageVulnerabilityDetails?: {
    readonly cvss?: Array<{
      readonly baseScore?: number;
      readonly scoringVector?: string;
      readonly source?: string;
      readonly version?: string;
    }>;
    readonly referenceUrls?: string[];
    readonly relatedVulnerabilities?: string[];
    readonly source?: string;
    readonly sourceUrl?: string;
    readonly vendorCreatedAt?: string;
    readonly vendorSeverity?: string;
    readonly vendorUpdatedAt?: string;
    readonly vulnerabilityId?: string;
    readonly vulnerablePackages?: Array<{
      readonly arch?: string;
      readonly epoch?: number;
      readonly name?: string;
      readonly packageManager?: string;
      readonly release?: string;
      readonly sourceLayerHash?: string;
      readonly version?: string;
    }>;
  };
  /** Remediation information */
  readonly remediation?: {
    readonly recommendation?: {
      readonly text?: string;
      readonly url?: string;
    };
  };
  /** Affected resources */
  readonly resources?: Array<{
    readonly details?: {
      readonly awsEcrContainerImage?: {
        readonly architecture?: string;
        readonly imageHash?: string;
        readonly imageTags?: string[];
        readonly platform?: string;
        readonly pushedAt?: string;
        readonly registry?: string;
        readonly repositoryName?: string;
      };
    };
    readonly id?: string;
    readonly tags?: Record<string, string>;
    readonly type?: string;
  }>;
  /** CVSS score */
  readonly score?: number;
  /** Score details */
  readonly scoreDetails?: {
    readonly cvss?: {
      readonly adjustments?: Array<{
        readonly metric?: string;
        readonly reason?: string;
      }>;
      readonly score?: number;
      readonly scoreSource?: string;
      readonly scoringVector?: string;
      readonly version?: string;
    };
  };
  /** Severity */
  readonly severity: Severity;
  /** Finding status */
  readonly status?: string;
  /** Finding title */
  readonly title: string;
  /** Finding type */
  readonly type?: string;
  /** Vulnerability ID */
  readonly vulnerabilityId: string;
}

/**
 * Scan state enumeration.
 */
export enum ScanState {
  /** Scan is in progress. */
  InProgress = 'IN_PROGRESS',
  /** Scan completed successfully. */
  Complete = 'COMPLETE',
  /** Scan failed. */
  Failed = 'FAILED',
  /** Image scanning is unsupported. */
  Unsupported = 'UNSUPPORTED_IMAGE',
  /** Scan is active. */
  Active = 'ACTIVE',
  /** Scan is pending. */
  Pending = 'PENDING',
  /** Scan completed with findings. */
  ScanningWithFindings = 'SCANNING',
  /** Findings are unavailable. */
  FindingsUnavailable = 'FINDINGS_UNAVAILABLE',
}

/**
 * Scan status information.
 */
export interface ScanStatus {
  /** Current scan state. */
  readonly status: ScanState;
  /** Optional status description. */
  readonly description?: string;
}

/**
 * Scan findings summary with severity counts.
 */
export interface ScanFindingsSummary {
  /** Count of findings by severity. */
  readonly findingSeverityCounts: Record<string, number>;
  /** Scan completion timestamp. */
  readonly imageScanCompletedAt?: string;
  /** Vulnerability source update timestamp. */
  readonly vulnerabilitySourceUpdatedAt?: string;
}

/**
 * Scan findings result.
 */
export interface ScanFindings {
  /** When the scan completed */
  readonly imageScanCompletedAt: string;
  /** When vulnerability source was last updated */
  readonly vulnerabilitySourceUpdatedAt?: string;
  /** Count of findings by severity */
  readonly findingSeverityCounts: Record<string, number>;
  /** Basic vulnerability findings */
  readonly findings: Finding[];
  /** Enhanced findings (if using Inspector) */
  readonly enhancedFindings?: EnhancedFinding[];
}

/**
 * Options for getting scan findings.
 */
export interface ScanFindingsOptions {
  /** Maximum results to return */
  readonly maxResults?: number;
}

/**
 * Options for waiting for scan completion.
 */
export interface WaitOptions {
  /** Timeout in seconds (default: 1800) */
  readonly timeoutSeconds?: number;
  /** Poll interval in seconds (default: 10) */
  readonly pollIntervalSeconds?: number;
}
