/**
 * Pub/Sub Publisher
 *
 * Message publishing with batching, ordering, and flow control.
 * Following the SPARC specification.
 */

import {
  PubSubMessage,
  PublishResult,
  BatchPublishResult,
  OrderingKeyState,
  PublisherStats,
  getMessageSize,
  validateMessage,
} from "../types/index.js";
import {
  PubSubConfig,
  BatchSettings,
  formatTopicPath,
  validateTopicName,
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
  MessageError,
  TopicError,
  ServerError,
  AuthenticationError,
  parseGrpcError,
  GrpcStatus,
} from "../error/index.js";

/**
 * Publish response from API.
 */
interface PublishResponse {
  messageIds: string[];
}

/**
 * Pending message in batch.
 */
interface PendingMessage {
  message: PubSubMessage;
  resolve: (result: PublishResult) => void;
  reject: (error: Error) => void;
}

/**
 * Message batch.
 */
interface MessageBatch {
  messages: PendingMessage[];
  bytes: number;
  orderingKey?: string;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * Pub/Sub Publisher.
 */
export class PubSubPublisher {
  private readonly config: PubSubConfig;
  private readonly topic: string;
  private readonly topicPath: string;
  private readonly authProvider: GcpAuthProvider;
  private readonly transport: HttpTransport;
  private readonly batchSettings: BatchSettings;
  private readonly enableOrdering: boolean;

  // Batching state
  private defaultBatch: MessageBatch | null = null;
  private orderedBatches: Map<string, MessageBatch> = new Map();
  private pausedOrderingKeys: Map<string, Error> = new Map();

  // Statistics
  private stats: PublisherStats = {
    messagesPublished: 0,
    bytesPublished: 0,
    publishErrors: 0,
    avgLatencyMs: 0,
    currentBatchSize: 0,
    pausedOrderingKeys: [],
  };
  private latencySum = 0;
  private latencyCount = 0;

  // Shutdown state
  private closed = false;

  constructor(
    config: PubSubConfig,
    topic: string,
    authProvider: GcpAuthProvider,
    transport?: HttpTransport
  ) {
    validateTopicName(topic);

    this.config = config;
    this.topic = topic;
    this.topicPath = formatTopicPath(config.projectId, topic);
    this.authProvider = authProvider;
    this.transport = transport ?? new FetchTransport(config.timeout);
    this.batchSettings = config.publisherConfig.batchSettings;
    this.enableOrdering = config.publisherConfig.enableOrdering;
  }

  /**
   * Publish a single message.
   */
  async publish(message: PubSubMessage): Promise<PublishResult> {
    if (this.closed) {
      throw new PubSubError("Publisher is closed", "PublisherClosed");
    }

    validateMessage(message);

    // Check if ordering key is paused
    if (message.orderingKey && this.pausedOrderingKeys.has(message.orderingKey)) {
      const error = this.pausedOrderingKeys.get(message.orderingKey);
      throw new MessageError(
        `Ordering key "${message.orderingKey}" is paused due to previous error: ${error?.message}`,
        "OrderingKeyPaused"
      );
    }

    return new Promise<PublishResult>((resolve, reject) => {
      this.addToBatch({
        message,
        resolve,
        reject,
      });
    });
  }

  /**
   * Publish multiple messages.
   */
  async publishBatch(messages: PubSubMessage[]): Promise<BatchPublishResult> {
    const results: PublishResult[] = [];
    const errors = new Map<number, Error>();
    let successCount = 0;
    let failureCount = 0;

    // Validate all messages first
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg) {
        try {
          validateMessage(msg);
        } catch (error) {
          errors.set(i, error as Error);
          failureCount++;
        }
      }
    }

    // Publish valid messages
    const publishPromises: Promise<void>[] = [];

