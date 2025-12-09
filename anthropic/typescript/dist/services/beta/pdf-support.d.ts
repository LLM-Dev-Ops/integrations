import type { DocumentContent } from './types.js';
/**
 * Creates PDF content from a base64-encoded string
 * @param pdfBase64 - Base64-encoded PDF data
 * @returns DocumentContent object for use in messages
 */
export declare function createPdfContent(pdfBase64: string): DocumentContent;
/**
 * Creates PDF content from a Node.js Buffer
 * @param buffer - Buffer containing PDF data
 * @returns DocumentContent object for use in messages
 */
export declare function createPdfContentFromBuffer(buffer: Buffer): DocumentContent;
/**
 * Creates PDF content from an ArrayBuffer
 * @param arrayBuffer - ArrayBuffer containing PDF data
 * @returns DocumentContent object for use in messages
 */
export declare function createPdfContentFromArrayBuffer(arrayBuffer: ArrayBuffer): DocumentContent;
/**
 * Creates PDF content from a Uint8Array
 * @param bytes - Uint8Array containing PDF data
 * @returns DocumentContent object for use in messages
 */
export declare function createPdfContentFromBytes(bytes: Uint8Array): DocumentContent;
/**
 * Validates that a Uint8Array contains PDF data
 * PDF files start with the magic bytes "%PDF-"
 * @param bytes - Uint8Array to validate
 * @returns True if the bytes appear to be a valid PDF
 */
export declare function validatePdfBytes(bytes: Uint8Array): boolean;
/**
 * Validates base64-encoded PDF data
 * @param base64 - Base64-encoded string to validate
 * @returns True if the decoded data appears to be a valid PDF
 */
export declare function validatePdfBase64(base64: string): boolean;
/**
 * Estimates the size of a PDF in bytes from base64 data
 * @param base64 - Base64-encoded PDF data
 * @returns Approximate size in bytes
 */
export declare function estimatePdfSize(base64: string): number;
/**
 * Checks if a PDF exceeds the maximum size limit
 * Anthropic's API has size limits for document uploads
 * @param base64 - Base64-encoded PDF data
 * @param maxBytes - Maximum allowed size in bytes (default: 32MB)
 * @returns True if the PDF is within size limits
 */
export declare function isPdfWithinSizeLimit(base64: string, maxBytes?: number): boolean;
//# sourceMappingURL=pdf-support.d.ts.map