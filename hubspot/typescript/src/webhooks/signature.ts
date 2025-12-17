/**
 * Webhook Signature Validation
 *
 * Validates HubSpot webhook signatures to ensure authenticity
 */

import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Error thrown when webhook signature validation fails
 */
export class InvalidSignatureError extends Error {
  constructor(message: string = 'Invalid webhook signature') {
    super(message);
    this.name = 'InvalidSignatureError';
  }
}

/**
 * Validate HubSpot webhook signature (v3)
 *
 * HubSpot v3 signature algorithm:
 * 1. Concatenate: method + url + body + timestamp
 * 2. Create HMAC-SHA256 hash using webhook secret
 * 3. Base64 encode the hash
 * 4. Compare with x-hubspot-signature-v3 header
 *
 * @param webhookSecret - Webhook secret from HubSpot app settings
 * @param signature - x-hubspot-signature-v3 header value
 * @param timestamp - x-hubspot-request-timestamp header value
 * @param method - HTTP method (usually POST)
 * @param url - Full request URL
 * @param body - Raw request body string
 * @returns true if signature is valid
 * @throws {InvalidSignatureError} if signature is invalid
 */
export function validateSignatureV3(
  webhookSecret: string,
  signature: string,
  timestamp: string,
  method: string,
  url: string,
  body: string
): boolean {
  if (!webhookSecret || !signature || !timestamp) {
    throw new InvalidSignatureError('Missing required signature parameters');
  }

  // Validate timestamp is not too old (5 minute window)
  const requestTime = parseInt(timestamp, 10);
  const currentTime = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes in ms

  if (isNaN(requestTime) || currentTime - requestTime > maxAge) {
    throw new InvalidSignatureError('Request timestamp is too old');
  }

  // Build source string: method + url + body + timestamp
  const sourceString = method + url + body + timestamp;

  // Compute expected signature
  const hmac = createHmac('sha256', webhookSecret);
  hmac.update(sourceString);
  const expectedSignature = hmac.digest('base64');

  // Timing-safe comparison
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    throw new InvalidSignatureError('Signature length mismatch');
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new InvalidSignatureError('Signature does not match');
  }

  return true;
}

/**
 * Validate HubSpot webhook signature (legacy v1/v2)
 *
 * For backwards compatibility with older webhook versions
 *
 * @param webhookSecret - Webhook secret
 * @param signature - x-hubspot-signature header value
 * @param body - Raw request body string
 * @returns true if signature is valid
 */
export function validateSignatureV1(
  webhookSecret: string,
  signature: string,
  body: string
): boolean {
  if (!webhookSecret || !signature) {
    throw new InvalidSignatureError('Missing required signature parameters');
  }

  // v1 signature: SHA256(clientSecret + body)
  const hmac = createHmac('sha256', webhookSecret);
  hmac.update(webhookSecret + body);
  const expectedSignature = hmac.digest('hex');

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(signatureBuffer, expectedBuffer);
}
