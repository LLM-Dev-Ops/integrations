/**
 * Tag blocker for preventing sensitive tags from being set
 *
 * @module security/blocker
 */

import { BLOCKED_TAG_KEYS, BLOCKED_TAG_PATTERNS } from './rules.js';

/**
 * Logger interface for reporting blocked tags
 */
export interface BlockerLogger {
  warn(message: string, context?: Record<string, unknown>): void;
}

/**
 * No-op logger
 */
const noopLogger: BlockerLogger = {
  warn: () => {},
};

/**
 * Tag blocker to prevent sensitive data from being recorded
 */
export class TagBlocker {
  private blockedKeys: Set<string>;
  private blockedPatterns: RegExp[];
  private logger: BlockerLogger;

  constructor(
    additionalBlockedKeys?: string[],
    additionalPatterns?: RegExp[],
    logger?: BlockerLogger
  ) {
    this.blockedKeys = new Set([...BLOCKED_TAG_KEYS]);
    this.blockedPatterns = [...BLOCKED_TAG_PATTERNS];
    this.logger = logger ?? noopLogger;

    if (additionalBlockedKeys) {
      for (const key of additionalBlockedKeys) {
        this.blockedKeys.add(key.toLowerCase());
      }
    }

    if (additionalPatterns) {
      this.blockedPatterns.push(...additionalPatterns);
    }
  }

  /**
   * Check if a tag key should be blocked
   */
  shouldBlock(key: string): boolean {
    const lowerKey = key.toLowerCase();

    // Check exact match
    if (this.blockedKeys.has(lowerKey)) {
      return true;
    }

    // Check patterns
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(key)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Filter tags, removing blocked keys
   */
  filterTags<T>(tags: Record<string, T>): Record<string, T> {
    const filtered: Record<string, T> = {};

    for (const [key, value] of Object.entries(tags)) {
      if (this.shouldBlock(key)) {
        this.logger.warn('Blocked sensitive tag', { key });
        continue;
      }
      filtered[key] = value;
    }

    return filtered;
  }

  /**
   * Add a key to the blocked list
   */
  addBlockedKey(key: string): void {
    this.blockedKeys.add(key.toLowerCase());
  }

  /**
   * Add a pattern to the blocked list
   */
  addBlockedPattern(pattern: RegExp): void {
    this.blockedPatterns.push(pattern);
  }

  /**
   * Check if a key is in the exact blocked list
   */
  isKeyBlocked(key: string): boolean {
    return this.blockedKeys.has(key.toLowerCase());
  }

  /**
   * Get all blocked keys
   */
  getBlockedKeys(): string[] {
    return Array.from(this.blockedKeys);
  }
}
