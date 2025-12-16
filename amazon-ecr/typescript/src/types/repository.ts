/**
 * Repository types for Amazon ECR.
 *
 * This module provides TypeScript type definitions for ECR repository entities,
 * matching the structure defined in the SPARC specification.
 *
 * @module types/repository
 */

/**
 * Tag mutability setting for repository images.
 */
export enum TagMutability {
  /** Tags can be overwritten. */
  Mutable = 'MUTABLE',
  /** Tags cannot be overwritten. */
  Immutable = 'IMMUTABLE',
}

/**
 * Scan type for image vulnerability scanning.
 */
export enum ScanType {
  /** Basic vulnerability scanning. */
  Basic = 'BASIC',
  /** Enhanced vulnerability scanning with Inspector. */
  Enhanced = 'ENHANCED',
}

/**
 * Image scanning configuration.
 */
export interface ScanConfig {
  /** Whether to scan images on push. */
  readonly scanOnPush: boolean;
  /** Type of scan to perform. */
  readonly scanType: ScanType;
}

/**
 * Encryption type for repository images.
 */
export enum EncryptionType {
  /** AES-256 encryption. */
  Aes256 = 'AES256',
  /** AWS KMS encryption. */
  Kms = 'KMS',
}

/**
 * Encryption configuration for repository.
 */
export interface EncryptionConfig {
  /** Type of encryption used. */
  readonly encryptionType: EncryptionType;
  /** KMS key ARN (required if encryptionType is KMS). */
  readonly kmsKey?: string;
}

/**
 * ECR repository.
 */
export interface Repository {
  /** AWS account ID that owns the repository. */
  readonly registryId: string;
  /** Repository name. */
  readonly repositoryName: string;
  /** Repository ARN. */
  readonly repositoryArn: string;
  /** Repository URI for docker push/pull. */
  readonly repositoryUri: string;
  /** Repository creation time. */
  readonly createdAt: string;
  /** Tag mutability setting. */
  readonly imageTagMutability: TagMutability;
  /** Image scanning configuration. */
  readonly imageScanningConfiguration: ScanConfig;
  /** Encryption configuration. */
  readonly encryptionConfiguration: EncryptionConfig;
}
