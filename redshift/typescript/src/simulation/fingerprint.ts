/**
 * Query Fingerprinting Utilities
 *
 * Utilities for generating unique fingerprints for SQL queries.
 * @module @llmdevops/redshift-integration/simulation/fingerprint
 */

import { createHash } from 'crypto';

/**
 * Query fingerprinter for generating unique query fingerprints.
 */
export class QueryFingerprinter {
  /**
   * Generates a unique fingerprint for a query.
   * @param sql - SQL query text
   * @param params - Query parameters
   * @returns Unique fingerprint string
   */
  fingerprint(sql: string, params?: unknown[]): string {
    const normalized = this.normalize(sql);
    return this.hashQuery(normalized, params);
  }

  /**
   * Normalizes SQL for comparison.
   * Removes extra whitespace, comments, and standardizes formatting.
   * @param sql - Raw SQL query text
   * @returns Normalized SQL string
   */
  normalize(sql: string): string {
    let normalized = sql;

    // Remove single-line comments
    normalized = normalized.replace(/--[^\n]*/g, '');

    // Remove multi-line comments
    normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, '');

    // Replace multiple whitespace with single space
    normalized = normalized.replace(/\s+/g, ' ');

    // Trim leading and trailing whitespace
    normalized = normalized.trim();

    // Convert to uppercase for case-insensitive comparison
    normalized = normalized.toUpperCase();

    // Remove trailing semicolon if present
    normalized = normalized.replace(/;$/, '');

    return normalized;
  }

  /**
   * Creates a hash from normalized SQL and parameters.
   * @param normalizedSql - Normalized SQL query text
   * @param params - Query parameters
   * @returns Hash string
   */
  hashQuery(normalizedSql: string, params?: unknown[]): string {
    const hash = createHash('sha256');

    // Hash the normalized SQL
    hash.update(normalizedSql);

    // Hash parameters if provided
    if (params && params.length > 0) {
      const paramsStr = this.serializeParams(params);
      hash.update(paramsStr);
    }

    return hash.digest('hex');
  }

  /**
   * Serializes parameters to a consistent string format.
   * @param params - Query parameters
   * @returns Serialized parameter string
   */
  private serializeParams(params: unknown[]): string {
    return JSON.stringify(
      params.map((param) => {
        if (param === null || param === undefined) {
          return { type: 'null' };
        }
        if (param instanceof Uint8Array || param instanceof Buffer) {
          // Convert binary to base64 for consistent serialization
          return {
            type: 'binary',
            value: Buffer.from(param).toString('base64'),
          };
        }
        if (param instanceof Date) {
          // Serialize dates as ISO strings
          return {
            type: 'date',
            value: param.toISOString(),
          };
        }
        if (typeof param === 'bigint') {
          // Serialize bigint as string
          return {
            type: 'bigint',
            value: param.toString(),
          };
        }
        // For other types, use the value directly
        return {
          type: typeof param,
          value: param,
        };
      })
    );
  }
}

/**
 * Default fingerprinter instance.
 */
export const defaultFingerprinter = new QueryFingerprinter();
