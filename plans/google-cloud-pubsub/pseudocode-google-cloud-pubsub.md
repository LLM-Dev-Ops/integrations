# Pseudocode: Google Cloud Pub/Sub Integration Module

## SPARC Phase 2: Pseudocode

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/google-cloud-pubsub`

---

## Table of Contents

1. [Module Structure](#1-module-structure)
2. [Configuration Module](#2-configuration-module)
3. [Client Core](#3-client-core)
4. [Publisher Implementation](#4-publisher-implementation)
5. [Subscriber Implementation](#5-subscriber-implementation)
6. [Streaming Pull](#6-streaming-pull)
7. [Simulation Layer](#7-simulation-layer)
8. [Error Handling](#8-error-handling)

---

## 1. Module Structure

### 1.1 Public API Exports (Rust)

```rust
// lib.rs - Public API surface

pub use client::{PubSubClient, PubSubClientBuilder};
pub use config::{PubSubConfig, PublisherConfig, SubscriberConfig};

pub use publisher::PubSubPublisher;
pub use subscriber::PubSubSubscriber;

pub use types::{
    PubSubMessage, ReceivedMessage, PublishResult,
    BatchSettings, FlowControlSettings, StreamConfig,
};

pub use simulation::{SimulationMode, RecordStorage, Recording};
pub use error::{PubSubError, PubSubResult};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
```

### 1.2 Public API Exports (TypeScript)

```typescript
// index.ts - Public API surface

export { PubSubClient, PubSubClientBuilder } from './client';
export { PubSubConfig, PublisherConfig, SubscriberConfig } from './config';

export { PubSubPublisher } from './publisher';
export { PubSubSubscriber } from './subscriber';

export {
    PubSubMessage, ReceivedMessage, PublishResult,
    BatchSettings, FlowControlSettings, StreamConfig,
} from './types';

export { SimulationMode, RecordStorage, Recording } from './simulation';
export { PubSubError, PubSubErrorCode } from './errors';

export const VERSION = '__VERSION__';
```

---

## 2. Configuration Module

### 2.1 Configuration Types (Rust)

```rust
// config.rs

use std::time::Duration;
use std::path::PathBuf;

/// Default values
const DEFAULT_BATCH_MAX_MESSAGES: u32 = 100;
const DEFAULT_BATCH_MAX_BYTES: u32 = 1_048_576; // 1MB
const DEFAULT_BATCH_MAX_LATENCY_MS: u64 = 10;
const DEFAULT_ACK_DEADLINE_SECS: u32 = 10;
const DEFAULT_MAX_OUTSTANDING_MESSAGES: u32 = 1000;

/// Pub/Sub client configuration
STRUCT PubSubConfig {
    /// GCP project ID
    project_id: String,

    /// Credentials source
    credentials: CredentialsSource,

    /// Custom endpoint (for emulator)
    endpoint: Option<String>,

    /// Publisher configuration
    publisher_config: PublisherConfig,

    /// Subscriber configuration
    subscriber_config: SubscriberConfig,

    /// Simulation mode
    simulation_mode: SimulationMode,
}

/// Credentials source options
ENUM CredentialsSource {
    /// Path to service account JSON file
    ServiceAccountFile(PathBuf),

    /// Service account JSON content
    ServiceAccountJson(String),

    /// Application Default Credentials
    ApplicationDefault,

    /// No credentials (for emulator)
    None,
}

/// Publisher configuration
STRUCT PublisherConfig {
    /// Batch settings
    batch_settings: BatchSettings,

    /// Enable message ordering
    enable_ordering: bool,

    /// Retry settings
    retry_settings: RetrySettings,

    /// Flow control
    flow_control: Option<FlowControlSettings>,
}

/// Batch settings for publishing
STRUCT BatchSettings {
    /// Max messages per batch
    max_messages: u32,

    /// Max bytes per batch
    max_bytes: u32,

    /// Max latency before sending batch
    max_latency: Duration,
}

/// Subscriber configuration
STRUCT SubscriberConfig {
    /// Max outstanding messages (flow control)
    max_outstanding_messages: u32,

    /// Max outstanding bytes (flow control)
    max_outstanding_bytes: u32,

    /// Ack deadline
    ack_deadline: Duration,

    /// Enable exactly-once delivery
    exactly_once: bool,

    /// Max ack deadline extension
    max_ack_extension: Duration,
}

IMPL Default FOR BatchSettings {
    FUNCTION default() -> Self {
        Self {
            max_messages: DEFAULT_BATCH_MAX_MESSAGES,
            max_bytes: DEFAULT_BATCH_MAX_BYTES,
            max_latency: Duration::from_millis(DEFAULT_BATCH_MAX_LATENCY_MS),
        }
    }
}

IMPL Default FOR SubscriberConfig {
    FUNCTION default() -> Self {
        Self {
            max_outstanding_messages: DEFAULT_MAX_OUTSTANDING_MESSAGES,
            max_outstanding_bytes: 100 * 1024 * 1024, // 100MB
            ack_deadline: Duration::from_secs(DEFAULT_ACK_DEADLINE_SECS as u64),
            exactly_once: false,
            max_ack_extension: Duration::from_secs(3600),
        }
    }
}
```

### 2.2 Client Builder (Rust)

```rust
// client.rs

