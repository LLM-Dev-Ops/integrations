/**
 * Salesforce Events Service Implementation following SPARC specification.
 *
 * Provides support for:
 * - Platform Events publishing via REST API
 * - Pub/Sub API (gRPC-based event streaming)
 * - CometD/Streaming API fallback for HTTP-based streaming
 *
 * Platform Events allow event-driven architecture patterns in Salesforce.
 * The Pub/Sub API provides high-throughput, low-latency event streaming.
 */

import { SalesforceClient } from '../client/index.js';
import { SalesforceError, SalesforceErrorCode } from '../errors/index.js';

// ============================================================================
// Platform Events Publishing (REST API)
// ============================================================================

/**
 * Result of publishing a platform event.
 */
export interface PublishResult {
  /** The ID of the published event */
  id: string;
  /** Whether the publish was successful */
  success: boolean;
  /** Array of errors if the publish failed */
  errors: PublishError[];
}

/**
 * Error details for failed event publish.
 */
export interface PublishError {
  /** The error status code */
  statusCode: string;
  /** The error message */
  message: string;
  /** Fields that caused the error (if applicable) */
  fields?: string[];
}

/**
 * Event service interface for publishing platform events.
 */
export interface EventService {
  /**
   * Publishes a single platform event.
   *
   * @param eventType The platform event type (e.g., 'Order_Event__e')
   * @param event The event payload
   * @returns Promise resolving to the publish result
   */
  publish(eventType: string, event: Record<string, unknown>): Promise<PublishResult>;

  /**
   * Publishes multiple platform events in a batch.
   * Uses the Composite API for efficiency.
   *
   * @param eventType The platform event type (e.g., 'Order_Event__e')
   * @param events Array of event payloads
   * @returns Promise resolving to an array of publish results
   */
  publishBatch(eventType: string, events: Record<string, unknown>[]): Promise<PublishResult[]>;
}

/**
 * Implementation of the EventService interface.
 */
export class EventServiceImpl implements EventService {
  private readonly client: SalesforceClient;

  constructor(client: SalesforceClient) {
    this.client = client;
  }

