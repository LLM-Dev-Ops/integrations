/**
 * Webhook handler registry and event dispatch
 */
import { WebhookProcessingError } from '../../errors/categories.js';
import type {
  WebhookEvent,
  WebhookEventType,
  WebhookHandler,
  WebhookHandlerEntry,
} from '../../types/webhook.js';

/**
 * Handler registry for webhook events
 */
export class WebhookHandlerRegistry {
  private readonly handlers: Map<WebhookEventType, WebhookHandler[]> = new Map();
  private readonly wildcardHandlers: WebhookHandler[] = [];
  private readonly processedEvents: Set<string> = new Set();
  private readonly maxProcessedEvents: number = 10000;

  /**
   * Registers a handler for a specific event type
   */
  on<T = Record<string, unknown>>(
    eventType: WebhookEventType,
    handler: WebhookHandler<T>
  ): this {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler as WebhookHandler);
    this.handlers.set(eventType, existing);
    return this;
  }

  /**
   * Registers a handler for all events
   */
  onAll<T = Record<string, unknown>>(handler: WebhookHandler<T>): this {
    this.wildcardHandlers.push(handler as WebhookHandler);
    return this;
  }

  /**
   * Registers handlers from an array of entries
   */
  registerHandlers(entries: WebhookHandlerEntry[]): this {
    for (const entry of entries) {
      this.on(entry.eventType, entry.handler);
    }
    return this;
  }

  /**
   * Removes a handler for a specific event type
   */
  off(eventType: WebhookEventType, handler: WebhookHandler): this {
    const existing = this.handlers.get(eventType);
    if (existing) {
      const index = existing.indexOf(handler);
      if (index !== -1) {
        existing.splice(index, 1);
      }
    }
    return this;
  }

  /**
   * Processes an event through registered handlers
   */
  async processEvent(event: WebhookEvent): Promise<void> {
    // Check for idempotency - skip already processed events
    if (this.hasProcessed(event.id)) {
      return;
    }

    const handlers = this.getHandlersForEvent(event.type);

    if (handlers.length === 0) {
      // No handlers registered, just mark as processed
      this.markProcessed(event.id);
      return;
    }

    const errors: Error[] = [];

    // Execute all handlers, collecting any errors
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        errors.push(error as Error);
      }
    }

    // Mark as processed even if some handlers failed
    this.markProcessed(event.id);

    // If any handler failed, throw a combined error
    if (errors.length > 0) {
      throw new WebhookProcessingError(
        `${errors.length} handler(s) failed for event ${event.type}`,
        event.id,
        {
          errors: errors.map((e) => e.message),
          eventType: event.type,
        }
      );
    }
  }

  /**
   * Gets handlers for a specific event type
   */
  private getHandlersForEvent(eventType: WebhookEventType): WebhookHandler[] {
    const specific = this.handlers.get(eventType) ?? [];
    return [...specific, ...this.wildcardHandlers];
  }

  /**
   * Checks if an event has already been processed
   */
  hasProcessed(eventId: string): boolean {
    return this.processedEvents.has(eventId);
  }

  /**
   * Marks an event as processed
   */
  private markProcessed(eventId: string): void {
    // Evict old events if at capacity
    if (this.processedEvents.size >= this.maxProcessedEvents) {
      const iterator = this.processedEvents.values();
      const toDelete = Math.ceil(this.maxProcessedEvents * 0.1);
      for (let i = 0; i < toDelete; i++) {
        const value = iterator.next().value;
        if (value) {
          this.processedEvents.delete(value);
        }
      }
    }

    this.processedEvents.add(eventId);
  }

  /**
   * Clears the processed events cache
   */
  clearProcessedEvents(): void {
    this.processedEvents.clear();
  }

  /**
   * Gets registered event types
   */
  getRegisteredEventTypes(): WebhookEventType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Checks if any handlers are registered for an event type
   */
  hasHandlers(eventType: WebhookEventType): boolean {
    const specific = this.handlers.get(eventType);
    return (specific && specific.length > 0) || this.wildcardHandlers.length > 0;
  }
}
