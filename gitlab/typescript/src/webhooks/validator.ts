/**
 * GitLab Webhook Validator
 *
 * Provides secure webhook validation with token verification, IP allowlisting,
 * and payload size checking to prevent webhook abuse and timing attacks.
 */

import { timingSafeEqual } from 'crypto';
import { WebhookValidationError } from '../errors';

/**
 * Request object for webhook validation
 */
export interface WebhookRequest {
  /**
   * HTTP headers from the webhook request
   */
  readonly headers: Record<string, string>;

  /**
   * Request body (can be string or object)
   */
  readonly body: string | object;

  /**
   * Optional client IP address for IP allowlist validation
   */
  readonly ip?: string;
}

/**
 * Configuration for webhook validator
 */
export interface WebhookValidatorConfig {
  /**
   * Expected webhook tokens for validation.
   * Multiple tokens are supported for rotation scenarios.
   */
  readonly expectedTokens: string[];

  /**
   * Optional IP allowlist.
   * If provided, requests from IPs not in this list will be rejected.
   */
  readonly allowedIps?: string[];

  /**
   * Maximum allowed payload size in bytes.
   * Defaults to 1MB (1048576 bytes) if not specified.
   */
  readonly maxPayloadSize?: number;
}

/**
 * Default maximum payload size (1MB)
 */
const DEFAULT_MAX_PAYLOAD_SIZE = 1048576;

/**
 * Validator for GitLab webhook requests.
 *
 * Provides comprehensive validation including:
 * - Token validation with constant-time comparison to prevent timing attacks
 * - Optional IP allowlist checking
 * - Payload size validation to prevent abuse
 *
 * @example
 * ```typescript
 * const validator = new WebhookValidator({
 *   expectedTokens: ['secret-token-1', 'secret-token-2'],
 *   allowedIps: ['192.168.1.0/24'],
 *   maxPayloadSize: 2 * 1024 * 1024 // 2MB
 * });
 *
 * try {
 *   validator.validate(request);
 *   // Request is valid, proceed with processing
 * } catch (error) {
 *   // Validation failed
 *   console.error(error.message);
 * }
 * ```
 */
export class WebhookValidator {
  private readonly config: Required<WebhookValidatorConfig>;

  /**
   * Create a new webhook validator
   *
   * @param config - Validator configuration
   * @throws {Error} If configuration is invalid (e.g., no tokens provided)
   */
  constructor(config: WebhookValidatorConfig) {
    if (!config.expectedTokens || config.expectedTokens.length === 0) {
      throw new Error('At least one expected token must be provided');
    }

    this.config = {
      expectedTokens: config.expectedTokens,
      allowedIps: config.allowedIps || [],
      maxPayloadSize: config.maxPayloadSize || DEFAULT_MAX_PAYLOAD_SIZE,
    };
  }

  /**
   * Validate a webhook request.
   *
   * Performs all validation checks in sequence:
   * 1. Payload size validation
   * 2. Token validation
   * 3. IP allowlist validation (if configured)
   *
   * @param request - The webhook request to validate
   * @throws {WebhookValidationError} If validation fails for any reason
   *
   * @example
   * ```typescript
   * const request = {
   *   headers: {
   *     'x-gitlab-token': 'my-secret-token'
   *   },
   *   body: '{"object_kind":"pipeline"}',
   *   ip: '192.168.1.100'
   * };
   *
   * validator.validate(request);
   * ```
   */
  validate(request: WebhookRequest): void {
    // 1. Validate payload size
    if (!this.validatePayloadSize(request.body)) {
      throw new WebhookValidationError(
        `Payload size exceeds maximum allowed size of ${this.config.maxPayloadSize} bytes`
      );
    }

    // 2. Validate token
    const token = this.extractToken(request.headers);
    if (!token) {
      throw new WebhookValidationError(
        'Missing X-Gitlab-Token header'
      );
    }

    if (!this.validateToken(token)) {
      throw new WebhookValidationError(
        'Invalid webhook token'
      );
    }

    // 3. Validate IP if allowlist is configured and IP is provided
    if (this.config.allowedIps.length > 0 && request.ip) {
      if (!this.validateIp(request.ip)) {
        throw new WebhookValidationError(
          `Request from IP ${request.ip} is not in the allowlist`
        );
      }
    }
  }

