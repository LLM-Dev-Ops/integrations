/**
 * Pub/Sub Subscriber
 *
 * Message subscription with pull, streaming pull, ack/nack, and flow control.
 * Following the SPARC specification.
 */

import {
  ReceivedMessage,
  PubSubMessageData,
  PullResult,
  MessageStream,
  SubscriberStats,
} from "../types/index.js";
import {
  PubSubConfig,
  formatSubscriptionPath,
  validateSubscriptionName,
} from "../config/index.js";
import { GcpAuthProvider } from "../credentials/index.js";
import {
  HttpTransport,
  FetchTransport,
  isSuccess,
  parseJsonBody,
  getRequestId,
} from "../transport/index.js";
import {
  PubSubError,
  AcknowledgmentError,
  SubscriptionError,
  ServerError,
  AuthenticationError,
  parseGrpcError,
  GrpcStatus,
} from "../error/index.js";

/**
 * Pull response from API.
 */
interface PullResponse {
  receivedMessages?: ReceivedMessageRaw[];
}

/**
 * Raw received message from API.
 */
interface ReceivedMessageRaw {
  ackId: string;
  message: PubSubMessageRaw;
  deliveryAttempt?: number;
}

/**
 * Raw message from API.
 */
interface PubSubMessageRaw {
  data?: string;
  attributes?: Record<string, string>;
  messageId: string;
  publishTime: string;
  orderingKey?: string;
}

/**
 * Pub/Sub Subscriber.
 */
export class PubSubSubscriber {
  private readonly config: PubSubConfig;
  private readonly subscription: string;
  private readonly subscriptionPath: string;
  private readonly authProvider: GcpAuthProvider;
  private readonly transport: HttpTransport;

  // Flow control
  private outstandingMessages = 0;
  private outstandingBytes = 0;

  // Statistics
  private stats: SubscriberStats = {
    messagesReceived: 0,
    messagesAcked: 0,
    messagesNacked: 0,
    outstandingMessages: 0,
    outstandingBytes: 0,
    avgProcessingLatencyMs: 0,
  };
  private latencySum = 0;
  private latencyCount = 0;

  // Shutdown state
  private closed = false;

  constructor(
    config: PubSubConfig,
    subscription: string,
    authProvider: GcpAuthProvider,
    transport?: HttpTransport
  ) {
    validateSubscriptionName(subscription);

    this.config = config;
    this.subscription = subscription;
    this.subscriptionPath = formatSubscriptionPath(config.projectId, subscription);
    this.authProvider = authProvider;
    this.transport = transport ?? new FetchTransport(config.timeout);
  }

  /**
   * Pull messages synchronously.
   */
  async pull(maxMessages: number = 10): Promise<PullResult> {
    if (this.closed) {
      throw new PubSubError("Subscriber is closed", "SubscriberClosed");
    }

    const token = await this.authProvider.getAccessToken();
    const endpoint = this.config.endpoint ?? "https://pubsub.googleapis.com";

    const requestBody = {
      maxMessages: Math.min(maxMessages, 1000),
      returnImmediately: false,
    };

    const url = `${endpoint}/v1/${this.subscriptionPath}:pull`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await this.transport.send({
      method: "POST",
      url,
      headers,
      body: JSON.stringify(requestBody),
      timeout: this.config.timeout,
    });

    if (!isSuccess(response)) {
      throw this.parseErrorResponse(response.status, response.body, getRequestId(response));
    }

    const result = parseJsonBody<PullResponse>(response);

    const messages = (result.receivedMessages ?? []).map((raw) => this.parseReceivedMessage(raw));

    // Update stats
    this.stats.messagesReceived += messages.length;
    this.outstandingMessages += messages.length;
    for (const msg of messages) {
      this.outstandingBytes += msg.message.data.length;
    }
    this.updateOutstandingStats();

    return { messages };
  }

