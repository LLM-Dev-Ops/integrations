/**
 * Pub/Sub Configuration Module
 *
 * Following the SPARC specification for Google Cloud Pub/Sub integration.
 */

import { ConfigurationError } from "../error/index.js";

/**
 * GCP credentials type.
 */
export type GcpCredentials =
  | { type: "service_account"; keyFile: string }
  | { type: "service_account_json"; key: ServiceAccountKey }
  | { type: "workload_identity" }
  | { type: "application_default" }
  | { type: "access_token"; token: string }
  | { type: "none" }; // For emulator

/**
 * Service account key structure.
 */
export interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts. */
  maxAttempts: number;
  /** Base delay in milliseconds. */
  baseDelay: number;
  /** Maximum delay in milliseconds. */
  maxDelay: number;
  /** Backoff multiplier. */
  multiplier: number;
}

/**
 * Batch settings for publishing.
 */
export interface BatchSettings {
  /** Maximum messages per batch (default: 100). */
  maxMessages: number;
  /** Maximum bytes per batch (default: 1MB). */
  maxBytes: number;
  /** Maximum delay before sending batch in ms (default: 10ms). */
  maxDelayMs: number;
}

/**
 * Flow control settings.
 */
export interface FlowControlSettings {
  /** Maximum outstanding messages. */
  maxOutstandingMessages: number;
  /** Maximum outstanding bytes. */
  maxOutstandingBytes: number;
  /** Behavior when limit exceeded. */
  limitExceededBehavior: "block" | "error";
}

/**
 * Publisher configuration.
 */
export interface PublisherConfig {
  /** Batch settings. */
  batchSettings: BatchSettings;
  /** Enable message ordering. */
  enableOrdering: boolean;
  /** Retry settings. */
  retryConfig: RetryConfig;
  /** Flow control settings. */
  flowControl?: FlowControlSettings;
}

/**
 * Subscriber configuration.
 */
export interface SubscriberConfig {
  /** Maximum outstanding messages for flow control. */
  maxOutstandingMessages: number;
  /** Maximum outstanding bytes for flow control. */
  maxOutstandingBytes: number;
  /** Ack deadline in seconds (default: 10). */
  ackDeadlineSeconds: number;
  /** Enable exactly-once delivery. */
  exactlyOnce: boolean;
  /** Maximum ack deadline extension in seconds. */
  maxAckExtensionSeconds: number;
}

/**
 * Simulation mode.
 */
export type SimulationMode =
  | { type: "disabled" }
  | { type: "recording"; storage: RecordStorage }
  | { type: "replay"; source: RecordStorage };

/**
 * Record storage options.
 */
export type RecordStorage =
  | { type: "memory" }
  | { type: "file"; path: string };

/**
 * Pub/Sub client configuration.
 */
export interface PubSubConfig {
  /** GCP project ID. */
  projectId: string;
  /** GCP credentials. */
  credentials: GcpCredentials;
  /** Publisher configuration. */
  publisherConfig: PublisherConfig;
  /** Subscriber configuration. */
  subscriberConfig: SubscriberConfig;
  /** Custom endpoint (for emulator). */
  endpoint?: string;
  /** Request timeout in milliseconds. */
  timeout: number;
  /** Simulation mode. */
  simulationMode: SimulationMode;
  /** Enable request logging. */
  enableLogging: boolean;
}

/**
 * Default batch settings.
 */
export const DEFAULT_BATCH_SETTINGS: BatchSettings = {
  maxMessages: 100,
  maxBytes: 1024 * 1024, // 1MB
  maxDelayMs: 10,
};

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 100,
  maxDelay: 60000,
  multiplier: 2,
};

/**
 * Default publisher configuration.
 */
export const DEFAULT_PUBLISHER_CONFIG: PublisherConfig = {
  batchSettings: DEFAULT_BATCH_SETTINGS,
  enableOrdering: false,
  retryConfig: DEFAULT_RETRY_CONFIG,
};

/**
 * Default subscriber configuration.
 */
export const DEFAULT_SUBSCRIBER_CONFIG: SubscriberConfig = {
  maxOutstandingMessages: 1000,
  maxOutstandingBytes: 100 * 1024 * 1024, // 100MB
  ackDeadlineSeconds: 10,
  exactlyOnce: false,
  maxAckExtensionSeconds: 3600,
};

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Omit<PubSubConfig, "projectId"> = {
  credentials: { type: "application_default" },
  publisherConfig: DEFAULT_PUBLISHER_CONFIG,
  subscriberConfig: DEFAULT_SUBSCRIBER_CONFIG,
  timeout: 30000,
  simulationMode: { type: "disabled" },
  enableLogging: false,
};

