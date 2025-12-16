/**
 * OpenTelemetry Security and Redaction Module
 *
 * Provides security features including attribute redaction, sensitive data masking,
 * and cardinality limiting for OpenTelemetry traces and metrics.
 * @module @integrations/opentelemetry/security
 */

import type { RedactionConfig, SpanAttributes } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Represents an OpenTelemetry attribute key-value pair.
 */
export interface KeyValue {
  key: string;
  value: string | number | boolean | string[] | number[] | boolean[] | undefined;
}

// ============================================================================
// Default Redaction Patterns
// ============================================================================

/**
 * Pattern for detecting OpenAI API keys.
 */
export const OPENAI_KEY_PATTERN = /sk-[a-zA-Z0-9]{32,}/g;

/**
 * Pattern for detecting Anthropic API keys.
 */
export const ANTHROPIC_KEY_PATTERN = /sk-ant-[a-zA-Z0-9\-]{32,}/g;

/**
 * Pattern for detecting AWS access keys.
 */
export const AWS_ACCESS_KEY_PATTERN = /AKIA[0-9A-Z]{16}/g;

/**
 * Pattern for detecting email addresses.
 */
export const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

/**
 * Pattern for detecting credit card numbers.
 */
export const CREDIT_CARD_PATTERN = /\b(?:\d{4}[- ]?){3}\d{4}\b/g;

/**
 * Pattern for detecting JWT tokens.
 */
export const JWT_PATTERN = /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g;

/**
 * Default sensitive key names that should be redacted.
 */
export const DEFAULT_SENSITIVE_KEYS = [
  'password',
  'secret',
  'token',
  'api_key',
  'apikey',
  'authorization',
  'auth',
  'credential',
  'private_key',
  'access_token',
  'refresh_token',
];

/**
 * Default redaction patterns.
 */
export const DEFAULT_REDACTION_PATTERNS = [
  OPENAI_KEY_PATTERN,
  ANTHROPIC_KEY_PATTERN,
  AWS_ACCESS_KEY_PATTERN,
  EMAIL_PATTERN,
  CREDIT_CARD_PATTERN,
  JWT_PATTERN,
];

// ============================================================================
// Redaction Configuration
// ============================================================================

/**
 * Extended redaction configuration with additional security options.
 */
export interface ExtendedRedactionConfig extends RedactionConfig {
  redactCompletions?: boolean;
  patterns?: RegExp[];
  sensitiveKeys?: string[];
  valueLengthLimit?: number;
}

/**
 * Creates a default redaction configuration.
 */
export function createRedactionConfig(
  overrides?: Partial<ExtendedRedactionConfig>
): ExtendedRedactionConfig {
  return {
    redactPrompts: true,
    redactCompletions: true,
    patterns: DEFAULT_REDACTION_PATTERNS,
    sensitiveKeys: DEFAULT_SENSITIVE_KEYS,
    valueLengthLimit: 4096,
    ...overrides,
  };
}

// ============================================================================
// Value Truncation
// ============================================================================

/**
 * Truncates a value to the specified length limit.
 */
export function truncateValue(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return value.substring(0, limit) + '...[TRUNCATED]';
}

// ============================================================================
// Attribute Redactor
// ============================================================================

/**
 * Redacts sensitive attributes from OpenTelemetry spans and metrics.
 */
export class AttributeRedactor {
  private readonly config: ExtendedRedactionConfig;
  private readonly patterns: RegExp[];
  private readonly sensitiveKeys: Set<string>;

  constructor(config?: ExtendedRedactionConfig) {
    this.config = config ?? createRedactionConfig();
    this.patterns = this.config.patterns ?? DEFAULT_REDACTION_PATTERNS;
    this.sensitiveKeys = new Set(
      (this.config.sensitiveKeys ?? DEFAULT_SENSITIVE_KEYS).map((k) => k.toLowerCase())
    );
  }

  /**
   * Checks if an attribute key should be redacted.
   */
  shouldRedact(key: string): boolean {
    const lowerKey = key.toLowerCase();

    // Check if key matches sensitive keys
    if (this.sensitiveKeys.has(lowerKey)) {
      return true;
    }

    // Check if key contains any sensitive keywords
    const sensitiveKeysArray = Array.from(this.sensitiveKeys);
    for (const sensitiveKey of sensitiveKeysArray) {
      if (lowerKey.includes(sensitiveKey)) {
        return true;
      }
    }

    // Check for LLM-specific attributes
    if (this.config.redactPrompts && lowerKey.includes('prompt')) {
      return true;
    }

    if (this.config.redactCompletions && lowerKey.includes('completion')) {
      return true;
    }

    if (this.config.redactResponses && lowerKey.includes('response')) {
      return true;
    }

    if (this.config.redactToolInputs && lowerKey.includes('tool_input')) {
      return true;
    }

    return false;
  }

