/**
 * Google Cloud Pub/Sub Integration
 *
 * A thin adapter layer for Google Cloud Pub/Sub following the SPARC specification.
 *
 * @module @anthropic/gcp-pubsub
 */

// Client
export {
  PubSubClient,
  createClient,
  createClientFromEnv,
  PubSubClientBuilder,
  clientBuilder,
} from "./client/index.js";

// Configuration
export {
  PubSubConfig,
  PubSubConfigBuilder,
  configBuilder,
  GcpCredentials,
  ServiceAccountKey,
  RetryConfig,
  BatchSettings,
  FlowControlSettings,
  PublisherConfig,
  SubscriberConfig,
  SimulationMode,
  RecordStorage,
  DEFAULT_CONFIG,
  DEFAULT_BATCH_SETTINGS,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_PUBLISHER_CONFIG,
  DEFAULT_SUBSCRIBER_CONFIG,
  resolveEndpoint,
  formatTopicPath,
  formatSubscriptionPath,
  validateTopicName,
  validateSubscriptionName,
} from "./config/index.js";

// Types
export {
  PubSubMessage,
  ReceivedMessage,
  PubSubMessageData,
  PublishResult,
  BatchPublishResult,
  PullResult,
  StreamConfig,
  FlowControlConfig,
  MessageStream,
  DeadLetterInfo,
  OrderingKeyState,
  PublisherStats,
  SubscriberStats,
  SeekTarget,
  createMessage,
  createJsonMessage,
  parseMessageAsString,
  parseMessageAsJson,
  getMessageSize,
  validateMessage,
} from "./types/index.js";

// Publisher
export {
  PubSubPublisher,
  createPublisher,
} from "./publisher/index.js";

// Subscriber
export {
  PubSubSubscriber,
  createSubscriber,
  MessageHandler,
  handleMessages,
} from "./subscriber/index.js";

// Credentials
export {
  GcpAuthProvider,
  createAuthProvider,
  NoAuthProvider,
  StaticTokenAuthProvider,
  ServiceAccountAuthProvider,
  WorkloadIdentityAuthProvider,
  ApplicationDefaultAuthProvider,
  UserCredentialsAuthProvider,
  TokenResponse,
  CachedToken,
} from "./credentials/index.js";

// Transport
export {
  HttpTransport,
  HttpRequest,
  HttpResponse,
  FetchTransport,
  createTransport,
  createRequest,
  isSuccess,
  getHeader,
  getRequestId,
  getContentLength,
  jsonBody,
  parseJsonBody,
  buildUrl,
} from "./transport/index.js";

// Simulation
export {
  SimulationLayer,
  createSimulationLayer,
  RecordedOperation,
  RecordedRequest,
  RecordedResponse,
  RecordingFile,
  OperationType,
  MatchMode,
  createRecording,
  createPublishRecording,
  createPullRecording,
  createEmptyPullRecording,
  createAckRecording,
} from "./simulation/index.js";

// Errors
export {
  PubSubError,
  ConfigurationError,
  AuthenticationError,
  TopicError,
  SubscriptionError,
  MessageError,
  AcknowledgmentError,
  NetworkError,
  ServerError,
  SimulationError,
  SimulationErrorCause,
  GrpcStatus,
  parseGrpcError,
} from "./error/index.js";
