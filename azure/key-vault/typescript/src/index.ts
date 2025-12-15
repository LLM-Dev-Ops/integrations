/**
 * Azure Key Vault Integration
 *
 * A thin adapter layer for accessing Azure Key Vault secrets, keys, and certificates
 * following the SPARC specification for the LLM Dev Ops platform.
 *
 * Features:
 * - Secrets management with version awareness and rotation semantics
 * - Keys management with cryptographic operations (encrypt, decrypt, sign, verify)
 * - Certificates management with policy and issuance support
 * - Integrated caching with LRU eviction and negative caching
 * - Full observability (metrics, logging, tracing)
 * - Simulation layer for CI/CD testing
 *
 * @example
 * ```typescript
 * import { KeyVaultClient, SecretString } from '@platform/azure-key-vault';
 *
 * // Create client from environment
 * const client = KeyVaultClient.fromEnv();
 *
 * // Get a secret
 * const secret = await client.secrets().getSecret('db-password');
 * console.log('Got secret, expires:', secret.properties.expiresOn);
 *
 * // Use secret value safely (SecretString prevents accidental logging)
 * const dbPassword = secret.value.expose();
 *
 * // Encrypt data with a key
 * const encrypted = await client.keys().encrypt(
 *   'encryption-key',
 *   'RSA-OAEP',
 *   Buffer.from('sensitive data')
 * );
 *
 * // Get a certificate
 * const cert = await client.certificates().getCertificate('my-cert');
 * ```
 *
 * @packageDocumentation
 */

// Main client
export { KeyVaultClient, KeyVaultClientOptions } from './client.js';

// Configuration
export {
  KeyVaultConfig,
  NormalizedKeyVaultConfig,
  CacheConfig,
  DEFAULT_CONFIG,
  normalizeConfig,
  configFromEnv,
} from './config.js';

// Transport layer
export {
  KEY_VAULT_SCOPE,
  KeyVaultCredential,
  EnvironmentCredential,
  StaticTokenCredential,
  createDefaultCredential,
  HttpTransportConfig,
  HttpRequest,
  HttpResponse,
  HttpTransport,
} from './transport/index.js';

// Cache layer
export {
  CacheEntry,
  CacheEntryOptions,
  CacheManager,
  CacheConfig as CacheManagerConfig,
} from './cache/index.js';

// Types - Common
export {
  RecoveryLevel,
  TimestampUtils,
  BaseProperties,
  DeletedObjectProperties,
} from './types/index.js';

// Types - Secrets
export {
  SecretString,
  Secret,
  SecretProperties,
  SetSecretOptions,
  DeletedSecret,
  BackupBlob,
  ListSecretsOptions,
  SecretsPage,
  GetSecretOptions,
  UpdateSecretPropertiesOptions,
} from './types/index.js';

// Types - Keys
export {
  KeyType,
  KeyOperation,
  CurveName,
  JsonWebKey,
  Key,
  KeyProperties,
  KeyReleasePolicy,
  CreateKeyOptions,
  ImportKeyOptions,
  DeletedKey,
  KeyBackupBlob,
  ListKeysOptions,
  KeysPage,
  GetKeyOptions,
  UpdateKeyPropertiesOptions,
  KeyRotationPolicy,
  KeyRotationLifetimeAction,
} from './types/index.js';

// Types - Certificates
export {
  CertificateContentType,
  CertificateKeyType,
  CertificateKeyCurveName,
  Certificate,
  CertificateProperties,
  CertificatePolicy,
  IssuerParameters,
  X509Properties,
  SubjectAlternativeNames,
  KeyUsageType,
  LifetimeAction,
  LifetimeActionType,
  LifetimeActionTrigger,
  CertificateKeyProperties,
  CertificateSecretProperties,
  DeletedCertificate,
  CreateCertificateOptions,
  ImportCertificateOptions,
  CertificateOperation,
  OperationError,
  CertificateBackupBlob,
  ListCertificatesOptions,
  CertificatesPage,
  GetCertificateOptions,
  UpdateCertificatePropertiesOptions,
  MergeCertificateOptions,
  CertificateContacts,
  Contact,
  CertificateIssuer,
  IssuerCredentials,
  OrganizationDetails,
} from './types/index.js';

// Types - Crypto
export {
  EncryptionAlgorithm,
  SignatureAlgorithm,
  KeyWrapAlgorithm,
  EncryptOptions,
  EncryptResult,
  DecryptOptions,
  DecryptResult,
  SignOptions,
  SignResult,
  VerifyOptions,
  VerifyResult,
  WrapKeyOptions,
  WrapResult,
  UnwrapKeyOptions,
  UnwrapResult,
  DigestInfo,
  GenerateRandomBytesOptions,
  RandomBytesResult,
} from './types/index.js';

// Services
export {
  SecretsService,
  SecretsServiceImpl,
} from './services/secrets/index.js';

export {
  KeysService,
  KeysServiceImpl,
} from './services/keys/index.js';

export {
  CertificatesService,
  CertificatesServiceImpl,
} from './services/certificates/index.js';

// Errors
export {
  KeyVaultError,
  KeyVaultErrorOptions,
  AuthenticationFailedError,
  AccessDeniedError,
  SecretNotFoundError,
  KeyNotFoundError,
  CertificateNotFoundError,
  VersionNotFoundError,
  ResourceDisabledError,
  ResourceDeletedError,
  SecretExpiredError,
  SecretNotYetValidError,
  UnsupportedAlgorithmError,
  InvalidKeyOperationError,
  DecryptionFailedError,
  SignatureVerificationFailedError,
  RateLimitedError,
  ServiceUnavailableError,
  InternalError,
  ConnectionError,
  TimeoutError,
  InvalidSecretNameError,
  SecretTooLargeError,
  ConfigurationError,
  createErrorFromResponse,
  isRetryableStatus,
} from './error.js';

// Validation
export {
  validateSecretName,
  validateKeyName,
  validateCertificateName,
  validateSecretValueSize,
  KEY_VAULT_NAME_MAX_LENGTH,
  SECRET_VALUE_MAX_SIZE,
} from './validation.js';

// Rotation
export {
  RotationHandler,
  NoOpRotationHandler,
  ExpiryMonitor,
  ExpiryMonitorConfig,
} from './rotation/index.js';

// Observability
export {
  MetricsCollector,
  NoOpMetricsCollector,
  METRICS,
  createOperationLabels,
  createCacheLabels,
  Logger,
  NoOpLogger,
  checkExpiryWarning,
  Tracer,
  NoOpTracer,
  createSecretSpanAttributes,
  SpanStatus,
} from './observability/index.js';

// Simulation
export {
  MockKeyVaultClient,
  AccessLogReplayer,
  AccessResult,
  AccessLogEntry,
  ReplayEntry,
  ReplayResult,
  AccessLogFile,
} from './simulation/index.js';