/**
 * Pub/Sub configuration builder.
 */
export class PubSubConfigBuilder {
  private config: Partial<PubSubConfig> = {};

  /**
   * Set the GCP project ID.
   */
  projectId(projectId: string): this {
    this.config.projectId = projectId;
    return this;
  }

  /**
   * Set explicit credentials.
   */
  credentials(credentials: GcpCredentials): this {
    this.config.credentials = credentials;
    return this;
  }

  /**
   * Use service account key file.
   */
  serviceAccountKeyFile(keyFile: string): this {
    this.config.credentials = { type: "service_account", keyFile };
    return this;
  }

  /**
   * Use service account key JSON.
   */
  serviceAccountKey(key: ServiceAccountKey): this {
    this.config.credentials = { type: "service_account_json", key };
    return this;
  }

  /**
   * Use workload identity (GKE).
   */
  workloadIdentity(): this {
    this.config.credentials = { type: "workload_identity" };
    return this;
  }

  /**
   * Use application default credentials.
   */
  applicationDefault(): this {
    this.config.credentials = { type: "application_default" };
    return this;
  }

  /**
   * Use explicit access token.
   */
  accessToken(token: string): this {
    this.config.credentials = { type: "access_token", token };
    return this;
  }

  /**
   * Set custom endpoint (for emulator).
   */
  endpoint(url: string): this {
    this.config.endpoint = url;
    return this;
  }

  /**
   * Set request timeout in milliseconds.
   */
  timeout(ms: number): this {
    this.config.timeout = ms;
    return this;
  }

  /**
   * Configure batch settings.
   */
  batchSettings(settings: Partial<BatchSettings>): this {
    const existingPublisher = this.config.publisherConfig ?? { ...DEFAULT_PUBLISHER_CONFIG };
    this.config.publisherConfig = {
      ...existingPublisher,
      batchSettings: {
        ...existingPublisher.batchSettings,
        ...settings,
      },
    };
    return this;
  }

  /**
   * Enable message ordering.
   */
  enableOrdering(enable: boolean = true): this {
    const existingPublisher = this.config.publisherConfig ?? { ...DEFAULT_PUBLISHER_CONFIG };
    this.config.publisherConfig = {
      ...existingPublisher,
      enableOrdering: enable,
    };
    return this;
  }

  /**
   * Set publisher configuration.
   */
  publisherConfig(config: Partial<PublisherConfig>): this {
    const existing = this.config.publisherConfig ?? { ...DEFAULT_PUBLISHER_CONFIG };
    this.config.publisherConfig = {
      ...existing,
      ...config,
      batchSettings: {
        ...existing.batchSettings,
        ...config.batchSettings,
      },
      retryConfig: {
        ...existing.retryConfig,
        ...config.retryConfig,
      },
    };
    return this;
  }

  /**
   * Set subscriber configuration.
   */
  subscriberConfig(config: Partial<SubscriberConfig>): this {
    const existing = this.config.subscriberConfig ?? { ...DEFAULT_SUBSCRIBER_CONFIG };
    this.config.subscriberConfig = {
      ...existing,
      ...config,
    };
    return this;
  }

  /**
   * Enable simulation recording.
   */
  recordTo(storage: RecordStorage): this {
    this.config.simulationMode = { type: "recording", storage };
    return this;
  }

  /**
   * Enable simulation replay.
   */
  replayFrom(source: RecordStorage): this {
    this.config.simulationMode = { type: "replay", source };
    return this;
  }

  /**
   * Enable request logging.
   */
  enableLogging(enable: boolean = true): this {
    this.config.enableLogging = enable;
    return this;
  }

  /**
   * Load configuration from environment variables.
   */
  fromEnv(): this {
    // Project ID
    const projectId =
      process.env["GOOGLE_CLOUD_PROJECT"] ??
      process.env["GCLOUD_PROJECT"] ??
      process.env["GCP_PROJECT"];
    if (projectId) {
      this.config.projectId = projectId;
    }

    // Credentials file
    const credentialsFile = process.env["GOOGLE_APPLICATION_CREDENTIALS"];
    if (credentialsFile) {
      this.config.credentials = { type: "service_account", keyFile: credentialsFile };
    }

    // Emulator endpoint
    const emulatorHost = process.env["PUBSUB_EMULATOR_HOST"];
    if (emulatorHost) {
      this.config.endpoint = emulatorHost.startsWith("http")
        ? emulatorHost
        : `http://${emulatorHost}`;
      this.config.credentials = { type: "none" };
    }

    // Simulation mode
    const simulationMode = process.env["PUBSUB_SIMULATION"];
    if (simulationMode === "record") {
      this.config.simulationMode = { type: "recording", storage: { type: "memory" } };
    } else if (simulationMode === "replay") {
      this.config.simulationMode = { type: "replay", source: { type: "memory" } };
    }

    return this;
  }