  /**
   * Publishes a single platform event via REST API.
   *
   * POST /services/data/vXX.0/sobjects/{EventType__e}/
   *
   * Example:
   * ```typescript
   * const result = await eventService.publish('Order_Event__e', {
   *   Order_Number__c: 'ORD-12345',
   *   Amount__c: 1500.00,
   *   Status__c: 'Shipped'
   * });
   * ```
   */
  async publish(eventType: string, event: Record<string, unknown>): Promise<PublishResult> {
    this.client.logger.debug('Publishing platform event', { eventType });

    try {
      const response = await this.client.post<PublishResult>(
        `/sobjects/${eventType}/`,
        event
      );

      this.client.logger.info('Platform event published successfully', {
        eventType,
        eventId: response.id,
      });

      return response;
    } catch (error) {
      this.client.logger.error('Failed to publish platform event', {
        eventType,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Publishes multiple platform events using the Composite API.
   *
   * POST /services/data/vXX.0/composite
   *
   * The Composite API allows multiple independent subrequests to be executed
   * in a single API call, improving efficiency and reducing API limits usage.
   *
   * Example:
   * ```typescript
   * const results = await eventService.publishBatch('Order_Event__e', [
   *   { Order_Number__c: 'ORD-12345', Amount__c: 1500.00 },
   *   { Order_Number__c: 'ORD-12346', Amount__c: 2500.00 },
   *   { Order_Number__c: 'ORD-12347', Amount__c: 3500.00 }
   * ]);
   * ```
   */
  async publishBatch(eventType: string, events: Record<string, unknown>[]): Promise<PublishResult[]> {
    if (events.length === 0) {
      return [];
    }

    this.client.logger.debug('Publishing platform events batch', {
      eventType,
      count: events.length,
    });

    // Build composite request
    const compositeRequest = {
      allOrNone: false, // Allow partial success
      compositeRequest: events.map((event, index) => ({
        method: 'POST',
        url: `/services/data/${this.client.configuration.apiVersion}/sobjects/${eventType}/`,
        referenceId: `event_${index}`,
        body: event,
      })),
    };

    try {
      const response = await this.client.post<{
        compositeResponse: Array<{
          body: PublishResult;
          httpStatusCode: number;
          referenceId: string;
        }>;
      }>('/composite', compositeRequest);

      const results = response.compositeResponse.map((subResponse) => subResponse.body);

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.length - successCount;

      this.client.logger.info('Platform events batch published', {
        eventType,
        total: events.length,
        successful: successCount,
        failed: failureCount,
      });

      return results;
    } catch (error) {
      this.client.logger.error('Failed to publish platform events batch', {
        eventType,
        count: events.length,
        error: (error as Error).message,
      });
      throw error;
    }
  }
}

// ============================================================================
// Pub/Sub API (gRPC-based Event Streaming)
// ============================================================================

/**
 * Options for subscribing to platform events via Pub/Sub API.
 */
export interface SubscribeOptions {
  /**
   * The topic name to subscribe to.
   * Format: '/event/{EventType__e}' for Platform Events
   * Format: '/data/{SObjectName}ChangeEvent' for Change Data Capture
   *
   * Example: '/event/Order_Event__e'
   * Example: '/data/AccountChangeEvent'
   */
  topicName: string;

  /**
   * Replay preset determines where to start in the event stream.
   * - LATEST: Start from the latest events (default)
   * - EARLIEST: Start from the earliest available events (24 hours retention)
   * - CUSTOM: Start from a specific replay ID
   */
  replayPreset: ReplayPreset;

  /**
   * The replay ID to start from (required when replayPreset is CUSTOM).
   * Replay IDs are opaque byte arrays that mark a position in the event stream.
   */
  replayId?: Uint8Array;

  /**
   * Number of events to request per batch.
   * Recommended: 100-1000 depending on event size and processing speed.
   */
  numRequested: number;
}

/**
 * Replay preset for determining event stream position.
 */
export type ReplayPreset = 'LATEST' | 'EARLIEST' | 'CUSTOM';

/**
 * Platform event message received from Pub/Sub API.
 */
export interface PlatformEventMessage {
  /**
   * Replay ID for this event.
   * Store this to resume from this position in case of disconnection.
   */
  replayId: Uint8Array;

  /**
   * Event metadata and payload.
   */
  event: {
    /** Schema ID for deserializing the payload */
    schemaId: string;
    /** Event payload (serialized with Apache Avro) */
    payload: Uint8Array;
    /** Event ID */
    id: string;
    /** When the event was created (ISO 8601) */
    createdDate: string;
  };
}

/**
 * Event schema for deserializing event payloads.
 */
export interface EventSchema {
  /** Schema ID */
  id: string;
  /** Schema definition in Apache Avro format (JSON) */
  schema: string;
}

/**
 * Pub/Sub API client interface for gRPC-based event streaming.
 *
 * PRODUCTION REQUIREMENTS:
 * -------------------------
 * For production use, this requires:
 * 1. gRPC dependencies: @grpc/grpc-js, @grpc/proto-loader
 * 2. Salesforce Pub/Sub API proto definitions
 * 3. Apache Avro library for payload deserialization
 * 4. OAuth 2.0 credentials for authentication
 *
 * Setup:
 * ```typescript
 * import * as grpc from '@grpc/grpc-js';
 * import * as protoLoader from '@grpc/proto-loader';
 * import avro from 'avro-js';
 *
 * // Load proto definition
 * const packageDefinition = protoLoader.loadSync('pubsub_api.proto');
 * const proto = grpc.loadPackageDefinition(packageDefinition);
 *
 * // Create gRPC client
 * const client = new proto.eventbus.v1.PubSub(
 *   'api.pubsub.salesforce.com:7443',
 *   grpc.credentials.createSsl()
 * );
 * ```
 *
 * Authentication:
 * ```typescript
 * const metadata = new grpc.Metadata();
 * metadata.add('accesstoken', await getAccessToken());
 * metadata.add('instanceurl', instanceUrl);
 * metadata.add('tenantid', organizationId);
 * ```
 */
export interface PubSubClient {
  /**
   * Subscribes to a topic and yields events as they arrive.
   *
   * This is an async generator that streams events from the Pub/Sub API.
   * The connection is maintained until the generator is closed or an error occurs.
   *
   * Example:
   * ```typescript
   * for await (const message of pubSubClient.subscribe({
   *   topicName: '/event/Order_Event__e',
   *   replayPreset: 'LATEST',
   *   numRequested: 100
   * })) {
   *   // Deserialize event payload using schema
   *   const schema = await pubSubClient.getSchema(message.event.schemaId);
   *   const avroType = avro.parse(schema.schema);
   *   const event = avroType.fromBuffer(message.event.payload);
   *
   *   console.log('Received event:', event);
   *
   *   // Store replay ID for resuming later
   *   await storeReplayId(message.replayId);
   * }
   * ```
   *
   * @param options Subscription options
   * @returns Async generator yielding platform event messages
   */
  subscribe(options: SubscribeOptions): AsyncGenerator<PlatformEventMessage, void, unknown>;

  /**
   * Retrieves the schema for deserializing event payloads.
   *
   * Schemas are cached by the Pub/Sub API and can be reused across events.
   * The schema is in Apache Avro format (JSON).
   *
   * @param schemaId The schema ID from the event message
   * @returns Promise resolving to the event schema
   */
  getSchema(schemaId: string): Promise<EventSchema>;
}

/**
 * Mock/Stub implementation of PubSubClient.
 *
 * This is a placeholder implementation that documents the expected behavior.
 * For production use, replace this with a real gRPC-based implementation.
 *
 * Production Implementation Guide:
 * ---------------------------------
 * 1. Install dependencies:
 *    ```bash
 *    npm install @grpc/grpc-js @grpc/proto-loader avro-js
 *    ```
 *
 * 2. Download Salesforce Pub/Sub API proto file:
 *    https://github.com/developerforce/pub-sub-api/blob/main/pubsub_api.proto
 *
 * 3. Implement authentication:
 *    - Use OAuth 2.0 to obtain access token
 *    - Include token, instance URL, and tenant ID in gRPC metadata
 *
 * 4. Implement bidirectional streaming:
 *    - Send Subscribe requests with flow control
 *    - Receive events and handle backpressure
 *    - Periodically send FetchRequest to request more events
 *
 * 5. Handle reconnection:
 *    - Store latest replay ID
 *    - Reconnect with CUSTOM replay preset on disconnection
 *    - Implement exponential backoff for reconnection
 *
 * 6. Deserialize events:
 *    - Fetch schema using GetSchema RPC
 *    - Cache schemas by ID
 *    - Use Apache Avro to decode binary payloads
 */
export class MockPubSubClient implements PubSubClient {
  /**
   * Mock subscribe implementation.
   * Throws an error indicating that gRPC implementation is required.
   */
  async *subscribe(options: SubscribeOptions): AsyncGenerator<PlatformEventMessage, void, unknown> {
    throw new SalesforceError({
      code: SalesforceErrorCode.ConfigurationError,
      message:
        'Pub/Sub API requires gRPC implementation. ' +
        'Install @grpc/grpc-js and implement PubSubClient using pubsub_api.proto. ' +
        'See class documentation for setup instructions.',
      details: { options },
      retryable: false,
    });
  }

  /**
   * Mock getSchema implementation.
   * Throws an error indicating that gRPC implementation is required.
   */
  async getSchema(schemaId: string): Promise<EventSchema> {
    throw new SalesforceError({
      code: SalesforceErrorCode.ConfigurationError,
      message:
        'Pub/Sub API requires gRPC implementation. ' +
        'Install @grpc/grpc-js and implement PubSubClient using pubsub_api.proto. ' +
        'See class documentation for setup instructions.',
      details: { schemaId },
      retryable: false,
    });
  }
}

// ============================================================================
// CometD/Streaming API (HTTP-based Event Streaming)
// ============================================================================

/**
 * Streaming API event envelope.
 */
export interface StreamingEvent {
  /** Channel name */
  channel: string;
  /** Replay ID for this event */
  replayId: number;
  /** Event data */
  data: {
    /** Event payload */
    payload: Record<string, unknown>;
    /** Event metadata */
    event: {
      /** Replay ID */
      replayId: number;
      /** Created date */
      createdDate?: string;
    };
  };
}

/**
 * Change Data Capture event payload structure.
 * Used when subscribing to CDC channels like '/data/{SObjectName}ChangeEvent'.
 */
export interface ChangeDataCaptureEvent {
  /** Change type: CREATE, UPDATE, DELETE, UNDELETE, GAP_CREATE, GAP_UPDATE, GAP_DELETE, GAP_UNDELETE, GAP_OVERFLOW */
  ChangeEventHeader: {
    entityName: string;
    recordIds: string[];
    changeType: 'CREATE' | 'UPDATE' | 'DELETE' | 'UNDELETE' | 'GAP_CREATE' | 'GAP_UPDATE' | 'GAP_DELETE' | 'GAP_UNDELETE' | 'GAP_OVERFLOW';
    changeOrigin: string;
    transactionKey: string;
    sequenceNumber: number;
    commitTimestamp: number;
    commitUser: string;
    commitNumber: number;
    changedFields: string[];
  };
  /** Dynamic fields from the changed record */
  [field: string]: unknown;
}

/**
 * CometD handshake response.
 */
interface CometDHandshakeResponse {
  clientId: string;
  successful: boolean;
  version: string;
  supportedConnectionTypes: string[];
  channel: string;
  minimumVersion?: string;
}

/**
 * CometD subscription response.
 */
interface CometDSubscriptionResponse {
  clientId: string;
  successful: boolean;
  subscription: string;
  channel: string;
}

/**
 * CometD connect response.
 */
interface CometDConnectResponse {
  clientId?: string;
  successful: boolean;
  channel: string;
  data?: StreamingEvent[];
}

/**
 * Simple Pub/Sub client using HTTP-based Streaming API (CometD).
 *
 * This is a simplified alternative to the gRPC Pub/Sub API for environments
 * where gRPC is not available or desired. It uses the CometD protocol over HTTP
 * long-polling to stream events.
 *
 * Limitations compared to Pub/Sub API:
 * - Lower throughput (HTTP long-polling vs gRPC streaming)
 * - Higher latency
 * - Less efficient for high-volume event processing
 * - 24-hour replay window
 *
 * Advantages:
 * - No gRPC dependencies required
 * - Works in any HTTP environment
 * - Simpler implementation
 * - Built-in authentication via SalesforceClient
 *
 * Example:
 * ```typescript
 * const client = new SimplePubSubClient(salesforceClient);
 *
 * for await (const event of client.subscribe('/event/Order_Event__e', -1)) {
 *   console.log('Received event:', event.data.payload);
 *   // Store replay ID for resuming later
 *   await storeReplayId(event.replayId);
 * }
 * ```
 */
export class SimplePubSubClient {
  private readonly client: SalesforceClient;
  private clientId: string | null = null;

  constructor(client: SalesforceClient) {
    this.client = client;
  }

  /**
   * Subscribes to a channel and yields events as they arrive.
   *
   * Channel formats:
   * - Platform Events: '/event/{EventType__e}'
   * - Change Data Capture: '/data/{SObjectName}ChangeEvent'
   * - PushTopic: '/topic/{PushTopicName}'
   *
   * Replay ID:
   * - -1: Get new events from now onwards (LATEST)
   * - -2: Get all events within retention window (EARLIEST)
   * - Specific ID: Resume from that event (CUSTOM)
   *
   * @param channel The channel to subscribe to
   * @param replayId Optional replay ID to start from (default: -1)
   * @returns Async generator yielding streaming events
   */
  async *subscribe(channel: string, replayId: number = -1): AsyncGenerator<StreamingEvent, void, unknown> {
    this.client.logger.info('Starting Streaming API subscription', { channel, replayId });

    try {
      // Handshake to establish connection
      await this.handshake();

      if (!this.clientId) {
        throw new SalesforceError({
          code: SalesforceErrorCode.ConfigurationError,
          message: 'Failed to obtain CometD client ID',
          retryable: false,
        });
      }

      // Subscribe to channel
      await this.subscribeChannel(channel, replayId);

      // Start long-polling for events
      let running = true;
      while (running) {
        try {
          const events = await this.connect();
          for (const event of events) {
            yield event;
          }
        } catch (error) {
          this.client.logger.error('Error in streaming connection', {
            error: (error as Error).message,
          });
          // Wait before reconnecting
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    } finally {
      this.client.logger.info('Streaming API subscription ended', { channel });
    }
  }

  /**
   * Subscribes to Change Data Capture events for a specific sObject.
   *
   * This is a convenience method that constructs the CDC channel name and
   * subscribes to it using the underlying subscribe method.
   *
   * Channel format: '/data/{SObjectName}ChangeEvent'
   *
   * Example:
   * ```typescript
   * const client = new SimplePubSubClient(salesforceClient);
   *
   * for await (const event of client.subscribeToCDC('Account', -1)) {
   *   const cdcEvent = event.data.payload as ChangeDataCaptureEvent;
   *   console.log('Change type:', cdcEvent.ChangeEventHeader.changeType);
   *   console.log('Record IDs:', cdcEvent.ChangeEventHeader.recordIds);
   *   console.log('Changed fields:', cdcEvent.ChangeEventHeader.changedFields);
   * }
   * ```
   *
   * @param sObjectName The sObject name (e.g., 'Account', 'Opportunity')
   * @param replayId Optional replay ID to start from (default: -1)
   * @returns Async generator yielding CDC streaming events
   */
  async *subscribeToCDC(sObjectName: string, replayId: number = -1): AsyncGenerator<StreamingEvent, void, unknown> {
    const channel = `/data/${sObjectName}ChangeEvent`;
    yield* this.subscribe(channel, replayId);
  }

  /**
   * Performs CometD handshake to establish a session.
   */
  private async handshake(): Promise<void> {
    const response = await this.client.post<CometDHandshakeResponse[]>(
      '/cometd/handshake',
      [
        {
          channel: '/meta/handshake',
          version: '1.0',
          supportedConnectionTypes: ['long-polling'],
        },
      ]
    );

    if (response.length === 0 || !response[0].successful) {
      throw new SalesforceError({
        code: SalesforceErrorCode.AuthenticationError,
        message: 'CometD handshake failed',
        retryable: false,
      });
    }

    this.clientId = response[0].clientId;
    this.client.logger.debug('CometD handshake successful', { clientId: this.clientId });
  }

  /**
   * Subscribes to a specific channel.
   */
  private async subscribeChannel(channel: string, replayId: number): Promise<void> {
    const subscribeRequest: Record<string, unknown> = {
      channel: '/meta/subscribe',
      clientId: this.clientId,
      subscription: channel,
    };

    // Add replay extension for event replay
    if (replayId !== undefined) {
      subscribeRequest.ext = {
        replay: {
          [channel]: replayId,
        },
      };
    }

    const response = await this.client.post<CometDSubscriptionResponse[]>(
      '/cometd/subscribe',
      [subscribeRequest]
    );

    if (response.length === 0 || !response[0].successful) {
      throw new SalesforceError({
        code: SalesforceErrorCode.ConfigurationError,
        message: `Failed to subscribe to channel: ${channel}`,
        retryable: false,
      });
    }

    this.client.logger.debug('Subscribed to channel', { channel });
  }

  /**
   * Connects to receive events via long-polling.
   */
  private async connect(): Promise<StreamingEvent[]> {
    const response = await this.client.post<CometDConnectResponse[]>(
      '/cometd/connect',
      [
        {
          channel: '/meta/connect',
          clientId: this.clientId,
          connectionType: 'long-polling',
        },
      ]
    );

    if (response.length === 0) {
      return [];
    }

    const connectResponse = response[0];
    if (!connectResponse.successful) {
      // Session expired, need to rehandshake
      if (connectResponse.clientId === null) {
        this.clientId = null;
        throw new SalesforceError({
          code: SalesforceErrorCode.TokenExpired,
          message: 'CometD session expired',
          retryable: true,
        });
      }
      return [];
    }

    // Return any events received
    return connectResponse.data ?? [];
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates an EventService instance for publishing platform events.
 *
 * @param client Salesforce client instance
 * @returns EventService implementation
 */
export function createEventService(client: SalesforceClient): EventService {
  return new EventServiceImpl(client);
}

/**
 * Creates a PubSubClient instance for subscribing to events.
 *
 * Currently returns a mock implementation. For production use, replace with
 * a real gRPC-based implementation using the Pub/Sub API proto definitions.
 *
 * @param _client Salesforce client instance (unused in mock, reserved for real implementation)
 * @returns PubSubClient implementation
 */
export function createPubSubClient(_client: SalesforceClient): PubSubClient {
  // In production, return a real gRPC-based implementation:
  // return new GrpcPubSubClient(_client);
  return new MockPubSubClient();
}

/**
 * Creates a SimplePubSubClient instance for HTTP-based event streaming.
 *
 * @param client Salesforce client instance
 * @returns SimplePubSubClient implementation
 */
export function createSimplePubSubClient(client: SalesforceClient): SimplePubSubClient {
  return new SimplePubSubClient(client);
}
