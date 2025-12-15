/**
 * Azure Key Vault Types
 *
 * Central export point for all Key Vault type definitions.
 */

// Common types
export {
  RecoveryLevel,
  TimestampUtils,
  type BaseProperties,
  type DeletedObjectProperties,
} from './common.js';

// Secret types
export {
  SecretString,
  type Secret,
  type SecretProperties,
  type SetSecretOptions,
  type DeletedSecret,
  type BackupBlob,
  type ListSecretsOptions,
  type SecretsPage,
  type GetSecretOptions,
  type UpdateSecretPropertiesOptions,
} from './secret.js';

// Key types
export {
  KeyType,
  KeyOperation,
  type CurveName,
  type JsonWebKey,
  type Key,
  type KeyProperties,
  type KeyReleasePolicy,
  type CreateKeyOptions,
  type ImportKeyOptions,
  type DeletedKey,
  type KeyBackupBlob,
  type ListKeysOptions,
  type KeysPage,
  type GetKeyOptions,
  type UpdateKeyPropertiesOptions,
  type KeyRotationPolicy,
  type KeyRotationLifetimeAction,
} from './key.js';

// Certificate types
export {
  type CertificateContentType,
  type CertificateKeyType,
  type CertificateKeyCurveName,
  type Certificate,
  type CertificateProperties,
  type CertificatePolicy,
  type IssuerParameters,
  type X509Properties,
  type SubjectAlternativeNames,
  type KeyUsageType,
  type LifetimeAction,
  type LifetimeActionType,
  type LifetimeActionTrigger,
  type CertificateKeyProperties,
  type CertificateSecretProperties,
  type DeletedCertificate,
  type CreateCertificateOptions,
  type ImportCertificateOptions,
  type CertificateOperation,
  type OperationError,
  type CertificateBackupBlob,
  type ListCertificatesOptions,
  type CertificatesPage,
  type GetCertificateOptions,
  type UpdateCertificatePropertiesOptions,
  type MergeCertificateOptions,
  type CertificateContacts,
  type Contact,
  type CertificateIssuer,
  type IssuerCredentials,
  type OrganizationDetails,
} from './certificate.js';

// Cryptographic operation types
export {
  EncryptionAlgorithm,
  SignatureAlgorithm,
  KeyWrapAlgorithm,
  type EncryptOptions,
  type EncryptResult,
  type DecryptOptions,
  type DecryptResult,
  type SignOptions,
  type SignResult,
  type VerifyOptions,
  type VerifyResult,
  type WrapKeyOptions,
  type WrapResult,
  type UnwrapKeyOptions,
  type UnwrapResult,
  type DigestInfo,
  type GenerateRandomBytesOptions,
  type RandomBytesResult,
} from './crypto.js';
