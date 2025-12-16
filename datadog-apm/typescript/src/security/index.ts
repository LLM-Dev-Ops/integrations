/**
 * Security module exports
 *
 * Provides PII redaction, tag blocking, and safe serialization
 *
 * @module security
 */

// Rules exports
export {
  type RedactionRule,
  DEFAULT_REDACTION_RULES,
  BLOCKED_TAG_KEYS,
  BLOCKED_TAG_PATTERNS,
  ALLOWED_TAGS,
  HIGH_CARDINALITY_PATTERNS,
} from './rules.js';

// Redaction exports
export { PIIRedactor } from './redaction.js';

// Blocker exports
export { type BlockerLogger, TagBlocker } from './blocker.js';

// Serializer exports
export { SafeTagSerializer } from './serializer.js';
