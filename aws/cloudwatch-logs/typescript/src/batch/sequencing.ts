/**
 * AWS CloudWatch Logs Sequence Token Management
 *
 * This module manages sequence tokens for CloudWatch Logs streams.
 * Note: Sequence tokens are deprecated in newer AWS SDK versions but may still be needed
 * for compatibility with older APIs.
 */

/**
 * Sequence token manager for CloudWatch Logs streams.
 */
export class SequenceTokenManager {
  private tokens: Map<string, string>;

  constructor() {
    this.tokens = new Map();
  }

  /**
   * Gets the sequence token for a log group/stream combination.
   * @param logGroup - Log group name
   * @param logStream - Log stream name
   * @returns The current sequence token or undefined if not set
   */
  getToken(logGroup: string, logStream: string): string | undefined {
    const key = this.makeKey(logGroup, logStream);
    return this.tokens.get(key);
  }

  /**
   * Sets the sequence token for a log group/stream combination.
   * @param logGroup - Log group name
   * @param logStream - Log stream name
   * @param token - The sequence token to set
   */
  setToken(logGroup: string, logStream: string, token: string): void {
    const key = this.makeKey(logGroup, logStream);
    this.tokens.set(key, token);
  }

  /**
   * Invalidates (removes) the sequence token for a log group/stream combination.
   * @param logGroup - Log group name
   * @param logStream - Log stream name
   */
  invalidateToken(logGroup: string, logStream: string): void {
    const key = this.makeKey(logGroup, logStream);
    this.tokens.delete(key);
  }

  /**
   * Clears all sequence tokens.
   */
  clear(): void {
    this.tokens.clear();
  }

  /**
   * Gets the number of tracked sequence tokens.
   * @returns The count of tracked sequence tokens
   */
  size(): number {
    return this.tokens.size;
  }

  /**
   * Creates a unique key for a log group/stream combination.
   * @param logGroup - Log group name
   * @param logStream - Log stream name
   * @returns A unique key string
   */
  private makeKey(logGroup: string, logStream: string): string {
    return `${logGroup}/${logStream}`;
  }
}