/// Builder for PubSubClient
STRUCT PubSubClientBuilder {
    project_id: Option<String>,
    credentials: CredentialsSource,
    endpoint: Option<String>,
    publisher_config: PublisherConfig,
    subscriber_config: SubscriberConfig,
    simulation_mode: SimulationMode,
}

IMPL PubSubClientBuilder {
    FUNCTION new() -> Self {
        Self {
            project_id: None,
            credentials: CredentialsSource::ApplicationDefault,
            endpoint: None,
            publisher_config: PublisherConfig::default(),
            subscriber_config: SubscriberConfig::default(),
            simulation_mode: SimulationMode::Disabled,
        }
    }

    /// Set GCP project ID
    FUNCTION project(mut self, id: impl Into<String>) -> Self {
        self.project_id = Some(id.into())
        self
    }

    /// Set project from environment variable
    FUNCTION project_from_env(mut self) -> Self {
        IF LET Ok(id) = std::env::var("GOOGLE_CLOUD_PROJECT") THEN
            self.project_id = Some(id)
        ELSE IF LET Ok(id) = std::env::var("GCLOUD_PROJECT") THEN
            self.project_id = Some(id)
        END IF
        self
    }

    /// Set credentials from file
    FUNCTION credentials_file(mut self, path: impl Into<PathBuf>) -> Self {
        self.credentials = CredentialsSource::ServiceAccountFile(path.into())
        self
    }

    /// Set credentials from JSON string
    FUNCTION credentials_json(mut self, json: impl Into<String>) -> Self {
        self.credentials = CredentialsSource::ServiceAccountJson(json.into())
        self
    }

    /// Use Application Default Credentials
    FUNCTION use_adc(mut self) -> Self {
        self.credentials = CredentialsSource::ApplicationDefault
        self
    }

    /// Set custom endpoint (for emulator)
    FUNCTION endpoint(mut self, url: impl Into<String>) -> Self {
        self.endpoint = Some(url.into())
        self
    }

    /// Use emulator from environment
    FUNCTION use_emulator_from_env(mut self) -> Self {
        IF LET Ok(host) = std::env::var("PUBSUB_EMULATOR_HOST") THEN
            self.endpoint = Some(format!("http://{}", host))
            self.credentials = CredentialsSource::None
        END IF
        self
    }

    /// Configure publisher
    FUNCTION publisher_config(mut self, config: PublisherConfig) -> Self {
        self.publisher_config = config
        self
    }

    /// Configure batch settings
    FUNCTION batch_settings(mut self, settings: BatchSettings) -> Self {
        self.publisher_config.batch_settings = settings
        self
    }

    /// Enable message ordering
    FUNCTION enable_ordering(mut self) -> Self {
        self.publisher_config.enable_ordering = true
        self
    }

    /// Configure subscriber
    FUNCTION subscriber_config(mut self, config: SubscriberConfig) -> Self {
        self.subscriber_config = config
        self
    }

    /// Enable simulation recording
    FUNCTION record_to(mut self, storage: RecordStorage) -> Self {
        self.simulation_mode = SimulationMode::Recording { storage }
        self
    }

    /// Enable simulation replay
    FUNCTION replay_from(mut self, source: RecordStorage) -> Self {
        self.simulation_mode = SimulationMode::Replay { source }
        self
    }

    /// Build client
    FUNCTION build(self) -> Result<PubSubClient, PubSubError> {
        LET project_id = self.project_id.ok_or_else(|| PubSubError::InvalidConfig {
            message: "Project ID is required".to_string(),
            field: "project_id".to_string(),
        })?

        LET config = PubSubConfig {
            project_id,
            credentials: self.credentials,
            endpoint: self.endpoint,
            publisher_config: self.publisher_config,
            subscriber_config: self.subscriber_config,
            simulation_mode: self.simulation_mode,
        }

        PubSubClient::from_config(config)
    }
}
```

---

## 3. Client Core

### 3.1 PubSubClient (Rust)

```rust
// client.rs

use std::sync::Arc;
use std::collections::HashMap;
use tokio::sync::RwLock;

/// Main Pub/Sub client
STRUCT PubSubClient {
    config: Arc<PubSubConfig>,
    inner: Arc<InnerClient>,
    simulation: Arc<SimulationLayer>,
    publishers: RwLock<HashMap<String, Arc<PubSubPublisher>>>,
    subscribers: RwLock<HashMap<String, Arc<PubSubSubscriber>>>,
}

/// Internal gRPC client wrapper
STRUCT InnerClient {
    publisher_client: google_cloud_pubsub::PublisherClient,
    subscriber_client: google_cloud_pubsub::SubscriberClient,
}

