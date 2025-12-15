/**
 * Azure Active Directory Types Module
 *
 * Re-exports all types for Azure AD OAuth2 operations.
 */

export {
  type AccessToken,
  type TokenResponse,
  type DeviceCodeResponse,
  type AuthorizationUrl,
} from "./token.js";

export {
  type TokenClaims,
} from "./claims.js";

export {
  type SecretCredential,
  type CertificateCredential,
  type ManagedIdentityCredential,
  type NoCredential,
  type CredentialType,
} from "./credential.js";
