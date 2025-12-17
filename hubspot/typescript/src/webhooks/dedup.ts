/**
 * Webhook Deduplication
 *
 * Prevents duplicate processing of webhook events
 */

/**
 * LRU Cache for tracking processed events
 */
export class ProcessedEventsCache {
  private cache = new Map<string, number>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  /**
   * Create a new processed events cache
   *
   * @param maxSize - Maximum number of events to cache (default: 10000)
   * @param ttlMs - Time-to-live in milliseconds (default: 1 hour)
   */
  constructor(maxSize: number = 10000, ttlMs: number = 3600000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Generate a unique key for an event
   *
   * @param subscriptionId - Subscription ID
   * @param eventId - Event ID
   * @returns Unique cache key
   */
  private getKey(subscriptionId: number, eventId: number): string {
    return `${subscriptionId}:${eventId}`;
  }

  /**
   * Check if an event has already been processed
   *
   * @param subscriptionId - Subscription ID
   * @param eventId - Event ID
   * @returns true if event was already processed
   */
  isProcessed(subscriptionId: number, eventId: number): boolean {
    const key = this.getKey(subscriptionId, eventId);
    const timestamp = this.cache.get(key);

    if (!timestamp) {
      return false;
    }

    // Check if entry has expired
    if (Date.now() - timestamp > this.ttlMs) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Mark an event as processed
   *
   * @param subscriptionId - Subscription ID
   * @param eventId - Event ID
   */
  markProcessed(subscriptionId: number, eventId: number): void {
    const key = this.getKey(subscriptionId, eventId);

    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    // Add new entry
    this.cache.set(key, Date.now());
  }

  /**
   * Remove expired entries from the cache
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.cache.entries()) {
      if (now - timestamp > this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }
}
