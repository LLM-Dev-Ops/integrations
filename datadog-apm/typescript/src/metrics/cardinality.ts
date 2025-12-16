/**
 * CardinalityProtector - Prevents high-cardinality metrics tags
 */

import { Tags, TagValue } from '../types';

/**
 * CardinalityProtectorConfig - Configuration for cardinality protection
 */
export interface CardinalityProtectorConfig {
  maxUniqueValues?: number;
  allowedTags?: Set<string>;
  blockedPatterns?: RegExp[];
}

/**
 * CardinalityProtector prevents high-cardinality tag values from being emitted
 */
export class CardinalityProtector {
  private maxUniqueValues: number;
  private allowedTags: Set<string>;
  private blockedPatterns: RegExp[];
  private tagValueCache: Map<string, Set<string>>;
  private warned: Set<string>;

  constructor(config: CardinalityProtectorConfig = {}) {
    this.maxUniqueValues = config.maxUniqueValues ?? 100;
    this.allowedTags = config.allowedTags ?? new Set([
      'env',
      'service',
      'version',
      'host',
      'region',
      'availability_zone',
      'status',
      'error_type',
      'method',
      'endpoint',
      'model',
      'provider',
    ]);

    // Default blocked patterns for high-cardinality values
    this.blockedPatterns = config.blockedPatterns ?? [
      /user_id/i,
      /request_id/i,
      /trace_id/i,
      /session/i,
      /token/i,
      /uuid/i,
      /guid/i,
      /timestamp/i,
      /email/i,
      /phone/i,
      /ip_address/i,
    ];

    this.tagValueCache = new Map();
    this.warned = new Set();
  }

  /**
   * Filter tags to prevent high-cardinality values
   */
  filter(tags: Tags): Tags {
    const filtered: Tags = {};

    for (const [key, value] of Object.entries(tags)) {
      // Always allow explicitly allowed tags
      if (this.allowedTags.has(key)) {
        filtered[key] = value;
        continue;
      }

      // Block tags matching high-cardinality patterns
      if (this.isBlockedPattern(key)) {
        this.warnOnce(key, 'blocked due to high-cardinality pattern');
        continue;
      }

      // Check unique value count
      if (!this.canAddValue(key, String(value))) {
        this.warnOnce(key, 'exceeded max unique values');
        continue;
      }

      filtered[key] = value;
    }

    return filtered;
  }

  /**
   * Check if a tag key matches a blocked pattern
   */
  private isBlockedPattern(key: string): boolean {
    return this.blockedPatterns.some(pattern => pattern.test(key));
  }

  /**
   * Check if we can add a new value for a tag key
   */
  private canAddValue(key: string, value: string): boolean {
    if (!this.tagValueCache.has(key)) {
      this.tagValueCache.set(key, new Set());
    }

    const valueSet = this.tagValueCache.get(key)!;

    // If value already exists, allow it
    if (valueSet.has(value)) {
      return true;
    }

    // Check if we've reached the limit
    if (valueSet.size >= this.maxUniqueValues) {
      return false;
    }

    // Add new value
    valueSet.add(value);
    return true;
  }

  /**
   * Warn once per tag key to avoid log spam
   */
  private warnOnce(key: string, reason: string): void {
    const warningKey = `${key}:${reason}`;

    if (!this.warned.has(warningKey)) {
      this.warned.add(warningKey);
      console.warn(
        `[CardinalityProtector] Tag "${key}" ${reason}. ` +
        `This tag will be dropped to prevent high-cardinality metrics.`
      );
    }
  }

  /**
   * Add a tag key to the allowed list
   */
  allowTag(key: string): void {
    this.allowedTags.add(key);
  }

  /**
   * Remove a tag key from the allowed list
   */
  disallowTag(key: string): void {
    this.allowedTags.delete(key);
  }

  /**
   * Reset the cardinality tracking
   */
  reset(): void {
    this.tagValueCache.clear();
    this.warned.clear();
  }

  /**
   * Get statistics about tracked tags
   */
  getStats(): { tag: string; uniqueValues: number }[] {
    const stats: { tag: string; uniqueValues: number }[] = [];

    for (const [tag, valueSet] of this.tagValueCache.entries()) {
      stats.push({
        tag,
        uniqueValues: valueSet.size,
      });
    }

    return stats.sort((a, b) => b.uniqueValues - a.uniqueValues);
  }
}
