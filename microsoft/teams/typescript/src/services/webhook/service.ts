/**
 * Microsoft Teams Webhook Service
 *
 * Handles sending messages via Teams Incoming Webhooks (Connectors).
 */

import type {
  WebhookResponse,
  AdaptiveCard,
  MessageCardPayload,
  AdaptiveCardPayload,
  FormattedMessage,
  MessageSection,
  Fact,
} from '../../types/index.js';
import type { TeamsConfig, SecretString } from '../../config/index.js';
import {
  TeamsError,
  WebhookConfigurationError,
  InvalidWebhookUrlError,
  parseWebhookError,
} from '../../errors.js';
import { validateWebhookUrl, validateCardSize, validatePayload } from '../../validation.js';
import { ResilientExecutor, withTimeout } from '../../resilience/index.js';

// ============================================================================
// Webhook Service
// ============================================================================

/**
 * Service for sending messages via Teams webhooks.
 */
export class WebhookService {
  private config: TeamsConfig;
  private executor: ResilientExecutor;
  private defaultWebhookUrl?: string;

  constructor(config: TeamsConfig, executor: ResilientExecutor) {
    this.config = config;
    this.executor = executor;
    this.defaultWebhookUrl = config.defaultWebhookUrl?.expose();
  }

  /**
   * Sends a simple text message via webhook.
   */
  async sendMessage(text: string, webhookUrl?: string): Promise<WebhookResponse> {
    const url = this.resolveWebhookUrl(webhookUrl);

    const payload: MessageCardPayload = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      text,
    };

    return this.sendPayload(url, payload);
  }

  /**
   * Sends an Adaptive Card via webhook.
   */
  async sendCard(card: AdaptiveCard, webhookUrl?: string): Promise<WebhookResponse> {
    const url = this.resolveWebhookUrl(webhookUrl);

    validateCardSize(card);

    const payload: AdaptiveCardPayload = {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          contentUrl: null,
          content: card,
        },
      ],
    };

    return this.sendPayload(url, payload);
  }

  /**
   * Sends a formatted message (MessageCard) via webhook.
   */
  async sendFormattedMessage(
    message: FormattedMessage,
    webhookUrl?: string
  ): Promise<WebhookResponse> {
    const url = this.resolveWebhookUrl(webhookUrl);

    const payload = this.buildMessageCardPayload(message);
    return this.sendPayload(url, payload);
  }

  /**
   * Sends a notification-style message with title, text, and optional link.
   */
  async sendNotification(
    title: string,
    text: string,
    options?: {
      themeColor?: string;
      actionUrl?: string;
      actionText?: string;
      webhookUrl?: string;
    }
  ): Promise<WebhookResponse> {
    const url = this.resolveWebhookUrl(options?.webhookUrl);

    const payload: MessageCardPayload = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      title,
      text,
    };

    if (options?.themeColor) {
      payload.themeColor = options.themeColor;
    }

    if (options?.actionUrl && options?.actionText) {
      payload.potentialAction = [
        {
          '@type': 'OpenUri',
          name: options.actionText,
          targets: [{ os: 'default', uri: options.actionUrl }],
        },
      ];
    }

    return this.sendPayload(url, payload);
  }

  /**
   * Sends a status card with facts.
   */
  async sendStatus(
    title: string,
    facts: Fact[],
    options?: {
      themeColor?: string;
      summary?: string;
      webhookUrl?: string;
    }
  ): Promise<WebhookResponse> {
    const url = this.resolveWebhookUrl(options?.webhookUrl);

    const payload: MessageCardPayload = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      title,
      summary: options?.summary ?? title,
      themeColor: options?.themeColor,
      sections: [
        {
          facts: facts.map((f) => ({ name: f.title, value: f.value })),
        },
      ],
    };

    return this.sendPayload(url, payload);
  }

  /**
   * Sends an alert-style message with color coding.
   */
  async sendAlert(
    title: string,
    message: string,
    severity: 'info' | 'warning' | 'error' | 'critical',
    options?: {
      details?: string;
      actionUrl?: string;
      actionText?: string;
      webhookUrl?: string;
    }
  ): Promise<WebhookResponse> {
    const url = this.resolveWebhookUrl(options?.webhookUrl);

    const themeColors: Record<string, string> = {
      info: '0078D4',
      warning: 'FFB900',
      error: 'D83B01',
      critical: 'A80000',
    };

    const payload: MessageCardPayload = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      title: `[${severity.toUpperCase()}] ${title}`,
      text: message,
      themeColor: themeColors[severity],
      summary: `${severity}: ${title}`,
    };

    if (options?.details) {
      payload.sections = [
        {
          text: options.details,
          markdown: true,
        },
      ];
    }

    if (options?.actionUrl && options?.actionText) {
      payload.potentialAction = [
        {
          '@type': 'OpenUri',
          name: options.actionText,
          targets: [{ os: 'default', uri: options.actionUrl }],
        },
      ];
    }

    return this.sendPayload(url, payload);
  }

  /**
   * Sends a raw payload via webhook.
   */
  async sendPayload(
    webhookUrl: string,
    payload: MessageCardPayload | AdaptiveCardPayload
  ): Promise<WebhookResponse> {
    validateWebhookUrl(webhookUrl);
    validatePayload(payload);

    return this.executor.execute(
      webhookUrl,
      async () => {
        const response = await withTimeout(
          fetch(webhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': this.config.userAgent,
            },
            body: JSON.stringify(payload),
          }),
          this.config.resilience.requestTimeoutMs,
          'webhook send'
        );

        if (!response.ok) {
          const body = await response.text();
          throw parseWebhookError(response.status, body);
        }

        // Teams webhook returns "1" on success
        return {
          success: true,
        };
      },
      {
        rateLimitName: 'webhook',
        rateLimitPerSecond: this.config.resilience.rateLimit.webhookPerSecond,
      }
    );
  }

  /**
   * Resolves the webhook URL to use.
   */
  private resolveWebhookUrl(provided?: string): string {
    const url = provided ?? this.defaultWebhookUrl;
    if (!url) {
      throw new WebhookConfigurationError('No webhook URL configured');
    }
    return url;
  }

  /**
   * Builds a MessageCard payload from a FormattedMessage.
   */
  private buildMessageCardPayload(message: FormattedMessage): MessageCardPayload {
    const payload: MessageCardPayload = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      title: message.title,
    };

    if (message.summary) payload.summary = message.summary;
    if (message.themeColor) payload.themeColor = message.themeColor;

    if (message.sections && message.sections.length > 0) {
      payload.sections = message.sections.map((section) => {
        const s: MessageCardPayload['sections'] extends Array<infer T> ? T : never = {};
        if (section.title) s.activityTitle = section.title;
        if (section.subtitle) s.activitySubtitle = section.subtitle;
        if (section.imageUrl) s.activityImage = section.imageUrl;
        if (section.text) s.text = section.text;
        if (section.markdown !== undefined) s.markdown = section.markdown;
        if (section.facts && section.facts.length > 0) {
          s.facts = section.facts.map((f) => ({ name: f.title, value: f.value }));
        }
        return s;
      });
    }

    if (message.actions && message.actions.length > 0) {
      payload.potentialAction = message.actions;
    }

    return payload;
  }
}
