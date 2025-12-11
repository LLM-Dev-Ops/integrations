/**
 * SMTP Client Library
 *
 * A production-ready SMTP client with connection pooling, TLS support,
 * multiple authentication methods, and resilience patterns.
 *
 * @example
 * ```typescript
 * import { smtpClient, EmailBuilder, TlsMode } from '@integrations/smtp';
 *
 * // Create client
 * const client = smtpClient()
 *   .host('smtp.example.com')
 *   .port(587)
 *   .credentials('user@example.com', 'password')
 *   .tlsMode(TlsMode.StartTls)
 *   .build();
 *
 * // Send email
 * const email = new EmailBuilder()
 *   .from('sender@example.com')
 *   .to('recipient@example.com')
 *   .subject('Hello World')
 *   .text('This is a test email.')
 *   .build();
 *
 * const result = await client.send(email);
 * console.log('Message ID:', result.messageId);
 *
 * // Close client when done
 * await client.close();
 * ```
 *
 * @packageDocumentation
 */

// Re-export errors
export {
  SmtpError,
  SmtpErrorKind,
  ErrorSeverity,
  EnhancedStatusCode,
  parseEnhancedCode,
  isSmtpError,
  isRetryableError,
} from './errors';

// Re-export config
export {
  // Types
  SmtpConfig,
  SmtpConfigOptions,
  TlsConfig,
  PoolConfig,
  RetryConfig,
  CircuitBreakerConfig,
  RateLimitConfig,
  // Enums
  TlsMode,
  TlsVersion,
  AuthMethod,
  OnLimitBehavior,
  // Constants
  DEFAULT_PORT,
  DEFAULT_CONNECT_TIMEOUT,
  DEFAULT_COMMAND_TIMEOUT,
  DEFAULT_MAX_MESSAGE_SIZE,
  DEFAULT_TLS_CONFIG,
  DEFAULT_POOL_CONFIG,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_RATE_LIMIT_CONFIG,
  // Functions
  createSmtpConfig,
  // Builders
  SmtpConfigBuilder,
} from './config';

// Re-export types
export {
  // Types
  Address,
  Email,
  EmailOptions,
  Attachment,
  InlineImage,
  ContentDisposition,
  SendResult,
  BatchSendResult,
  RejectedRecipient,
  PoolStatus,
  ConnectionInfo,
  // Functions
  createAddress,
  createAddressWithName,
  parseAddress,
  formatAddressForSmtp,
  formatAddressForHeader,
  createAttachment,
  createAttachmentFromFile,
  createInlineImage,
  createEmail,
  // Builders
  EmailBuilder,
} from './types';

// Re-export auth
export {
  SecretString,
  Credentials,
  OAuth2Token,
  CredentialProvider,
  OAuth2Provider,
  Authenticator,
  AuthResult,
  StaticCredentialProvider,
  StaticOAuth2Provider,
  createCredentials,
  createOAuth2Token,
  createAuthenticator,
  createOAuth2Authenticator,
} from './auth';

// Re-export protocol
export {
  SmtpCommandType,
  SmtpCommand,
  SmtpResponse,
  EsmtpCapabilities,
  TransactionState,
  SmtpSession,
  // Command creators
  createCommand,
  ehlo,
  helo,
  mailFrom,
  rcptTo,
  data,
  quit,
  rset,
  noop,
  auth,
  startTls,
  formatCommand,
  // Response helpers
  parseResponse,
  isSuccessResponse,
  isIntermediateResponse,
  isTemporaryError,
  isPermanentError,
  parseCapabilities,
  canTransition,
} from './protocol';

// Re-export transport
export {
  SmtpTransport,
  TcpTransport,
  ConnectionPool,
  PooledConnection,
  createTransport,
  createConnectionPool,
} from './transport';

// Re-export mime
export {
  TransferEncoding,
  ContentType,
  ContentTypes,
  MimeEncoder,
  createContentType,
  formatContentType,
  generateBoundary,
  generateMessageId,
  encodeQuotedPrintable,
  encodeBase64,
  encodeHeaderValue,
  foldHeader,
  createMimeEncoder,
  dotStuff,
  prepareMessageData,
} from './mime';

// Re-export resilience
export {
  RetryExecutor,
  CircuitBreaker,
  CircuitState,
  CircuitBreakerEvent,
  RateLimiter,
  ResilienceOrchestrator,
  createRetryExecutor,
  createCircuitBreaker,
  createRateLimiter,
  createResilienceOrchestrator,
} from './resilience';

// Re-export observability
export {
  LogLevel,
  LogEntry,
  RequestContext,
  Logger,
  ConsoleLogger,
  NoopLogger,
  SmtpMetrics,
  MetricsCollector,
  Timer,
  TracingHook,
  CompositeTracingHook,
  createRequestContext,
  createLogger,
  createNoopLogger,
  createMetricsCollector,
  createEmptyMetrics,
} from './observability';

// Re-export client
export {
  SmtpClient,
  SmtpClientBuilder,
  SmtpClientOptions,
  createSmtpClient,
  smtpClient,
} from './client';

// Re-export mocks
export {
  MockTransport,
  MockTransportConfig,
  RecordedCommand,
  MockCredentialProvider,
  MockOAuth2Provider,
  TestFixtures,
  createMockTransport,
  createMockCredentialProvider,
  createMockOAuth2Provider,
} from './mocks';