IMPL PubSubClient {
    /// Create client from configuration
    FUNCTION from_config(config: PubSubConfig) -> Result<Self, PubSubError> {
        LET config = Arc::new(config)

        // Initialize credentials
        LET credentials = Self::init_credentials(&config)?

        // Create gRPC clients
        LET inner = Arc::new(InnerClient::new(
            &config,
            credentials,
        ).await?)

        // Create simulation layer
        LET simulation = Arc::new(SimulationLayer::new(
            config.simulation_mode.clone(),
        ))

        Ok(Self {
            config,
            inner,
            simulation,
            publishers: RwLock::new(HashMap::new()),
            subscribers: RwLock::new(HashMap::new()),
        })
    }

    /// Get or create publisher for topic
    ASYNC FUNCTION publisher(&self, topic: &str) -> Result<Arc<PubSubPublisher>, PubSubError> {
        // Check cache first
        {
            LET publishers = self.publishers.read().await
            IF LET Some(publisher) = publishers.get(topic) THEN
                RETURN Ok(publisher.clone())
            END IF
        }

        // Create new publisher
        LET topic_path = self.format_topic_path(topic)
        LET publisher = Arc::new(PubSubPublisher::new(
            topic_path.clone(),
            self.inner.clone(),
            self.config.publisher_config.clone(),
            self.simulation.clone(),
        ))

        // Cache and return
        {
            LET mut publishers = self.publishers.write().await
            publishers.insert(topic.to_string(), publisher.clone())
        }

        Ok(publisher)
    }

    /// Get or create subscriber for subscription
    ASYNC FUNCTION subscriber(&self, subscription: &str) -> Result<Arc<PubSubSubscriber>, PubSubError> {
        // Check cache first
        {
            LET subscribers = self.subscribers.read().await
            IF LET Some(subscriber) = subscribers.get(subscription) THEN
                RETURN Ok(subscriber.clone())
            END IF
        }

        // Create new subscriber
        LET subscription_path = self.format_subscription_path(subscription)
        LET subscriber = Arc::new(PubSubSubscriber::new(
            subscription_path.clone(),
            self.inner.clone(),
            self.config.subscriber_config.clone(),
            self.simulation.clone(),
        ))

        // Cache and return
        {
            LET mut subscribers = self.subscribers.write().await
            subscribers.insert(subscription.to_string(), subscriber.clone())
        }

        Ok(subscriber)
    }

    /// Format topic path
    FUNCTION format_topic_path(&self, topic: &str) -> String {
        IF topic.starts_with("projects/") THEN
            topic.to_string()
        ELSE
            format!("projects/{}/topics/{}", self.config.project_id, topic)
        END IF
    }

    /// Format subscription path
    FUNCTION format_subscription_path(&self, subscription: &str) -> String {
        IF subscription.starts_with("projects/") THEN
            subscription.to_string()
        ELSE
            format!("projects/{}/subscriptions/{}", self.config.project_id, subscription)
        END IF
    }

    /// Get configuration
    FUNCTION config(&self) -> &PubSubConfig {
        &self.config
    }

    /// Set simulation mode
    FUNCTION set_simulation_mode(&self, mode: SimulationMode) {
        self.simulation.set_mode(mode)
    }

    /// Create builder
    FUNCTION builder() -> PubSubClientBuilder {
        PubSubClientBuilder::new()
    }
}
```

---

## 4. Publisher Implementation

### 4.1 PubSubPublisher (Rust)

```rust
// publisher.rs

use std::sync::Arc;
use tokio::sync::{mpsc, RwLock, Semaphore};
use std::collections::HashMap;

/// Publisher for a specific topic
STRUCT PubSubPublisher {
    topic: String,
    inner: Arc<InnerClient>,
    config: PublisherConfig,
    simulation: Arc<SimulationLayer>,
    batcher: Arc<MessageBatcher>,
    ordering_state: RwLock<HashMap<String, OrderingKeyState>>,
}

/// State for ordering key
STRUCT OrderingKeyState {
    /// Whether ordering is paused due to error
    paused: bool,
    /// Pending messages waiting for resume
    pending: Vec<PendingMessage>,
}

/// Message waiting to be published
STRUCT PendingMessage {
    message: PubSubMessage,
    response_tx: oneshot::Sender<Result<PublishResult, PubSubError>>,
}

