# XML Parsing Utilities

XML parsing and building utilities for Cloudflare R2 Storage API responses. R2 uses S3-compatible XML format for all API operations.

## Overview

This module provides:

- **XML Parsers**: Convert S3/R2 XML responses to TypeScript objects
- **XML Builders**: Generate XML request bodies for S3/R2 operations
- **Edge Case Handling**: Handles single-vs-array, empty results, optional fields
- **Type Safety**: Full TypeScript support with strict typing

## Modules

### Core Parser (`parser.ts`)

Low-level XML parsing utilities using `fast-xml-parser`.

```typescript
import {
  parseXml,
  buildXml,
  normalizeArray,
  cleanETag,
  parseDate
} from './xml/parser';

// Parse XML to object
const result = parseXml<MyType>(xmlString);

// Build XML from object
const xml = buildXml({ Root: { Value: 'test' } });

// Normalize array (handles S3 single-vs-array behavior)
const items = normalizeArray(result.Items); // Always returns array

// Clean ETag (removes quotes)
const eTag = cleanETag('"abc123"'); // 'abc123'

// Parse date
const date = parseDate('2024-01-15T10:30:00.000Z');
```

### List Objects (`list-objects.ts`)

Parse `ListObjectsV2` API responses.

```typescript
import { parseListObjectsResponse } from './xml/list-objects';

const xml = `
  <ListBucketResult>
    <Name>my-bucket</Name>
    <IsTruncated>false</IsTruncated>
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
// {
//   isTruncated: false,
//   contents: [{ key: 'file.txt', size: 1024, ... }],
//   commonPrefixes: [],
//   name: 'my-bucket',
//   ...
// }
```

**Edge Cases Handled:**
- Single object vs array of objects
- Empty results (no Contents)
- Optional fields (Prefix, Delimiter, etc.)
- Date parsing (ISO 8601)
- ETag cleanup (removes quotes)

### Error Parser (`error.ts`)

Parse S3/R2 error responses.

```typescript
import {
  parseErrorResponse,
  isErrorResponse,
  formatErrorMessage
} from './xml/error';

const errorXml = `
  <Error>
    <Code>NoSuchKey</Code>
    <Message>The specified key does not exist.</Message>
    <RequestId>4442587FB7D0A2F9</RequestId>
  </Error>
`;

// Check if response is an error
if (isErrorResponse(xmlString)) {
  const error = parseErrorResponse(xmlString);
  // { code: 'NoSuchKey', message: '...', requestId: '...' }

  console.error(formatErrorMessage(error));
  // 'NoSuchKey: The specified key does not exist. (RequestId: 4442587FB7D0A2F9)'
}
```

**Common Error Codes:**
- `NoSuchKey`: Object does not exist
- `NoSuchBucket`: Bucket does not exist
- `AccessDenied`: Insufficient permissions
- `InvalidBucketName`: Invalid bucket name
- `NoSuchUpload`: Multipart upload does not exist
- `EntityTooLarge`: Object exceeds size limit

### Multipart Upload (`multipart.ts`)

Parse multipart upload operation responses.

```typescript
import {
  parseInitiateMultipartResponse,
  parseCompleteMultipartResponse,
  parseListPartsResponse
} from './xml/multipart';

// Initiate multipart upload
const initXml = `<InitiateMultipartUploadResult>...</InitiateMultipartUploadResult>`;
const { uploadId } = parseInitiateMultipartResponse(initXml);

// Complete multipart upload
const completeXml = `<CompleteMultipartUploadResult>...</CompleteMultipartUploadResult>`;
const { eTag, location } = parseCompleteMultipartResponse(completeXml);

// List parts
const listXml = `<ListPartsResult>...</ListPartsResult>`;
const { parts } = parseListPartsResponse(listXml);
```

### Copy Object (`copy.ts`)

Parse copy object responses.

```typescript
import { parseCopyObjectResponse } from './xml/copy';

const xml = `
  <CopyObjectResult>
    <ETag>"abc123"</ETag>
    <LastModified>2024-01-15T10:30:00.000Z</LastModified>
  </CopyObjectResult>
`;

const { eTag, lastModified } = parseCopyObjectResponse(xml);
```

### Delete Objects (`delete.ts`)

Parse batch delete responses.

```typescript
import { parseDeleteObjectsResponse } from './xml/delete';

const xml = `
  <DeleteResult>
    <Deleted>
      <Key>file1.txt</Key>
    </Deleted>
    <Error>
      <Key>file2.txt</Key>
      <Code>AccessDenied</Code>
      <Message>Access Denied</Message>
    </Error>
  </DeleteResult>
`;