  /**
   * Use emulator configuration from environment.
   */
  useEmulatorFromEnv(): this {
    const emulatorHost = process.env["PUBSUB_EMULATOR_HOST"];
    if (emulatorHost) {
      this.config.endpoint = emulatorHost.startsWith("http")
        ? emulatorHost
        : `http://${emulatorHost}`;
      this.config.credentials = { type: "none" };
    }
    return this;
  }

  /**
   * Build the configuration.
   */
  build(): PubSubConfig {
    const merged: PubSubConfig = {
      ...DEFAULT_CONFIG,
      ...this.config,
      publisherConfig: {
        ...DEFAULT_PUBLISHER_CONFIG,
        ...this.config.publisherConfig,
      },
      subscriberConfig: {
        ...DEFAULT_SUBSCRIBER_CONFIG,
        ...this.config.subscriberConfig,
      },
    } as PubSubConfig;

    // Validate required fields
    if (!merged.projectId) {
      throw new ConfigurationError(
        "Project ID must be specified (set GOOGLE_CLOUD_PROJECT or call projectId())",
        "MissingProject"
      );
    }

    // Validate endpoint if provided
    if (merged.endpoint) {
      try {
        new URL(merged.endpoint);
      } catch {
        throw new ConfigurationError(
          `Invalid API endpoint URL: ${merged.endpoint}`,
          "InvalidConfig"
        );
      }
    }

    // Validate batch settings
    if (merged.publisherConfig.batchSettings.maxMessages > 1000) {
      throw new ConfigurationError(
        "Batch max messages cannot exceed 1000",
        "InvalidConfig"
      );
    }

    if (merged.publisherConfig.batchSettings.maxBytes > 10 * 1024 * 1024) {
      throw new ConfigurationError(
        "Batch max bytes cannot exceed 10MB",
        "InvalidConfig"
      );
    }

    return merged;
  }
}

/**
 * Create a new Pub/Sub config builder.
 */
export function configBuilder(): PubSubConfigBuilder {
  return new PubSubConfigBuilder();
}

/**
 * Resolve the Pub/Sub API endpoint.
 */
export function resolveEndpoint(config: PubSubConfig): string {
  if (config.endpoint) {
    return config.endpoint;
  }
  return "https://pubsub.googleapis.com";
}

/**
 * Format topic path.
 */
export function formatTopicPath(projectId: string, topic: string): string {
  if (topic.startsWith("projects/")) {
    return topic;
  }
  return `projects/${projectId}/topics/${topic}`;
}

/**
 * Format subscription path.
 */
export function formatSubscriptionPath(projectId: string, subscription: string): string {
  if (subscription.startsWith("projects/")) {
    return subscription;
  }
  return `projects/${projectId}/subscriptions/${subscription}`;
}

/**
 * Validate topic name.
 */
export function validateTopicName(topic: string): void {
  if (!topic) {
    throw new ConfigurationError("Topic name cannot be empty", "InvalidTopic");
  }

  // If it's a full path, extract the topic name
  const topicName = topic.startsWith("projects/")
    ? topic.split("/").pop() ?? ""
    : topic;

  if (topicName.length < 3 || topicName.length > 255) {
    throw new ConfigurationError(
      "Topic name must be 3-255 characters",
      "InvalidTopic"
    );
  }

  // Must match pattern
  if (!/^[a-zA-Z][a-zA-Z0-9._~+%-]*$/.test(topicName)) {
    throw new ConfigurationError(
      "Topic name must start with a letter and contain only letters, numbers, and ._~+%-",
      "InvalidTopic"
    );
  }
}

/**
 * Validate subscription name.
 */
export function validateSubscriptionName(subscription: string): void {
  if (!subscription) {
    throw new ConfigurationError("Subscription name cannot be empty", "InvalidSubscription");
  }

  // If it's a full path, extract the subscription name
  const subscriptionName = subscription.startsWith("projects/")
    ? subscription.split("/").pop() ?? ""
    : subscription;

  if (subscriptionName.length < 3 || subscriptionName.length > 255) {
    throw new ConfigurationError(
      "Subscription name must be 3-255 characters",
      "InvalidSubscription"
    );
  }

  // Must match pattern
  if (!/^[a-zA-Z][a-zA-Z0-9._~+%-]*$/.test(subscriptionName)) {
    throw new ConfigurationError(
      "Subscription name must start with a letter and contain only letters, numbers, and ._~+%-",
      "InvalidSubscription"
    );
  }
}
