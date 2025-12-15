/**
 * AWS CloudWatch Logs Retention Types
 *
 * This module contains type definitions for log retention policies.
 */

/**
 * Valid retention periods in days.
 * These are the only values accepted by AWS CloudWatch Logs for retention policies.
 */
export type RetentionDays =
  | 1
  | 3
  | 5
  | 7
  | 14
  | 30
  | 60
  | 90
  | 120
  | 150
  | 180
  | 365
  | 400
  | 545
  | 731
  | 1096
  | 1827
  | 2192
  | 2557
  | 2922
  | 3288
  | 3653;
