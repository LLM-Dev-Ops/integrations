/**
 * Query Fingerprinting Utilities
 *
 * Utilities for generating unique fingerprints for SQL queries.
 * @module @llmdevops/snowflake-integration/simulation/fingerprint
 */

import { createHash } from 'crypto';
import type { Value } from '../types/index.js';

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
  fingerprint(sql: string, params?: Value[]): string {
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
  hashQuery(normalizedSql: string, params?: Value[]): string {
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
  private serializeParams(params: Value[]): string {
    return JSON.stringify(
      params.map((param) => {
        if (param.type === 'null') {
          return { type: 'null' };
        }
        if (param.type === 'binary') {
          // Convert Uint8Array to base64 for consistent serialization
          return {
            type: 'binary',
            value: Buffer.from(param.value).toString('base64'),
          };
        }
        if (param.type === 'date' || param.type === 'timestamp') {
          // Serialize dates as ISO strings
          return {
            type: param.type,
            value: param.value.toISOString(),
          };
        }
        if (param.type === 'bigint') {
          // Serialize bigint as string
          return {
            type: 'bigint',
            value: param.value.toString(),
          };
        }
        // For other types, use the value directly
        return {
          type: param.type,
          value: param.value,
        };
      })
    );
  }
}

/**
 * Default fingerprinter instance.
 */
export const defaultFingerprinter = new QueryFingerprinter();
