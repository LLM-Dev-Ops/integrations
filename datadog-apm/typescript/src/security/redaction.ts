/**
 * PII Redaction implementation
 *
 * @module security/redaction
 */

import { RedactionRule, DEFAULT_REDACTION_RULES } from './rules.js';

/**
 * PII Redactor for sanitizing sensitive data
 */
export class PIIRedactor {
  private rules: RedactionRule[];
  private customRules: RedactionRule[] = [];

  constructor(additionalRules?: RedactionRule[]) {
    this.rules = [...DEFAULT_REDACTION_RULES];
    if (additionalRules) {
      this.customRules = additionalRules;
    }
  }

  /**
   * Add a custom redaction rule
   */
  addRule(rule: RedactionRule): void {
    this.customRules.push(rule);
  }

  /**
   * Remove a rule by name
   */
  removeRule(name: string): boolean {
    const customIndex = this.customRules.findIndex((r) => r.name === name);
    if (customIndex >= 0) {
      this.customRules.splice(customIndex, 1);
      return true;
    }
    return false;
  }

  /**
   * Redact sensitive data from a string value
   */
  redact(value: string, context: 'tags' | 'logs' | 'metrics'): string {
    let result = value;

    for (const rule of [...this.rules, ...this.customRules]) {
      if (rule.applyTo.includes(context)) {
        result = result.replace(rule.pattern, rule.replacement);
      }
    }

    return result;
  }

  /**
   * Redact all string values in an object
   */
  redactObject<T extends Record<string, unknown>>(
    obj: T,
    context: 'tags' | 'logs' | 'metrics'
  ): T {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.redact(value, context);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.redactObject(value as Record<string, unknown>, context);
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === 'string'
            ? this.redact(item, context)
            : typeof item === 'object' && item !== null
            ? this.redactObject(item as Record<string, unknown>, context)
            : item
        );
      } else {
        result[key] = value;
      }
    }

    return result as T;
  }

  /**
   * Check if a value contains sensitive data
   */
  containsSensitiveData(value: string): boolean {
    for (const rule of [...this.rules, ...this.customRules]) {
      if (rule.pattern.test(value)) {
        // Reset the regex lastIndex for global patterns
        rule.pattern.lastIndex = 0;
        return true;
      }
      // Reset for next check
      rule.pattern.lastIndex = 0;
    }
    return false;
  }

  /**
   * Get all rule names
   */
  getRuleNames(): string[] {
    return [...this.rules, ...this.customRules].map((r) => r.name);
  }
}