IMPL PubSubPublisher {
    /// Create new publisher
    FUNCTION new(
        topic: String,
        inner: Arc<InnerClient>,
        config: PublisherConfig,
        simulation: Arc<SimulationLayer>,
    ) -> Self {
        LET batcher = Arc::new(MessageBatcher::new(
            topic.clone(),
            config.batch_settings.clone(),
            inner.clone(),
            simulation.clone(),
        ))

        Self {
            topic,
            inner,
            config,
            simulation,
            batcher,
            ordering_state: RwLock::new(HashMap::new()),
        }
    }

    /// Publish single message
    ASYNC FUNCTION publish(&self, message: PubSubMessage) -> Result<PublishResult, PubSubError> {
        // Validate message
        self.validate_message(&message)?

        // Check simulation mode
        IF self.simulation.is_replay() THEN
            RETURN self.simulation.replay_publish(&self.topic, &message).await
        END IF

        // Check ordering key state
        IF LET Some(ref key) = message.ordering_key THEN
            self.check_ordering_key_state(key).await?
        END IF

        // Submit to batcher
        LET result = self.batcher.submit(message.clone()).await?

        // Record if in recording mode
        IF self.simulation.is_recording() THEN
            self.simulation.record_publish(&self.topic, &message, &result).await?
        END IF

        Ok(result)
    }

    /// Publish batch of messages
    ASYNC FUNCTION publish_batch(&self, messages: Vec<PubSubMessage>) -> Result<Vec<PublishResult>, PubSubError> {
        // Validate all messages
        FOR message IN &messages DO
            self.validate_message(message)?
        END FOR

        // Check batch size
        IF messages.len() > 1000 THEN
            RETURN Err(PubSubError::InvalidMessage {
                message: "Batch size exceeds maximum of 1000".to_string(),
                field: Some("messages".to_string()),
            })
        END IF

        // Publish each message
        LET futures: Vec<_> = messages.into_iter()
            .map(|msg| self.publish(msg))
            .collect()

        futures::future::try_join_all(futures).await
    }

    /// Publish with ordering key
    ASYNC FUNCTION publish_ordered(&self, message: PubSubMessage, ordering_key: String) -> Result<PublishResult, PubSubError> {
        IF !self.config.enable_ordering THEN
            RETURN Err(PubSubError::OrderingKeyError {
                key: ordering_key,
                message: "Ordering is not enabled for this publisher".to_string(),
            })
        END IF

        LET mut message = message
        message.ordering_key = Some(ordering_key)

        self.publish(message).await
    }

    /// Resume publishing for ordering key after error
    ASYNC FUNCTION resume_ordering(&self, ordering_key: &str) -> Result<(), PubSubError> {
        LET mut state = self.ordering_state.write().await

        IF LET Some(key_state) = state.get_mut(ordering_key) THEN
            key_state.paused = false

            // Retry pending messages
            LET pending = std::mem::take(&mut key_state.pending)
            FOR pending_msg IN pending DO
                LET result = self.batcher.submit(pending_msg.message).await
                LET _ = pending_msg.response_tx.send(result)
            END FOR
        END IF

        Ok(())
    }

    /// Flush all pending messages
    ASYNC FUNCTION flush(&self) -> Result<(), PubSubError> {
        self.batcher.flush().await
    }

    /// Validate message
    FUNCTION validate_message(&self, message: &PubSubMessage) -> Result<(), PubSubError> {
        // Check message size
        LET size = message.data.len()
        IF size > 10 * 1024 * 1024 THEN
            RETURN Err(PubSubError::MessageTooLarge {
                size,
                max: 10 * 1024 * 1024,
            })
        END IF

        // Check attributes count
        IF message.attributes.len() > 100 THEN
            RETURN Err(PubSubError::TooManyAttributes {
                count: message.attributes.len(),
                max: 100,
            })
        END IF

        // Check ordering key size
        IF LET Some(ref key) = message.ordering_key THEN
            IF key.len() > 1024 THEN
                RETURN Err(PubSubError::OrderingKeyError {
                    key: key.clone(),
                    message: "Ordering key exceeds 1KB limit".to_string(),
                })
            END IF
        END IF

        Ok(())
    }

    /// Check ordering key state
    ASYNC FUNCTION check_ordering_key_state(&self, key: &str) -> Result<(), PubSubError> {
        LET state = self.ordering_state.read().await

        IF LET Some(key_state) = state.get(key) THEN
            IF key_state.paused THEN
                RETURN Err(PubSubError::OrderingKeyError {
                    key: key.to_string(),
                    message: "Ordering key is paused. Call resume_ordering() to continue.".to_string(),
                })
            END IF
        END IF

        Ok(())
    }
}
```

### 4.2 Message Batcher (Rust)

```rust
// publisher/batcher.rs

/// Batches messages for efficient publishing
STRUCT MessageBatcher {
    topic: String,
    settings: BatchSettings,
    inner: Arc<InnerClient>,
    simulation: Arc<SimulationLayer>,
    pending: RwLock<Vec<BatchEntry>>,
    flush_tx: mpsc::Sender<()>,
}

STRUCT BatchEntry {
    message: PubSubMessage,
    response_tx: oneshot::Sender<Result<PublishResult, PubSubError>>,
    added_at: Instant,
}

