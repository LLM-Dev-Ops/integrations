/**
 * Tests for ListObjectsV2 XML parser
 */

import { parseListObjectsResponse } from '../list-objects';

describe('parseListObjectsResponse', () => {
  describe('happy path', () => {
    it('should parse response with single object', () => {
      const xml = `
        <ListBucketResult>
          <Name>my-bucket</Name>
          <IsTruncated>false</IsTruncated>
          <MaxKeys>1000</MaxKeys>
          <KeyCount>1</KeyCount>
          <Contents>
            <Key>file.txt</Key>
            <LastModified>2024-01-15T10:30:00.000Z</LastModified>
            <ETag>"abc123"</ETag>
            <Size>1024</Size>
            <StorageClass>STANDARD</StorageClass>
          </Contents>
        </ListBucketResult>
      `;

      const result = parseListObjectsResponse(xml);
      expect(result.name).toBe('my-bucket');
      expect(result.isTruncated).toBe(false);
      expect(result.maxKeys).toBe(1000);
      expect(result.keyCount).toBe(1);
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]).toMatchObject({
        key: 'file.txt',
        size: 1024,
        eTag: 'abc123', // Quotes removed
        storageClass: 'STANDARD',
      });
      expect(result.contents[0].lastModified).toBeInstanceOf(Date);
    });

    it('should parse response with multiple objects', () => {
      const xml = `
        <ListBucketResult>
          <Name>my-bucket</Name>
          <IsTruncated>false</IsTruncated>
          <MaxKeys>1000</MaxKeys>
          <KeyCount>2</KeyCount>
          <Contents>
            <Key>file1.txt</Key>
            <LastModified>2024-01-15T10:30:00.000Z</LastModified>
            <ETag>"abc123"</ETag>
            <Size>1024</Size>
            <StorageClass>STANDARD</StorageClass>
          </Contents>
          <Contents>
            <Key>file2.txt</Key>
            <LastModified>2024-01-15T10:31:00.000Z</LastModified>
            <ETag>"def456"</ETag>
            <Size>2048</Size>
            <StorageClass>INFREQUENT_ACCESS</StorageClass>
          </Contents>
        </ListBucketResult>
      `;

      const result = parseListObjectsResponse(xml);
      expect(result.contents).toHaveLength(2);
      expect(result.contents[0].key).toBe('file1.txt');
      expect(result.contents[1].key).toBe('file2.txt');
      expect(result.contents[1].storageClass).toBe('INFREQUENT_ACCESS');
    });

    it('should parse response with common prefixes', () => {
      const xml = `
        <ListBucketResult>
          <Name>my-bucket</Name>
          <Delimiter>/</Delimiter>
          <Prefix>documents/</Prefix>
          <IsTruncated>false</IsTruncated>
          <MaxKeys>1000</MaxKeys>
          <KeyCount>2</KeyCount>
          <CommonPrefixes>
            <Prefix>documents/2024/</Prefix>
          </CommonPrefixes>
          <CommonPrefixes>
            <Prefix>documents/archive/</Prefix>
          </CommonPrefixes>
        </ListBucketResult>
      `;

      const result = parseListObjectsResponse(xml);
      expect(result.delimiter).toBe('/');
      expect(result.prefix).toBe('documents/');
      expect(result.commonPrefixes).toHaveLength(2);
      expect(result.commonPrefixes[0].prefix).toBe('documents/2024/');
      expect(result.commonPrefixes[1].prefix).toBe('documents/archive/');
    });
  });

  describe('edge cases', () => {
    it('should handle empty results', () => {
      const xml = `
        <ListBucketResult>
          <Name>empty-bucket</Name>
          <IsTruncated>false</IsTruncated>
          <MaxKeys>1000</MaxKeys>
          <KeyCount>0</KeyCount>
        </ListBucketResult>
      `;

      const result = parseListObjectsResponse(xml);
      expect(result.contents).toEqual([]);
      expect(result.commonPrefixes).toEqual([]);
      expect(result.keyCount).toBe(0);
    });

    it('should handle truncated results with continuation token', () => {
      const xml = `
        <ListBucketResult>
          <Name>large-bucket</Name>
          <IsTruncated>true</IsTruncated>
          <MaxKeys>1000</MaxKeys>
          <KeyCount>1000</KeyCount>
          <ContinuationToken>token-abc</ContinuationToken>
          <NextContinuationToken>token-def</NextContinuationToken>
        </ListBucketResult>
      `;

      const result = parseListObjectsResponse(xml);
      expect(result.isTruncated).toBe(true);
      expect(result.continuationToken).toBe('token-abc');
      expect(result.nextContinuationToken).toBe('token-def');
    });

    it('should handle objects without optional fields', () => {
      const xml = `
        <ListBucketResult>
          <Name>my-bucket</Name>
          <IsTruncated>false</IsTruncated>
          <MaxKeys>1000</MaxKeys>
          <KeyCount>1</KeyCount>
          <Contents>
            <Key>file.txt</Key>
            <LastModified>2024-01-15T10:30:00.000Z</LastModified>
            <ETag>"abc123"</ETag>
            <Size>1024</Size>
          </Contents>
        </ListBucketResult>
      `;

      const result = parseListObjectsResponse(xml);
      expect(result.contents[0].storageClass).toBe('STANDARD'); // Default
      expect(result.contents[0].owner).toBeUndefined();
    });

    it('should handle object with owner information', () => {
      const xml = `
        <ListBucketResult>
          <Name>my-bucket</Name>
          <IsTruncated>false</IsTruncated>
          <MaxKeys>1000</MaxKeys>
          <KeyCount>1</KeyCount>
          <Contents>
            <Key>file.txt</Key>
            <LastModified>2024-01-15T10:30:00.000Z</LastModified>
            <ETag>"abc123"</ETag>
            <Size>1024</Size>
            <Owner>
              <ID>user123</ID>
              <DisplayName>John Doe</DisplayName>
            </Owner>
          </Contents>
        </ListBucketResult>
      `;

      const result = parseListObjectsResponse(xml);
      expect(result.contents[0].owner).toEqual({
        id: 'user123',
        displayName: 'John Doe',
      });
    });

    it('should handle single common prefix', () => {
      const xml = `
        <ListBucketResult>
          <Name>my-bucket</Name>
          <Delimiter>/</Delimiter>
          <IsTruncated>false</IsTruncated>
          <MaxKeys>1000</MaxKeys>
          <KeyCount>1</KeyCount>
          <CommonPrefixes>
            <Prefix>documents/</Prefix>
          </CommonPrefixes>
        </ListBucketResult>
      `;

      const result = parseListObjectsResponse(xml);
      expect(result.commonPrefixes).toHaveLength(1);
      expect(result.commonPrefixes[0].prefix).toBe('documents/');
    });
  });

  describe('error handling', () => {
    it('should throw on missing ListBucketResult element', () => {
      const xml = '<InvalidRoot></InvalidRoot>';
      expect(() => parseListObjectsResponse(xml)).toThrow(
        'Invalid ListObjectsV2 response: missing ListBucketResult element'
      );
    });

    it('should throw on malformed XML', () => {
      const xml = '<ListBucketResult><Unclosed>';
      expect(() => parseListObjectsResponse(xml)).toThrow(
        'Failed to parse ListObjectsV2 response'
      );
    });

    it('should throw on invalid date format', () => {
      const xml = `
        <ListBucketResult>
          <Name>my-bucket</Name>
          <IsTruncated>false</IsTruncated>
          <MaxKeys>1000</MaxKeys>
          <KeyCount>1</KeyCount>
          <Contents>
            <Key>file.txt</Key>
            <LastModified>invalid-date</LastModified>
            <ETag>"abc123"</ETag>
            <Size>1024</Size>
          </Contents>
        </ListBucketResult>
      `;

      expect(() => parseListObjectsResponse(xml)).toThrow();
    });
  });
});
