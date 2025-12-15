/**
 * Microsoft Teams Message Router
 *
 * Rule-based message routing to multiple destinations.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  RoutableMessage,
  RoutingRule,
  RoutingCondition,
  Destination,
  DeliveryResult,
  RoutingResult,
  Severity,
  AdaptiveCard,
} from '../types/index.js';
import { MAX_ROUTING_DEPTH } from '../config/index.js';
import {
  CircularRoutingError,
  AllDestinationsFailedError,
  NoRouteFoundError,
  TeamsError,
} from '../errors.js';
import type { WebhookService } from '../services/webhook/index.js';
import type { GraphService } from '../services/graph/index.js';

// ============================================================================
// Routing Rule Builder
// ============================================================================

/**
 * Builder for routing rules.
 */
export class RoutingRuleBuilder {
  private name: string = '';
  private conditions: RoutingCondition[] = [];
  private destinations: Destination[] = [];
  private priority: number = 0;
  private stopOnError: boolean = false;

  /**
   * Sets the rule name.
   */
  setName(name: string): this {
    this.name = name;
    return this;
  }

  /**
   * Adds a tag condition.
   */
  withTag(tag: string): this {
    this.conditions.push({ type: 'tag', tag });
    return this;
  }

  /**
   * Adds a severity condition (matches if message severity >= specified).
   */
  withSeverity(severity: Severity): this {
    this.conditions.push({ type: 'severity', severity });
    return this;
  }

  /**
   * Adds a source condition.
   */
  withSource(source: string): this {
    this.conditions.push({ type: 'source', source });
    return this;
  }

  /**
   * Adds a custom condition.
   */
  withCustomCondition(predicate: (message: RoutableMessage) => boolean): this {
    this.conditions.push({ type: 'custom', predicate });
    return this;
  }

  /**
   * Adds a channel destination.
   */
  toChannel(teamId: string, channelId: string): this {
    this.destinations.push({ type: 'channel', teamId, channelId });
    return this;
  }

  /**
   * Adds a chat destination.
   */
  toChat(chatId: string): this {
    this.destinations.push({ type: 'chat', chatId });
    return this;
  }

  /**
   * Adds a user destination.
   */
  toUser(userId: string): this {
    this.destinations.push({ type: 'user', userId });
    return this;
  }

  /**
   * Adds a webhook destination.
   */
  toWebhook(url: string): this {
    this.destinations.push({ type: 'webhook', url });
    return this;
  }

  /**
   * Adds multiple destinations.
   */
  toDestinations(destinations: Destination[]): this {
    this.destinations.push(...destinations);
    return this;
  }

  /**
   * Sets the priority (higher = evaluated first).
   */
  setPriority(priority: number): this {
    this.priority = priority;
    return this;
  }

  /**
   * Sets whether to stop routing if this rule fails.
   */
  setStopOnError(stop: boolean): this {
    this.stopOnError = stop;
    return this;
  }

  /**
   * Builds the routing rule.
   */
  build(): RoutingRule {
    if (!this.name) {
      throw new Error('Rule name is required');
    }
    if (this.destinations.length === 0) {
      throw new Error('At least one destination is required');
    }

    return {
      name: this.name,
      conditions: [...this.conditions],
      destinations: [...this.destinations],
      priority: this.priority,
      stopOnError: this.stopOnError,
    };
  }
}

// ============================================================================
// Message Router
// ============================================================================

/**
 * Message router with rule-based routing to multiple destinations.
 */
export class MessageRouter {
  private rules: RoutingRule[] = [];
  private webhookService?: WebhookService;
  private graphService?: GraphService;
  private maxDepth: number;

  constructor(options?: {
    webhookService?: WebhookService;
    graphService?: GraphService;
    maxDepth?: number;
  }) {
    this.webhookService = options?.webhookService;
    this.graphService = options?.graphService;
    this.maxDepth = options?.maxDepth ?? MAX_ROUTING_DEPTH;
  }

  /**
   * Sets the webhook service.
   */
  setWebhookService(service: WebhookService): this {
    this.webhookService = service;
    return this;
  }

  /**
   * Sets the graph service.
   */
  setGraphService(service: GraphService): this {
    this.graphService = service;
    return this;
  }

