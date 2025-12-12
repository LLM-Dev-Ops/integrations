/**
 * Tests for signing key cache
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SigningKeyCache } from './cache';

describe('SigningKeyCache', () => {
  let cache: SigningKeyCache;

  beforeEach(() => {
    cache = new SigningKeyCache();
  });

  describe('basic operations', () => {
    it('should store and retrieve keys', async () => {
      const encoder = new TextEncoder();
      const key = encoder.encode('test-key').buffer;

      await cache.set('20231201', 'us-east-1', 'ses', key);
      const retrieved = await cache.get('20231201', 'us-east-1', 'ses');

      expect(retrieved).toEqual(key);
    });

    it('should return null for non-existent keys', async () => {
      const retrieved = await cache.get('20231201', 'us-east-1', 'ses');
      expect(retrieved).toBeNull();
    });

    it('should handle multiple keys', async () => {
      const encoder = new TextEncoder();
      const key1 = encoder.encode('key1').buffer;
      const key2 = encoder.encode('key2').buffer;

      await cache.set('20231201', 'us-east-1', 'ses', key1);
      await cache.set('20231201', 'us-west-2', 'ses', key2);

      const retrieved1 = await cache.get('20231201', 'us-east-1', 'ses');
      const retrieved2 = await cache.get('20231201', 'us-west-2', 'ses');

      expect(retrieved1).toEqual(key1);
      expect(retrieved2).toEqual(key2);
    });

    it('should differentiate keys by date', async () => {
      const encoder = new TextEncoder();
      const key1 = encoder.encode('key1').buffer;
      const key2 = encoder.encode('key2').buffer;

      await cache.set('20231201', 'us-east-1', 'ses', key1);
      await cache.set('20231202', 'us-east-1', 'ses', key2);

      const retrieved1 = await cache.get('20231201', 'us-east-1', 'ses');
      const retrieved2 = await cache.get('20231202', 'us-east-1', 'ses');

      expect(retrieved1).toEqual(key1);
      expect(retrieved2).toEqual(key2);
    });

    it('should differentiate keys by region', async () => {
      const encoder = new TextEncoder();
      const key1 = encoder.encode('key1').buffer;
      const key2 = encoder.encode('key2').buffer;

      await cache.set('20231201', 'us-east-1', 'ses', key1);
      await cache.set('20231201', 'eu-west-1', 'ses', key2);

      const retrieved1 = await cache.get('20231201', 'us-east-1', 'ses');
      const retrieved2 = await cache.get('20231201', 'eu-west-1', 'ses');

      expect(retrieved1).toEqual(key1);
      expect(retrieved2).toEqual(key2);
    });

    it('should differentiate keys by service', async () => {
      const encoder = new TextEncoder();
      const key1 = encoder.encode('key1').buffer;
      const key2 = encoder.encode('key2').buffer;

      await cache.set('20231201', 'us-east-1', 'ses', key1);
      await cache.set('20231201', 'us-east-1', 's3', key2);

      const retrieved1 = await cache.get('20231201', 'us-east-1', 'ses');
      const retrieved2 = await cache.get('20231201', 'us-east-1', 's3');

      expect(retrieved1).toEqual(key1);
      expect(retrieved2).toEqual(key2);
    });
  });

  describe('delete', () => {
    it('should delete keys', async () => {
      const encoder = new TextEncoder();
      const key = encoder.encode('test-key').buffer;

      await cache.set('20231201', 'us-east-1', 'ses', key);
      expect(cache.size).toBe(1);

      const deleted = cache.delete('20231201', 'us-east-1', 'ses');
      expect(deleted).toBe(true);
      expect(cache.size).toBe(0);

      const retrieved = await cache.get('20231201', 'us-east-1', 'ses');
      expect(retrieved).toBeNull();
    });

    it('should return false when deleting non-existent key', () => {
      const deleted = cache.delete('20231201', 'us-east-1', 'ses');
      expect(deleted).toBe(false);
    });
  });

  describe('has', () => {
    it('should check if key exists', async () => {
      const encoder = new TextEncoder();
      const key = encoder.encode('test-key').buffer;

      expect(cache.has('20231201', 'us-east-1', 'ses')).toBe(false);

      await cache.set('20231201', 'us-east-1', 'ses', key);

      expect(cache.has('20231201', 'us-east-1', 'ses')).toBe(true);
    });

    it('should return true even for expired keys', async () => {
      const encoder = new TextEncoder();
      const key = encoder.encode('test-key').buffer;
      const shortTtl = new SigningKeyCache(1); // 1ms TTL

      await shortTtl.set('20231201', 'us-east-1', 'ses', key);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      // has() returns true even if expired (doesn't check expiration)
      expect(shortTtl.has('20231201', 'us-east-1', 'ses')).toBe(true);

      // get() returns null for expired keys
      const retrieved = await shortTtl.get('20231201', 'us-east-1', 'ses');
      expect(retrieved).toBeNull();
    });
  });

  describe('clear', () => {
    it('should clear all keys', async () => {
      const encoder = new TextEncoder();
      const key1 = encoder.encode('key1').buffer;
      const key2 = encoder.encode('key2').buffer;

      await cache.set('20231201', 'us-east-1', 'ses', key1);
      await cache.set('20231201', 'us-west-2', 'ses', key2);

      expect(cache.size).toBe(2);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(await cache.get('20231201', 'us-east-1', 'ses')).toBeNull();
      expect(await cache.get('20231201', 'us-west-2', 'ses')).toBeNull();
    });
  });

  describe('size', () => {
    it('should return cache size', async () => {
      const encoder = new TextEncoder();
      const key = encoder.encode('test-key').buffer;

      expect(cache.size).toBe(0);

      await cache.set('20231201', 'us-east-1', 'ses', key);
      expect(cache.size).toBe(1);

      await cache.set('20231201', 'us-west-2', 'ses', key);
      expect(cache.size).toBe(2);

      cache.delete('20231201', 'us-east-1', 'ses');
      expect(cache.size).toBe(1);

      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe('expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should expire keys after TTL', async () => {
      const encoder = new TextEncoder();
      const key = encoder.encode('test-key').buffer;
      const ttl = 1000; // 1 second
      const cache = new SigningKeyCache(ttl);

      await cache.set('20231201', 'us-east-1', 'ses', key);

      // Key should be available immediately
      let retrieved = await cache.get('20231201', 'us-east-1', 'ses');
      expect(retrieved).toEqual(key);

      // Advance time by half TTL
      vi.advanceTimersByTime(ttl / 2);
      retrieved = await cache.get('20231201', 'us-east-1', 'ses');
      expect(retrieved).toEqual(key);

      // Advance time past TTL
      vi.advanceTimersByTime(ttl / 2 + 100);
      retrieved = await cache.get('20231201', 'us-east-1', 'ses');
      expect(retrieved).toBeNull();
    });

    it('should use default TTL of 24 hours', async () => {
      const encoder = new TextEncoder();
      const key = encoder.encode('test-key').buffer;

      await cache.set('20231201', 'us-east-1', 'ses', key);

      // Advance time by 23 hours - should still be valid
      vi.advanceTimersByTime(23 * 60 * 60 * 1000);
      let retrieved = await cache.get('20231201', 'us-east-1', 'ses');
      expect(retrieved).toEqual(key);

      // Advance time by 2 more hours - should be expired
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);
      retrieved = await cache.get('20231201', 'us-east-1', 'ses');
      expect(retrieved).toBeNull();
    });

    it('should allow custom TTL', async () => {
      const encoder = new TextEncoder();
      const key = encoder.encode('test-key').buffer;
      const customTtl = 5000; // 5 seconds
      const customCache = new SigningKeyCache(customTtl);

      await customCache.set('20231201', 'us-east-1', 'ses', key);

      // Advance time by 4 seconds - should still be valid
      vi.advanceTimersByTime(4000);
      let retrieved = await customCache.get('20231201', 'us-east-1', 'ses');
      expect(retrieved).toEqual(key);

      // Advance time by 2 more seconds - should be expired
      vi.advanceTimersByTime(2000);
      retrieved = await customCache.get('20231201', 'us-east-1', 'ses');
      expect(retrieved).toBeNull();
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should remove expired entries', async () => {
      const encoder = new TextEncoder();
      const key = encoder.encode('test-key').buffer;
      const ttl = 1000;
      const cache = new SigningKeyCache(ttl);

      // Add multiple entries
      await cache.set('20231201', 'us-east-1', 'ses', key);
      await cache.set('20231201', 'us-west-2', 'ses', key);
      await cache.set('20231202', 'us-east-1', 'ses', key);

      expect(cache.size).toBe(3);

      // Advance time to expire all entries
      vi.advanceTimersByTime(ttl + 100);

      // Cleanup should remove all expired entries
      const removed = cache.cleanup();
      expect(removed).toBe(3);
      expect(cache.size).toBe(0);
    });

    it('should only remove expired entries', async () => {
      const encoder = new TextEncoder();
      const key1 = encoder.encode('key1').buffer;
      const key2 = encoder.encode('key2').buffer;
      const ttl = 1000;
      const cache = new SigningKeyCache(ttl);

      // Add first entry
      await cache.set('20231201', 'us-east-1', 'ses', key1);

      // Advance time by half TTL
      vi.advanceTimersByTime(ttl / 2);

      // Add second entry
      await cache.set('20231201', 'us-west-2', 'ses', key2);

      // Advance time to expire only first entry
      vi.advanceTimersByTime(ttl / 2 + 100);

      // Cleanup should remove only first entry
      const removed = cache.cleanup();
      expect(removed).toBe(1);
      expect(cache.size).toBe(1);

      // Second entry should still be retrievable
      const retrieved = await cache.get('20231201', 'us-west-2', 'ses');
      expect(retrieved).toEqual(key2);
    });

    it('should return 0 when no entries are expired', async () => {
      const encoder = new TextEncoder();
      const key = encoder.encode('test-key').buffer;

      await cache.set('20231201', 'us-east-1', 'ses', key);

      const removed = cache.cleanup();
      expect(removed).toBe(0);
      expect(cache.size).toBe(1);
    });

    it('should return 0 when cache is empty', () => {
      const removed = cache.cleanup();
      expect(removed).toBe(0);
    });
  });

  describe('overwriting keys', () => {
    it('should overwrite existing keys', async () => {
      const encoder = new TextEncoder();
      const key1 = encoder.encode('key1').buffer;
      const key2 = encoder.encode('key2').buffer;

      await cache.set('20231201', 'us-east-1', 'ses', key1);
      await cache.set('20231201', 'us-east-1', 'ses', key2);

      expect(cache.size).toBe(1);

      const retrieved = await cache.get('20231201', 'us-east-1', 'ses');
      expect(retrieved).toEqual(key2);
    });

    it('should reset expiration when overwriting', async () => {
      vi.useFakeTimers();

      const encoder = new TextEncoder();
      const key1 = encoder.encode('key1').buffer;
      const key2 = encoder.encode('key2').buffer;
      const ttl = 1000;
      const cache = new SigningKeyCache(ttl);

      // Set first key
      await cache.set('20231201', 'us-east-1', 'ses', key1);

      // Advance time by 90% of TTL
      vi.advanceTimersByTime(ttl * 0.9);

      // Overwrite with new key (resets expiration)
      await cache.set('20231201', 'us-east-1', 'ses', key2);

      // Advance time by another 50% of TTL
      // If expiration wasn't reset, entry would be expired
      // But since it was reset, it should still be valid
      vi.advanceTimersByTime(ttl * 0.5);

      const retrieved = await cache.get('20231201', 'us-east-1', 'ses');
      expect(retrieved).toEqual(key2);

      vi.useRealTimers();
    });
  });
});
