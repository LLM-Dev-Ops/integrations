/**
 * STS XML Response Parsing Utilities
 *
 * This module provides utilities for parsing XML responses from AWS STS API.
 * STS returns XML-formatted responses that need to be parsed and converted to
 * typed TypeScript objects.
 *
 * @module sts/xml
 */

import type {
  AssumedCredentials,
  CallerIdentity,
  SessionCredentials,
} from '../types/responses.js';

/**
 * STS error response
 */
export interface StsError {
  /** Error code from STS */
  code: string;
  /** Error message from STS */
  message: string;
  /** Request ID */
  requestId?: string;
}

/**
 * Extract text content from an XML element.
 *
 * @param xml - XML string
 * @param tagName - Tag name to extract
 * @returns Text content or undefined if not found
 */
function getTextContent(xml: string, tagName: string): string | undefined {
  const regex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : undefined;
}

/**
 * Parse ISO 8601 datetime string to Date object.
 *
 * @param dateStr - ISO 8601 datetime string
 * @returns Date object
 */
function parseDateTime(dateStr: string): Date {
  return new Date(dateStr);
}

/**
 * Parse AssumeRole response XML.
 *
 * Extracts credentials and assumed role information from the XML response.
 *
 * @param xml - XML response body
 * @returns Assumed credentials
 * @throws {Error} If required fields are missing
 *
 * @example
 * ```typescript
 * const xml = `
 *   <AssumeRoleResponse>
 *     <AssumeRoleResult>
 *       <Credentials>
 *         <AccessKeyId>ASIAIOSFODNN7EXAMPLE</AccessKeyId>
 *         <SecretAccessKey>wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY</SecretAccessKey>
 *         <SessionToken>FwoGZXIvYXdzEBYaDK...</SessionToken>
 *         <Expiration>2025-12-13T12:00:00Z</Expiration>
 *       </Credentials>
 *       <AssumedRoleUser>
 *         <AssumedRoleId>AROA3XFRBF535PLBIFPI4:session-name</AssumedRoleId>
 *         <Arn>arn:aws:sts::123456789012:assumed-role/RoleName/session-name</Arn>
 *       </AssumedRoleUser>
 *     </AssumeRoleResult>
 *   </AssumeRoleResponse>
 * `;
 *
 * const credentials = parseAssumeRoleResponse(xml);
 * console.log(credentials.accessKeyId); // "ASIAIOSFODNN7EXAMPLE"
 * ```
 */
export function parseAssumeRoleResponse(xml: string): AssumedCredentials {
  const accessKeyId = getTextContent(xml, 'AccessKeyId');
  const secretAccessKey = getTextContent(xml, 'SecretAccessKey');
  const sessionToken = getTextContent(xml, 'SessionToken');
  const expirationStr = getTextContent(xml, 'Expiration');
  const assumedRoleId = getTextContent(xml, 'AssumedRoleId');
  const arn = getTextContent(xml, 'Arn');

  if (!accessKeyId || !secretAccessKey || !sessionToken || !expirationStr || !assumedRoleId || !arn) {
    throw new Error('Invalid AssumeRole response: missing required fields');
  }

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken,
    expiration: parseDateTime(expirationStr),
    assumedRoleArn: arn,
    assumedRoleId,
  };
}

/**
 * Parse GetCallerIdentity response XML.
 *
 * Extracts caller identity information from the XML response.
 *
 * @param xml - XML response body
 * @returns Caller identity
 * @throws {Error} If required fields are missing
 *
 * @example
 * ```typescript
 * const xml = `
 *   <GetCallerIdentityResponse>
 *     <GetCallerIdentityResult>
 *       <UserId>AIDAIOSFODNN7EXAMPLE</UserId>
 *       <Account>123456789012</Account>
 *       <Arn>arn:aws:iam::123456789012:user/username</Arn>
 *     </GetCallerIdentityResult>
 *   </GetCallerIdentityResponse>
 * `;
 *
 * const identity = parseCallerIdentityResponse(xml);
 * console.log(identity.account); // "123456789012"
 * ```
 */
