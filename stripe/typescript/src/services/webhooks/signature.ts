/**
 * Webhook signature verification
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { WebhookSignatureError } from '../../errors/categories.js';
import type { WebhookSignatureHeader } from '../../types/webhook.js';

/**
 * Signature scheme used by Stripe
 */
const EXPECTED_SCHEME = 'v1';

/**
 * Parses the Stripe-Signature header
 */
export function parseSignatureHeader(header: string): WebhookSignatureHeader {
  const parts = header.split(',');
  let timestamp: number | undefined;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split('=');

    if (key === 't' && value !== undefined) {
      timestamp = parseInt(value, 10);
    } else if (key === EXPECTED_SCHEME && value !== undefined) {
      signatures.push(value);
    }
  }

  if (timestamp === undefined) {
    throw new WebhookSignatureError('Missing timestamp in signature header');
  }

  if (signatures.length === 0) {
    throw new WebhookSignatureError(`No ${EXPECTED_SCHEME} signatures found in header`);
  }

  return { timestamp, signatures };
}

/**
 * Computes the expected signature for a payload
 */
export function computeSignature(
  payload: string | Buffer,
  timestamp: number,
  secret: string
): string {
  const payloadString = typeof payload === 'string' ? payload : payload.toString('utf8');
  const signedPayload = `${timestamp}.${payloadString}`;

  return createHmac('sha256', secret).update(signedPayload, 'utf8').digest('hex');
}

/**
 * Compares two signatures in constant time
 */
export function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');

  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies a webhook signature
 */
export function verifySignature(
  payload: string | Buffer,
  header: string,
  secret: string,
  tolerance: number = 300
): { valid: boolean; timestamp: number } {
  const { timestamp, signatures } = parseSignatureHeader(header);

  // Check timestamp tolerance
  const now = Math.floor(Date.now() / 1000);
  const timeDiff = now - timestamp;

  if (timeDiff > tolerance) {
    throw new WebhookSignatureError(
      `Webhook timestamp is outside the tolerance window. ` +
      `Event was signed ${timeDiff} seconds ago, but tolerance is ${tolerance} seconds.`,
      { timestamp, now, tolerance }
    );
  }

  if (timeDiff < -tolerance) {
    throw new WebhookSignatureError(
      `Webhook timestamp is in the future. ` +
      `Event claims to be signed ${-timeDiff} seconds from now.`,
      { timestamp, now, tolerance }
    );
  }

  // Compute expected signature
  const expectedSignature = computeSignature(payload, timestamp, secret);

  // Check if any of the signatures match
  const signatureMatch = signatures.some((sig) => secureCompare(sig, expectedSignature));

  if (!signatureMatch) {
    throw new WebhookSignatureError(
      'Webhook signature verification failed. ' +
      'The signature does not match the expected value.',
      { signatureCount: signatures.length }
    );
  }

  return { valid: true, timestamp };
}

/**
 * Generates a signature header for testing purposes
 */
export function generateSignatureHeader(
  payload: string | Buffer,
  secret: string,
  timestamp?: number
): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signature = computeSignature(payload, ts, secret);
  return `t=${ts},${EXPECTED_SCHEME}=${signature}`;
}
