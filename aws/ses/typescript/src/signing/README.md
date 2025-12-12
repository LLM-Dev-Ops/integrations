# AWS Signature Version 4 Signing Module

This module provides a complete implementation of AWS Signature Version 4 (SigV4) for signing HTTP requests to AWS services like SES.

## Features

- **Full SigV4 Implementation**: Complete AWS Signature Version 4 algorithm
- **Signing Key Cache**: Automatic caching of derived signing keys for performance
- **Web Crypto API**: Uses native Web Crypto API for all cryptographic operations
- **TypeScript**: Fully typed with comprehensive JSDoc documentation
- **AWS Test Vectors**: Validated against official AWS test suite
- **Zero Dependencies**: Uses only Web standards (crypto, fetch)

## Installation

```bash
npm install @integrations/aws-ses
```

## Quick Start

```typescript
import { signRequest } from '@integrations/aws-ses/signing';

// Create a request
const request = new Request('https://email.us-east-1.amazonaws.com/', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-amz-json-1.0',
    'X-Amz-Target': 'SimpleEmailService_v2.SendEmail',
  },
  body: JSON.stringify({
    FromEmailAddress: 'sender@example.com',
    Destination: {
      ToAddresses: ['recipient@example.com'],
    },
    Content: {
      Simple: {
        Subject: { Data: 'Test Email' },
        Body: { Text: { Data: 'Test message' } },
      },
    },
  }),
});

// Sign the request
const signed = await signRequest(request, {
  region: 'us-east-1',
  service: 'ses',
  credentials: {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  },
});

// Use the signed request
const response = await fetch(signed.url, {
  method: signed.method,
  headers: signed.headers,
  body: signed.body,
});
```

## API Reference

### `signRequest(request, params)`

Signs an HTTP request using AWS Signature Version 4.

**Parameters:**
- `request: Request` - The HTTP request to sign
- `params: SigningParams` - Signing parameters
  - `region: string` - AWS region (e.g., 'us-east-1')
  - `service: string` - AWS service name (e.g., 'ses')
  - `credentials: AwsCredentials` - AWS credentials
  - `date?: Date` - Optional date for signing (defaults to current time)

**Returns:** `Promise<SignedRequest>`

**Example:**
```typescript
const signed = await signRequest(request, {
  region: 'us-east-1',
  service: 'ses',
  credentials: {
    accessKeyId: 'AKID...',
    secretAccessKey: 'SECRET...',
    sessionToken: 'TOKEN...', // Optional for temporary credentials
  },
});
```

### `deriveSigningKey(secret, date, region, service)`

Derives a signing key from AWS credentials. Results are automatically cached.

**Parameters:**
- `secret: string` - AWS secret access key
- `date: string` - Date in YYYYMMDD format
- `region: string` - AWS region
- `service: string` - AWS service name

**Returns:** `Promise<ArrayBuffer>` - Derived signing key

### Canonical Request Functions

#### `uriEncode(input, encodeSlash)`

URI encodes a string according to AWS requirements.

```typescript
uriEncode('hello world', true); // 'hello%20world'
uriEncode('path/to/file', false); // 'path/to/file'
```

#### `normalizeUriPath(path)`

Normalizes a URI path for canonical request.

```typescript
normalizeUriPath('/path//to/../resource'); // '/path/resource'
```

#### `canonicalQueryString(params)`

Creates canonical query string from URL search parameters.

```typescript
const params = new URLSearchParams('foo=bar&baz=qux');
canonicalQueryString(params); // 'baz=qux&foo=bar' (sorted)
```

#### `canonicalHeaders(headers)`

Creates canonical headers string and signed headers list.

```typescript
const headers = new Headers({
  'Host': 'example.amazonaws.com',
  'X-Amz-Date': '20231201T120000Z',
});

const result = canonicalHeaders(headers);
// result.canonical: 'host:example.amazonaws.com\nx-amz-date:20231201T120000Z\n'
// result.signed: 'host;x-amz-date'
```

### Cache Management

