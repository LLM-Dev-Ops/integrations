import { describe, it, expect } from 'vitest';
import {
  createPdfContent,
  createPdfContentFromBuffer,
  createPdfContentFromArrayBuffer,
  createPdfContentFromBytes,
  validatePdfBytes,
  validatePdfBase64,
  estimatePdfSize,
  isPdfWithinSizeLimit,
} from '../pdf-support.js';

describe('PDF Support', () => {
  // Valid PDF header: %PDF-
  const validPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const validPdfBase64 = Buffer.from(validPdfBytes).toString('base64');

  describe('createPdfContent', () => {
    it('should create PDF content from base64 string', () => {
      const content = createPdfContent(validPdfBase64);

      expect(content).toEqual({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: validPdfBase64,
        },
      });
    });

    it('should throw error for empty string', () => {
      expect(() => createPdfContent('')).toThrow('PDF base64 data cannot be empty');
    });

    it('should throw error for whitespace-only string', () => {
      expect(() => createPdfContent('   ')).toThrow('PDF base64 data cannot be empty');
    });

    it('should handle long base64 strings', () => {
      const longBase64 = 'a'.repeat(10000);
      const content = createPdfContent(longBase64);

      expect(content.source.data).toBe(longBase64);
    });
  });

  describe('createPdfContentFromBuffer', () => {
    it('should create PDF content from Buffer', () => {
      const buffer = Buffer.from(validPdfBytes);
      const content = createPdfContentFromBuffer(buffer);

      expect(content.type).toBe('document');
      expect(content.source.type).toBe('base64');
      expect(content.source.media_type).toBe('application/pdf');
      expect(content.source.data).toBe(validPdfBase64);
    });

    it('should throw error for empty buffer', () => {
      const buffer = Buffer.from([]);
      expect(() => createPdfContentFromBuffer(buffer)).toThrow('PDF buffer cannot be empty');
    });

    it('should handle large buffers', () => {
      const largeBuffer = Buffer.alloc(1024 * 1024); // 1MB
      const content = createPdfContentFromBuffer(largeBuffer);

      expect(content.source.data.length).toBeGreaterThan(0);
    });
  });

  describe('createPdfContentFromArrayBuffer', () => {
    it('should create PDF content from ArrayBuffer', () => {
      const arrayBuffer = validPdfBytes.buffer;
      const content = createPdfContentFromArrayBuffer(arrayBuffer);

      expect(content.type).toBe('document');
      expect(content.source.type).toBe('base64');
      expect(content.source.media_type).toBe('application/pdf');
    });

    it('should throw error for empty ArrayBuffer', () => {
      const arrayBuffer = new ArrayBuffer(0);
      expect(() => createPdfContentFromArrayBuffer(arrayBuffer)).toThrow('PDF ArrayBuffer cannot be empty');
    });

    it('should handle partial ArrayBuffer views', () => {
      const bytes = new Uint8Array(100);
      bytes.set(validPdfBytes, 0);
      const content = createPdfContentFromArrayBuffer(bytes.buffer);

      expect(content.source.data.length).toBeGreaterThan(0);
    });
  });

  describe('createPdfContentFromBytes', () => {
    it('should create PDF content from Uint8Array', () => {
      const content = createPdfContentFromBytes(validPdfBytes);

      expect(content.type).toBe('document');
      expect(content.source.type).toBe('base64');
      expect(content.source.media_type).toBe('application/pdf');
    });

    it('should throw error for empty Uint8Array', () => {
      const bytes = new Uint8Array(0);
      expect(() => createPdfContentFromBytes(bytes)).toThrow('PDF bytes cannot be empty');
    });

    it('should handle different byte arrays', () => {
      const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
      const content = createPdfContentFromBytes(bytes);

      expect(content.source.data.length).toBeGreaterThan(0);
    });
  });

  describe('validatePdfBytes', () => {
    it('should validate correct PDF header', () => {
      expect(validatePdfBytes(validPdfBytes)).toBe(true);
    });

    it('should reject incorrect magic bytes', () => {
      const invalidBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
      expect(validatePdfBytes(invalidBytes)).toBe(false);
    });

    it('should reject too short byte array', () => {
      const shortBytes = new Uint8Array([0x25, 0x50, 0x44]);
      expect(validatePdfBytes(shortBytes)).toBe(false);
    });

    it('should reject empty byte array', () => {
      const emptyBytes = new Uint8Array(0);
      expect(validatePdfBytes(emptyBytes)).toBe(false);
    });

    it('should validate PDF with different version numbers', () => {
      const pdf13 = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x33]);
      const pdf17 = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

      expect(validatePdfBytes(pdf13)).toBe(true);
      expect(validatePdfBytes(pdf17)).toBe(true);
    });

    it('should validate only the header, ignoring rest', () => {
      const pdfWithContent = new Uint8Array(1000);
      pdfWithContent.set([0x25, 0x50, 0x44, 0x46, 0x2d], 0);

      expect(validatePdfBytes(pdfWithContent)).toBe(true);
    });
  });

  describe('validatePdfBase64', () => {
    it('should validate correct PDF base64', () => {
      expect(validatePdfBase64(validPdfBase64)).toBe(true);
    });

    it('should reject invalid base64', () => {
      expect(validatePdfBase64('not-valid-base64!!!')).toBe(false);
    });

    it('should reject base64 with wrong magic bytes', () => {
      const wrongBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
      const wrongBase64 = Buffer.from(wrongBytes).toString('base64');

      expect(validatePdfBase64(wrongBase64)).toBe(false);
    });

    it('should reject empty base64', () => {
      const emptyBase64 = Buffer.from([]).toString('base64');
      expect(validatePdfBase64(emptyBase64)).toBe(false);
    });

    it('should handle base64 with padding', () => {
      const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
      const base64 = Buffer.from(bytes).toString('base64');

      expect(validatePdfBase64(base64)).toBe(true);
    });
  });

  describe('estimatePdfSize', () => {
    it('should estimate size from base64', () => {
      // Create a 1000 byte array
      const bytes = new Uint8Array(1000);
      const base64 = Buffer.from(bytes).toString('base64');

      const estimatedSize = estimatePdfSize(base64);

      // Should be close to 1000 bytes (within 10%)
      expect(estimatedSize).toBeGreaterThan(900);
      expect(estimatedSize).toBeLessThan(1100);
    });

    it('should return 0 for empty base64', () => {
      const emptyBase64 = '';
      const size = estimatePdfSize(emptyBase64);

      expect(size).toBe(0);
    });

    it('should handle small PDFs', () => {
      const smallBase64 = validPdfBase64;
      const size = estimatePdfSize(smallBase64);

      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThan(100);
    });

    it('should handle large PDFs', () => {
      // 1MB of data
      const largeBytes = new Uint8Array(1024 * 1024);
      const largeBase64 = Buffer.from(largeBytes).toString('base64');

      const size = estimatePdfSize(largeBase64);

      // Should be around 1MB
      expect(size).toBeGreaterThan(1000000);
      expect(size).toBeLessThan(1100000);
    });
  });

  describe('isPdfWithinSizeLimit', () => {
    it('should return true for small PDF', () => {
      const smallPdf = validPdfBase64;

      expect(isPdfWithinSizeLimit(smallPdf)).toBe(true);
    });

    it('should return false for PDF exceeding limit', () => {
      // Create a PDF larger than default 32MB
      const largeBytes = new Uint8Array(33 * 1024 * 1024);
      const largeBase64 = Buffer.from(largeBytes).toString('base64');

      expect(isPdfWithinSizeLimit(largeBase64)).toBe(false);
    });

    it('should respect custom size limit', () => {
      // 1KB PDF
      const bytes = new Uint8Array(1024);
      const base64 = Buffer.from(bytes).toString('base64');

      expect(isPdfWithinSizeLimit(base64, 2048)).toBe(true);
      expect(isPdfWithinSizeLimit(base64, 512)).toBe(false);
    });

    it('should handle exact size match', () => {
      const bytes = new Uint8Array(1000);
      const base64 = Buffer.from(bytes).toString('base64');
      const size = estimatePdfSize(base64);

      expect(isPdfWithinSizeLimit(base64, size)).toBe(true);
      expect(isPdfWithinSizeLimit(base64, size - 1)).toBe(false);
    });

    it('should use default 32MB limit', () => {
      // 31MB PDF
      const bytes = new Uint8Array(31 * 1024 * 1024);
      const base64 = Buffer.from(bytes).toString('base64');

      expect(isPdfWithinSizeLimit(base64)).toBe(true);
    });
  });
});
