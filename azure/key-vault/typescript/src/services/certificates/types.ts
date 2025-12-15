/**
 * Azure Key Vault Certificates Service Types
 *
 * Azure API response shapes and service-specific types for certificate operations.
 */

import type {
  Certificate,
  CertificateProperties,
  CertificatePolicy,
  GetCertificateOptions,
  ListCertificatesOptions,
} from '../../types/certificate.js';

/**
 * Re-export service interface types
 */
export type {
  Certificate,
  CertificateProperties,
  CertificatePolicy,
  GetCertificateOptions,
  ListCertificatesOptions,
};

/**
 * Azure API response shape for certificate bundle
 *
 * This represents the raw response from Azure Key Vault GET /certificates/{name}/{version}
 */
export interface CertificateBundle {
  /** Certificate identifier */
  id?: string;
  /** Key identifier associated with this certificate */
  kid?: string;
  /** Secret identifier associated with this certificate */
  sid?: string;
  /** X.509 thumbprint (hex string) */
  x5t?: string;
  /** CER-encoded certificate (base64url) */
  cer?: string;
  /** Certificate content type */
  contentType?: string;
  /** Certificate attributes */
  attributes?: {
    /** Whether enabled */
    enabled?: boolean;
    /** Not before (Unix timestamp in seconds) */
    nbf?: number;
    /** Expires (Unix timestamp in seconds) */
    exp?: number;
    /** Created (Unix timestamp in seconds) */
    created?: number;
    /** Updated (Unix timestamp in seconds) */
    updated?: number;
    /** Recovery level */
    recoveryLevel?: string;
    /** Recoverable days */
    recoverableDays?: number;
  };
  /** Custom tags */
  tags?: Record<string, string>;
  /** Certificate policy */
  policy?: CertificatePolicyBundle;
}

/**
 * Azure API response shape for certificate item (list operation)
 *
 * This represents items in the response from Azure Key Vault GET /certificates
 */
export interface CertificateItem {
  /** Certificate identifier */
  id?: string;
  /** X.509 thumbprint (hex string) */
  x5t?: string;
  /** Certificate attributes */
  attributes?: {
    /** Whether enabled */
    enabled?: boolean;
    /** Not before (Unix timestamp in seconds) */
    nbf?: number;
    /** Expires (Unix timestamp in seconds) */
    exp?: number;
    /** Created (Unix timestamp in seconds) */
    created?: number;
    /** Updated (Unix timestamp in seconds) */
    updated?: number;
    /** Recovery level */
    recoveryLevel?: string;
    /** Recoverable days */
    recoverableDays?: number;
  };
  /** Subject name */
  subject?: string;
  /** Custom tags */
  tags?: Record<string, string>;
}

/**
 * Azure API response shape for certificate policy
 *
 * This represents the raw response from Azure Key Vault GET /certificates/{name}/policy
 */
export interface CertificatePolicyBundle {
  /** Policy identifier */
  id?: string;
  /** Key properties */
  key_props?: {
    /** Whether exportable */
    exportable?: boolean;
    /** Key type */
    kty?: string;
    /** Key size */
    key_size?: number;
    /** Curve name */
    crv?: string;
    /** Whether to reuse key */
    reuse_key?: boolean;
  };
  /** Secret properties */
  secret_props?: {
    /** Content type */
    contentType?: string;
  };
  /** X.509 properties */
  x509_props?: {
    /** Subject */
    subject?: string;
    /** Subject alternative names */
    sans?: {
      /** DNS names */
      dns_names?: string[];
      /** Emails */
      emails?: string[];
      /** UPNs */
      upns?: string[];
    };
    /** Enhanced key usages */
    ekus?: string[];
    /** Key usage */
    key_usage?: string[];
    /** Validity in months */
    validity_months?: number;
  };
  /** Lifetime actions */
  lifetime_actions?: Array<{
    /** Trigger */
    trigger?: {
      /** Days before expiry */
      days_before_expiry?: number;
      /** Lifetime percentage */
      lifetime_percentage?: number;
    };
    /** Action */
    action?: {
      /** Action type */
      action_type?: string;
    };
  }>;
  /** Issuer parameters */
  issuer?: {
    /** Issuer name */
    name?: string;
    /** Certificate type */
    cty?: string;
    /** Certificate transparency */
    cert_transparency?: boolean;
  };
  /** Attributes */
  attributes?: {
    /** Whether enabled */
    enabled?: boolean;
    /** Created (Unix timestamp in seconds) */
    created?: number;
    /** Updated (Unix timestamp in seconds) */
    updated?: number;
  };
}

/**
 * Azure API list response
 */
export interface ListResponse<T> {
  /** Array of items */
  value?: T[];
  /** Next page link */
  nextLink?: string;
}