  /**
   * Create a streaming pull iterator.
   */
  async streamingPull(): Promise<MessageStream> {
    if (this.closed) {
      throw new PubSubError("Subscriber is closed", "SubscriberClosed");
    }

    const self = this;
    let running = true;

    // Simple polling-based streaming for REST API
    // In production, this would use the gRPC streaming API
    const stream: MessageStream = {
      async *[Symbol.asyncIterator](): AsyncIterableIterator<ReceivedMessage> {
        while (running && !self.closed) {
          try {
            // Check flow control
            if (
              self.outstandingMessages >= self.config.subscriberConfig.maxOutstandingMessages ||
              self.outstandingBytes >= self.config.subscriberConfig.maxOutstandingBytes
            ) {
              // Wait a bit for acks
              await sleep(100);
              continue;
            }

            const result = await self.pull(100);
            for (const message of result.messages) {
              yield message;
            }

            if (result.messages.length === 0) {
              // No messages, wait before polling again
              await sleep(1000);
            }
          } catch (error) {
            if (!running || self.closed) break;
            // Log error and continue
            await sleep(1000);
          }
        }
      },

      async ack(ackId: string): Promise<void> {
        await self.acknowledge([ackId]);
      },

      async nack(ackId: string): Promise<void> {
        await self.modifyAckDeadline([ackId], 0);
      },

      async modifyAckDeadline(ackId: string, seconds: number): Promise<void> {
        await self.modifyAckDeadline([ackId], seconds);
      },

      async close(): Promise<void> {
        running = false;
      },
    };

    return stream;
  }

  /**
   * Acknowledge messages.
   */
  async acknowledge(ackIds: string[]): Promise<void> {
    if (ackIds.length === 0) return;

    if (this.closed) {
      throw new PubSubError("Subscriber is closed", "SubscriberClosed");
    }

    const token = await this.authProvider.getAccessToken();
    const endpoint = this.config.endpoint ?? "https://pubsub.googleapis.com";

    const requestBody = {
      ackIds,
    };

    const url = `${endpoint}/v1/${this.subscriptionPath}:acknowledge`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await this.transport.send({
      method: "POST",
      url,
      headers,
      body: JSON.stringify(requestBody),
      timeout: this.config.timeout,
    });

    if (!isSuccess(response)) {
      throw this.parseErrorResponse(response.status, response.body, getRequestId(response));
    }

    // Update stats
    this.stats.messagesAcked += ackIds.length;
    this.outstandingMessages = Math.max(0, this.outstandingMessages - ackIds.length);
    this.updateOutstandingStats();
  }

  /**
   * Alias for acknowledge.
   */
  async ack(ackId: string): Promise<void> {
    await this.acknowledge([ackId]);
  }

  /**
   * Negative acknowledge (nack) messages.
   */
  async nack(ackId: string): Promise<void> {
    await this.modifyAckDeadline([ackId], 0);
    this.stats.messagesNacked++;
  }

  /**
   * Modify ack deadline.
   */
  async modifyAckDeadline(ackIds: string[], ackDeadlineSeconds: number): Promise<void> {
    if (ackIds.length === 0) return;

    if (this.closed) {
      throw new PubSubError("Subscriber is closed", "SubscriberClosed");
    }

    const token = await this.authProvider.getAccessToken();
    const endpoint = this.config.endpoint ?? "https://pubsub.googleapis.com";

    const requestBody = {
      ackIds,
      ackDeadlineSeconds,
    };

    const url = `${endpoint}/v1/${this.subscriptionPath}:modifyAckDeadline`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await this.transport.send({
      method: "POST",
      url,
      headers,
      body: JSON.stringify(requestBody),
      timeout: this.config.timeout,
    });

    if (!isSuccess(response)) {
      throw this.parseErrorResponse(response.status, response.body, getRequestId(response));
    }

    // If deadline is 0, this is a nack - update outstanding
    if (ackDeadlineSeconds === 0) {
      this.outstandingMessages = Math.max(0, this.outstandingMessages - ackIds.length);
      this.updateOutstandingStats();
    }
  }

