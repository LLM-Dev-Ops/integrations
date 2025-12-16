/**
 * XML parsing for S3/R2 error responses
 * @module @studiorack/cloudflare-r2/xml/error
 */

import { parseXml } from './parser.js';

/**
 * S3/R2 Error XML structure
 */
interface ErrorResponseXml {
  Error: {
    Code: string;
    Message: string;
    RequestId?: string;
    Resource?: string;
    HostId?: string;
  };
}

/**
 * Parsed error information from S3/R2 response
 */
export interface ParsedError {
  /**
   * Error code (e.g., 'NoSuchKey', 'AccessDenied')
   */
  readonly code: string;

  /**
   * Human-readable error message
   */
  readonly message: string;

  /**
   * Request ID for debugging
   */
  readonly requestId?: string;

  /**
   * Resource that caused the error
   */
  readonly resource?: string;

  /**
   * Host ID for debugging (S3-specific)
   */
  readonly hostId?: string;
}

/**
 * Checks if an XML string represents an S3/R2 error response
 *
 * @param xml - XML string to check
 * @returns True if the XML contains an Error element
 *
 * @example
 * ```typescript
 * const errorXml = '<Error><Code>NoSuchKey</Code><Message>Not found</Message></Error>';
 * isErrorResponse(errorXml); // true
 *
 * const successXml = '<ListBucketResult>...</ListBucketResult>';
 * isErrorResponse(successXml); // false
 * ```
 */
export function isErrorResponse(xml: string): boolean {
  try {
    // Quick check before parsing
    if (!xml.includes('<Error>')) {
      return false;
    }

    const parsed = parseXml<ErrorResponseXml>(xml);
    return parsed.Error !== undefined && parsed.Error.Code !== undefined;
  } catch {
    // If parsing fails, it's not a valid error response
    return false;
  }
}

/**
 * Parses S3/R2 error XML response into structured error information
 *
 * Common S3/R2 error codes:
 * - NoSuchKey: Object does not exist
 * - NoSuchBucket: Bucket does not exist
 * - AccessDenied: Insufficient permissions
 * - InvalidBucketName: Invalid bucket name format
 * - NoSuchUpload: Multipart upload does not exist
 * - EntityTooLarge: Object exceeds size limit
 * - InvalidArgument: Invalid parameter value
 *
 * @param xml - Raw XML error response string
 * @returns Parsed error information
 * @throws Error if XML is malformed or missing required fields
 *
 * @example
 * ```typescript
 * const errorXml = `
 *   <Error>
 *     <Code>NoSuchKey</Code>
 *     <Message>The specified key does not exist.</Message>
 *     <RequestId>4442587FB7D0A2F9</RequestId>
 *     <Resource>/mybucket/mykey</Resource>
 *   </Error>
 * `;
 *
 * const error = parseErrorResponse(errorXml);
 * console.log(error.code); // 'NoSuchKey'
 * console.log(error.message); // 'The specified key does not exist.'
 * console.log(error.requestId); // '4442587FB7D0A2F9'
 * ```
 */
export function parseErrorResponse(xml: string): ParsedError {
  try {
    const parsed = parseXml<ErrorResponseXml>(xml);

    if (!parsed.Error) {
      throw new Error('Invalid error response: missing Error element');
    }

    const error = parsed.Error;

    if (!error.Code) {
      throw new Error('Invalid error response: missing Code element');
    }

    if (!error.Message) {
      throw new Error('Invalid error response: missing Message element');
    }

    return {
      code: error.Code,
      message: error.Message,
      requestId: error.RequestId,
      resource: error.Resource,
      hostId: error.HostId,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse error response: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Creates a user-friendly error message from parsed error
 *
 * @param error - Parsed error information
 * @returns Formatted error message
 *
 * @example
 * ```typescript
 * const error = {
 *   code: 'NoSuchKey',
 *   message: 'The specified key does not exist.',
 *   requestId: '4442587FB7D0A2F9'
 * };
 *
 * formatErrorMessage(error);
 * // 'NoSuchKey: The specified key does not exist. (RequestId: 4442587FB7D0A2F9)'
 * ```
 */
export function formatErrorMessage(error: ParsedError): string {
  let message = `${error.code}: ${error.message}`;

  if (error.requestId) {
    message += ` (RequestId: ${error.requestId})`;
  }

  if (error.resource) {
    message += ` [Resource: ${error.resource}]`;
  }

  return message;
}