  /**
   * Adds a routing rule.
   */
  addRule(rule: RoutingRule): this {
    this.rules.push(rule);
    // Sort by priority (descending)
    this.rules.sort((a, b) => b.priority - a.priority);
    return this;
  }

  /**
   * Removes a routing rule by name.
   */
  removeRule(name: string): this {
    this.rules = this.rules.filter((r) => r.name !== name);
    return this;
  }

  /**
   * Gets all routing rules.
   */
  getRules(): RoutingRule[] {
    return [...this.rules];
  }

  /**
   * Clears all routing rules.
   */
  clearRules(): this {
    this.rules = [];
    return this;
  }

  /**
   * Routes a message to matching destinations.
   */
  async route(message: RoutableMessage | string, card?: AdaptiveCard): Promise<RoutingResult> {
    // Normalize message
    const routableMessage: RoutableMessage =
      typeof message === 'string'
        ? {
            id: uuidv4(),
            content: message,
            routingDepth: 0,
          }
        : {
            ...message,
            id: message.id || uuidv4(),
            routingDepth: message.routingDepth ?? 0,
          };

    // Check for circular routing
    if (routableMessage.routingDepth! >= this.maxDepth) {
      throw new CircularRoutingError();
    }

    // Find matching rules
    const matchingRules = this.findMatchingRules(routableMessage);

    if (matchingRules.length === 0) {
      return {
        messageId: routableMessage.id,
        deliveries: [],
        status: 'no_match',
      };
    }

    // Collect unique destinations from matching rules
    const destinations = this.collectDestinations(matchingRules);

    // Deliver to all destinations
    const deliveries = await this.deliverToDestinations(routableMessage, destinations, card);

    // Determine overall status
    const successCount = deliveries.filter((d) => d.success).length;
    let status: RoutingResult['status'];

    if (successCount === deliveries.length) {
      status = 'success';
    } else if (successCount > 0) {
      status = 'partial';
    } else {
      status = 'failed';
    }

    return {
      messageId: routableMessage.id,
      deliveries,
      status,
    };
  }

  /**
   * Routes a message, throwing if all destinations fail.
   */
  async routeOrThrow(message: RoutableMessage | string, card?: AdaptiveCard): Promise<RoutingResult> {
    const result = await this.route(message, card);

    if (result.status === 'no_match') {
      const messageId = typeof message === 'string' ? 'unknown' : message.id || 'unknown';
      throw new NoRouteFoundError(messageId);
    }

    if (result.status === 'failed') {
      throw new AllDestinationsFailedError(result.deliveries.length);
    }

    return result;
  }

  /**
   * Evaluates which rules match a message without routing.
   */
  evaluateRules(message: RoutableMessage): RoutingRule[] {
    return this.findMatchingRules(message);
  }

