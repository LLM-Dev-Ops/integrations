# Cloudflare R2 Storage Integration

A production-ready TypeScript client for [Cloudflare R2](https://www.cloudflare.com/products/r2/) object storage, providing an S3-compatible API with advanced features for the LLM Dev Ops platform.

## Features

- **Complete Object Lifecycle Management**: PUT, GET, DELETE, HEAD, LIST, and COPY operations
- **Multipart Uploads**: Automatic chunking for large files with configurable concurrency
- **Presigned URLs**: Generate time-limited signed URLs for GET and PUT operations
- **S3 Signature V4 Authentication**: Full-featured AWS signature implementation
- **Resilience Patterns**: Built-in retry logic, circuit breakers, and timeout handling
- **Comprehensive Error Handling**: Typed errors with detailed context and retry information
- **Mock Client**: Full-featured mock implementation for testing
- **TypeScript Native**: Complete type safety with detailed type definitions
- **ESM Support**: Modern ES modules with tree-shaking support

## Installation

```bash
npm install @llm-devops/cloudflare-r2
```

### Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.3.3 (for TypeScript projects)

## Quick Start

### Basic Usage

```typescript
import { createClient } from '@llm-devops/cloudflare-r2';

// Create client from configuration
const client = createClient({
  accountId: 'your-account-id',
  accessKeyId: 'your-access-key-id',
  secretAccessKey: 'your-secret-access-key'
});

// Upload an object
await client.objects.put('my-bucket', 'documents/file.txt', 'Hello, World!', {
  contentType: 'text/plain',
  metadata: { author: 'John Doe' }
});

// Download an object
const result = await client.objects.get('my-bucket', 'documents/file.txt');
console.log(result.body); // 'Hello, World!'
console.log(result.metadata); // { author: 'John Doe' }

// List objects
const list = await client.objects.list('my-bucket', {
  prefix: 'documents/',
  maxKeys: 100
});
console.log(list.objects.map(obj => obj.key));

// Delete an object
await client.objects.delete('my-bucket', 'documents/file.txt');

// Clean up
await client.close();
```

### Using Environment Variables

```typescript
import { createClientFromEnv } from '@llm-devops/cloudflare-r2';

// Reads from R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
const client = createClientFromEnv();
```

### Configuration Builder

```typescript
import { R2ConfigBuilder } from '@llm-devops/cloudflare-r2';

const config = new R2ConfigBuilder()
  .accountId('your-account-id')
  .credentials('access-key-id', 'secret-access-key')
  .timeout(30000)
  .multipartThreshold(10 * 1024 * 1024) // 10 MB
  .multipartPartSize(5 * 1024 * 1024)   // 5 MB
  .multipartConcurrency(4)
  .retry({
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
  })
  .build();

const client = createClient(config);
```

## API Reference

### Client Creation

#### `createClient(config: R2Config): R2Client`

Creates a new R2 client with the specified configuration.

```typescript
const client = createClient({
  accountId: 'your-account-id',
  accessKeyId: 'your-access-key-id',
  secretAccessKey: 'your-secret-access-key',
  timeout: 30000,
  multipartThreshold: 10 * 1024 * 1024
});
```

#### `createClientFromEnv(): R2Client`

Creates a client using environment variables:

- `R2_ACCOUNT_ID` or `CLOUDFLARE_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID` or `AWS_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY` or `AWS_SECRET_ACCESS_KEY`

```typescript
const client = createClientFromEnv();
```

#### `createMockClient(): R2Client`

Creates a mock client for testing. The mock client implements the full R2Client interface with in-memory storage.

```typescript
const mockClient = createMockClient();
```

### Object Operations

#### `put(bucket: string, key: string, body: BodyData, options?: PutObjectRequest): Promise<PutObjectOutput>`

Upload an object to R2.

```typescript
// Upload string content
await client.objects.put('my-bucket', 'file.txt', 'Hello, World!', {
  contentType: 'text/plain',
  metadata: { version: '1.0' },
  tags: { environment: 'production' }
});

// Upload Buffer
const buffer = Buffer.from('binary data');
await client.objects.put('my-bucket', 'image.png', buffer, {
  contentType: 'image/png'
});

// Upload with custom headers
await client.objects.put('my-bucket', 'doc.pdf', pdfData, {
  contentType: 'application/pdf',
  contentDisposition: 'attachment; filename="document.pdf"',
  cacheControl: 'max-age=3600'
});
```

#### `get(bucket: string, key: string, options?: GetObjectRequest): Promise<GetObjectOutput>`

Download an object from R2.

```typescript
const result = await client.objects.get('my-bucket', 'file.txt');
console.log(result.body);           // Object content
console.log(result.contentType);    // 'text/plain'
console.log(result.metadata);       // { version: '1.0' }
console.log(result.etag);           // '"abc123..."'
console.log(result.contentLength);  // 13

// Get specific byte range
const partial = await client.objects.get('my-bucket', 'large-file.bin', {
  range: 'bytes=0-1023'  // First 1024 bytes
});
```

#### `getStream(bucket: string, key: string, options?: GetObjectRequest): Promise<GetObjectStreamOutput>`

Download an object as a readable stream (for large files).

```typescript
const result = await client.objects.getStream('my-bucket', 'large-file.mp4');
const writeStream = fs.createWriteStream('output.mp4');
result.body.pipe(writeStream);
```

#### `delete(bucket: string, key: string, options?: DeleteObjectRequest): Promise<DeleteObjectOutput>`

Delete an object from R2.

```typescript
await client.objects.delete('my-bucket', 'file.txt');
```

#### `deleteMultiple(bucket: string, keys: string[], options?: DeleteObjectsRequest): Promise<DeleteObjectsOutput>`

Delete multiple objects in a single request.

```typescript
const result = await client.objects.deleteMultiple('my-bucket', [
  'file1.txt',
  'file2.txt',
  'documents/file3.pdf'
]);

console.log(result.deleted); // Successfully deleted objects
console.log(result.errors);  // Objects that failed to delete
```

#### `head(bucket: string, key: string, options?: HeadObjectRequest): Promise<HeadObjectOutput>`

Get object metadata without downloading the content.

```typescript
const metadata = await client.objects.head('my-bucket', 'file.txt');
console.log(metadata.contentType);
console.log(metadata.contentLength);
console.log(metadata.lastModified);
console.log(metadata.etag);
console.log(metadata.metadata);
```

#### `copy(sourceBucket: string, sourceKey: string, destBucket: string, destKey: string, options?: CopyObjectRequest): Promise<CopyObjectOutput>`

Copy an object within R2.

```typescript
await client.objects.copy(
  'source-bucket',
  'source/file.txt',
  'dest-bucket',
  'dest/file.txt',
  {
    metadata: { copied: 'true' },
    metadataDirective: 'REPLACE'  // Override metadata
  }
);
```

#### `list(bucket: string, options?: ListObjectsRequest): Promise<ListObjectsOutput>`

List objects in a bucket.

```typescript
const result = await client.objects.list('my-bucket', {
  prefix: 'documents/',
  maxKeys: 100,
  delimiter: '/'
});

console.log(result.objects);        // Array of R2Object
console.log(result.commonPrefixes); // Common prefixes (folders)
console.log(result.isTruncated);    // More results available?
console.log(result.nextMarker);     // Pagination token

// Paginate through all objects
let marker: string | undefined;
do {
  const page = await client.objects.list('my-bucket', {
    prefix: 'large-dataset/',
    maxKeys: 1000,
    marker
  });

  for (const obj of page.objects) {
    console.log(obj.key, obj.size, obj.lastModified);
  }

  marker = page.nextMarker;
} while (marker);
```

### Multipart Upload Operations

#### `createMultipart(bucket: string, key: string, options?: CreateMultipartRequest): Promise<CreateMultipartOutput>`

Initiate a multipart upload.

```typescript
const upload = await client.multipart.createMultipart('my-bucket', 'large-file.bin', {
  contentType: 'application/octet-stream',
  metadata: { size: 'large' }
});
console.log(upload.uploadId);
```

#### `uploadPart(bucket: string, key: string, uploadId: string, partNumber: number, body: BodyData, options?: UploadPartRequest): Promise<UploadPartOutput>`

Upload a part of a multipart upload.

```typescript
const part1 = await client.multipart.uploadPart(
  'my-bucket',
  'large-file.bin',
  uploadId,
  1,
  partData1
);
console.log(part1.etag); // Save for completion
```

#### `completeMultipart(bucket: string, key: string, uploadId: string, parts: CompletedPart[], options?: CompleteMultipartRequest): Promise<CompleteMultipartOutput>`

Complete a multipart upload.

```typescript
await client.multipart.completeMultipart(
  'my-bucket',
  'large-file.bin',
  uploadId,
  [
    { partNumber: 1, etag: part1.etag },
    { partNumber: 2, etag: part2.etag }
  ]
);
```

#### `abortMultipart(bucket: string, key: string, uploadId: string, options?: AbortMultipartRequest): Promise<AbortMultipartOutput>`

Abort a multipart upload.

```typescript
await client.multipart.abortMultipart('my-bucket', 'large-file.bin', uploadId);
```

#### Example: Complete Multipart Upload

```typescript
const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
const fileData = fs.readFileSync('large-file.bin');

// Initiate upload
const upload = await client.multipart.createMultipart('my-bucket', 'large-file.bin');

// Upload parts
const parts: CompletedPart[] = [];
for (let i = 0; i < fileData.length; i += CHUNK_SIZE) {
  const partNumber = Math.floor(i / CHUNK_SIZE) + 1;
  const chunk = fileData.slice(i, i + CHUNK_SIZE);

  const result = await client.multipart.uploadPart(
    'my-bucket',
    'large-file.bin',
    upload.uploadId,
    partNumber,
    chunk
  );

  parts.push({ partNumber, etag: result.etag });
}

// Complete upload
await client.multipart.completeMultipart(
  'my-bucket',
  'large-file.bin',
  upload.uploadId,
  parts
);
```

### Presigned URL Operations

#### `getUrl(bucket: string, key: string, expiresIn: number, options?: PresignGetRequest): Promise<PresignedUrl>`

Generate a presigned URL for downloading an object.

```typescript
const url = await client.presign.getUrl('my-bucket', 'file.txt', 3600); // 1 hour
console.log(url.url);       // https://...
console.log(url.expiresAt); // Expiration timestamp

// Share the URL - no authentication required
const response = await fetch(url.url);
const content = await response.text();
```

#### `putUrl(bucket: string, key: string, expiresIn: number, options?: PresignPutRequest): Promise<PresignedUrl>`

Generate a presigned URL for uploading an object.

```typescript
const url = await client.presign.putUrl('my-bucket', 'upload.txt', 3600, {
  contentType: 'text/plain'
});

// Client can upload directly
await fetch(url.url, {
  method: 'PUT',
  headers: { 'Content-Type': 'text/plain' },
  body: 'Upload content'
});
```

### Client Lifecycle

#### `close(): Promise<void>`

Close the client and release all resources.

```typescript
await client.close();
```

## Configuration Options

### R2Config

```typescript
interface R2Config {
  // Required
  accountId: string;              // Cloudflare account ID
  accessKeyId: string;            // R2 access key ID
  secretAccessKey: string;        // R2 secret access key

  // Optional
  endpoint?: string;              // Custom endpoint (default: auto)
  region?: string;                // Region (default: 'auto')
  timeout?: number;               // Request timeout in ms (default: 30000)

  // Multipart settings
  multipartThreshold?: number;    // Size threshold for multipart (default: 10 MB)
  multipartPartSize?: number;     // Part size for multipart (default: 5 MB)
  multipartConcurrency?: number;  // Concurrent parts (default: 4)

  // Resilience
  retry?: R2RetryConfig;
  circuitBreaker?: R2CircuitBreakerConfig;

  // Testing
  simulation?: R2SimulationConfig;
}
```

### Retry Configuration

```typescript
interface R2RetryConfig {
  maxAttempts: number;           // Maximum retry attempts (default: 3)
  initialDelay: number;          // Initial delay in ms (default: 1000)
  maxDelay: number;              // Maximum delay in ms (default: 30000)
  backoffMultiplier: number;     // Backoff multiplier (default: 2)
  jitter: boolean;               // Add random jitter (default: true)
}
```

Default retry configuration:
```typescript
const DEFAULT_RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true
};
```

### Circuit Breaker Configuration

```typescript
interface R2CircuitBreakerConfig {
  failureThreshold: number;      // Failures before opening (default: 5)
  successThreshold: number;      // Successes to close (default: 2)
  timeout: number;               // Half-open timeout in ms (default: 60000)
  monitoringPeriod: number;      // Monitoring window in ms (default: 60000)
}
```

## Environment Variables

The client can be configured using environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `R2_ACCOUNT_ID` | Cloudflare account ID | `abc123...` |
| `R2_ACCESS_KEY_ID` | R2 access key ID | `key123...` |
| `R2_SECRET_ACCESS_KEY` | R2 secret access key | `secret123...` |
| `R2_ENDPOINT` | Custom endpoint (optional) | `https://custom.r2.dev` |
| `R2_TIMEOUT` | Request timeout in ms | `30000` |
| `R2_MULTIPART_THRESHOLD` | Multipart threshold in bytes | `10485760` |
| `R2_MULTIPART_PART_SIZE` | Multipart part size in bytes | `5242880` |

Alternative AWS-compatible variables are also supported:
- `CLOUDFLARE_ACCOUNT_ID` (alternative to `R2_ACCOUNT_ID`)
- `AWS_ACCESS_KEY_ID` (alternative to `R2_ACCESS_KEY_ID`)
- `AWS_SECRET_ACCESS_KEY` (alternative to `R2_SECRET_ACCESS_KEY`)

## Error Handling

All errors extend the base `R2Error` class and include detailed context:

```typescript
import {
  R2Error,
  ObjectError,
  NetworkError,
  AuthError,
  isRetryableError
} from '@llm-devops/cloudflare-r2';

try {
  await client.objects.get('my-bucket', 'missing-file.txt');
} catch (error) {
  if (error instanceof ObjectError) {
    console.error('Object error:', error.message);
    console.error('Status code:', error.statusCode);
    console.error('Request ID:', error.requestId);
  } else if (error instanceof NetworkError) {
    console.error('Network error:', error.message);
    if (isRetryableError(error)) {
      console.error('This error is retryable');
    }
  } else if (error instanceof AuthError) {
    console.error('Authentication failed:', error.message);
  }
}
```

### Error Types

| Error Class | Description | Retryable |
|------------|-------------|-----------|
| `ConfigError` | Invalid configuration | No |
| `AuthError` | Authentication/authorization failure | No |
| `ObjectError` | Object operation failure (404, etc.) | No |
| `NetworkError` | Network connectivity issues | Yes |
| `ServerError` | Server-side errors (5xx) | Yes |
| `ValidationError` | Request validation failure | No |
| `MultipartError` | Multipart upload errors | Varies |
| `TransferError` | Data transfer errors | Yes |

### Error Properties

All errors include:
- `message`: Human-readable error description
- `code`: Error code (e.g., 'NoSuchKey', 'AccessDenied')
- `statusCode`: HTTP status code
- `requestId`: R2 request ID for debugging
- `retryable`: Whether the error can be retried
- `cause`: Original error (if wrapped)

## Testing with Mock Client

The mock client provides a full in-memory implementation for testing:

```typescript
import { createMockClient } from '@llm-devops/cloudflare-r2';

describe('My App', () => {
  let client: R2Client;

  beforeEach(() => {
    client = createMockClient();
  });

  afterEach(async () => {
    await client.close();
  });

  it('uploads and downloads files', async () => {
    // Upload
    await client.objects.put('test-bucket', 'test.txt', 'Hello');

    // Download
    const result = await client.objects.get('test-bucket', 'test.txt');
    expect(result.body).toBe('Hello');
  });

  it('lists objects', async () => {
    await client.objects.put('test-bucket', 'file1.txt', 'A');
    await client.objects.put('test-bucket', 'file2.txt', 'B');

    const list = await client.objects.list('test-bucket');
    expect(list.objects).toHaveLength(2);
  });
});
```

### Mock Client Features

- In-memory object storage
- Full support for all operations
- Realistic error simulation
- Configurable latency and failure injection
- Automatic ETag generation
- Multipart upload support
- Presigned URL validation

## Advanced Usage

### Custom Signing

For advanced use cases, you can use the signing module directly:

```typescript
import { R2Signer, createPresignedUrl } from '@llm-devops/cloudflare-r2';

const signer = new R2Signer({
  accessKeyId: 'your-key-id',
  secretAccessKey: 'your-secret-key',
  region: 'auto',
  service: 's3'
});

// Sign a request
const signedRequest = signer.sign({
  method: 'GET',
  url: 'https://bucket.account.r2.cloudflarestorage.com/object-key',
  headers: new Headers(),
  body: undefined,
  timestamp: new Date()
});

// Create presigned URL
const presignedUrl = createPresignedUrl(
  signer,
  'GET',
  'https://bucket.account.r2.cloudflarestorage.com/object-key',
  3600
);
```

### Custom Authentication Provider

```typescript
import {
  createClient,
  ChainCredentialsProvider,
  EnvironmentCredentialsProvider,
  StaticCredentialsProvider
} from '@llm-devops/cloudflare-r2';

const provider = new ChainCredentialsProvider([
  new EnvironmentCredentialsProvider(),
  new StaticCredentialsProvider({
    accessKeyId: 'fallback-key',
    secretAccessKey: 'fallback-secret'
  })
]);

const credentials = await provider.getCredentials();
const client = createClient({
  accountId: 'your-account',
  ...credentials
});
```

### Custom Resilience Configuration

```typescript
const client = createClient({
  accountId: 'your-account',
  accessKeyId: 'your-key',
  secretAccessKey: 'your-secret',
  retry: {
    maxAttempts: 5,
    initialDelay: 500,
    maxDelay: 60000,
    backoffMultiplier: 3,
    jitter: true
  },
  circuitBreaker: {
    failureThreshold: 10,
    successThreshold: 3,
    timeout: 120000,
    monitoringPeriod: 120000
  }
});
```

## Examples

### Upload Large File with Progress

```typescript
import fs from 'fs';
import { createClient } from '@llm-devops/cloudflare-r2';

async function uploadLargeFile(filePath: string, bucket: string, key: string) {
  const client = createClient({
    accountId: process.env.R2_ACCOUNT_ID!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!
  });

  const fileData = fs.readFileSync(filePath);
  const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB

  // Initiate multipart upload
  const upload = await client.multipart.createMultipart(bucket, key);

  try {
    // Upload parts with progress
    const parts = [];
    for (let i = 0; i < fileData.length; i += CHUNK_SIZE) {
      const partNumber = Math.floor(i / CHUNK_SIZE) + 1;
      const chunk = fileData.slice(i, i + CHUNK_SIZE);

      console.log(`Uploading part ${partNumber}...`);
      const result = await client.multipart.uploadPart(
        bucket,
        key,
        upload.uploadId,
        partNumber,
        chunk
      );

      parts.push({ partNumber, etag: result.etag });

      const progress = ((i + chunk.length) / fileData.length * 100).toFixed(1);
      console.log(`Progress: ${progress}%`);
    }

    // Complete upload
    await client.multipart.completeMultipart(bucket, key, upload.uploadId, parts);
    console.log('Upload complete!');

  } catch (error) {
    // Abort on error
    await client.multipart.abortMultipart(bucket, key, upload.uploadId);
    throw error;
  } finally {
    await client.close();
  }
}
```

### Batch Operations

```typescript
async function batchDownload(bucket: string, prefix: string, outputDir: string) {
  const client = createClientFromEnv();

  try {
    // List all objects
    const objects = [];
    let marker: string | undefined;

    do {
      const page = await client.objects.list(bucket, { prefix, marker, maxKeys: 1000 });
      objects.push(...page.objects);
      marker = page.nextMarker;
    } while (marker);

    console.log(`Downloading ${objects.length} objects...`);

    // Download concurrently with limit
    const CONCURRENCY = 10;
    for (let i = 0; i < objects.length; i += CONCURRENCY) {
      const batch = objects.slice(i, i + CONCURRENCY);

      await Promise.all(
        batch.map(async (obj) => {
          const result = await client.objects.get(bucket, obj.key);
          const outputPath = path.join(outputDir, obj.key);

          await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
          await fs.promises.writeFile(outputPath, result.body);

          console.log(`Downloaded: ${obj.key}`);
        })
      );
    }

    console.log('Batch download complete!');

  } finally {
    await client.close();
  }
}
```

### Implement CDN Cache Warming

```typescript
async function warmCache(bucket: string, keys: string[]) {
  const client = createClientFromEnv();

  try {
    // Generate presigned URLs with long expiration
    const urls = await Promise.all(
      keys.map(key => client.presign.getUrl(bucket, key, 86400)) // 24 hours
    );

    // Fetch URLs to warm CDN cache
    await Promise.all(
      urls.map(async ({ url }) => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to warm ${url}: ${response.status}`);
        }
        console.log(`Warmed: ${url}`);
      })
    );

    console.log(`Warmed ${keys.length} objects in CDN cache`);

  } finally {
    await client.close();
  }
}
```

## Performance Tips

1. **Use Multipart Uploads for Large Files**: Files over 10 MB should use multipart uploads for better reliability and performance.

2. **Configure Appropriate Part Size**: Balance between number of requests and memory usage. Default is 5 MB.

3. **Adjust Concurrency**: Increase `multipartConcurrency` for faster uploads on high-bandwidth connections.

4. **Enable Retry Logic**: The default retry configuration handles transient failures automatically.

5. **Reuse Client Instances**: Create one client and reuse it across operations to benefit from connection pooling.

6. **Use Presigned URLs for Direct Uploads**: For browser uploads, generate presigned PUT URLs to bypass your server.

7. **Implement Pagination**: Use `maxKeys` and markers when listing large buckets to avoid timeouts.

8. **Monitor Circuit Breaker**: Configure circuit breaker thresholds based on your traffic patterns.

## Troubleshooting

### Authentication Errors

```
AuthError: The request signature we calculated does not match the signature you provided
```

**Solution**: Verify your access key ID and secret access key are correct. Ensure there are no extra spaces or newlines.

### Object Not Found

```
ObjectError: The specified key does not exist (404)
```

**Solution**: Verify the bucket name and object key are correct. Check for typos and case sensitivity.

### Network Timeouts

```
NetworkError: Request timeout after 30000ms
```

**Solution**: Increase the timeout in configuration or check your network connectivity. For large files, use multipart uploads.

### Circuit Breaker Open

```
Error: Circuit breaker is OPEN, failing fast
```

**Solution**: The service is experiencing high failure rates. Wait for the circuit breaker to reset or investigate the underlying issue.

## TypeScript Support

This library is written in TypeScript and provides complete type definitions:

```typescript
import type {
  R2Client,
  PutObjectRequest,
  GetObjectOutput
} from '@llm-devops/cloudflare-r2';

// Full type inference
const client: R2Client = createClient({
  accountId: 'abc',
  accessKeyId: 'key',
  secretAccessKey: 'secret'
});

// Request types
const putOptions: PutObjectRequest = {
  contentType: 'application/json',
  metadata: { version: '1.0' }
};

// Response types
const result: GetObjectOutput = await client.objects.get('bucket', 'key');
```

## License

MIT

## Contributing

Contributions are welcome! Please see our contributing guidelines for details.

## Support

- Documentation: https://github.com/llm-devops/integrations
- Issues: https://github.com/llm-devops/integrations/issues
- Cloudflare R2 Docs: https://developers.cloudflare.com/r2/

## Related Projects

- [@llm-devops/aws-s3](../aws-s3) - AWS S3 integration
- [@llm-devops/google-cloud-storage](../google-cloud-storage) - Google Cloud Storage integration

---

Built with ❤️ by the LLM DevOps Team
