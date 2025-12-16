/**
 * Efficient label set storage with pre-computed hash for fast lookups.
 * Implements immutable label sets optimized for use in metric storage.
 */

import { validateLabelSet, ValidationResult } from './validation.js';

/**
 * Efficient storage for label sets with pre-computed hash.
 * Provides immutable label storage with fast equality checks via hash comparison.
 *
 * @example
 * ```typescript
 * const labels = LabelSet.from({
 *   method: 'GET',
 *   status: '200',
 *   endpoint: '/api/users'
 * });
 *
 * console.log(labels.get('method'));  // 'GET'
 * console.log(labels.has('status'));  // true
 *
 * const labels2 = LabelSet.from({
 *   method: 'GET',
 *   status: '200',
 *   endpoint: '/api/users'
 * });
 *
 * console.log(labels.equals(labels2));  // true (same content, same hash)
 * ```
 */
export class LabelSet {
  private readonly labels: Map<string, string>;
  private readonly hash: number;

  /**
   * Creates a new LabelSet.
   * Note: Use LabelSet.from() for validation and error handling.
   *
   * @param labels - Record of label name to value mappings
   * @throws Error if label set validation fails
   */
  constructor(labels: Record<string, string>) {
    // Validate labels
    const validation = validateLabelSet(labels);
    if (!validation.valid) {
      throw new Error(
        `Invalid label set: ${validation.errors.join(', ')}`
      );
    }

    // Create immutable map from labels
    // Sort by key to ensure consistent ordering
    const entries = Object.entries(labels).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    this.labels = new Map(entries);

    // Pre-compute hash for fast equality checks
    this.hash = computeLabelHash(this.labels);
  }

  /**
   * Gets a label value by key.
   *
   * @param key - The label name
   * @returns The label value, or undefined if not present
   *
   * @example
   * ```typescript
   * const labels = LabelSet.from({ method: 'GET', status: '200' });
   * labels.get('method');   // 'GET'
   * labels.get('missing');  // undefined
   * ```
   */
  get(key: string): string | undefined {
    return this.labels.get(key);
  }

  /**
   * Checks if a label exists.
   *
   * @param key - The label name
   * @returns true if the label exists, false otherwise
   *
   * @example
   * ```typescript
   * const labels = LabelSet.from({ method: 'GET' });
   * labels.has('method');   // true
   * labels.has('missing');  // false
   * ```
   */
  has(key: string): boolean {
    return this.labels.has(key);
  }

  /**
   * Returns an iterator over label entries.
   * Entries are in sorted order by label name.
   *
   * @returns Iterator of [key, value] pairs
   *
   * @example
   * ```typescript
   * const labels = LabelSet.from({ method: 'GET', status: '200' });
   * for (const [key, value] of labels.entries()) {
   *   console.log(`${key}=${value}`);
   * }
   * // Output (sorted):
   * // method=GET
   * // status=200
   * ```
   */
  entries(): IterableIterator<[string, string]> {
    return this.labels.entries();
  }

  /**
   * Converts the label set to a plain object.
   *
   * @returns A plain object representation of the labels
   *
   * @example
   * ```typescript
   * const labels = LabelSet.from({ method: 'GET', status: '200' });
   * const obj = labels.toRecord();
   * // { method: 'GET', status: '200' }
   * ```
   */
  toRecord(): Record<string, string> {
    const record: Record<string, string> = {};
    for (const [key, value] of this.labels.entries()) {
      record[key] = value;
    }
    return record;
  }

  /**
   * Checks equality with another LabelSet.
   * Uses hash comparison for fast rejection, then deep comparison if hashes match.
   *
   * @param other - The other LabelSet to compare
   * @returns true if the label sets are equal, false otherwise
   *
   * @example
   * ```typescript
   * const labels1 = LabelSet.from({ method: 'GET', status: '200' });
   * const labels2 = LabelSet.from({ method: 'GET', status: '200' });
   * const labels3 = LabelSet.from({ method: 'POST', status: '201' });
   *
   * labels1.equals(labels2);  // true
   * labels1.equals(labels3);  // false
   * ```
   */
  equals(other: LabelSet): boolean {
    // Fast path: compare hashes first
    if (this.hash !== other.hash) {
      return false;
    }

    // Hash collision check: compare sizes
    if (this.labels.size !== other.labels.size) {
      return false;
    }

    // Deep comparison
    for (const [key, value] of this.labels.entries()) {
      if (other.labels.get(key) !== value) {
        return false;
      }
    }

    return true;
  }