  /**
   * Creates a routable message from text.
   */
  createMessage(
    content: string,
    options?: {
      tags?: string[];
      severity?: Severity;
      source?: string;
      metadata?: Record<string, unknown>;
    }
  ): RoutableMessage {
    return {
      id: uuidv4(),
      content,
      tags: options?.tags,
      severity: options?.severity,
      source: options?.source,
      metadata: options?.metadata,
      routingDepth: 0,
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private findMatchingRules(message: RoutableMessage): RoutingRule[] {
    return this.rules.filter((rule) => this.ruleMatches(rule, message));
  }

  private ruleMatches(rule: RoutingRule, message: RoutableMessage): boolean {
    // If no conditions, rule matches everything
    if (rule.conditions.length === 0) {
      return true;
    }

    // All conditions must match
    return rule.conditions.every((condition) => this.conditionMatches(condition, message));
  }

  private conditionMatches(condition: RoutingCondition, message: RoutableMessage): boolean {
    switch (condition.type) {
      case 'tag':
        return message.tags?.includes(condition.tag) ?? false;

      case 'severity': {
        if (!message.severity) return false;
        const severityOrder: Severity[] = ['info', 'warning', 'error', 'critical'];
        const messageSeverityIndex = severityOrder.indexOf(message.severity);
        const conditionSeverityIndex = severityOrder.indexOf(condition.severity);
        return messageSeverityIndex >= conditionSeverityIndex;
      }

      case 'source':
        return message.source === condition.source;

      case 'custom':
        return condition.predicate(message);

      default:
        return false;
    }
  }

  private collectDestinations(rules: RoutingRule[]): Destination[] {
    const destinationMap = new Map<string, Destination>();

    for (const rule of rules) {
      for (const dest of rule.destinations) {
        const key = this.destinationKey(dest);
        if (!destinationMap.has(key)) {
          destinationMap.set(key, dest);
        }
      }
    }

    return Array.from(destinationMap.values());
  }

  private destinationKey(dest: Destination): string {
    switch (dest.type) {
      case 'channel':
        return `channel:${dest.teamId}:${dest.channelId}`;
      case 'chat':
        return `chat:${dest.chatId}`;
      case 'user':
        return `user:${dest.userId}`;
      case 'webhook':
        return `webhook:${dest.url}`;
    }
  }

  private async deliverToDestinations(
    message: RoutableMessage,
    destinations: Destination[],
    card?: AdaptiveCard
  ): Promise<DeliveryResult[]> {
    const deliveryPromises = destinations.map((dest) =>
      this.deliverToDestination(message, dest, card)
    );

    return Promise.all(deliveryPromises);
  }

  private async deliverToDestination(
    message: RoutableMessage,
    destination: Destination,
    card?: AdaptiveCard
  ): Promise<DeliveryResult> {
    try {
      let messageId: string | undefined;

      switch (destination.type) {
        case 'webhook':
          if (!this.webhookService) {
            throw new Error('Webhook service not configured');
          }
          if (card) {
            await this.webhookService.sendCard(card, destination.url);
          } else {
            await this.webhookService.sendMessage(message.content, destination.url);
          }
          messageId = message.id;
          break;

        case 'channel':
          if (!this.graphService) {
            throw new Error('Graph service not configured');
          }
          if (card) {
            const result = await this.graphService.sendChannelCard(
              destination.teamId,
              destination.channelId,
              card
            );
            messageId = result.id;
          } else {
            const result = await this.graphService.sendChannelMessage(
              destination.teamId,
              destination.channelId,
              message.content,
              { contentType: message.contentType }
            );
            messageId = result.id;
          }
          break;

        case 'chat':
          if (!this.graphService) {
            throw new Error('Graph service not configured');
          }
          if (card) {
            const result = await this.graphService.sendChatCard(destination.chatId, card);
            messageId = result.id;
          } else {
            const result = await this.graphService.sendChatMessage(
              destination.chatId,
              message.content,
              { contentType: message.contentType }
            );
            messageId = result.id;
          }
          break;

        case 'user':
          // User destinations require creating a chat first
          // This is a simplified implementation
          if (!this.graphService) {
            throw new Error('Graph service not configured');
          }
          // For user destinations, we'd typically need to create a chat first
          // This would be expanded in a production implementation
          throw new Error('Direct user messaging requires bot service');
      }

      return {
        destination,
        success: true,
        messageId,
      };
    } catch (error) {
      return {
        destination,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a new routing rule builder.
 */
export function createRuleBuilder(): RoutingRuleBuilder {
  return new RoutingRuleBuilder();
}

/**
 * Creates a new message router.
 */
export function createRouter(options?: {
  webhookService?: WebhookService;
  graphService?: GraphService;
  maxDepth?: number;
}): MessageRouter {
  return new MessageRouter(options);
}

/**
 * Creates a catch-all rule that routes to the specified destinations.
 */
export function createCatchAllRule(
  name: string,
  destinations: Destination[],
  priority: number = 0
): RoutingRule {
  return {
    name,
    conditions: [], // No conditions = matches everything
    destinations,
    priority,
  };
}

/**
 * Creates a severity-based rule.
 */
export function createSeverityRule(
  name: string,
  severity: Severity,
  destinations: Destination[],
  priority: number = 50
): RoutingRule {
  return {
    name,
    conditions: [{ type: 'severity', severity }],
    destinations,
    priority,
  };
}

/**
 * Creates a tag-based rule.
 */
export function createTagRule(
  name: string,
  tag: string,
  destinations: Destination[],
  priority: number = 50
): RoutingRule {
  return {
    name,
    conditions: [{ type: 'tag', tag }],
    destinations,
    priority,
  };
}
