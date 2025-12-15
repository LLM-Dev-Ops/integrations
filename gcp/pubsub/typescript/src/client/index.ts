/**
 * Pub/Sub Client
 *
 * Main entry point for Google Cloud Pub/Sub integration.
 * Following the SPARC specification.
 */

import {
  PubSubConfig,
  configBuilder,
  PubSubConfigBuilder,
} from "../config/index.js";
import { GcpAuthProvider, createAuthProvider } from "../credentials/index.js";
import { HttpTransport, FetchTransport } from "../transport/index.js";
import { PubSubPublisher, createPublisher } from "../publisher/index.js";
import { PubSubSubscriber, createSubscriber } from "../subscriber/index.js";
import { SimulationLayer, createSimulationLayer } from "../simulation/index.js";
import { PubSubError } from "../error/index.js";

/**
 * Pub/Sub Client.
 */
export class PubSubClient {
  private readonly config: PubSubConfig;
  private authProvider?: GcpAuthProvider;
  private transport: HttpTransport;
  private simulation?: SimulationLayer;
  private publishers: Map<string, PubSubPublisher> = new Map();
  private subscribers: Map<string, PubSubSubscriber> = new Map();
  private closed = false;
  private initialized = false;
  private initPromise?: Promise<void>;

  /**
   * Create a new Pub/Sub client.
   */
  constructor(config: PubSubConfig) {
    this.config = config;
    this.transport = new FetchTransport(config.timeout);

    // Initialize simulation layer if configured
    if (config.simulationMode.type !== "disabled") {
      this.simulation = createSimulationLayer(config.simulationMode);
    }
  }

  /**
   * Get the project ID.
   */
  get projectId(): string {
    return this.config.projectId;
  }

  /**
   * Initialize the client.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.doInitialize();
    await this.initPromise;
    this.initialized = true;
  }

  private async doInitialize(): Promise<void> {
    // Create auth provider
    this.authProvider = await createAuthProvider(
      this.config.credentials,
      this.transport
    );

    // Load simulation recordings if in replay mode
    if (this.simulation?.isReplaying()) {
      await this.simulation.loadRecordings();
    }
  }

  /**
   * Get a publisher for a topic.
   */
  async publisher(topic: string): Promise<PubSubPublisher> {
    if (this.closed) {
      throw new PubSubError("Client is closed", "ClientClosed");
    }

    await this.initialize();

    // Check cache
    let publisher = this.publishers.get(topic);
    if (publisher) {
      return publisher;
    }

    // Create new publisher
    publisher = createPublisher(
      this.config,
      topic,
      this.authProvider!,
      this.transport
    );

    this.publishers.set(topic, publisher);
    return publisher;
  }

  /**
   * Get a subscriber for a subscription.
   */
  async subscriber(subscription: string): Promise<PubSubSubscriber> {
    if (this.closed) {
      throw new PubSubError("Client is closed", "ClientClosed");
    }

    await this.initialize();

    // Check cache
    let subscriber = this.subscribers.get(subscription);
    if (subscriber) {
      return subscriber;
    }

    // Create new subscriber
    subscriber = createSubscriber(
      this.config,
      subscription,
      this.authProvider!,
      this.transport
    );

    this.subscribers.set(subscription, subscriber);
    return subscriber;
  }

  /**
   * Get the simulation layer.
   */
  getSimulation(): SimulationLayer | undefined {
    return this.simulation;
  }

  /**
   * Save simulation recordings.
   */
  async saveRecordings(): Promise<void> {
    if (this.simulation?.isRecording()) {
      await this.simulation.saveRecordings();
    }
  }

  /**
   * Close the client and all publishers/subscribers.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    // Close all publishers
    for (const publisher of this.publishers.values()) {
      await publisher.close();
    }
    this.publishers.clear();

    // Close all subscribers
    for (const subscriber of this.subscribers.values()) {
      await subscriber.close();
    }
    this.subscribers.clear();

    // Save recordings if in recording mode
    await this.saveRecordings();
  }
}

/**
 * Create a Pub/Sub client.
 */
export function createClient(config: PubSubConfig): PubSubClient {
  return new PubSubClient(config);
}

/**
 * Create a Pub/Sub client from environment.
 */
export function createClientFromEnv(): PubSubClient {
  const config = configBuilder().fromEnv().build();
  return new PubSubClient(config);
}

/**
 * Client builder for fluent configuration.
 */
export class PubSubClientBuilder {
  private configBuilder: PubSubConfigBuilder;

  constructor() {
    this.configBuilder = configBuilder();
  }

  /**
   * Set project ID.
   */
  projectId(projectId: string): this {
    this.configBuilder.projectId(projectId);
    return this;
  }

  /**
   * Use service account key file.
   */
  serviceAccountKeyFile(keyFile: string): this {
    this.configBuilder.serviceAccountKeyFile(keyFile);
    return this;
  }

  /**
   * Use application default credentials.
   */
  applicationDefault(): this {
    this.configBuilder.applicationDefault();
    return this;
  }

  /**
   * Set custom endpoint (for emulator).
   */
  endpoint(url: string): this {
    this.configBuilder.endpoint(url);
    return this;
  }

  /**
   * Load from environment.
   */
  fromEnv(): this {
    this.configBuilder.fromEnv();
    return this;
  }

  /**
   * Enable message ordering.
   */
  enableOrdering(enable: boolean = true): this {
    this.configBuilder.enableOrdering(enable);
    return this;
  }

  /**
   * Enable simulation recording.
   */
  recordTo(path: string): this {
    this.configBuilder.recordTo({ type: "file", path });
    return this;
  }

  /**
   * Enable simulation replay.
   */
  replayFrom(path: string): this {
    this.configBuilder.replayFrom({ type: "file", path });
    return this;
  }

  /**
   * Build the client.
   */
  build(): PubSubClient {
    const config = this.configBuilder.build();
    return new PubSubClient(config);
  }
}

/**
 * Create a client builder.
 */
export function clientBuilder(): PubSubClientBuilder {
  return new PubSubClientBuilder();
}
