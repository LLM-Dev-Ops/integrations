/**
 * Webhook Module Exports
 *
 * Handles HubSpot webhook processing, validation, and routing
 */

// Main processor
export {
  WebhookProcessor,
  InvalidSignatureError,
  MalformedPayloadError,
} from './processor.js';
export type {
  WebhookProcessorConfig,
  WebhookRequest,
  WebhookProcessingResult,
} from './processor.js';

// Signature validation
export { validateSignatureV3, validateSignatureV1 } from './signature.js';

// Event parsing
export { parseWebhookPayload, parseEvent, parseEventType } from './parser.js';

// Deduplication
export { ProcessedEventsCache } from './dedup.js';

// Router
export { WebhookRouter } from './router.js';
export type { WebhookHandler } from './router.js';
