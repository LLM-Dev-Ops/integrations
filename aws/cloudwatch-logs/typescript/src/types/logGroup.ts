/**
 * AWS CloudWatch Logs Group Types
 *
 * This module contains type definitions for log groups in AWS CloudWatch Logs.
 */

/**
 * Represents a log group.
 */
export interface LogGroup {
  /** The name of the log group */
  logGroupName?: string;
  /** The creation time of the log group, expressed as the number of milliseconds since Jan 1, 1970 00:00:00 UTC */
  creationTime?: number;
  /** The number of days to retain the log events in the log group */
  retentionInDays?: number;
  /** The number of metric filters associated with the log group */
  metricFilterCount?: number;
  /** The Amazon Resource Name (ARN) of the log group */
  arn?: string;
  /** The number of bytes stored in the log group */
  storedBytes?: number;
  /** The Amazon Resource Name (ARN) of the KMS key to use when encrypting log data */
  kmsKeyId?: string;
  /** The data protection status of the log group */
  dataProtectionStatus?: DataProtectionStatus;
  /** Inherited properties from parent resources */
  inheritedProperties?: string[];
  /** The log group class */
  logGroupClass?: LogGroupClass;
  /** The Amazon Resource Name (ARN) of the log group */
  logGroupArn?: string;
}

/**
 * Data protection status for a log group.
 */
export type DataProtectionStatus = 'ACTIVATED' | 'DELETED' | 'ARCHIVED' | 'DISABLED';

/**
 * Log group class determining storage and query capabilities.
 */
export type LogGroupClass = 'STANDARD' | 'INFREQUENT_ACCESS';
