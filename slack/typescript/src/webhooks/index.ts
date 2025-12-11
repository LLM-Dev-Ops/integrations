/**
 * Slack Webhooks handling.
 */

import { SignatureVerifier } from '../auth';

/**
 * Incoming webhook payload
 */
export interface IncomingWebhookPayload {
  text?: string;
  blocks?: unknown[];
  attachments?: unknown[];
  thread_ts?: string;
  mrkdwn?: boolean;
  unfurl_links?: boolean;
  unfurl_media?: boolean;
}

/**
 * Incoming webhook client
 */
export class IncomingWebhook {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  /**
   * Send message via webhook
   */
  async send(payload: IncomingWebhookPayload | string): Promise<void> {
    const body = typeof payload === 'string' ? { text: payload } : payload;

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Webhook request failed: ${response.status} ${text}`);
    }
  }

  /**
   * Send text message
   */
  async sendText(text: string): Promise<void> {
    await this.send({ text });
  }

  /**
   * Send blocks
   */
  async sendBlocks(blocks: unknown[], text?: string): Promise<void> {
    await this.send({ blocks, text });
  }
}

/**
 * Slash command payload
 */
export interface SlashCommandPayload {
  token: string;
  team_id: string;
  team_domain: string;
  enterprise_id?: string;
  enterprise_name?: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  api_app_id: string;
  is_enterprise_install?: string;
  response_url: string;
  trigger_id: string;
}

/**
 * Interactive payload (button clicks, select menus, etc.)
 */
export interface InteractivePayload {
  type: 'block_actions' | 'view_submission' | 'view_closed' | 'shortcut' | 'message_action';
  team: {
    id: string;
    domain: string;
    enterprise_id?: string;
    enterprise_name?: string;
  };
  user: {
    id: string;
    username: string;
    name: string;
    team_id: string;
  };
  api_app_id: string;
  token: string;
  container?: {
    type: string;
    message_ts?: string;
    channel_id?: string;
    is_ephemeral?: boolean;
  };
  channel?: {
    id: string;
    name: string;
  };
  message?: unknown;
  view?: unknown;
  actions?: Array<{
    action_id: string;
    block_id: string;
    type: string;
    value?: string;
    selected_option?: {
      text: { type: string; text: string };
      value: string;
    };
    selected_options?: Array<{
      text: { type: string; text: string };
      value: string;
    }>;
    selected_user?: string;
    selected_users?: string[];
    selected_channel?: string;
    selected_channels?: string[];
    selected_conversation?: string;
    selected_conversations?: string[];
    selected_date?: string;
    selected_time?: string;
    action_ts: string;
  }>;
  trigger_id: string;
  response_url?: string;
  is_enterprise_install?: boolean;
}

/**
 * Response action for view submissions
 */
export interface ViewResponseAction {
  response_action: 'errors' | 'update' | 'push' | 'clear';
  errors?: Record<string, string>;
  view?: unknown;
}

/**
 * Webhook request handler
 */
export class WebhookHandler {
  private verifier?: SignatureVerifier;

  constructor(signingSecret?: string) {
    if (signingSecret) {
      this.verifier = new SignatureVerifier(signingSecret);
    }
  }

  /**
   * Verify and parse slash command
   */
  parseSlashCommand(
    headers: Record<string, string>,
    body: string
  ): SlashCommandPayload | null {
    if (this.verifier && !this.verifier.verifyRequest(headers, body)) {
      return null;
    }

    const params = new URLSearchParams(body);
    return {
      token: params.get('token') ?? '',
      team_id: params.get('team_id') ?? '',
      team_domain: params.get('team_domain') ?? '',
      enterprise_id: params.get('enterprise_id') ?? undefined,
      enterprise_name: params.get('enterprise_name') ?? undefined,
      channel_id: params.get('channel_id') ?? '',
      channel_name: params.get('channel_name') ?? '',
      user_id: params.get('user_id') ?? '',
      user_name: params.get('user_name') ?? '',
      command: params.get('command') ?? '',
      text: params.get('text') ?? '',
      api_app_id: params.get('api_app_id') ?? '',
      is_enterprise_install: params.get('is_enterprise_install') ?? undefined,
      response_url: params.get('response_url') ?? '',
      trigger_id: params.get('trigger_id') ?? '',
    };
  }

  /**
   * Verify and parse interactive payload
   */
  parseInteractive(
    headers: Record<string, string>,
    body: string
  ): InteractivePayload | null {
    if (this.verifier && !this.verifier.verifyRequest(headers, body)) {
      return null;
    }

    const params = new URLSearchParams(body);
    const payload = params.get('payload');
    if (!payload) {
      return null;
    }

    try {
      return JSON.parse(payload) as InteractivePayload;
    } catch {
      return null;
    }
  }

  /**
   * Send response to response_url
   */
  async respond(
    responseUrl: string,
    payload: IncomingWebhookPayload & { response_type?: 'in_channel' | 'ephemeral'; replace_original?: boolean; delete_original?: boolean }
  ): Promise<void> {
    const response = await fetch(responseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Response URL request failed: ${response.status} ${text}`);
    }
  }
}

/**
 * Create incoming webhook
 */
export function createIncomingWebhook(webhookUrl: string): IncomingWebhook {
  return new IncomingWebhook(webhookUrl);
}

/**
 * Create webhook handler
 */
export function createWebhookHandler(signingSecret?: string): WebhookHandler {
  return new WebhookHandler(signingSecret);
}
