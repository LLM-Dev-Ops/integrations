/**
 * Webhook Handler Router
 *
 * Routes webhook events to registered handlers
 */

import type { WebhookEvent } from '../types/webhooks.js';

/**
 * Webhook handler function
 */
export type WebhookHandler = (event: WebhookEvent) => Promise<void> | void;

/**
 * Handler registration
 */
interface HandlerRegistration {
  pattern: string;
  handler: WebhookHandler;
}

/**
 * WebhookRouter routes incoming webhook events to registered handlers
 *
 * Supports:
 * - Exact match (e.g., "contact.creation")
 * - Wildcard object type (e.g., "*.creation")
 * - Wildcard action (e.g., "contact.*")
 * - Catch-all (e.g., "*")
 */
export class WebhookRouter {
  private handlers: HandlerRegistration[] = [];

  /**
   * Register a handler for a specific event pattern
   *
   * @param pattern - Event pattern (e.g., "contact.creation", "*.deletion", "*")
   * @param handler - Handler function to invoke
   */
  on(pattern: string, handler: WebhookHandler): void {
    this.handlers.push({ pattern, handler });
  }

  /**
   * Remove a handler for a specific pattern
   *
   * @param pattern - Event pattern to remove
   * @param handler - Specific handler to remove (optional, removes all if not specified)
   */
  off(pattern: string, handler?: WebhookHandler): void {
    this.handlers = this.handlers.filter((h) => {
      if (h.pattern !== pattern) return true;
      if (handler && h.handler !== handler) return true;
      return false;
    });
  }

  /**
   * Find all matching handlers for an event
   *
   * @param event - Webhook event
   * @returns Array of matching handlers
   */
  findHandlers(event: WebhookEvent): WebhookHandler[] {
    const subscriptionType = event.subscriptionType;
    const [objectType, action] = subscriptionType.split('.');

    return this.handlers
      .filter((h) => this.matches(h.pattern, objectType, action))
      .map((h) => h.handler);
  }

  /**
   * Route an event to all matching handlers
   *
   * @param event - Webhook event to route
   * @returns Array of handler results (errors are captured, not thrown)
   */
  async route(event: WebhookEvent): Promise<{ handler: string; error?: Error }[]> {
    const handlers = this.findHandlers(event);
    const results: { handler: string; error?: Error }[] = [];

    for (const handler of handlers) {
      try {
        await handler(event);
        results.push({ handler: handler.name || 'anonymous' });
      } catch (error) {
        results.push({
          handler: handler.name || 'anonymous',
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    return results;
  }

  /**
   * Check if a pattern matches an event
   *
   * @param pattern - Handler pattern
   * @param objectType - Event object type
   * @param action - Event action
   * @returns true if pattern matches
   */
  private matches(pattern: string, objectType: string, action: string): boolean {
    // Catch-all
    if (pattern === '*') {
      return true;
    }

    const [patternObject, patternAction] = pattern.split('.');

    // Wildcard object type
    if (patternObject === '*') {
      return patternAction === action || patternAction === '*';
    }

    // Wildcard action
    if (patternAction === '*') {
      return patternObject === objectType;
    }

    // Exact match
    return patternObject === objectType && patternAction === action;
  }

  /**
   * Get all registered patterns
   */
  getPatterns(): string[] {
    return [...new Set(this.handlers.map((h) => h.pattern))];
  }

  /**
   * Clear all handlers
   */
  clear(): void {
    this.handlers = [];
  }
}
