/**
 * Redaction rules for PII and sensitive data
 *
 * @module security/rules
 */

/**
 * Redaction rule definition
 */
export interface RedactionRule {
  /** Rule name for identification */
  name: string;
  /** Pattern to match */
  pattern: RegExp;
  /** Replacement text */
  replacement: string;
  /** Where to apply the rule */
  applyTo: ('tags' | 'logs' | 'metrics')[];
}

/**
 * Default redaction rules for common PII patterns
 */
export const DEFAULT_REDACTION_RULES: RedactionRule[] = [
  {
    name: 'email',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[EMAIL_REDACTED]',
    applyTo: ['tags', 'logs'],
  },
  {
    name: 'phone',
    pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    replacement: '[PHONE_REDACTED]',
    applyTo: ['tags', 'logs'],
  },
  {
    name: 'ssn',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    replacement: '[SSN_REDACTED]',
    applyTo: ['tags', 'logs'],
  },
  {
    name: 'credit_card',
    pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
    replacement: '[CC_REDACTED]',
    applyTo: ['tags', 'logs'],
  },
  {
    name: 'api_key',
    pattern: /\b(sk-|pk_|api[_-]?key[=:]\s*)[a-zA-Z0-9]{20,}\b/gi,
    replacement: '[API_KEY_REDACTED]',
    applyTo: ['tags', 'logs'],
  },
  {
    name: 'bearer_token',
    pattern: /Bearer\s+[a-zA-Z0-9._-]+/gi,
    replacement: 'Bearer [TOKEN_REDACTED]',
    applyTo: ['tags', 'logs'],
  },
  {
    name: 'jwt',
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    replacement: '[JWT_REDACTED]',
    applyTo: ['tags', 'logs'],
  },
  {
    name: 'password_value',
    pattern: /password[=:]\s*[^\s,;]+/gi,
    replacement: 'password=[REDACTED]',
    applyTo: ['tags', 'logs'],
  },
];

/**
 * Tags that are always blocked from being set
 */
export const BLOCKED_TAG_KEYS = new Set([
  'password',
  'passwd',
  'secret',
  'api_key',
  'apikey',
  'api-key',
  'authorization',
  'auth_token',
  'access_token',
  'refresh_token',
  'private_key',
  'credential',
  'ssn',
  'social_security',
]);

/**
 * Patterns for tag keys that should be blocked
 */
export const BLOCKED_TAG_PATTERNS: RegExp[] = [
  /password/i,
  /secret/i,
  /^token$/i,
  /private.*key/i,
  /credential/i,
];

/**
 * Tags that are always allowed (for cardinality protection)
 */
export const ALLOWED_TAGS = new Set([
  'env',
  'service',
  'version',
  'llm.provider',
  'llm.model',
  'llm.request_type',
  'agent.name',
  'agent.type',
  'status',
  'error_type',
  'error',
  'span.type',
]);

/**
 * High cardinality patterns to block
 */
export const HIGH_CARDINALITY_PATTERNS: RegExp[] = [
  /user[_-]?id/i,
  /request[_-]?id/i,
  /trace[_-]?id/i,
  /session/i,
  /uuid/i,
  /correlation[_-]?id/i,
];
