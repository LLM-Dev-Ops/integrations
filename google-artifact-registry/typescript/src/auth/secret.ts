/**
 * Secret string wrapper to prevent accidental exposure.
 * @module auth/secret
 */

/**
 * Secret string wrapper that prevents accidental logging or serialization.
 */
export class SecretString {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  /**
   * Exposes the secret value.
   * Use with caution - avoid logging or displaying.
   */
  expose(): string {
    return this.value;
  }

  /**
   * Returns the length of the secret (safe to expose).
   */
  get length(): number {
    return this.value.length;
  }

  /**
   * Returns a safe representation for logging.
   */
  toString(): string {
    return '***REDACTED***';
  }

  /**
   * Custom JSON serialization to prevent accidental exposure.
   */
  toJSON(): string {
    return '***REDACTED***';
  }

  /**
   * Custom inspect for Node.js util.inspect.
   */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return 'SecretString(***REDACTED***)';
  }
}