  /**
   * Redacts a string value using configured patterns.
   */
  redactValue(value: string): string {
    let redacted = value;

    // Apply all redaction patterns
    for (const pattern of this.patterns) {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }

    // Apply custom patterns if provided
    if (this.config.customRedactionPatterns) {
      for (const pattern of this.config.customRedactionPatterns) {
        redacted = redacted.replace(pattern, '[REDACTED]');
      }
    }

    // Apply value length limit
    if (this.config.valueLengthLimit && redacted.length > this.config.valueLengthLimit) {
      redacted = truncateValue(redacted, this.config.valueLengthLimit);
    }

    return redacted;
  }

  /**
   * Redacts an array of KeyValue attributes.
   */
  redactAttributes(attrs: KeyValue[]): KeyValue[] {
    return attrs.map((attr) => {
      // If key should be redacted, redact the entire value
      if (this.shouldRedact(attr.key)) {
        return {
          key: attr.key,
          value: '[REDACTED]',
        };
      }

      // If value is a string, apply pattern-based redaction
      if (typeof attr.value === 'string') {
        return {
          key: attr.key,
          value: this.redactValue(attr.value),
        };
      }

      // If value is an array of strings, redact each element
      if (Array.isArray(attr.value) && attr.value.every((v) => typeof v === 'string')) {
        return {
          key: attr.key,
          value: (attr.value as string[]).map((v) => this.redactValue(v)),
        };
      }

      // Return other types as-is
      return attr;
    });
  }

  /**
   * Redacts SpanAttributes object.
   */
  redactSpanAttributes(attrs: SpanAttributes): SpanAttributes {
    const result: SpanAttributes = {};

    for (const [key, value] of Object.entries(attrs)) {
      // If key should be redacted, redact the entire value
      if (this.shouldRedact(key)) {
        result[key] = '[REDACTED]';
        continue;
      }

      // If value is a string, apply pattern-based redaction
      if (typeof value === 'string') {
        result[key] = this.redactValue(value);
        continue;
      }

      // If value is an array of strings, redact each element
      if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
        result[key] = (value as string[]).map((v) => this.redactValue(v));
        continue;
      }

      // Return other types as-is
      result[key] = value;
    }

    return result;
  }
}

// ============================================================================
// Cardinality Limiter
// ============================================================================

/**
 * Limits attribute cardinality to prevent metric explosion.
 */
export class CardinalityLimiter {
  private readonly limits: Map<string, number>;
  private readonly valueCounts: Map<string, Map<string, number>>;

  constructor(limits?: Map<string, number>) {
    this.limits = limits ?? this.getDefaultLimits();
    this.valueCounts = new Map();
  }

  /**
   * Gets default cardinality limits for common attributes.
   */
  private getDefaultLimits(): Map<string, number> {
    return new Map([
      ['gen_ai.request.model', 50],
      ['agent.name', 100],
      ['agent.tool.name', 200],
      ['gen_ai.system', 10],
      ['gen_ai.operation.name', 50],
      ['http.route', 100],
      ['http.target', 100],
      ['db.operation', 50],
      ['messaging.destination', 100],
    ]);
  }

  /**
   * Sanitizes an attribute value to respect cardinality limits.
   */
  sanitizeAttribute(key: string, value: string): string {
    const limit = this.limits.get(key);
    if (!limit) {
      // No limit configured, return as-is
      return value;
    }

    // Get or create value count map for this key
    if (!this.valueCounts.has(key)) {
      this.valueCounts.set(key, new Map());
    }
    const counts = this.valueCounts.get(key)!;

    // If we've seen this value before, return it
    if (counts.has(value)) {
      return value;
    }

    // If we're under the limit, add this value
    if (counts.size < limit) {
      counts.set(value, 1);
      return value;
    }

    // We're at the limit, return a generic value
    return `${key}_other`;
  }

  /**
   * Sanitizes multiple attributes.
   */
  sanitizeAttributes(attrs: KeyValue[]): KeyValue[] {
    return attrs.map((attr) => {
      if (typeof attr.value === 'string') {
        return {
          key: attr.key,
          value: this.sanitizeAttribute(attr.key, attr.value),
        };
      }
      return attr;
    });
  }

  /**
   * Sanitizes SpanAttributes object.
   */
  sanitizeSpanAttributes(attrs: SpanAttributes): SpanAttributes {
    const result: SpanAttributes = {};

    for (const [key, value] of Object.entries(attrs)) {
      if (typeof value === 'string') {
        result[key] = this.sanitizeAttribute(key, value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Resets cardinality tracking for a specific key or all keys.
   */
  reset(key?: string): void {
    if (key) {
      this.valueCounts.delete(key);
    } else {
      this.valueCounts.clear();
    }
  }

  /**
   * Gets the current cardinality for a specific key.
   */
  getCardinality(key: string): number {
    return this.valueCounts.get(key)?.size ?? 0;
  }

  /**
   * Gets all tracked keys and their cardinalities.
   */
  getCardinalityStats(): Map<string, number> {
    const stats = new Map<string, number>();
    const entries = Array.from(this.valueCounts.entries());
    for (const [key, counts] of entries) {
      stats.set(key, counts.size);
    }
    return stats;
  }
}

// ============================================================================
// Exports
// ============================================================================

export type { RedactionConfig } from '../types/index.js';