  /**
   * Gets the pre-computed hash for this label set.
   * Useful for using LabelSet as a key in hash maps.
   *
   * @returns The hash value
   *
   * @example
   * ```typescript
   * const labels = LabelSet.from({ method: 'GET' });
   * const hash = labels.getHash();
   * // Use hash for bucketing, caching, etc.
   * ```
   */
  getHash(): number {
    return this.hash;
  }

  /**
   * Returns the number of labels in the set.
   *
   * @returns The number of labels
   *
   * @example
   * ```typescript
   * const labels = LabelSet.from({ method: 'GET', status: '200' });
   * labels.size();  // 2
   * ```
   */
  size(): number {
    return this.labels.size;
  }

  /**
   * Creates a LabelSet from a plain object.
   * This is the preferred way to create label sets.
   *
   * @param labels - Record of label name to value mappings
   * @returns A new LabelSet instance
   * @throws Error if label validation fails
   *
   * @example
   * ```typescript
   * const labels = LabelSet.from({
   *   method: 'GET',
   *   status: '200',
   *   endpoint: '/api/users'
   * });
   * ```
   */
  static from(labels: Record<string, string>): LabelSet {
    return new LabelSet(labels);
  }

  /**
   * Creates an empty LabelSet.
   *
   * @returns An empty LabelSet
   *
   * @example
   * ```typescript
   * const empty = LabelSet.empty();
   * empty.size();  // 0
   * ```
   */
  static empty(): LabelSet {
    return new LabelSet({});
  }

  /**
   * Returns a string representation of the label set.
   * Format: {key1="value1",key2="value2"}
   *
   * @returns String representation
   *
   * @example
   * ```typescript
   * const labels = LabelSet.from({ method: 'GET', status: '200' });
   * labels.toString();  // '{method="GET",status="200"}'
   * ```
   */
  toString(): string {
    if (this.labels.size === 0) {
      return '{}';
    }

    const pairs: string[] = [];
    for (const [key, value] of this.labels.entries()) {
      // Escape quotes in value for proper representation
      const escapedValue = value.replace(/"/g, '\\"');
      pairs.push(`${key}="${escapedValue}"`);
    }

    return `{${pairs.join(',')}}`;
  }
}

/**
 * Computes a hash for a label set for efficient storage and comparison.
 * Uses FNV-1a hash algorithm for good distribution and speed.
 *
 * @param labels - Map of label entries (must be in sorted order)
 * @returns A 32-bit hash value
 *
 * @internal
 */
function computeLabelHash(labels: Map<string, string>): number {
  // FNV-1a hash algorithm constants
  const FNV_OFFSET_BASIS = 2166136261;
  const FNV_PRIME = 16777619;

  let hash = FNV_OFFSET_BASIS;

  // Hash each label key-value pair
  // Since the map is sorted, we get consistent hashes
  for (const [key, value] of labels.entries()) {
    // Hash the key
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, FNV_PRIME);
    }

    // Hash a separator
    hash ^= 0x3d; // '=' character
    hash = Math.imul(hash, FNV_PRIME);

    // Hash the value
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, FNV_PRIME);
    }

    // Hash a separator between pairs
    hash ^= 0x2c; // ',' character
    hash = Math.imul(hash, FNV_PRIME);
  }

  // Convert to unsigned 32-bit integer
  return hash >>> 0;
}

/**
 * Creates a hash key string for a label set.
 * Useful for using label sets as keys in regular objects/maps.
 *
 * @param labels - The label set or record
 * @returns A string key representing the label set
 *
 * @example
 * ```typescript
 * const key1 = createLabelKey({ method: 'GET', status: '200' });
 * const key2 = createLabelKey({ status: '200', method: 'GET' });
 * key1 === key2;  // true (order-independent)
 *
 * // Use as map key
 * const cache = new Map<string, MetricValue>();
 * cache.set(createLabelKey(labels), value);
 * ```
 */
export function createLabelKey(
  labels: Record<string, string> | LabelSet
): string {
  if (labels instanceof LabelSet) {
    // Use the pre-computed hash for efficiency
    return `h${labels.getHash()}`;
  }

  // Create a consistent string representation
  // Sort keys to ensure order-independence
  const keys = Object.keys(labels).sort();
  const pairs = keys.map((key) => {
    const value = labels[key];
    // Escape special characters
    const escapedValue = value.replace(/\\/g, '\\\\').replace(/,/g, '\\,');
    return `${key}=${escapedValue}`;
  });

  return pairs.join(',');
}
