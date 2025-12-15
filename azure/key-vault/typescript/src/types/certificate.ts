/**
 * Azure Key Vault Certificate Types
 *
 * Type definitions for certificate operations following SPARC specification.
 */

import type { BaseProperties, DeletedObjectProperties } from './common.js';

/**
 * Certificate content type
 */
export type CertificateContentType = 'application/x-pkcs12' | 'application/x-pem-file';

/**
 * Certificate key type
 */
export type CertificateKeyType = 'RSA' | 'RSA-HSM' | 'EC' | 'EC-HSM';

/**
 * Certificate key curve name
 */
export type CertificateKeyCurveName = 'P-256' | 'P-384' | 'P-521' | 'P-256K';

/**
 * Certificate properties
 */
export interface CertificateProperties extends BaseProperties {
  /** X.509 thumbprint (SHA-1 hash) */
  x509Thumbprint?: Uint8Array;
  /** Subject name */
  subject?: string;
  /** Certificate content type */
  contentType?: CertificateContentType;
  /** Whether the certificate is managed */
  managed?: boolean;
}

/**
 * Certificate object
 */
export interface Certificate {
  /** Certificate identifier (URL) */
  id: string;
  /** Certificate name */
  name: string;
  /** CER-encoded certificate (DER format) */
  cer: Uint8Array;
  /** Certificate properties */
  properties: CertificateProperties;
  /** Certificate policy */
  policy?: CertificatePolicy;
  /** Key ID associated with this certificate */
  keyId?: string;
  /** Secret ID associated with this certificate */
  secretId?: string;
}

/**
 * Certificate policy
 */
export interface CertificatePolicy {
  /** Policy ID */
  id?: string;
  /** Issuer parameters */
  issuerParameters?: IssuerParameters;
  /** X.509 certificate properties */
  x509Properties?: X509Properties;
  /** Lifetime actions */
  lifetimeActions?: LifetimeAction[];
  /** Key properties */
  keyProperties?: CertificateKeyProperties;
  /** Secret properties */
  secretProperties?: CertificateSecretProperties;
  /** Whether the certificate is enabled */
  enabled?: boolean;
  /** Creation time */
  createdOn?: Date;
  /** Last updated time */
  updatedOn?: Date;
}

/**
 * Issuer parameters
 */
export interface IssuerParameters {
  /** Issuer name (e.g., 'Self', 'Unknown', or custom CA name) */
  name?: string;
  /** Certificate type (optional, CA-specific) */
  certificateType?: string;
  /** Whether the certificate is transparent (Certificate Transparency) */
  certificateTransparency?: boolean;
}

/**
 * X.509 certificate properties
 */
export interface X509Properties {
  /** Subject name (e.g., 'CN=example.com') */
  subject?: string;
  /** Subject alternative names */
  subjectAlternativeNames?: SubjectAlternativeNames;
  /** Enhanced key usage OIDs */
  ekus?: string[];
  /** Key usage flags */
  keyUsage?: KeyUsageType[];
  /** Validity period in months */
  validityInMonths?: number;
}

/**
 * Subject alternative names
 */
export interface SubjectAlternativeNames {
  /** DNS names */
  dnsNames?: string[];
  /** Email addresses */
  emails?: string[];
  /** User principal names */
  upns?: string[];
}

/**
 * Key usage types
 */
export type KeyUsageType =
  | 'digitalSignature'
  | 'nonRepudiation'
  | 'keyEncipherment'
  | 'dataEncipherment'
  | 'keyAgreement'
  | 'keyCertSign'
  | 'cRLSign'
  | 'encipherOnly'
  | 'decipherOnly';

/**
 * Lifetime action
 */
export interface LifetimeAction {
  /** Action to perform */
  action?: LifetimeActionType;
  /** Trigger for the action */
  trigger?: LifetimeActionTrigger;
}

/**
 * Lifetime action type
 */
export interface LifetimeActionType {
  /** Action name ('EmailContacts' or 'AutoRenew') */
  actionType: 'EmailContacts' | 'AutoRenew';
}

/**
 * Lifetime action trigger
 */
export interface LifetimeActionTrigger {
  /** Days before expiry */
  daysBeforeExpiry?: number;
  /** Lifetime percentage (0-100) */
  lifetimePercentage?: number;
}

/**
 * Certificate key properties
 */
export interface CertificateKeyProperties {
  /** Whether the key is exportable */
  exportable?: boolean;
  /** Key type */
  keyType?: CertificateKeyType;
  /** Key size in bits */
  keySize?: number;
  /** Curve name (for EC keys) */
  curveName?: CertificateKeyCurveName;
  /** Whether to reuse key on renewal */
  reuseKey?: boolean;
}