IMPL MessageBatcher {
    FUNCTION new(
        topic: String,
        settings: BatchSettings,
        inner: Arc<InnerClient>,
        simulation: Arc<SimulationLayer>,
    ) -> Self {
        LET (flush_tx, flush_rx) = mpsc::channel(1)

        LET batcher = Self {
            topic,
            settings,
            inner,
            simulation,
            pending: RwLock::new(Vec::new()),
            flush_tx,
        }

        // Start background flush task
        batcher.start_flush_task(flush_rx)

        batcher
    }

    /// Submit message to batch
    ASYNC FUNCTION submit(&self, message: PubSubMessage) -> Result<PublishResult, PubSubError> {
        LET (response_tx, response_rx) = oneshot::channel()

        LET entry = BatchEntry {
            message,
            response_tx,
            added_at: Instant::now(),
        }

        LET should_flush = {
            LET mut pending = self.pending.write().await
            pending.push(entry)

            // Check if batch is full
            self.should_flush(&pending)
        }

        IF should_flush THEN
            self.flush().await?
        END IF

        // Wait for result
        response_rx.await.map_err(|_| PubSubError::Internal {
            message: "Batch response channel closed".to_string(),
        })?
    }

    /// Check if batch should be flushed
    FUNCTION should_flush(&self, pending: &[BatchEntry]) -> bool {
        IF pending.len() >= self.settings.max_messages as usize THEN
            RETURN true
        END IF

        LET total_bytes: usize = pending.iter()
            .map(|e| e.message.data.len())
            .sum()

        IF total_bytes >= self.settings.max_bytes as usize THEN
            RETURN true
        END IF

        false
    }

    /// Flush pending messages
    ASYNC FUNCTION flush(&self) -> Result<(), PubSubError> {
        LET entries = {
            LET mut pending = self.pending.write().await
            std::mem::take(&mut *pending)
        }

        IF entries.is_empty() THEN
            RETURN Ok(())
        END IF

        // Build publish request
        LET messages: Vec<_> = entries.iter()
            .map(|e| e.message.to_proto())
            .collect()

        // Execute publish
        LET results = self.inner.publisher_client
            .publish(&self.topic, messages)
            .await?

        // Send results back
        FOR (entry, message_id) IN entries.into_iter().zip(results.message_ids) DO
            LET result = PublishResult {
                message_id,
                publish_time: results.publish_time.clone(),
            }
            LET _ = entry.response_tx.send(Ok(result))
        END FOR

        Ok(())
    }

    /// Start background flush task
    FUNCTION start_flush_task(&self, mut flush_rx: mpsc::Receiver<()>) {
        LET topic = self.topic.clone()
        LET settings = self.settings.clone()
        LET pending = self.pending.clone()
        LET inner = self.inner.clone()

        tokio::spawn(async move {
            LET mut interval = tokio::time::interval(settings.max_latency)

            LOOP
                tokio::select! {
                    _ = interval.tick() => {
                        // Time-based flush
                        Self::flush_pending(&topic, &pending, &inner).await
                    }
                    _ = flush_rx.recv() => {
                        // Manual flush
                        Self::flush_pending(&topic, &pending, &inner).await
                    }
                }
            END LOOP
        })
    }
}
```

---

## 5. Subscriber Implementation

### 5.1 PubSubSubscriber (Rust)

```rust
// subscriber.rs

/// Subscriber for a specific subscription
STRUCT PubSubSubscriber {
    subscription: String,
    inner: Arc<InnerClient>,
    config: SubscriberConfig,
    simulation: Arc<SimulationLayer>,
}

IMPL PubSubSubscriber {
    /// Create new subscriber
    FUNCTION new(
        subscription: String,
        inner: Arc<InnerClient>,
        config: SubscriberConfig,
        simulation: Arc<SimulationLayer>,
    ) -> Self {
        Self {
            subscription,
            inner,
            config,
            simulation,
        }
    }

    /// Pull messages synchronously
    ASYNC FUNCTION pull(&self, max_messages: u32) -> Result<Vec<ReceivedMessage>, PubSubError> {
        // Check simulation mode
        IF self.simulation.is_replay() THEN
            RETURN self.simulation.replay_pull(&self.subscription, max_messages).await
        END IF

        // Execute pull
        LET response = self.inner.subscriber_client
            .pull(&self.subscription, max_messages, true)
            .await?

        // Convert to domain types
        LET messages: Vec<ReceivedMessage> = response.received_messages
            .into_iter()
            .map(|m| ReceivedMessage::from_proto(m))
            .collect()

        // Record if in recording mode
        IF self.simulation.is_recording() THEN
            self.simulation.record_pull(&self.subscription, &messages).await?
        END IF

        Ok(messages)
    }

    /// Start streaming pull
    ASYNC FUNCTION streaming_pull(&self, config: StreamConfig) -> Result<MessageStream, PubSubError> {
        // Check simulation mode
        IF self.simulation.is_replay() THEN
            RETURN self.simulation.replay_streaming_pull(&self.subscription).await
        END IF

        // Create streaming pull
        LET stream = StreamingPullStream::new(
            self.subscription.clone(),
            self.inner.clone(),
            self.config.clone(),
            config,
            self.simulation.clone(),
        ).await?

        Ok(MessageStream::new(stream))
    }

    /// Acknowledge messages
    ASYNC FUNCTION ack(&self, ack_ids: Vec<String>) -> Result<(), PubSubError> {
        IF ack_ids.is_empty() THEN
            RETURN Ok(())
        END IF

        // Check simulation mode
        IF self.simulation.is_replay() THEN
            RETURN self.simulation.replay_ack(&self.subscription, &ack_ids).await
        END IF

        // Execute acknowledge
        self.inner.subscriber_client
            .acknowledge(&self.subscription, ack_ids.clone())
            .await?

        // Record if in recording mode
        IF self.simulation.is_recording() THEN
            self.simulation.record_ack(&self.subscription, &ack_ids).await?
        END IF

        Ok(())
    }

    /// Negative acknowledge (request redelivery)
    ASYNC FUNCTION nack(&self, ack_ids: Vec<String>) -> Result<(), PubSubError> {
        IF ack_ids.is_empty() THEN
            RETURN Ok(())
        END IF

        // Nack by setting ack deadline to 0
        self.modify_ack_deadline(ack_ids, 0).await
    }

    /// Modify acknowledgment deadline
    ASYNC FUNCTION modify_ack_deadline(&self, ack_ids: Vec<String>, seconds: u32) -> Result<(), PubSubError> {
        IF ack_ids.is_empty() THEN
            RETURN Ok(())
        END IF

        // Check simulation mode
        IF self.simulation.is_replay() THEN
            RETURN Ok(())
        END IF

        self.inner.subscriber_client
            .modify_ack_deadline(&self.subscription, ack_ids, seconds as i32)
            .await?

        Ok(())
    }

    /// Seek to timestamp
    ASYNC FUNCTION seek_to_time(&self, timestamp: DateTime<Utc>) -> Result<(), PubSubError> {
        // Check simulation mode
        IF self.simulation.is_replay() THEN
            RETURN self.simulation.replay_seek(&self.subscription).await
        END IF

        self.inner.subscriber_client
            .seek_to_time(&self.subscription, timestamp)
            .await?

        Ok(())
    }

    /// Seek to snapshot
    ASYNC FUNCTION seek_to_snapshot(&self, snapshot: &str) -> Result<(), PubSubError> {
        LET snapshot_path = IF snapshot.starts_with("projects/") THEN
            snapshot.to_string()
        ELSE
            format!("projects/{}/snapshots/{}",
                self.extract_project_id(),
                snapshot)
        END IF

        // Check simulation mode
        IF self.simulation.is_replay() THEN
            RETURN self.simulation.replay_seek(&self.subscription).await
        END IF

        self.inner.subscriber_client
            .seek_to_snapshot(&self.subscription, &snapshot_path)
            .await?

        Ok(())
    }
}
```

---

## 6. Streaming Pull

### 6.1 Streaming Pull Stream (Rust)

```rust
// subscriber/streaming.rs

