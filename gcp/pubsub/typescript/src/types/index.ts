/**
 * Pub/Sub Types
 *
 * Core types following the SPARC specification for Google Cloud Pub/Sub integration.
 */

/**
 * Pub/Sub message for publishing.
 */
export interface PubSubMessage {
  /** Message payload (binary data). */
  data: Buffer | string;
  /** Message attributes (key-value metadata). */
  attributes?: Record<string, string>;
  /** Ordering key for ordered delivery. */
  orderingKey?: string;
}

/**
 * Received message from subscription.
 */
export interface ReceivedMessage {
  /** Acknowledgment ID. */
  ackId: string;
  /** Original message. */
  message: PubSubMessageData;
  /** Server-assigned message ID. */
  messageId: string;
  /** Publish timestamp. */
  publishTime: Date;
  /** Delivery attempt count (for DLQ tracking). */
  deliveryAttempt?: number;
}

/**
 * Message data as received from Pub/Sub.
 */
export interface PubSubMessageData {
  /** Message payload. */
  data: Buffer;
  /** Message attributes. */
  attributes: Record<string, string>;
  /** Ordering key if present. */
  orderingKey?: string;
  /** Server-assigned message ID. */
  messageId: string;
  /** Publish timestamp. */
  publishTime: Date;
}

/**
 * Result of publishing a message.
 */
export interface PublishResult {
  /** Server-assigned message ID. */
  messageId: string;
}

/**
 * Batch publish result.
 */
export interface BatchPublishResult {
  /** Results for each message. */
  results: PublishResult[];
  /** Number of successful publishes. */
  successCount: number;
  /** Number of failed publishes. */
  failureCount: number;
  /** Errors for failed messages (index -> error). */
  errors: Map<number, Error>;
}

/**
 * Pull result.
 */
export interface PullResult {
  /** Received messages. */
  messages: ReceivedMessage[];
}

/**
 * Stream configuration for streaming pull.
 */
export interface StreamConfig {
  /** Flow control settings. */
  flowControl: FlowControlConfig;
  /** Maximum ack deadline extension in seconds. */
  maxAckExtensionSeconds: number;
}

/**
 * Flow control configuration.
 */
export interface FlowControlConfig {
  /** Maximum outstanding messages. */
  maxOutstandingMessages: number;
  /** Maximum outstanding bytes. */
  maxOutstandingBytes: number;
}

/**
 * Message stream for streaming pull.
 */
export interface MessageStream extends AsyncIterable<ReceivedMessage> {
  /** Acknowledge a message. */
  ack(ackId: string): Promise<void>;
  /** Negative acknowledge a message. */
  nack(ackId: string): Promise<void>;
  /** Modify ack deadline. */
  modifyAckDeadline(ackId: string, seconds: number): Promise<void>;
  /** Close the stream. */
  close(): Promise<void>;
}

/**
 * Dead letter queue info.
 */
export interface DeadLetterInfo {
  /** Original topic. */
  sourceTopic: string;
  /** Original subscription. */
  sourceSubscription: string;
  /** Delivery attempt when moved to DLQ. */
  deliveryAttempt: number;
  /** Timestamp when moved to DLQ. */
  deadLetterTime: Date;
}

/**
 * Ordering key state.
 */
export interface OrderingKeyState {
  /** Whether ordering is paused due to error. */
  paused: boolean;
  /** Error that caused the pause. */
  error?: Error;
  /** Pending messages waiting for resume. */
  pendingCount: number;
}

/**
 * Publisher statistics.
 */
export interface PublisherStats {
  /** Total messages published. */
  messagesPublished: number;
  /** Total bytes published. */
  bytesPublished: number;
  /** Total publish errors. */
  publishErrors: number;
  /** Average publish latency in ms. */
  avgLatencyMs: number;
  /** Current batch size. */
  currentBatchSize: number;
  /** Paused ordering keys. */
  pausedOrderingKeys: string[];
}

/**
 * Subscriber statistics.
 */
export interface SubscriberStats {
  /** Total messages received. */
  messagesReceived: number;
  /** Total messages acknowledged. */
  messagesAcked: number;
  /** Total messages nacked. */
  messagesNacked: number;
  /** Outstanding messages count. */
  outstandingMessages: number;
  /** Outstanding bytes. */
  outstandingBytes: number;
  /** Average processing latency in ms. */
  avgProcessingLatencyMs: number;
}

/**
 * Seek target for replay.
 */
export type SeekTarget =
  | { type: "timestamp"; timestamp: Date }
  | { type: "snapshot"; snapshot: string };

/**
 * Create a message from string data.
 */
export function createMessage(
  data: string | Buffer,
  attributes?: Record<string, string>,
  orderingKey?: string
): PubSubMessage {
  return {
    data: typeof data === "string" ? Buffer.from(data) : data,
    attributes,
    orderingKey,
  };
}

/**
 * Create a message from JSON object.
 */
export function createJsonMessage<T>(
  data: T,
  attributes?: Record<string, string>,
  orderingKey?: string
): PubSubMessage {
  return {
    data: Buffer.from(JSON.stringify(data)),
    attributes: {
      ...attributes,
      "content-type": "application/json",
    },
    orderingKey,
  };
}

/**
 * Parse received message data as string.
 */
export function parseMessageAsString(message: ReceivedMessage): string {
  return message.message.data.toString("utf-8");
}

/**
 * Parse received message data as JSON.
 */
export function parseMessageAsJson<T>(message: ReceivedMessage): T {
  const data = message.message.data.toString("utf-8");
  return JSON.parse(data) as T;
}

/**
 * Get message size in bytes.
 */
export function getMessageSize(message: PubSubMessage): number {
  const dataSize = typeof message.data === "string"
    ? Buffer.byteLength(message.data)
    : message.data.length;

  let attributesSize = 0;
  if (message.attributes) {
    for (const [key, value] of Object.entries(message.attributes)) {
      attributesSize += Buffer.byteLength(key) + Buffer.byteLength(value);
    }
  }

  const orderingKeySize = message.orderingKey
    ? Buffer.byteLength(message.orderingKey)
    : 0;

  return dataSize + attributesSize + orderingKeySize;
}

/**
 * Validate message constraints.
 */
export function validateMessage(message: PubSubMessage): void {
  const { ConfigurationError } = require("../error/index.js");

  // Check message size (max 10MB)
  const size = getMessageSize(message);
  if (size > 10 * 1024 * 1024) {
    throw new ConfigurationError(
      `Message size ${size} exceeds maximum of 10MB`,
      "InvalidMessage"
    );
  }

  // Check attributes
  if (message.attributes) {
    const attrCount = Object.keys(message.attributes).length;
    if (attrCount > 100) {
      throw new ConfigurationError(
        `Attribute count ${attrCount} exceeds maximum of 100`,
        "InvalidMessage"
      );
    }

    for (const [key, value] of Object.entries(message.attributes)) {
      if (Buffer.byteLength(key) > 256) {
        throw new ConfigurationError(
          `Attribute key "${key}" exceeds maximum of 256 bytes`,
          "InvalidMessage"
        );
      }
      if (Buffer.byteLength(value) > 1024) {
        throw new ConfigurationError(
          `Attribute value for "${key}" exceeds maximum of 1024 bytes`,
          "InvalidMessage"
        );
      }
    }
  }

  // Check ordering key
  if (message.orderingKey && Buffer.byteLength(message.orderingKey) > 1024) {
    throw new ConfigurationError(
      "Ordering key exceeds maximum of 1024 bytes",
      "InvalidMessage"
    );
  }
}
