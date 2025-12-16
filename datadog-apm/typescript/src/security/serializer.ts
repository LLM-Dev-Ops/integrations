/**
 * Safe serializer for handling complex objects with circular references
 *
 * @module security/serializer
 */

/**
 * Safe tag serializer that handles circular references and complex objects
 */
export class SafeTagSerializer {
  private maxDepth: number;
  private maxLength: number;

  constructor(options?: { maxDepth?: number; maxLength?: number }) {
    this.maxDepth = options?.maxDepth ?? 3;
    this.maxLength = options?.maxLength ?? 1000;
  }

  /**
   * Serialize a value safely to a string
   */
  serialize(value: unknown, depth: number = 0): string {
    if (depth > this.maxDepth) {
      return '[max depth exceeded]';
    }

    if (value === null) {
      return 'null';
    }

    if (value === undefined) {
      return 'undefined';
    }

    const type = typeof value;

    if (type === 'string') {
      return this.truncate(value as string);
    }

    if (type === 'number' || type === 'boolean') {
      return String(value);
    }

    if (type === 'bigint') {
      return `${value}n`;
    }

    if (type === 'symbol') {
      return value.toString();
    }

    if (type === 'function') {
      return '[function]';
    }

    if (type === 'object') {
      return this.serializeObject(value as object, depth);
    }

    return String(value);
  }

  /**
   * Serialize an object with circular reference protection
   */
  private serializeObject(obj: object, depth: number): string {
    if (obj instanceof Date) {
      return obj.toISOString();
    }

    if (obj instanceof Error) {
      return `${obj.name}: ${obj.message}`;
    }

    if (obj instanceof RegExp) {
      return obj.toString();
    }

    if (Array.isArray(obj)) {
      if (depth >= this.maxDepth) {
        return `[Array(${obj.length})]`;
      }
      const items = obj.slice(0, 10).map((item) => this.serialize(item, depth + 1));
      const result = `[${items.join(', ')}${obj.length > 10 ? ', ...' : ''}]`;
      return this.truncate(result);
    }

    try {
      // Use WeakSet to detect circular references
      const seen = new WeakSet<object>();
      const result = JSON.stringify(
        obj,
        (key, val) => {
          if (typeof val === 'object' && val !== null) {
            if (seen.has(val)) {
              return '[circular]';
            }
            seen.add(val);
          }
          if (typeof val === 'bigint') {
            return `${val}n`;
          }
          if (typeof val === 'function') {
            return '[function]';
          }
          if (typeof val === 'symbol') {
            return val.toString();
          }
          return val;
        },
        0
      );
      return this.truncate(result);
    } catch {
      return '[serialization error]';
    }
  }

  /**
   * Truncate a string to the maximum length
   */
  private truncate(str: string): string {
    if (str.length > this.maxLength) {
      return str.substring(0, this.maxLength) + '...[truncated]';
    }
    return str;
  }

  /**
   * Sanitize a tag key to be Datadog-compliant
   */
  sanitizeKey(key: string): string {
    return key
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .toLowerCase()
      .substring(0, 200);
  }

  /**
   * Sanitize a tag value to be Datadog-compliant
   */
  sanitizeValue(value: unknown): string {
    const str = this.serialize(value);
    // Remove characters that could break DogStatsD protocol
    return str.replace(/[,|]/g, '_').substring(0, 200);
  }
}
