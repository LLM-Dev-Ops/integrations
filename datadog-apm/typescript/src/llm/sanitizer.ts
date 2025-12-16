/**
 * Content sanitizer for LLM spans
 * Redacts sensitive information from prompts and responses
 */

/**
 * Sanitization rule
 */
export interface SanitizationRule {
  pattern: RegExp;
  replacement: string;
  description?: string;
}

/**
 * Default sanitization rules
 */
const DEFAULT_RULES: SanitizationRule[] = [
  {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '[EMAIL]',
    description: 'Email addresses',
  },
  {
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[SSN]',
    description: 'Social Security Numbers',
  },
  {
    pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
    replacement: '[CREDIT_CARD]',
    description: 'Credit card numbers',
  },
  {
    pattern: /\b(?:\+?1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b/g,
    replacement: '[PHONE]',
    description: 'Phone numbers',
  },
  {
    pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    replacement: '[IP_ADDRESS]',
    description: 'IP addresses',
  },
  {
    pattern: /sk-[a-zA-Z0-9]{48}/g,
    replacement: '[API_KEY]',
    description: 'OpenAI API keys',
  },
  {
    pattern: /sk-ant-[a-zA-Z0-9-]{95}/g,
    replacement: '[API_KEY]',
    description: 'Anthropic API keys',
  },
];

/**
 * Content sanitizer class
 */
export class ContentSanitizer {
  private rules: SanitizationRule[];
  private enabled: boolean;

  constructor(options: {
    enabled?: boolean;
    customRules?: SanitizationRule[];
    includeDefaultRules?: boolean;
  } = {}) {
    this.enabled = options.enabled ?? true;

    this.rules = [];
    if (options.includeDefaultRules !== false) {
      this.rules.push(...DEFAULT_RULES);
    }
    if (options.customRules) {
      this.rules.push(...options.customRules);
    }
  }

  /**
   * Sanitize content by applying all rules
   * @param content - Content to sanitize
   * @returns Sanitized content
   */
  sanitize(content: string): string {
    if (!this.enabled || !content) {
      return content;
    }

    let sanitized = content;
    for (const rule of this.rules) {
      sanitized = sanitized.replace(rule.pattern, rule.replacement);
    }

    return sanitized;
  }

  /**
   * Sanitize an object by applying rules to all string values
   * @param obj - Object to sanitize
   * @returns Sanitized object
   */
  sanitizeObject<T extends Record<string, any>>(obj: T): T {
    if (!this.enabled) {
      return obj;
    }

    const result: any = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.sanitize(value);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.sanitizeObject(value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Add a custom sanitization rule
   * @param rule - Rule to add
   */
  addRule(rule: SanitizationRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove all custom rules
   */
  clearCustomRules(): void {
    this.rules = this.rules.filter((rule) => DEFAULT_RULES.includes(rule));
  }

  /**
   * Enable or disable sanitization
   * @param enabled - Whether to enable sanitization
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if sanitization is enabled
   * @returns True if sanitization is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get all active rules
   * @returns Array of active rules
   */
  getRules(): ReadonlyArray<SanitizationRule> {
    return this.rules;
  }
}