export function parseCallerIdentityResponse(xml: string): CallerIdentity {
  const userId = getTextContent(xml, 'UserId');
  const account = getTextContent(xml, 'Account');
  const arn = getTextContent(xml, 'Arn');

  if (!userId || !account || !arn) {
    throw new Error('Invalid GetCallerIdentity response: missing required fields');
  }

  return {
    userId,
    account,
    arn,
  };
}

/**
 * Parse GetSessionToken response XML.
 *
 * Extracts session token credentials from the XML response.
 *
 * @param xml - XML response body
 * @returns Session credentials
 * @throws {Error} If required fields are missing
 *
 * @example
 * ```typescript
 * const xml = `
 *   <GetSessionTokenResponse>
 *     <GetSessionTokenResult>
 *       <Credentials>
 *         <AccessKeyId>ASIAIOSFODNN7EXAMPLE</AccessKeyId>
 *         <SecretAccessKey>wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY</SecretAccessKey>
 *         <SessionToken>FwoGZXIvYXdzEBYaDK...</SessionToken>
 *         <Expiration>2025-12-13T12:00:00Z</Expiration>
 *       </Credentials>
 *     </GetSessionTokenResult>
 *   </GetSessionTokenResponse>
 * `;
 *
 * const credentials = parseSessionTokenResponse(xml);
 * console.log(credentials.sessionToken); // "FwoGZXIvYXdzEBYaDK..."
 * ```
 */
export function parseSessionTokenResponse(xml: string): SessionCredentials {
  const accessKeyId = getTextContent(xml, 'AccessKeyId');
  const secretAccessKey = getTextContent(xml, 'SecretAccessKey');
  const sessionToken = getTextContent(xml, 'SessionToken');
  const expirationStr = getTextContent(xml, 'Expiration');

  if (!accessKeyId || !secretAccessKey || !sessionToken || !expirationStr) {
    throw new Error('Invalid GetSessionToken response: missing required fields');
  }

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken,
    expiration: parseDateTime(expirationStr),
  };
}

/**
 * Parse STS error response XML.
 *
 * Extracts error information from STS error responses.
 *
 * @param xml - XML error response body
 * @returns STS error object
 *
 * @example
 * ```typescript
 * const xml = `
 *   <ErrorResponse>
 *     <Error>
 *       <Type>Sender</Type>
 *       <Code>AccessDenied</Code>
 *       <Message>User is not authorized to perform: sts:AssumeRole</Message>
 *     </Error>
 *     <RequestId>12345678-1234-1234-1234-123456789012</RequestId>
 *   </ErrorResponse>
 * `;
 *
 * const error = parseStsError(xml);
 * console.log(error.code); // "AccessDenied"
 * console.log(error.message); // "User is not authorized to perform: sts:AssumeRole"
 * ```
 */
export function parseStsError(xml: string): StsError {
  const code = getTextContent(xml, 'Code') || 'UnknownError';
  const message = getTextContent(xml, 'Message') || 'An unknown error occurred';
  const requestId = getTextContent(xml, 'RequestId');

  return {
    code,
    message,
    requestId,
  };
}

/**
 * Parse AssumeRoleWithWebIdentity response XML.
 *
 * This has the same structure as AssumeRole response.
 *
 * @param xml - XML response body
 * @returns Assumed credentials
 */
export function parseAssumeRoleWithWebIdentityResponse(xml: string): AssumedCredentials {
  // Same structure as AssumeRole, just different result tag name
  return parseAssumeRoleResponse(xml);
}

/**
 * Parse GetFederationToken response XML.
 *
 * Extracts federated credentials from the XML response.
 *
 * @param xml - XML response body
 * @returns Federated credentials (using SessionCredentials type)
 * @throws {Error} If required fields are missing
 */
export function parseFederationTokenResponse(xml: string): SessionCredentials {
  const accessKeyId = getTextContent(xml, 'AccessKeyId');
  const secretAccessKey = getTextContent(xml, 'SecretAccessKey');
  const sessionToken = getTextContent(xml, 'SessionToken');
  const expirationStr = getTextContent(xml, 'Expiration');

  if (!accessKeyId || !secretAccessKey || !sessionToken || !expirationStr) {
    throw new Error('Invalid GetFederationToken response: missing required fields');
  }

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken,
    expiration: parseDateTime(expirationStr),
  };
}