  /**
   * Extract the webhook token from request headers.
   *
   * GitLab sends the webhook token in the X-Gitlab-Token header.
   * Header names are case-insensitive, so we check both lowercase and original case.
   *
   * @param headers - Request headers
   * @returns The token if found, undefined otherwise
   */
  private extractToken(headers: Record<string, string>): string | undefined {
    // Check common header name variations (case-insensitive)
    return (
      headers['x-gitlab-token'] ||
      headers['X-Gitlab-Token'] ||
      headers['X-GitLab-Token']
    );
  }

  /**
   * Validate the webhook token using constant-time comparison.
   *
   * Uses timingSafeEqual to prevent timing attacks where an attacker
   * could deduce the token by measuring comparison time.
   *
   * @param token - The token to validate
   * @returns true if the token matches one of the expected tokens
   */
  private validateToken(token: string): boolean {
    // Check against all expected tokens (supports token rotation)
    for (const expectedToken of this.config.expectedTokens) {
      if (this.constantTimeCompare(token, expectedToken)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Perform constant-time string comparison to prevent timing attacks.
   *
   * Converts both strings to buffers and uses Node's timingSafeEqual
   * which ensures the comparison takes constant time regardless of
   * where the strings differ.
   *
   * @param a - First string to compare
   * @param b - Second string to compare
   * @returns true if strings are equal
   */
  private constantTimeCompare(a: string, b: string): boolean {
    // If lengths differ, timingSafeEqual will throw, so we need to handle that
    // We still want constant-time behavior, so we compare against a dummy buffer
    if (a.length !== b.length) {
      // Compare against dummy buffer of same length as 'a' to maintain constant-time
      const dummyBuffer = Buffer.alloc(Buffer.byteLength(a, 'utf8'));
      const aBuffer = Buffer.from(a, 'utf8');
      try {
        timingSafeEqual(aBuffer, dummyBuffer);
      } catch {
        // Expected to throw, but ensures constant-time
      }
      return false;
    }

    try {
      const aBuffer = Buffer.from(a, 'utf8');
      const bBuffer = Buffer.from(b, 'utf8');
      return timingSafeEqual(aBuffer, bBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Validate payload size.
   *
   * Checks if the payload size is within the configured maximum.
   * Supports both string and object payloads.
   *
   * @param body - The request body (string or object)
   * @returns true if payload size is acceptable
   */
  private validatePayloadSize(body: string | object): boolean {
    let size: number;

    if (typeof body === 'string') {
      // For strings, use byte length
      size = Buffer.byteLength(body, 'utf8');
    } else if (body instanceof ArrayBuffer) {
      // For ArrayBuffer, use byteLength
      size = body.byteLength;
    } else {
      // For objects, serialize and check size
      try {
        const serialized = JSON.stringify(body);
        size = Buffer.byteLength(serialized, 'utf8');
      } catch {
        // If serialization fails, reject the payload
        return false;
      }
    }

    return size <= this.config.maxPayloadSize;
  }

  /**
   * Validate IP address against allowlist.
   *
   * Supports both individual IPs and CIDR notation.
   * Note: This is a basic implementation. For production use with CIDR,
   * consider using a library like 'ip-range-check' or 'ipaddr.js'.
   *
   * @param ip - The IP address to validate
   * @returns true if IP is in the allowlist
   */
  private validateIp(ip: string): boolean {
    // Basic implementation: exact match only
    // For CIDR support, you would need to parse CIDR ranges and check if IP is within range
    return this.config.allowedIps.some((allowedIp) => {
      // Check for exact match
      if (allowedIp === ip) {
        return true;
      }

      // Basic CIDR support (simplified - for production use a proper library)
      if (allowedIp.includes('/')) {
        return this.isIpInCidr(ip, allowedIp);
      }

      return false;
    });
  }

  /**
   * Check if an IP address is within a CIDR range.
   *
   * This is a simplified implementation for IPv4.
   * For production use, consider using a proper IP library.
   *
   * @param ip - The IP address to check
   * @param cidr - The CIDR range (e.g., '192.168.1.0/24')
   * @returns true if IP is within the CIDR range
   */
  private isIpInCidr(ip: string, cidr: string): boolean {
    try {
      const [range, bits] = cidr.split('/');
      const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);

      const ipNum = this.ipToNumber(ip);
      const rangeNum = this.ipToNumber(range);

      return (ipNum & mask) === (rangeNum & mask);
    } catch {
      return false;
    }
  }

  /**
   * Convert an IPv4 address string to a number.
   *
   * @param ip - The IP address string (e.g., '192.168.1.1')
   * @returns The IP as a 32-bit number
   */
  private ipToNumber(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  }
}
