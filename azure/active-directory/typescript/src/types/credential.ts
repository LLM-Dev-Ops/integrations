/**
 * Credential types for Azure Active Directory authentication.
 *
 * Following the SPARC specification for Azure AD integration.
 */

/**
 * Secret credential (zeroized after use).
 */
export interface SecretCredential {
  /** Credential type. */
  type: "secret";
  /** Client secret value. */
  value: string;
}

/**
 * Certificate credential.
 */
export interface CertificateCredential {
  /** Credential type. */
  type: "certificate";
  /** Certificate data (PFX/PEM). */
  certData: Uint8Array;
  /** Certificate password (if encrypted). */
  password?: string;
}

/**
 * Managed identity credential.
 */
export interface ManagedIdentityCredential {
  /** Credential type. */
  type: "managedIdentity";
  /** Client ID for user-assigned managed identity. */
  clientId?: string;
}

/**
 * No credential (public client).
 */
export interface NoCredential {
  /** Credential type. */
  type: "none";
}

/**
 * Discriminated union of all credential types.
 */
export type CredentialType =
  | SecretCredential
  | CertificateCredential
  | ManagedIdentityCredential
  | NoCredential;
