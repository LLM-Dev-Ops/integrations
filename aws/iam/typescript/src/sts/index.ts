/**
 * AWS STS Module
 *
 * This module provides the Security Token Service (STS) client for AWS IAM integration.
 *
 * @module sts
 */

// Export service
export { StsService, StsServiceError } from './service.js';
export type {
  StsConfig,
  AwsCredentials,
  HttpClient,
  HttpRequest,
  HttpResponse,
  RequestSigner,
  SigningParams,
  SignedRequest,
  GetFederationTokenRequest,
} from './service.js';

// Export XML parsers
export {
  parseAssumeRoleResponse,
  parseAssumeRoleWithWebIdentityResponse,
  parseCallerIdentityResponse,
  parseSessionTokenResponse,
  parseFederationTokenResponse,
  parseStsError,
} from './xml.js';
export type { StsError } from './xml.js';
