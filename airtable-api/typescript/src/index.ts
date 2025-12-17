/**
 * Airtable API Integration
 *
 * A production-grade TypeScript client for the Airtable API following SPARC specification.
 *
 * Features:
 * - Full CRUD operations for records
 * - Batch operations with automatic chunking
 * - Fluent query builder for list operations
 * - Rate limiting with adaptive backoff
 * - Circuit breaker for fault tolerance
 * - Automatic retry with exponential backoff
 * - Webhook management and verification
 * - Record/replay simulation for testing
 * - Comprehensive observability (logging, metrics, tracing)
 *
 * @example
 * ```typescript
 * import { createAirtableClient, AirtableConfigBuilder } from '@llmdevops/airtable-api';
 *
 * // Create client with Personal Access Token
 * const config = new AirtableConfigBuilder()
 *   .withToken(process.env.AIRTABLE_PAT!)
 *   .build();
 *
 * const client = createAirtableClient(config);
 *
 * // Access a base and table
 * const table = client.base('appXXXXXXXXXXXXXX').table('Tasks');
 *
 * // Create a record
 * const recordService = createRecordService(
 *   table.getClient(),
 *   table.getBaseId(),
 *   table.getTableIdOrName()
 * );
 * const record = await recordService.create({ Name: 'New Task', Status: 'Todo' });
 *
 * // List records with filtering and sorting
 * const listService = createListService(
 *   table.getClient(),
 *   table.getBaseId(),
 *   table.getTableIdOrName()
 * );
 * const activeRecords = await listService
 *   .list()
 *   .filterByFormula("Status = 'Active'")
 *   .sortBy('Name', 'asc')
 *   .all();
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Client
// ============================================================================

export {
  AirtableClient,
  BaseHandle,
  TableHandle,
  createAirtableClient,
  createAirtableClientFromEnv,
} from './client/index.js';

export type {
  HttpMethod,
  RequestOptions,
  Response,
} from './client/index.js';

// ============================================================================
// Configuration
// ============================================================================

export {
  AirtableConfigBuilder,
  RateLimitStrategy,
  SimulationMode,
  SecretString,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  DEFAULT_RATE_LIMIT_CONFIG,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_WEBHOOK_TIMESTAMP_TOLERANCE_MS,
} from './config/index.js';

export type {
  AirtableConfig,
  AuthMethod,
  PatAuthMethod,
  OAuthAuthMethod,
  RateLimitConfig,
  RetryConfig,
  CircuitBreakerConfig,
  WebhookConfig,
} from './config/index.js';

// ============================================================================
// Types
// ============================================================================

export {
  // Enums
  FieldType,
  ViewType,
  PermissionLevel,
  // Constants
  MAX_BATCH_SIZE,
  MIN_PAGE_SIZE,
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  BASE_ID_PREFIX,
  TABLE_ID_PREFIX,
  RECORD_ID_PREFIX,
  FIELD_ID_PREFIX,
  VIEW_ID_PREFIX,
  // Validation Functions
  isValidBaseId,
  isValidTableId,
  isValidRecordId,
  isValidFieldId,
  isValidViewId,
  validateBatchSize,
  validatePageSize,
  validateFieldName,
  isValidDateString,
  isValidDateTimeString,
  isUserRef,
  isAttachment,
} from './types/index.js';

export type {
  // ID Types
  BaseId,
  TableId,
  RecordId,
  FieldId,
  ViewId,
  WebhookId,
  // Field Values
  FieldValue,
  BaseFieldValue,
  UserRef,
  Attachment,
  Thumbnails,
  CurrencyValue,
  BarcodeValue,
  FormulaResult,
  RollupResult,
  // Records
  Record,
  DeletedRecord,
  CreateRecordInput,
  UpdateRecordInput,
  RecordUpdate,
  UpsertRequest,
  UpsertResult,
  // Query Types
  SortDirection,
  SortField,
  CellFormat,
  ListRecordsRequest,
  ListRecordsResponse,
  // Metadata
  Base,
  TableSchema,
  FieldSchema,
  ViewSchema,
  // Webhooks
  WebhookNotification,
  WebhookSpec,
  WebhookChangeType,
  WebhookPayload,
  // Errors
  AirtableError as AirtableErrorType,
  BatchError,
} from './types/index.js';

// ============================================================================
// Services
// ============================================================================

// Record Service
export {
  RecordServiceImpl,
  createRecordService,
} from './services/record.js';

export type {
  RecordService,
} from './services/record.js';

// List Service
export {
  ListServiceImpl,
  ListRecordsBuilder,
  createListService,
} from './services/list.js';

export type {
  ListService,
  ListRecordsResponse as ListServiceResponse,
} from './services/list.js';

// Batch Service
export {
  BatchServiceImpl,
  createBatchService,
  chunk,
} from './services/batch.js';

export type {
  BatchService,
} from './services/batch.js';

// Metadata Service
export {
  MetadataServiceImpl,
  createMetadataService,
  SchemaCache,
} from './services/metadata.js';

export type {
  MetadataService,
} from './services/metadata.js';

// ============================================================================
// Authentication
// ============================================================================

export {
  PatAuthProvider,
  OAuthAuthProvider,
  createAuthProvider,
} from './auth/index.js';

export type {
  AuthProvider,
  Headers,
} from './auth/index.js';

// ============================================================================
// Errors
// ============================================================================

export {
  AirtableError,
  AirtableErrorCode,
  // Configuration Errors
  ConfigurationError,
  MissingCredentialsError,
  InvalidBaseUrlError,
  // Authentication Errors
  AuthenticationError,
  TokenExpiredError,
  InsufficientScopeError,
  // Rate Limiting Errors
  RateLimitedError,
  RateLimitExhaustedError,
  QueueTimeoutError,
  // Resource Errors
  NotFoundError,
  ValidationError,
  BatchSizeExceededError,
  // Network/Server Errors
  ServerError,
  NetworkError,
  TimeoutError,
  // Webhook Errors
  WebhookMissingSignatureError,
  WebhookInvalidSignatureError,
  WebhookUnknownError,
  // Simulation Errors
  SimulationNotInReplayError,
  SimulationExhaustedError,
  SimulationMismatchError,
  // Circuit Breaker Errors
  CircuitBreakerOpenError,
  // Utilities
  parseAirtableApiError,
  isAirtableError,
  isRetryableError,
  getRetryDelayMs,
} from './errors/index.js';

export type {
  AirtableApiErrorResponse,
} from './errors/index.js';

// ============================================================================
// Resilience
// ============================================================================

export {
  RateLimiter,
  CircuitBreaker,
  RetryExecutor,
  ResilienceOrchestrator,
  createRetryExecutor,
} from './resilience/index.js';

export type {
  CircuitBreakerState,
  RetryHooks,
  ResilientExecuteOptions,
} from './resilience/index.js';

// ============================================================================
// Observability
// ============================================================================

export {
  // Logger
  LogLevel,
  ConsoleLogger,
  NoopLogger,
  InMemoryLogger,
  // Metrics
  MetricNames,
  NoopMetricsCollector,
  InMemoryMetricsCollector,
  // Tracer
  NoopTracer,
  InMemoryTracer,
  InMemorySpanContext,
  // Observability Container
  createNoopObservability,
  createInMemoryObservability,
  createConsoleObservability,
} from './observability/index.js';

export type {
  // Logger
  Logger,
  LogEntry,
  // Metrics
  MetricsCollector,
  MetricEntry,
  // Tracer
  Tracer,
  SpanContext,
  SpanStatus,
  // Observability Container
  Observability,
} from './observability/index.js';

// ============================================================================
// Webhooks
// ============================================================================

export {
  WebhookServiceImpl,
  WebhookProcessor,
  createWebhookService,
  createWebhookProcessor,
} from './webhook/index.js';

export type {
  WebhookService,
  // Types
  WebhookDataType,
  WebhookChangeType as WebhookEventType,
  CreateWebhookRequest,
  Webhook,
  WebhookPayload as IncomingWebhookPayload,
  ChangedRecord,
  WebhookChanges,
} from './webhook/index.js';

// ============================================================================
// Simulation
// ============================================================================

export {
  InteractionRecorder,
  InteractionReplayer,
  SimulationClient,
  WebhookSimulator,
  // Factory Functions
  createRecorder,
  createReplayer,
  loadReplayer,
  createSimulationClient,
} from './simulation/index.js';

export type {
  RecordedRequest,
  RecordedResponse,
  RecordedInteraction,
  SimulationSession,
  RequestOptions as SimulationRequestOptions,
  Response as SimulationResponse,
} from './simulation/index.js';