const { deleted, errors } = parseDeleteObjectsResponse(xml);
// deleted: [{ key: 'file1.txt' }]
// errors: [{ key: 'file2.txt', code: 'AccessDenied', ... }]
```

**Edge Cases Handled:**
- Single vs multiple deleted objects
- Single vs multiple errors
- All succeeded (no errors)
- All failed (no deleted)

### XML Builders (`builders.ts`)

Build XML request bodies.

```typescript
import {
  buildDeleteObjectsXml,
  buildCompleteMultipartXml,
  buildTaggingXml,
  escapeXml,
  validateObjectKey
} from './xml/builders';

// Delete objects request
const deleteXml = buildDeleteObjectsXml([
  { key: 'file1.txt' },
  { key: 'file2.txt', versionId: 'v123' }
], false); // quiet mode

// Complete multipart upload request
const completeXml = buildCompleteMultipartXml([
  { partNumber: 1, eTag: 'abc123' },
  { partNumber: 2, eTag: 'def456' }
]);

// Tagging request
const taggingXml = buildTaggingXml({
  Environment: 'production',
  Project: 'web-app'
});

// Escape XML characters
const safe = escapeXml('Hello & "World"'); // 'Hello &amp; &quot;World&quot;'

// Validate object key
validateObjectKey('valid/path/file.txt'); // OK
validateObjectKey(''); // Throws error
```

## S3 XML Quirks

### Single vs Array Behavior

S3/R2 returns a single object when there's only one item, but an array when there are multiple:

```xml
<!-- Single item (object) -->
<ListBucketResult>
  <Contents>
    <Key>file.txt</Key>
  </Contents>
</ListBucketResult>

<!-- Multiple items (array) -->
<ListBucketResult>
  <Contents>
    <Key>file1.txt</Key>
  </Contents>
  <Contents>
    <Key>file2.txt</Key>
  </Contents>
</ListBucketResult>
```

Solution: Use `normalizeArray()` helper:
```typescript
const items = normalizeArray(result.Contents); // Always array
```

### ETag Quotes

S3/R2 returns ETags wrapped in double quotes:

```xml
<ETag>"abc123def456"</ETag>
```

Solution: Use `cleanETag()` helper:
```typescript
const eTag = cleanETag(xmlETag); // Removes quotes
```

### Date Format

S3/R2 uses ISO 8601 format:

```xml
<LastModified>2024-01-15T10:30:00.000Z</LastModified>
```

Solution: Use `parseDate()` helper:
```typescript
const date = parseDate(xmlDate); // Date object
```

### Boolean Values

S3/R2 uses string 'true'/'false':

```xml
<IsTruncated>true</IsTruncated>
```

Solution: Use `parseBooleanSafe()` helper:
```typescript
const bool = parseBooleanSafe(xmlBool, false); // boolean
```

## Error Handling

All parsers throw descriptive errors:

```typescript
try {
  const result = parseListObjectsResponse(xml);
} catch (error) {
  console.error(error.message);
  // 'Failed to parse ListObjectsV2 response: Invalid date string'
}
```

Common errors:
- Malformed XML
- Missing required elements
- Invalid date/number format
- Empty arrays where required

## Testing

Test files should validate:

1. **Happy path**: Valid XML with all fields
2. **Single vs array**: Single item behavior
3. **Empty results**: No contents/parts/errors
4. **Optional fields**: Missing optional elements
5. **Edge cases**: Quotes in ETags, date formats
6. **Error cases**: Malformed XML, missing required fields

Example test:

```typescript
describe('parseListObjectsResponse', () => {
  it('handles single object', () => {
    const xml = `
      <ListBucketResult>
        <Name>bucket</Name>
        <Contents>
          <Key>file.txt</Key>
          <Size>1024</Size>
          <ETag>"abc123"</ETag>
          <LastModified>2024-01-15T10:30:00.000Z</LastModified>
        </Contents>
      </ListBucketResult>
    `;

    const result = parseListObjectsResponse(xml);
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].key).toBe('file.txt');
    expect(result.contents[0].eTag).toBe('abc123'); // Quotes removed
  });
});
```

## Dependencies

- `fast-xml-parser`: Fast, lightweight XML parser
  - Version: ^4.3.4
  - No native dependencies
  - Full TypeScript support

## Best Practices

1. **Always use type-safe parsers**: Don't parse XML directly
2. **Handle arrays properly**: Use `normalizeArray()`
3. **Clean ETags**: Use `cleanETag()`
4. **Validate inputs**: Use validation helpers
5. **Proper error handling**: Catch and handle parse errors
6. **Test edge cases**: Single items, empty results, optional fields

## References

- [S3 API Reference](https://docs.aws.amazon.com/AmazonS3/latest/API/)
- [R2 Documentation](https://developers.cloudflare.com/r2/)
- [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser)
