# XML Utilities Quick Reference

## Import

```typescript
import {
  // Parsers
  parseListObjectsResponse,
  parseErrorResponse,
  parseInitiateMultipartResponse,
  parseCompleteMultipartResponse,
  parseListPartsResponse,
  parseCopyObjectResponse,
  parseDeleteObjectsResponse,

  // Builders
  buildDeleteObjectsXml,
  buildCompleteMultipartXml,
  buildTaggingXml,

  // Utilities
  isErrorResponse,
  formatErrorMessage,
  cleanETag,
  parseDate,
  normalizeArray,
  escapeXml,
  validateObjectKey,
} from '@studiorack/cloudflare-r2/xml';
```

## Common Patterns

### Parse Response with Error Handling

```typescript
async function fetchAndParse(url: string): Promise<ListObjectsOutput> {
  const response = await fetch(url);
  const xml = await response.text();

  // Check for errors first
  if (isErrorResponse(xml)) {
    const error = parseErrorResponse(xml);
    throw new Error(`R2 Error ${error.code}: ${error.message}`);
  }

  // Parse success response
  return parseListObjectsResponse(xml);
}
```

### List Objects

```typescript
const xml = await r2.listObjects('my-bucket');
const result = parseListObjectsResponse(xml);

// Access results
result.contents.forEach(obj => {
  console.log(`${obj.key}: ${obj.size} bytes`);
});

// Handle pagination
if (result.isTruncated) {
  const nextXml = await r2.listObjects('my-bucket', {
    continuationToken: result.nextContinuationToken
  });
}
```

### Delete Multiple Objects

```typescript
const deleteXml = buildDeleteObjectsXml([
  { key: 'file1.txt' },
  { key: 'file2.txt' },
  { key: 'old/file.txt', versionId: 'v123' }
], false); // quiet = false (return all results)

const response = await r2.deleteObjects('my-bucket', deleteXml);
const result = parseDeleteObjectsResponse(response);

console.log(`Deleted: ${result.deleted.length}`);
console.log(`Errors: ${result.errors.length}`);

result.errors.forEach(err => {
  console.error(`Failed to delete ${err.key}: ${err.code}`);
});
```

### Multipart Upload

```typescript
// 1. Initiate
const initiateXml = await r2.initiateMultipart('bucket', 'large-file.bin');
const { uploadId } = parseInitiateMultipartResponse(initiateXml);

// 2. Upload parts (parallel)
const parts = await Promise.all([
  uploadPart(uploadId, 1, chunk1),
  uploadPart(uploadId, 2, chunk2),
  uploadPart(uploadId, 3, chunk3),
]);

// 3. Complete
const completeXml = buildCompleteMultipartXml(parts);
const response = await r2.completeMultipart('bucket', 'large-file.bin', uploadId, completeXml);
const { eTag, location } = parseCompleteMultipartResponse(response);

console.log(`Upload complete: ${location}`);
```

### Copy Object

```typescript
const xml = await r2.copyObject({
  sourceBucket: 'bucket-a',
  sourceKey: 'file.txt',
  destinationBucket: 'bucket-b',
  destinationKey: 'copy.txt'
});

const { eTag, lastModified } = parseCopyObjectResponse(xml);
console.log(`Copied with ETag: ${eTag}`);
```

### List Parts

```typescript
const xml = await r2.listParts('bucket', 'large-file.bin', uploadId);
const { parts, isTruncated } = parseListPartsResponse(xml);

parts.forEach(part => {
  console.log(`Part ${part.partNumber}: ${part.size} bytes, ETag: ${part.eTag}`);
});
```

## Utilities

### Clean ETag

```typescript
const rawETag = '"abc123def456"';
const cleanedETag = cleanETag(rawETag); // 'abc123def456'
```

### Normalize Array

```typescript
// S3 returns single object when one item, array when multiple
const contents = normalizeArray(xmlResult.Contents);
// Always returns array, even if 0 or 1 items
```

### Parse Date

```typescript
const date = parseDate('2024-01-15T10:30:00.000Z');
console.log(date.toLocaleDateString());
```

### Validate Object Key

```typescript
try {
  validateObjectKey('valid/path/file.txt'); // OK
  validateObjectKey(''); // Throws
} catch (error) {
  console.error('Invalid key:', error.message);
}
```

### Escape XML

```typescript
const safe = escapeXml('Hello & "World"');
// 'Hello &amp; &quot;World&quot;'
```

## Error Codes

Common S3/R2 error codes:

| Code | Description |
|------|-------------|
| `NoSuchKey` | Object does not exist |
| `NoSuchBucket` | Bucket does not exist |
| `AccessDenied` | Insufficient permissions |
| `InvalidBucketName` | Invalid bucket name format |
| `NoSuchUpload` | Multipart upload does not exist |
| `EntityTooLarge` | Object exceeds size limit |
| `InvalidArgument` | Invalid parameter value |
| `BucketAlreadyExists` | Bucket name already taken |
| `BucketNotEmpty` | Cannot delete non-empty bucket |
| `InvalidPart` | Invalid part in multipart upload |
| `InvalidPartOrder` | Parts not in ascending order |

## Type Exports

```typescript
import type {
  ListObjectsOutput,
  R2Object,
  CommonPrefix,
  CreateMultipartOutput,
  CompleteMultipartOutput,
  ListPartsOutput,
  Part,
  CopyObjectOutput,
  DeleteObjectsOutput,
  DeletedObject,
  DeleteError,
  ObjectIdentifier,
  CompletedPart,
} from '@studiorack/cloudflare-r2/types';
```

## Best Practices

1. **Always check for errors first**:
   ```typescript
   if (isErrorResponse(xml)) {
     throw parseErrorResponse(xml);
   }
   ```

2. **Use normalizeArray for S3 quirks**:
   ```typescript
   const items = normalizeArray(result.Contents);
   ```

3. **Clean ETags**:
   ```typescript
   const eTag = cleanETag(xmlETag);
   ```

4. **Validate inputs**:
   ```typescript
   validateObjectKey(key);
   ```

5. **Handle pagination**:
   ```typescript
   while (result.isTruncated) {
     result = await fetchNext(result.nextContinuationToken);
   }
   ```

6. **Proper error handling**:
   ```typescript
   try {
     const result = parseListObjectsResponse(xml);
   } catch (error) {
     console.error('Parse error:', error.message);
   }
   ```

## Testing

```typescript
import {
  parseListObjectsResponse,
  buildDeleteObjectsXml
} from '@studiorack/cloudflare-r2/xml';

describe('My integration', () => {
  it('should parse list response', () => {
    const xml = `<ListBucketResult>...</ListBucketResult>`;
    const result = parseListObjectsResponse(xml);
    expect(result.contents).toHaveLength(1);
  });

  it('should build delete request', () => {
    const xml = buildDeleteObjectsXml([{ key: 'test.txt' }]);
    expect(xml).toContain('<Key>test.txt</Key>');
  });
});
```

## Performance Tips

- Parsers are optimized for speed
- No unnecessary transformations
- Minimal memory overhead
- Stream large responses when possible

## Troubleshooting

### "Invalid date string"
- S3 returns ISO 8601 format
- Check date format in XML

### "missing ListBucketResult element"
- Check XML structure
- Verify response is not an error

### Single object not returned as array
- Use `normalizeArray()` helper
- Never assume array structure

### ETags have quotes
- Use `cleanETag()` helper
- S3 always wraps ETags in quotes