  /**
   * Get subscriber statistics.
   */
  getStats(): SubscriberStats {
    return {
      ...this.stats,
      outstandingMessages: this.outstandingMessages,
      outstandingBytes: this.outstandingBytes,
      avgProcessingLatencyMs: this.latencyCount > 0
        ? this.latencySum / this.latencyCount
        : 0,
    };
  }

  /**
   * Close the subscriber.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
  }

  /**
   * Parse received message from raw API response.
   */
  private parseReceivedMessage(raw: ReceivedMessageRaw): ReceivedMessage {
    const data = raw.message.data
      ? Buffer.from(raw.message.data, "base64")
      : Buffer.alloc(0);

    const messageData: PubSubMessageData = {
      data,
      attributes: raw.message.attributes ?? {},
      orderingKey: raw.message.orderingKey,
      messageId: raw.message.messageId,
      publishTime: new Date(raw.message.publishTime),
    };

    return {
      ackId: raw.ackId,
      message: messageData,
      messageId: raw.message.messageId,
      publishTime: new Date(raw.message.publishTime),
      deliveryAttempt: raw.deliveryAttempt,
    };
  }

  /**
   * Parse error response.
   */
  private parseErrorResponse(
    status: number,
    body: Buffer,
    requestId?: string
  ): PubSubError {
    try {
      const json = JSON.parse(body.toString());
      const errorInfo = json.error;

      if (errorInfo) {
        const grpcStatus = errorInfo.code as GrpcStatus;
        const message = errorInfo.message || `HTTP ${status}`;

        if (status === 404) {
          return new SubscriptionError(message, "NotFound", {
            subscription: this.subscription,
            requestId,
          });
        }

        return parseGrpcError(grpcStatus, message, requestId);
      }
    } catch {
      // Not JSON, use status code
    }

    // Map HTTP status to error
    switch (status) {
      case 401:
        return new AuthenticationError("Authentication required", "TokenExpired", { requestId });
      case 403:
        return new AuthenticationError("Permission denied", "PermissionDenied", { requestId });
      case 404:
        return new SubscriptionError(`Subscription not found: ${this.subscription}`, "NotFound", {
          subscription: this.subscription,
          requestId,
        });
      case 429:
        return new ServerError("Rate limited", "RateLimited", { requestId });
      case 503:
        return new ServerError("Service unavailable", "ServiceUnavailable", { requestId });
      default:
        return new ServerError(`HTTP ${status}`, "InternalError", { requestId, statusCode: status });
    }
  }

  /**
   * Update outstanding stats.
   */
  private updateOutstandingStats(): void {
    this.stats.outstandingMessages = this.outstandingMessages;
    this.stats.outstandingBytes = this.outstandingBytes;
  }
}

/**
 * Sleep helper.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a subscriber.
 */
export function createSubscriber(
  config: PubSubConfig,
  subscription: string,
  authProvider: GcpAuthProvider,
  transport?: HttpTransport
): PubSubSubscriber {
  return new PubSubSubscriber(config, subscription, authProvider, transport);
}

/**
 * Message handler callback type.
 */
export type MessageHandler = (message: ReceivedMessage) => Promise<void>;

/**
 * Handle messages with automatic ack/nack.
 */
export async function handleMessages(
  subscriber: PubSubSubscriber,
  handler: MessageHandler,
  options: {
    maxMessages?: number;
    autoAck?: boolean;
  } = {}
): Promise<void> {
  const { maxMessages = 10, autoAck = true } = options;

  const result = await subscriber.pull(maxMessages);

  const processPromises = result.messages.map(async (message) => {
    try {
      await handler(message);
      if (autoAck) {
        await subscriber.ack(message.ackId);
      }
    } catch {
      if (autoAck) {
        await subscriber.nack(message.ackId);
      }
    }
  });

  await Promise.all(processPromises);
}
