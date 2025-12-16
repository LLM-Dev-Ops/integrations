import { createHash } from 'crypto';

/**
 * Cached response with TTL.
 */
export interface CachedResponse {
  content: string;
  compressed?: Buffer;
  timestamp: number;
  etag: string;
}

/**
 * Simple TTL cache for metrics responses.
 */
export class ResponseCache {
  private cache: CachedResponse | null = null;
  private readonly ttlMs: number;

  constructor(ttlMs: number = 1000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Get cached response if still valid.
   */
  get(): CachedResponse | null {
    if (!this.cache) return null;
    if (Date.now() - this.cache.timestamp > this.ttlMs) {
      this.cache = null;
      return null;
    }
    return this.cache;
  }

  /**
   * Store response in cache.
   */
  set(content: string, compressed?: Buffer): void {
    const etag = this.generateEtag(content);
    this.cache = {
      content,
      compressed,
      timestamp: Date.now(),
      etag
    };
  }

  /**
   * Invalidate cache.
   */
  invalidate(): void {
    this.cache = null;
  }

  /**
   * Generate ETag for content.
   */
  private generateEtag(content: string): string {
    return `"${createHash('md5').update(content).digest('hex')}"`;
  }
}
