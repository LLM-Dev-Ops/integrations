/**
 * AWS SES Identity Types
 *
 * This module contains type definitions for identity management in AWS SES v2.
 */

/**
 * The type of identity.
 */
export type IdentityType = 'EMAIL_ADDRESS' | 'DOMAIN' | 'MANAGED_DOMAIN';

/**
 * The status of DKIM signing for an identity.
 */
export type DkimStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'TEMPORARY_FAILURE' | 'NOT_STARTED';

/**
 * The verification status of an identity.
 */
export type VerificationStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'TEMPORARY_FAILURE' | 'NOT_STARTED';

/**
 * The length of the DKIM signing key.
 */
export type DkimSigningKeyLength = 'RSA_1024_BIT' | 'RSA_2048_BIT';

/**
 * The action to take if MX record verification fails.
 */
export type BehaviorOnMxFailure = 'USE_DEFAULT_VALUE' | 'REJECT_MESSAGE';

/**
 * The signing attributes origin.
 */
export type DkimSigningAttributesOrigin = 'AWS_SES' | 'EXTERNAL';

/**
 * Represents DKIM attributes for an identity.
 */
export interface DkimAttributes {
  /** Whether DKIM signing is enabled */
  signingEnabled?: boolean;
  /** The status of DKIM signing */
  status?: DkimStatus;
  /** DKIM tokens for DNS verification (for domain identities) */
  tokens?: string[];
  /** The origin of the DKIM signing attributes */
  signingAttributesOrigin?: DkimSigningAttributesOrigin;
  /** The next signing key length */
  nextSigningKeyLength?: DkimSigningKeyLength;
  /** The current signing key length */
  currentSigningKeyLength?: DkimSigningKeyLength;
  /** The last time the key was rotated */
  lastKeyGenerationTimestamp?: Date;
}

/**
 * Represents MAIL FROM attributes for a domain identity.
 */
export interface MailFromAttributes {
  /** The custom MAIL FROM domain */
  mailFromDomain?: string;
  /** The status of the MAIL FROM domain */
  mailFromDomainStatus?: MailFromDomainStatus;
  /** The action to take if MX record verification fails */
  behaviorOnMxFailure?: BehaviorOnMxFailure;
}

/**
 * The status of the MAIL FROM domain.
 */
export type MailFromDomainStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'TEMPORARY_FAILURE';

/**
 * Represents a complete email identity.
 */
export interface EmailIdentity {
  /** The email address or domain name */
  identityName?: string;
  /** The type of identity */
  identityType?: IdentityType;
  /** Whether the identity is able to send email */
  sendingEnabled?: boolean;
  /** DKIM attributes for the identity */
  dkimAttributes?: DkimAttributes;
  /** MAIL FROM attributes (for domain identities only) */
  mailFromAttributes?: MailFromAttributes;
  /** Feedback forwarding configuration */
  feedbackForwardingStatus?: boolean;
  /** The verification status of the identity */
  verificationStatus?: VerificationStatus;
  /** Tags associated with the identity */
  tags?: Tag[];
  /** The configuration set associated with the identity */
  configurationSetName?: string;
  /** Verification information */
  verificationInfo?: VerificationInfo;
}

/**
 * Represents verification information for an identity.
 */
export interface VerificationInfo {
  /** The last time a verification was checked */
  lastCheckedTimestamp?: Date;
  /** The last successful verification timestamp */
  lastSuccessTimestamp?: Date;
  /** The error type if verification failed */
  errorType?: VerificationError;
  /** SOA record for the domain */
  soaRecord?: SOARecord;
}

/**
 * The type of verification error.
 */
export type VerificationError = 'SERVICE_ERROR' | 'DNS_SERVER_ERROR' | 'HOST_NOT_FOUND' |
  'TYPE_NOT_FOUND' | 'INVALID_VALUE';

/**
 * Represents an SOA (Start of Authority) record.
 */
export interface SOARecord {
  /** The primary name server */
  primaryNameServer?: string;
  /** The administrator email */
  adminEmail?: string;
  /** The serial number */
  serialNumber?: number;
}

/**
 * Represents summary information about an identity.
 */
export interface IdentityInfo {
  /** The type of identity */
  identityType?: IdentityType;
  /** The email address or domain name */
  identityName?: string;
  /** Whether the identity is able to send email */
  sendingEnabled?: boolean;
  /** The verification status of the identity */
  verificationStatus?: VerificationStatus;
}

/**
 * Represents a tag for resource tagging.
 */
export interface Tag {
  /** The key of the tag */
  key: string;
  /** The value of the tag */
  value: string;
}

/**
 * Represents DKIM signing attributes.
 */
export interface DkimSigningAttributes {
  /** The domain signing selector */
  domainSigningSelector?: string;
  /** The domain signing private key */
  domainSigningPrivateKey?: string;
  /** The next signing key length to use */
  nextSigningKeyLength?: DkimSigningKeyLength;
}

/**
 * Represents a policy for an identity.
 */
export interface IdentityPolicy {
  /** The policy document as a JSON string */
  policy?: string;
}