/// Streaming pull implementation
STRUCT StreamingPullStream {
    subscription: String,
    inner: Arc<InnerClient>,
    config: SubscriberConfig,
    stream_config: StreamConfig,
    simulation: Arc<SimulationLayer>,

    /// gRPC bidirectional stream
    stream: Option<tonic::Streaming<StreamingPullResponse>>,

    /// Sender for ack/modifyAckDeadline requests
    request_tx: mpsc::Sender<StreamingPullRequest>,

    /// Outstanding messages for flow control
    outstanding_messages: Arc<AtomicU32>,
    outstanding_bytes: Arc<AtomicU64>,
}

IMPL StreamingPullStream {
    /// Create new streaming pull
    ASYNC FUNCTION new(
        subscription: String,
        inner: Arc<InnerClient>,
        config: SubscriberConfig,
        stream_config: StreamConfig,
        simulation: Arc<SimulationLayer>,
    ) -> Result<Self, PubSubError> {
        LET (request_tx, request_rx) = mpsc::channel(100)

        // Initialize streaming pull
        LET initial_request = StreamingPullRequest {
            subscription: subscription.clone(),
            stream_ack_deadline_seconds: config.ack_deadline.as_secs() as i32,
            max_outstanding_messages: stream_config.flow_control.max_outstanding_messages as i64,
            max_outstanding_bytes: stream_config.flow_control.max_outstanding_bytes as i64,
            ..Default::default()
        }

        LET stream = inner.subscriber_client
            .streaming_pull(request_rx, initial_request)
            .await?

        Ok(Self {
            subscription,
            inner,
            config,
            stream_config,
            simulation,
            stream: Some(stream),
            request_tx,
            outstanding_messages: Arc::new(AtomicU32::new(0)),
            outstanding_bytes: Arc::new(AtomicU64::new(0)),
        })
    }

    /// Receive next message
    ASYNC FUNCTION next(&mut self) -> Option<Result<ReceivedMessage, PubSubError>> {
        // Check flow control
        self.wait_for_flow_control().await

        // Get next message from stream
        LET stream = self.stream.as_mut()?

        MATCH stream.message().await {
            Ok(Some(response)) => {
                FOR msg IN response.received_messages DO
                    LET received = ReceivedMessage::from_proto(msg)

                    // Update flow control counters
                    self.outstanding_messages.fetch_add(1, Ordering::SeqCst)
                    self.outstanding_bytes.fetch_add(
                        received.message.data.len() as u64,
                        Ordering::SeqCst
                    )

                    // Start ack deadline extender
                    self.start_ack_deadline_extender(&received)

                    RETURN Some(Ok(received))
                END FOR

                // No messages in this response, get next
                self.next().await
            },
            Ok(None) => {
                // Stream ended, try to reconnect
                self.reconnect().await
            },
            Err(e) => {
                Some(Err(PubSubError::from(e)))
            },
        }
    }

    /// Acknowledge message
    ASYNC FUNCTION ack(&self, ack_id: &str) -> Result<(), PubSubError> {
        LET request = StreamingPullRequest {
            ack_ids: vec![ack_id.to_string()],
            ..Default::default()
        }

        self.request_tx.send(request).await
            .map_err(|_| PubSubError::Internal {
                message: "Stream request channel closed".to_string(),
            })?

        // Update flow control
        self.outstanding_messages.fetch_sub(1, Ordering::SeqCst)

        Ok(())
    }

    /// Nack message (request redelivery)
    ASYNC FUNCTION nack(&self, ack_id: &str) -> Result<(), PubSubError> {
        LET request = StreamingPullRequest {
            modify_deadline_ack_ids: vec![ack_id.to_string()],
            modify_deadline_seconds: vec![0],
            ..Default::default()
        }

        self.request_tx.send(request).await
            .map_err(|_| PubSubError::Internal {
                message: "Stream request channel closed".to_string(),
            })?

        // Update flow control
        self.outstanding_messages.fetch_sub(1, Ordering::SeqCst)

        Ok(())
    }

    /// Wait for flow control capacity
    ASYNC FUNCTION wait_for_flow_control(&self) {
        LOOP
            LET outstanding = self.outstanding_messages.load(Ordering::SeqCst)
            IF outstanding < self.stream_config.flow_control.max_outstanding_messages THEN
                BREAK
            END IF
            tokio::time::sleep(Duration::from_millis(10)).await
        END LOOP
    }

    /// Reconnect stream
    ASYNC FUNCTION reconnect(&mut self) -> Option<Result<ReceivedMessage, PubSubError>> {
        // Exponential backoff for reconnection
        LET mut backoff = Duration::from_millis(100)
        LET max_backoff = Duration::from_secs(60)

        FOR attempt IN 0..10 DO
            tokio::time::sleep(backoff).await

            MATCH Self::new(
                self.subscription.clone(),
                self.inner.clone(),
                self.config.clone(),
                self.stream_config.clone(),
                self.simulation.clone(),
            ).await {
                Ok(new_stream) => {
                    *self = new_stream
                    RETURN self.next().await
                },
                Err(_) => {
                    backoff = std::cmp::min(backoff * 2, max_backoff)
                },
            }
        END FOR

        Some(Err(PubSubError::ConnectionError {
            message: "Failed to reconnect after 10 attempts".to_string(),
            cause: None,
        }))
    }
}