#### `SigningKeyCache`

Class for caching derived signing keys.

```typescript
import { SigningKeyCache } from '@integrations/aws-ses/signing';

// Create cache with custom TTL
const cache = new SigningKeyCache(1000 * 60 * 60); // 1 hour

// Store a key
await cache.set('20231201', 'us-east-1', 'ses', signingKey);

// Retrieve a key
const key = await cache.get('20231201', 'us-east-1', 'ses');

// Clean up expired entries
const removed = cache.cleanup();

// Clear all entries
cache.clear();
```

#### `getSigningKeyCache()`

Gets the global signing key cache instance.

```typescript
import { getSigningKeyCache } from '@integrations/aws-ses/signing';

const cache = getSigningKeyCache();

// Periodic cleanup
setInterval(() => {
  const removed = cache.cleanup();
  console.log(`Cleaned up ${removed} expired signing keys`);
}, 3600000); // Every hour
```

### Error Handling

The module throws `SigningError` for signing-related errors.

```typescript
import { SigningError, isSigningError } from '@integrations/aws-ses/signing';

try {
  const signed = await signRequest(request, params);
} catch (error) {
  if (isSigningError(error)) {
    console.error(`Signing failed: ${error.code} - ${error.message}`);
    // error.code is one of:
    // - 'MISSING_HEADER'
    // - 'INVALID_URL'
    // - 'INVALID_TIMESTAMP'
    // - 'SIGNING_FAILED'
  }
}
```

## Types

### `AwsCredentials`

```typescript
interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;    // For temporary credentials
  expiration?: Date;        // For temporary credentials
}
```

### `SigningParams`

```typescript
interface SigningParams {
  region: string;           // AWS region
  service: string;          // AWS service name
  credentials: AwsCredentials;
  date?: Date;              // Optional signing date
}
```

### `SignedRequest`

```typescript
interface SignedRequest {
  headers: Record<string, string>;  // Includes Authorization header
  url: string;                       // Full request URL
  method: string;                    // HTTP method
  body?: string;                     // Request body
}
```

## AWS Signature V4 Algorithm

The signing process follows these steps:

1. **Create Canonical Request**
   - Normalize HTTP method, URI path, and query string
   - Create canonical headers (lowercase, sorted, trimmed)
   - Hash the request payload

2. **Create String to Sign**
   - Combine algorithm identifier, timestamp, credential scope
   - Hash the canonical request

3. **Calculate Signature**
   - Derive signing key using HMAC-SHA256 chain:
     - kDate = HMAC("AWS4" + Secret, Date)
     - kRegion = HMAC(kDate, Region)
     - kService = HMAC(kRegion, Service)
     - kSigning = HMAC(kService, "aws4_request")
   - Sign the string to sign with the derived key

4. **Build Authorization Header**
   - Format: `AWS4-HMAC-SHA256 Credential=..., SignedHeaders=..., Signature=...`

## Performance Optimizations

### Signing Key Cache

Signing keys are cached automatically based on:
- Date (YYYYMMDD)
- Region
- Service

Keys are cached for 24 hours by default, avoiding expensive HMAC derivation on every request.

### Web Crypto API

All cryptographic operations use the native Web Crypto API:
- Non-blocking async operations
- Hardware acceleration where available
- No external crypto dependencies

## Testing

The module includes comprehensive tests validated against AWS test vectors:

```bash
npm test
```

Test coverage includes:
- Canonical request building
- URI encoding and normalization
- Query string canonicalization
- Header canonicalization
- Signature calculation
- Key derivation and caching
- Error handling
- AWS official test vectors

## Compliance

This implementation follows the official AWS Signature Version 4 specification:

- [AWS Signature Version 4 Signing Process](https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html)
- [Create a Canonical Request](https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html)
- [Create a String to Sign](https://docs.aws.amazon.com/general/latest/gr/sigv4-create-string-to-sign.html)
- [Calculate the Signature](https://docs.aws.amazon.com/general/latest/gr/sigv4-calculate-signature.html)

## License

MIT
