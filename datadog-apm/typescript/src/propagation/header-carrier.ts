/**
 * HeaderCarrier - HTTP header carrier implementation for context propagation
 */

/**
 * Carrier interface for context propagation
 */
export interface Carrier {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/**
 * HeaderCarrier implements case-insensitive header storage and retrieval
 * for context propagation across HTTP boundaries.
 */
export class HeaderCarrier implements Carrier {
  private headers: Record<string, string>;

  constructor(headers?: Record<string, string>) {
    this.headers = headers ?? {};
  }

  /**
   * Get header value with case-insensitive lookup
   */
  get(key: string): string | null {
    const lowerKey = key.toLowerCase();

    for (const [k, v] of Object.entries(this.headers)) {
      if (k.toLowerCase() === lowerKey) {
        return v;
      }
    }

    return null;
  }

  /**
   * Set header value
   */
  set(key: string, value: string): void {
    this.headers[key] = value;
  }

  /**
   * Get all headers as object
   */
  toObject(): Record<string, string> {
    return { ...this.headers };
  }
}