// Implement Stream trait
IMPL Stream FOR StreamingPullStream {
    TYPE Item = Result<ReceivedMessage, PubSubError>

    FUNCTION poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        Box::pin(self.next()).poll_unpin(cx)
    }
}
```

---

## 7. Simulation Layer

### 7.1 Simulation Types (Rust)

```rust
// simulation/mod.rs

/// Simulation mode
ENUM SimulationMode {
    /// Normal operation
    Disabled,

    /// Record operations
    Recording { storage: RecordStorage },

    /// Replay recorded operations
    Replay { source: RecordStorage },
}

/// Storage for recordings
ENUM RecordStorage {
    Memory,
    File { path: PathBuf },
}

/// Recorded operation
STRUCT RecordedOperation {
    id: String,
    timestamp: DateTime<Utc>,
    operation_type: OperationType,
    topic_or_subscription: String,
    request: Value,
    response: Value,
    timing: TimingInfo,
}

ENUM OperationType {
    Publish,
    Pull,
    StreamingPull,
    Ack,
    Nack,
    Seek,
}
```

### 7.2 Simulation Layer (Rust)

```rust
// simulation/layer.rs

STRUCT SimulationLayer {
    mode: RwLock<SimulationMode>,
    recordings: RwLock<Vec<RecordedOperation>>,
    replay_index: AtomicUsize,
}

IMPL SimulationLayer {
    FUNCTION new(mode: SimulationMode) -> Self {
        Self {
            mode: RwLock::new(mode),
            recordings: RwLock::new(Vec::new()),
            replay_index: AtomicUsize::new(0),
        }
    }

    FUNCTION is_recording(&self) -> bool {
        MATCHES!(*self.mode.read().unwrap(), SimulationMode::Recording { .. })
    }

    FUNCTION is_replay(&self) -> bool {
        MATCHES!(*self.mode.read().unwrap(), SimulationMode::Replay { .. })
    }

    /// Record publish operation
    ASYNC FUNCTION record_publish(
        &self,
        topic: &str,
        message: &PubSubMessage,
        result: &PublishResult,
    ) -> Result<(), PubSubError> {
        LET operation = RecordedOperation {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            operation_type: OperationType::Publish,
            topic_or_subscription: topic.to_string(),
            request: serde_json::to_value(message)?,
            response: serde_json::to_value(result)?,
            timing: TimingInfo::default(),
        }

        self.recordings.write().unwrap().push(operation)
        Ok(())
    }

    /// Replay publish operation
    ASYNC FUNCTION replay_publish(
        &self,
        topic: &str,
        message: &PubSubMessage,
    ) -> Result<PublishResult, PubSubError> {
        LET recordings = self.recordings.read().unwrap()

        // Find matching publish recording
        FOR recording IN recordings.iter() DO
            IF recording.operation_type == OperationType::Publish &&
               recording.topic_or_subscription == topic THEN
                RETURN Ok(serde_json::from_value(recording.response.clone())?)
            END IF
        END FOR

        Err(PubSubError::SimulationError {
            message: format!("No recording found for publish to {}", topic),
            cause: SimulationErrorCause::NoRecordingFound,
        })
    }

    /// Record pull operation
    ASYNC FUNCTION record_pull(
        &self,
        subscription: &str,
        messages: &[ReceivedMessage],
    ) -> Result<(), PubSubError> {
        LET operation = RecordedOperation {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            operation_type: OperationType::Pull,
            topic_or_subscription: subscription.to_string(),
            request: Value::Null,
            response: serde_json::to_value(messages)?,
            timing: TimingInfo::default(),
        }

        self.recordings.write().unwrap().push(operation)
        Ok(())
    }

    /// Replay pull operation
    ASYNC FUNCTION replay_pull(
        &self,
        subscription: &str,
        max_messages: u32,
    ) -> Result<Vec<ReceivedMessage>, PubSubError> {
        LET recordings = self.recordings.read().unwrap()
        LET index = self.replay_index.fetch_add(1, Ordering::SeqCst)

        // Find pull recordings for this subscription
        LET pull_recordings: Vec<_> = recordings.iter()
            .filter(|r| r.operation_type == OperationType::Pull &&
                       r.topic_or_subscription == subscription)
            .collect()

        IF LET Some(recording) = pull_recordings.get(index % pull_recordings.len()) THEN
            LET messages: Vec<ReceivedMessage> = serde_json::from_value(recording.response.clone())?
            Ok(messages.into_iter().take(max_messages as usize).collect())
        ELSE
            Ok(Vec::new())
        END IF
    }

    /// Save recordings to file
    ASYNC FUNCTION save_to_file(&self, path: &Path) -> Result<(), PubSubError> {
        LET recordings = self.recordings.read().unwrap()

        LET json = serde_json::to_string_pretty(&*recordings)?
        tokio::fs::write(path, json).await?

        Ok(())
    }

    /// Load recordings from file
    ASYNC FUNCTION load_from_file(&self, path: &Path) -> Result<(), PubSubError> {
        LET json = tokio::fs::read_to_string(path).await?
        LET recordings: Vec<RecordedOperation> = serde_json::from_str(&json)?

        *self.recordings.write().unwrap() = recordings

        Ok(())
    }
}
```

---

## 8. Error Handling

### 8.1 Error Types (Rust)

```rust
// error.rs