/**
 * Certificate secret properties
 */
export interface CertificateSecretProperties {
  /** Content type of the secret */
  contentType?: CertificateContentType;
}

/**
 * Deleted certificate
 */
export interface DeletedCertificate {
  /** Certificate identifier */
  id: string;
  /** Certificate name */
  name: string;
  /** CER-encoded certificate */
  cer?: Uint8Array;
  /** Certificate properties including deletion metadata */
  properties: DeletedObjectProperties & Omit<CertificateProperties, keyof BaseProperties>;
  /** Certificate policy */
  policy?: CertificatePolicy;
}

/**
 * Options for creating a certificate
 */
export interface CreateCertificateOptions {
  /** Certificate policy */
  policy: CertificatePolicy;
  /** Enable or disable the certificate */
  enabled?: boolean;
  /** Custom tags */
  tags?: Record<string, string>;
}

/**
 * Options for importing a certificate
 */
export interface ImportCertificateOptions {
  /** Certificate data (PFX/PKCS12 or PEM) */
  certificate: Uint8Array | string;
  /** Password for PFX/PKCS12 format */
  password?: string;
  /** Certificate policy */
  policy?: CertificatePolicy;
  /** Enable or disable the certificate */
  enabled?: boolean;
  /** Custom tags */
  tags?: Record<string, string>;
}

/**
 * Certificate operation (for async certificate creation)
 */
export interface CertificateOperation {
  /** Operation ID */
  id?: string;
  /** Issuer parameters */
  issuerParameters?: IssuerParameters;
  /** Certificate signing request (CSR) */
  csr?: Uint8Array;
  /** Whether CSR creation is requested */
  cancellationRequested?: boolean;
  /** Operation status */
  status?: string;
  /** Status details */
  statusDetails?: string;
  /** Error information */
  error?: OperationError;
  /** Target location */
  target?: string;
  /** Request ID */
  requestId?: string;
}

/**
 * Operation error
 */
export interface OperationError {
  /** Error code */
  code?: string;
  /** Error message */
  message?: string;
  /** Inner error */
  innerError?: OperationError;
}

/**
 * Certificate backup blob
 */
export interface CertificateBackupBlob {
  /** Backup data as byte array */
  value: Uint8Array;
}

/**
 * List certificates options
 */
export interface ListCertificatesOptions {
  /** Maximum number of results per page */
  maxPageSize?: number;
  /** Include pending certificates */
  includePending?: boolean;
}

/**
 * Page of certificate properties
 */
export interface CertificatesPage {
  /** Array of certificate properties */
  items: CertificateProperties[];
  /** Continuation token for next page */
  continuationToken?: string;
}

/**
 * Get certificate options
 */
export interface GetCertificateOptions {
  /** Specific version to retrieve */
  version?: string;
}

/**
 * Update certificate properties options
 */
export interface UpdateCertificatePropertiesOptions {
  /** Enable or disable */
  enabled?: boolean;
  /** Custom tags */
  tags?: Record<string, string>;
}

/**
 * Merge certificate options
 */
export interface MergeCertificateOptions {
  /** X.509 certificates to merge */
  x509Certificates: Uint8Array[];
  /** Enable or disable */
  enabled?: boolean;
  /** Custom tags */
  tags?: Record<string, string>;
}

/**
 * Certificate contacts
 */
export interface CertificateContacts {
  /** Contact ID */
  id?: string;
  /** List of contacts */
  contacts?: Contact[];
}

/**
 * Contact information
 */
export interface Contact {
  /** Email address */
  email?: string;
  /** Contact name */
  name?: string;
  /** Phone number */
  phone?: string;
}

/**
 * Certificate issuer
 */
export interface CertificateIssuer {
  /** Issuer ID */
  id?: string;
  /** Issuer name */
  name?: string;
  /** Provider name */
  provider?: string;
  /** Credentials */
  credentials?: IssuerCredentials;
  /** Organization details */
  organizationDetails?: OrganizationDetails;
  /** Whether the issuer is enabled */
  enabled?: boolean;
  /** Creation time */
  createdOn?: Date;
  /** Last updated time */
  updatedOn?: Date;
}

/**
 * Issuer credentials
 */
export interface IssuerCredentials {
  /** Account ID */
  accountId?: string;
  /** Password/API key */
  password?: string;
}

/**
 * Organization details
 */
export interface OrganizationDetails {
  /** Organization ID */
  id?: string;
  /** Admin contacts */
  adminContacts?: Contact[];
}
