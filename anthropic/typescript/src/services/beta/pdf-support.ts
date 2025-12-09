import type { DocumentContent, PdfSource } from './types.js';

/**
 * Creates PDF content from a base64-encoded string
 * @param pdfBase64 - Base64-encoded PDF data
 * @returns DocumentContent object for use in messages
 */
export function createPdfContent(pdfBase64: string): DocumentContent {
  if (!pdfBase64 || pdfBase64.trim().length === 0) {
    throw new Error('PDF base64 data cannot be empty');
  }

  return {
    type: 'document',
    source: {
      type: 'base64',
      media_type: 'application/pdf',
      data: pdfBase64,
    },
  };
}

/**
 * Creates PDF content from a Node.js Buffer
 * @param buffer - Buffer containing PDF data
 * @returns DocumentContent object for use in messages
 */
export function createPdfContentFromBuffer(buffer: Buffer): DocumentContent {
  if (!buffer || buffer.length === 0) {
    throw new Error('PDF buffer cannot be empty');
  }

  return createPdfContent(buffer.toString('base64'));
}

/**
 * Creates PDF content from an ArrayBuffer
 * @param arrayBuffer - ArrayBuffer containing PDF data
 * @returns DocumentContent object for use in messages
 */
export function createPdfContentFromArrayBuffer(arrayBuffer: ArrayBuffer | SharedArrayBuffer): DocumentContent {
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error('PDF ArrayBuffer cannot be empty');
  }

  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  // Use btoa if available (browser), otherwise use Buffer (Node.js)
  const base64 = typeof btoa !== 'undefined'
    ? btoa(binary)
    : Buffer.from(bytes).toString('base64');

  return createPdfContent(base64);
}

/**
 * Creates PDF content from a Uint8Array
 * @param bytes - Uint8Array containing PDF data
 * @returns DocumentContent object for use in messages
 */
export function createPdfContentFromBytes(bytes: Uint8Array): DocumentContent {
  if (!bytes || bytes.length === 0) {
    throw new Error('PDF bytes cannot be empty');
  }

  return createPdfContentFromArrayBuffer(bytes.buffer as ArrayBuffer);
}

/**
 * Validates that a Uint8Array contains PDF data
 * PDF files start with the magic bytes "%PDF-"
 * @param bytes - Uint8Array to validate
 * @returns True if the bytes appear to be a valid PDF
 */
export function validatePdfBytes(bytes: Uint8Array): boolean {
  // PDF files start with "%PDF-"
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d    // -
  );
}

/**
 * Validates base64-encoded PDF data
 * @param base64 - Base64-encoded string to validate
 * @returns True if the decoded data appears to be a valid PDF
 */
export function validatePdfBase64(base64: string): boolean {
  try {
    // Decode base64 to check magic bytes
    const binary = typeof atob !== 'undefined'
      ? atob(base64)
      : Buffer.from(base64, 'base64').toString('binary');

    if (binary.length < 5) return false;

    return (
      binary.charCodeAt(0) === 0x25 && // %
      binary.charCodeAt(1) === 0x50 && // P
      binary.charCodeAt(2) === 0x44 && // D
      binary.charCodeAt(3) === 0x46 && // F
      binary.charCodeAt(4) === 0x2d    // -
    );
  } catch {
    return false;
  }
}

/**
 * Estimates the size of a PDF in bytes from base64 data
 * @param base64 - Base64-encoded PDF data
 * @returns Approximate size in bytes
 */
export function estimatePdfSize(base64: string): number {
  // Base64 encoding increases size by ~33%, so divide by 1.33 to get original size
  return Math.ceil((base64.length * 3) / 4);
}

/**
 * Checks if a PDF exceeds the maximum size limit
 * Anthropic's API has size limits for document uploads
 * @param base64 - Base64-encoded PDF data
 * @param maxBytes - Maximum allowed size in bytes (default: 32MB)
 * @returns True if the PDF is within size limits
 */
export function isPdfWithinSizeLimit(base64: string, maxBytes: number = 32 * 1024 * 1024): boolean {
  return estimatePdfSize(base64) <= maxBytes;
}