use thiserror::Error;

pub type PubSubResult<T> = Result<T, PubSubError>;

#[derive(Debug, Error)]
ENUM PubSubError {
    #[error("Topic not found: {topic}")]
    TopicNotFound { topic: String },

    #[error("Subscription not found: {subscription}")]
    SubscriptionNotFound { subscription: String },

    #[error("Permission denied: {message}")]
    PermissionDenied { message: String, resource: String },

    #[error("Invalid message: {message}")]
    InvalidMessage { message: String, field: Option<String> },

    #[error("Message too large: {size} bytes (max: {max})")]
    MessageTooLarge { size: usize, max: usize },

    #[error("Too many attributes: {count} (max: {max})")]
    TooManyAttributes { count: usize, max: usize },

    #[error("Ordering key error for key {key}: {message}")]
    OrderingKeyError { key: String, message: String },

    #[error("Quota exceeded: {quota}")]
    QuotaExceeded { quota: String, retry_after: Option<Duration> },

    #[error("Connection error: {message}")]
    ConnectionError { message: String, cause: Option<String> },

    #[error("Timeout: {operation} after {duration:?}")]
    Timeout { operation: String, duration: Duration },

    #[error("Invalid configuration: {message}")]
    InvalidConfig { message: String, field: String },

    #[error("Simulation error: {message}")]
    SimulationError { message: String, cause: SimulationErrorCause },

    #[error("Internal error: {message}")]
    Internal { message: String },
}

#[derive(Debug, Clone)]
ENUM SimulationErrorCause {
    NoRecordingFound,
    RequestMismatch,
    CorruptedRecording,
}

IMPL PubSubError {
    FUNCTION is_retryable(&self) -> bool {
        MATCHES!(self,
            PubSubError::QuotaExceeded { .. } |
            PubSubError::ConnectionError { .. } |
            PubSubError::Timeout { .. } |
            PubSubError::Internal { .. }
        )
    }

    FUNCTION retry_after(&self) -> Option<Duration> {
        MATCH self {
            PubSubError::QuotaExceeded { retry_after, .. } => *retry_after,
            _ => None,
        }
    }
}

// Convert from gRPC status
IMPL From<tonic::Status> FOR PubSubError {
    FUNCTION from(status: tonic::Status) -> Self {
        MATCH status.code() {
            tonic::Code::NotFound => {
                // Parse resource type from message
                PubSubError::TopicNotFound {
                    topic: status.message().to_string(),
                }
            },
            tonic::Code::PermissionDenied => {
                PubSubError::PermissionDenied {
                    message: status.message().to_string(),
                    resource: String::new(),
                }
            },
            tonic::Code::InvalidArgument => {
                PubSubError::InvalidMessage {
                    message: status.message().to_string(),
                    field: None,
                }
            },
            tonic::Code::ResourceExhausted => {
                PubSubError::QuotaExceeded {
                    quota: status.message().to_string(),
                    retry_after: None,
                }
            },
            tonic::Code::DeadlineExceeded => {
                PubSubError::Timeout {
                    operation: "gRPC call".to_string(),
                    duration: Duration::default(),
                }
            },
            _ => {
                PubSubError::Internal {
                    message: status.message().to_string(),
                }
            },
        }
    }
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-GCPUBSUB-PSEUDO-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Pseudocode Document**

*SPARC Phase 2 Complete - Proceed to Architecture phase with "Next phase."*
