/**
 * Webhook Processor
 *
 * Main entry point for processing HubSpot webhooks
 */

import type { WebhookEvent } from '../types/webhooks.js';
import type { Logger } from '../types/config.js';
import { validateSignatureV3, InvalidSignatureError } from './signature.js';
import { parseWebhookPayload, MalformedPayloadError } from './parser.js';
import { ProcessedEventsCache } from './dedup.js';
import { WebhookRouter, type WebhookHandler } from './router.js';

/**
 * Webhook processor configuration
 */
export interface WebhookProcessorConfig {
  webhookSecret: string;
  logger?: Logger;
  maxEventAge?: number;
  cacheSize?: number;
  cacheTtl?: number;
}

/**
 * Webhook request context
 */
export interface WebhookRequest {
  method: string;
  url: string;
  body: string;
  headers: Record<string, string>;
}

/**
 * Webhook processing result
 */
export interface WebhookProcessingResult {
  processed: number;
  skipped: number;
  errors: Array<{
    eventId: number;
    error: string;
  }>;
}

/**
 * No-op logger
 */
const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * WebhookProcessor handles incoming HubSpot webhooks
 *
 * Features:
 * - Signature validation
 * - Payload parsing
 * - Event deduplication
 * - Handler routing
 * - Error handling
 */
export class WebhookProcessor {
  private readonly webhookSecret: string;
  private readonly logger: Logger;
  private readonly maxEventAge: number;
  private readonly cache: ProcessedEventsCache;
  private readonly router: WebhookRouter;

  constructor(config: WebhookProcessorConfig) {
    this.webhookSecret = config.webhookSecret;
    this.logger = config.logger ?? noopLogger;
    this.maxEventAge = config.maxEventAge ?? 5 * 60 * 1000; // 5 minutes
    this.cache = new ProcessedEventsCache(config.cacheSize, config.cacheTtl);
    this.router = new WebhookRouter();
  }

  /**
   * Register a handler for webhook events
   *
   * @param pattern - Event pattern (e.g., "contact.creation")
   * @param handler - Handler function
   */
  on(pattern: string, handler: WebhookHandler): void {
    this.router.on(pattern, handler);
    this.logger.debug('Registered webhook handler', { pattern });
  }

  /**
   * Remove a handler for webhook events
   *
   * @param pattern - Event pattern
   * @param handler - Handler to remove (optional)
   */
  off(pattern: string, handler?: WebhookHandler): void {
    this.router.off(pattern, handler);
  }

  /**
   * Process an incoming webhook request
   *
   * @param request - Webhook request
   * @returns Processing result
   * @throws {InvalidSignatureError} if signature is invalid
   * @throws {MalformedPayloadError} if payload is malformed
   */
  async process(request: WebhookRequest): Promise<WebhookProcessingResult> {
    const startTime = Date.now();

    // Validate signature
    const signature = request.headers['x-hubspot-signature-v3'] ?? '';
    const timestamp = request.headers['x-hubspot-request-timestamp'] ?? '';

    try {
      validateSignatureV3(
        this.webhookSecret,
        signature,
        timestamp,
        request.method,
        request.url,
        request.body
      );
    } catch (error) {
      this.logger.error('Webhook signature validation failed', { error });
      throw error;
    }

    // Parse events
    const events = parseWebhookPayload(request.body);

    this.logger.info('Processing webhook events', { count: events.length });

    // Process events
    const result: WebhookProcessingResult = {
      processed: 0,
      skipped: 0,
      errors: [],
    };

    for (const event of events) {
      // Check for duplicates
      if (this.cache.isProcessed(event.subscriptionId, event.eventId)) {
        this.logger.debug('Skipping duplicate event', { eventId: event.eventId });
        result.skipped++;
        continue;
      }

      // Check event age
      const eventAge = Date.now() - event.occurredAt;
      if (eventAge > this.maxEventAge) {
        this.logger.warn('Skipping stale event', {
          eventId: event.eventId,
          age: eventAge,
        });
        result.skipped++;
        continue;
      }

      // Route to handlers
      try {
        const handlerResults = await this.router.route(event);

        // Mark as processed
        this.cache.markProcessed(event.subscriptionId, event.eventId);

        // Check for handler errors
        const handlerErrors = handlerResults.filter((r) => r.error);
        if (handlerErrors.length > 0) {
          for (const { handler, error } of handlerErrors) {
            this.logger.error('Webhook handler error', {
              eventId: event.eventId,
              handler,
              error: error?.message,
            });
            result.errors.push({
              eventId: event.eventId,
              error: `Handler ${handler}: ${error?.message}`,
            });
          }
        }

        result.processed++;
      } catch (error) {
        this.logger.error('Event processing error', {
          eventId: event.eventId,
          error,
        });
        result.errors.push({
          eventId: event.eventId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info('Webhook processing complete', {
      processed: result.processed,
      skipped: result.skipped,
      errors: result.errors.length,
      duration: Date.now() - startTime,
    });

    return result;
  }

  /**
   * Get webhook router for direct access
   */
  getRouter(): WebhookRouter {
    return this.router;
  }

  /**
   * Clear processed events cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Re-export error classes for convenience
export { InvalidSignatureError, MalformedPayloadError };