    for (let i = 0; i < messages.length; i++) {
      if (errors.has(i)) {
        continue;
      }

      const msg = messages[i];
      if (!msg) continue;

      const index = i;
      publishPromises.push(
        this.publish(msg)
          .then((result) => {
            results[index] = result;
            successCount++;
          })
          .catch((error) => {
            errors.set(index, error as Error);
            failureCount++;
          })
      );
    }

    await Promise.all(publishPromises);

    return {
      results,
      successCount,
      failureCount,
      errors,
    };
  }

  /**
   * Flush all pending messages.
   */
  async flush(): Promise<void> {
    const flushPromises: Promise<void>[] = [];

    // Flush default batch
    if (this.defaultBatch && this.defaultBatch.messages.length > 0) {
      flushPromises.push(this.sendBatch(this.defaultBatch));
      this.defaultBatch = null;
    }

    // Flush all ordered batches
    for (const [key, batch] of this.orderedBatches) {
      if (batch.messages.length > 0) {
        flushPromises.push(this.sendBatch(batch));
      }
      this.orderedBatches.delete(key);
    }

    await Promise.all(flushPromises);
  }

  /**
   * Resume a paused ordering key.
   */
  resumePublish(orderingKey: string): void {
    this.pausedOrderingKeys.delete(orderingKey);
    this.updatePausedKeysStats();
  }

  /**
   * Get ordering key state.
   */
  getOrderingKeyState(orderingKey: string): OrderingKeyState {
    const error = this.pausedOrderingKeys.get(orderingKey);
    const batch = this.orderedBatches.get(orderingKey);

    return {
      paused: error !== undefined,
      error,
      pendingCount: batch?.messages.length ?? 0,
    };
  }

  /**
   * Get publisher statistics.
   */
  getStats(): PublisherStats {
    let currentBatchSize = this.defaultBatch?.messages.length ?? 0;
    for (const batch of this.orderedBatches.values()) {
      currentBatchSize += batch.messages.length;
    }

    return {
      ...this.stats,
      currentBatchSize,
      avgLatencyMs: this.latencyCount > 0
        ? this.latencySum / this.latencyCount
        : 0,
      pausedOrderingKeys: [...this.pausedOrderingKeys.keys()],
    };
  }

  /**
   * Close the publisher.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    // Flush all pending messages
    await this.flush();

    // Clear timers
    if (this.defaultBatch?.timer) {
      clearTimeout(this.defaultBatch.timer);
    }
    for (const batch of this.orderedBatches.values()) {
      if (batch.timer) {
        clearTimeout(batch.timer);
      }
    }
  }

  /**
   * Add message to appropriate batch.
   */
  private addToBatch(pending: PendingMessage): void {
    const orderingKey = pending.message.orderingKey;
    const messageBytes = getMessageSize(pending.message);

    if (orderingKey && this.enableOrdering) {
      // Use ordering key-specific batch
      let batch = this.orderedBatches.get(orderingKey);

      if (!batch) {
        batch = this.createBatch(orderingKey);
        this.orderedBatches.set(orderingKey, batch);
      }

      this.addToBatchInternal(batch, pending, messageBytes);
    } else {
      // Use default batch
      if (!this.defaultBatch) {
        this.defaultBatch = this.createBatch();
      }

      this.addToBatchInternal(this.defaultBatch, pending, messageBytes);
    }
  }

  /**
   * Add to batch internal.
   */
  private addToBatchInternal(
    batch: MessageBatch,
    pending: PendingMessage,
    messageBytes: number
  ): void {
    // Check if adding message would exceed limits
    if (
      batch.messages.length >= this.batchSettings.maxMessages ||
      batch.bytes + messageBytes > this.batchSettings.maxBytes
    ) {
      // Flush current batch first
      this.sendBatch(batch);

      // Create new batch
      const newBatch = this.createBatch(batch.orderingKey);
      if (batch.orderingKey) {
        this.orderedBatches.set(batch.orderingKey, newBatch);
      } else {
        this.defaultBatch = newBatch;
      }
      batch = newBatch;
    }

    batch.messages.push(pending);
    batch.bytes += messageBytes;

    // Check if we hit limits after adding
    if (
      batch.messages.length >= this.batchSettings.maxMessages ||
      batch.bytes >= this.batchSettings.maxBytes
    ) {
      this.sendBatch(batch);
      if (batch.orderingKey) {
        this.orderedBatches.delete(batch.orderingKey);
      } else {
        this.defaultBatch = null;
      }
    }
  }

  /**
   * Create new batch.
   */
  private createBatch(orderingKey?: string): MessageBatch {
    const batch: MessageBatch = {
      messages: [],
      bytes: 0,
      orderingKey,
    };

    // Set up flush timer
    batch.timer = setTimeout(() => {
      if (batch.messages.length > 0) {
        this.sendBatch(batch);
        if (orderingKey) {
          this.orderedBatches.delete(orderingKey);
        } else if (this.defaultBatch === batch) {
          this.defaultBatch = null;
        }
      }
    }, this.batchSettings.maxDelayMs);

    return batch;
  }

  /**
   * Send batch to API.
   */
  private async sendBatch(batch: MessageBatch): Promise<void> {
    if (batch.timer) {
      clearTimeout(batch.timer);
      batch.timer = undefined;
    }

    if (batch.messages.length === 0) return;

    const startTime = Date.now();
    const messages = batch.messages;

    try {
      const token = await this.authProvider.getAccessToken();
      const endpoint = this.config.endpoint ?? "https://pubsub.googleapis.com";

      // Build request body
      const requestBody = {
        messages: messages.map((p) => ({
          data: this.encodeData(p.message.data),
          attributes: p.message.attributes,
          orderingKey: p.message.orderingKey,
        })),
      };

      const url = `${endpoint}/v1/${this.topicPath}:publish`;

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
        const error = this.parseErrorResponse(response.status, response.body, getRequestId(response));
        throw error;
      }

      const result = parseJsonBody<PublishResponse>(response);

      // Resolve all pending messages
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const messageId = result.messageIds[i];
        if (msg && messageId) {
          msg.resolve({ messageId });
          this.stats.messagesPublished++;
          this.stats.bytesPublished += getMessageSize(msg.message);
        }
      }

      // Update latency stats
      const latency = Date.now() - startTime;
      this.latencySum += latency;
      this.latencyCount++;

    } catch (error) {
      // Reject all pending messages
      for (const msg of messages) {
        msg.reject(error as Error);
        this.stats.publishErrors++;
      }

      // Pause ordering key on error
      if (batch.orderingKey && this.enableOrdering) {
        this.pausedOrderingKeys.set(batch.orderingKey, error as Error);
        this.updatePausedKeysStats();
      }
    }
  }

  /**
   * Encode message data to base64.
   */
  private encodeData(data: Buffer | string): string {
    const buffer = typeof data === "string" ? Buffer.from(data) : data;
    return buffer.toString("base64");
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
          return new TopicError(message, "NotFound", { topic: this.topic, requestId });
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
        return new TopicError(`Topic not found: ${this.topic}`, "NotFound", { topic: this.topic, requestId });
      case 429:
        return new ServerError("Rate limited", "RateLimited", { requestId });
      case 503:
        return new ServerError("Service unavailable", "ServiceUnavailable", { requestId });
      default:
        return new ServerError(`HTTP ${status}`, "InternalError", { requestId, statusCode: status });
    }
  }

  /**
   * Update paused keys in stats.
   */
  private updatePausedKeysStats(): void {
    this.stats.pausedOrderingKeys = [...this.pausedOrderingKeys.keys()];
  }
}

/**
 * Create a publisher.
 */
export function createPublisher(
  config: PubSubConfig,
  topic: string,
  authProvider: GcpAuthProvider,
  transport?: HttpTransport
): PubSubPublisher {
  return new PubSubPublisher(config, topic, authProvider, transport);
}
