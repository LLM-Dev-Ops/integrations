/**
 * Slack Socket Mode client for real-time events.
 */

import { SlackClient } from '../client';
import { EventCallback, SlackEvent, EventDispatcher, createEventDispatcher } from '../events';

/**
 * Socket Mode connection state
 */
export type SocketState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/**
 * Socket Mode envelope
 */
export interface SocketModeEnvelope {
  envelope_id: string;
  payload: EventCallback | InteractiveEnvelope | SlashCommandEnvelope;
  type: 'events_api' | 'interactive' | 'slash_commands';
  accepts_response_payload: boolean;
  retry_attempt?: number;
  retry_reason?: string;
}

/**
 * Interactive envelope
 */
export interface InteractiveEnvelope {
  type: 'block_actions' | 'view_submission' | 'view_closed' | 'shortcut';
  user: { id: string; username: string; team_id: string };
  api_app_id: string;
  token: string;
  trigger_id: string;
  team: { id: string; domain: string };
  channel?: { id: string; name: string };
  container?: unknown;
  actions?: unknown[];
  view?: unknown;
  response_url?: string;
}

/**
 * Slash command envelope
 */
export interface SlashCommandEnvelope {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  api_app_id: string;
  response_url: string;
  trigger_id: string;
}

/**
 * Socket Mode acknowledgement
 */
export interface SocketModeAck {
  envelope_id: string;
  payload?: unknown;
}

/**
 * Socket Mode configuration
 */
export interface SocketModeConfig {
  appToken: string;
  autoReconnect: boolean;
  reconnectDelay: number;
  maxReconnectAttempts: number;
  pingInterval: number;
}

/**
 * Default Socket Mode configuration
 */
export const DEFAULT_SOCKET_MODE_CONFIG: SocketModeConfig = {
  appToken: '',
  autoReconnect: true,
  reconnectDelay: 5000,
  maxReconnectAttempts: 10,
  pingInterval: 30000,
};

/**
 * Socket Mode event handlers
 */
export interface SocketModeHandlers {
  onEvent?: (event: SlackEvent, context: EventCallback) => void | Promise<void>;
  onInteractive?: (payload: InteractiveEnvelope) => unknown | Promise<unknown>;
  onSlashCommand?: (payload: SlashCommandEnvelope) => unknown | Promise<unknown>;
  onConnect?: () => void;
  onDisconnect?: (reason?: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Socket Mode client
 */
export class SocketModeClient {
  private config: SocketModeConfig;
  private state: SocketState = 'disconnected';
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private eventDispatcher: EventDispatcher;
  private handlers: SocketModeHandlers = {};

  constructor(config: Partial<SocketModeConfig>) {
    this.config = { ...DEFAULT_SOCKET_MODE_CONFIG, ...config };
    this.eventDispatcher = createEventDispatcher();
  }

  /**
   * Set event handlers
   */
  setHandlers(handlers: SocketModeHandlers): void {
    this.handlers = handlers;
  }

  /**
   * Register event handler
   */
  on<T extends SlackEvent>(eventType: string, handler: (event: T, context: EventCallback<T>) => void | Promise<void>): void {
    this.eventDispatcher.on(eventType, handler);
  }

  /**
   * Connect to Socket Mode
   */
  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.state = 'connecting';

    try {
      const wsUrl = await this.getWebSocketUrl();
      await this.establishConnection(wsUrl);
    } catch (error) {
      this.state = 'disconnected';
      this.handlers.onError?.(error instanceof Error ? error : new Error(String(error)));

      if (this.config.autoReconnect) {
        await this.scheduleReconnect();
      }
    }
  }

  /**
   * Disconnect from Socket Mode
   */
  disconnect(): void {
    this.state = 'disconnected';
    this.stopPing();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Get current state
   */
  getState(): SocketState {
    return this.state;
  }

  /**
   * Send acknowledgement
   */
  private ack(envelopeId: string, payload?: unknown): void {
    if (this.ws && this.state === 'connected') {
      const ack: SocketModeAck = { envelope_id: envelopeId };
      if (payload !== undefined) {
        ack.payload = payload;
      }
      this.ws.send(JSON.stringify(ack));
    }
  }

  private async getWebSocketUrl(): Promise<string> {
    const response = await fetch('https://slack.com/api/apps.connections.open', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.appToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const data = await response.json() as { ok: boolean; url?: string; error?: string };

    if (!data.ok || !data.url) {
      throw new Error(`Failed to get WebSocket URL: ${data.error ?? 'Unknown error'}`);
    }

    return data.url;
  }

  private async establishConnection(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        this.ws = ws;
        this.state = 'connected';
        this.reconnectAttempts = 0;
        this.startPing();
        this.handlers.onConnect?.();
        resolve();
      };

      ws.onclose = (event) => {
        this.handleClose(event.reason);
      };

      ws.onerror = (event) => {
        const error = new Error('WebSocket error');
        this.handlers.onError?.(error);
        reject(error);
      };

      ws.onmessage = (event) => {
        this.handleMessage(event.data as string);
      };
    });
  }

  private handleClose(reason?: string): void {
    this.stopPing();
    const wasConnected = this.state === 'connected';
    this.state = 'disconnected';
    this.ws = null;

    if (wasConnected) {
      this.handlers.onDisconnect?.(reason);
    }

    if (this.config.autoReconnect) {
      this.scheduleReconnect();
    }
  }

  private async handleMessage(data: string): Promise<void> {
    try {
      const envelope = JSON.parse(data) as SocketModeEnvelope;

      // Handle based on type
      let responsePayload: unknown;

      switch (envelope.type) {
        case 'events_api':
          await this.eventDispatcher.dispatch(envelope.payload as EventCallback);
          if (this.handlers.onEvent) {
            const eventCallback = envelope.payload as EventCallback;
            await this.handlers.onEvent(eventCallback.event as SlackEvent, eventCallback);
          }
          break;

        case 'interactive':
          if (this.handlers.onInteractive) {
            responsePayload = await this.handlers.onInteractive(envelope.payload as InteractiveEnvelope);
          }
          break;

        case 'slash_commands':
          if (this.handlers.onSlashCommand) {
            responsePayload = await this.handlers.onSlashCommand(envelope.payload as SlashCommandEnvelope);
          }
          break;
      }

      // Always acknowledge
      this.ack(envelope.envelope_id, envelope.accepts_response_payload ? responsePayload : undefined);
    } catch (error) {
      this.handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.handlers.onError?.(new Error('Max reconnect attempts reached'));
      return;
    }

    this.state = 'reconnecting';
    this.reconnectAttempts++;

    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    await new Promise((resolve) => setTimeout(resolve, delay));

    if (this.state === 'reconnecting') {
      await this.connect();
    }
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws && this.state === 'connected') {
        // Slack Socket Mode uses the envelope acknowledgement as a heartbeat
        // No explicit ping needed, but we can check connection health here
      }
    }, this.config.pingInterval);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}

/**
 * Create Socket Mode client
 */
export function createSocketModeClient(config: Partial<SocketModeConfig>): SocketModeClient {
  return new SocketModeClient(config);
}
