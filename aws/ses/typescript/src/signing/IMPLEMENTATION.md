# AWS SES TypeScript Signing Module Implementation

## Overview

This document describes the implementation of the AWS Signature Version 4 signing module for the AWS SES TypeScript integration.

## Files Created

### Core Implementation

1. **`types.ts`** (71 lines)
   - `AwsCredentials` interface
   - `SigningParams` interface
   - `SignedRequest` interface
   - `CanonicalRequest` interface
   - `CacheEntry` interface

2. **`error.ts`** (63 lines)
   - `SigningError` class with error codes
   - `SigningErrorCode` type
   - `isSigningError()` type guard
   - Error codes: `MISSING_HEADER`, `INVALID_URL`, `INVALID_TIMESTAMP`, `SIGNING_FAILED`

3. **`canonical.ts`** (263 lines)
   - `uriEncode()` - URI encoding per AWS spec
   - `normalizeUriPath()` - Path normalization
   - `canonicalQueryString()` - Query string canonicalization
   - `shouldSignHeader()` - Header filtering
   - `canonicalHeaders()` - Headers canonicalization

4. **`v4.ts`** (427 lines)
   - `signRequest()` - Main signing function
   - `createCanonicalRequest()` - Canonical request builder
   - `createStringToSign()` - String to sign builder
   - `calculateSignature()` - Signature calculation
   - `deriveSigningKey()` - Key derivation with caching
   - `buildAuthorizationHeader()` - Auth header builder
   - `getSigningKeyCache()` - Cache accessor

5. **`cache.ts`** (190 lines)
   - `SigningKeyCache` class
   - Methods: `set()`, `get()`, `delete()`, `cleanup()`, `clear()`, `has()`
   - TTL-based expiration (default 24 hours)
   - Thread-safe operations

6. **`index.ts`** (75 lines)
   - Main module exports
   - Re-exports all public APIs
   - Comprehensive documentation

### Tests

7. **`canonical.test.ts`** (276 lines)
   - 33 test cases for canonical request functions
   - Tests for URI encoding, path normalization, query strings, headers
   - AWS test vector validation

8. **`v4.test.ts`** (436 lines)
   - 19 test cases for SigV4 implementation
   - Tests for signing GET/POST requests
   - Session token handling
   - AWS official test vectors
   - Error handling

9. **`cache.test.ts`** (375 lines)
   - 21 test cases for signing key cache
   - Tests for basic operations, expiration, cleanup
   - Thread-safety and overwriting behavior

10. **`error.test.ts`** (173 lines)
    - 17 test cases for error handling
    - Tests for error types, type guards, error scenarios
    - Promise rejection and async/await patterns

### Documentation

11. **`README.md`** (8 KB)
    - Comprehensive API documentation
    - Quick start guide
    - Usage examples
    - Performance optimizations
    - Compliance information

12. **`IMPLEMENTATION.md`** (this file)
    - Implementation details
    - Technical specifications

## Implementation Details

### Cryptographic Operations

The module uses the Web Crypto API for all cryptographic operations:

```typescript
// SHA-256 hashing
async function sha256(data: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return arrayBufferToHex(buffer);
}

// HMAC-SHA256 signing
async function hmacSha256(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}
```

### Signing Key Derivation

The signing key is derived using a chain of HMAC operations:

```
kDate = HMAC-SHA256("AWS4" + SecretAccessKey, Date)
kRegion = HMAC-SHA256(kDate, Region)
kService = HMAC-SHA256(kRegion, Service)
kSigning = HMAC-SHA256(kService, "aws4_request")
```

Keys are cached using a composite key: `${date}:${region}:${service}`

### Canonical Request Format

```
HTTPMethod + '\n' +
CanonicalURI + '\n' +
CanonicalQueryString + '\n' +
CanonicalHeaders + '\n' +
SignedHeaders + '\n' +
HashedPayload
```

### String to Sign Format

```
"AWS4-HMAC-SHA256" + '\n' +
RequestDateTime + '\n' +
CredentialScope + '\n' +
HashedCanonicalRequest
```

### Authorization Header Format

```
AWS4-HMAC-SHA256 Credential=AccessKeyId/CredentialScope,
SignedHeaders=SignedHeaders,
Signature=Signature
```

## Test Results

All tests pass successfully:

```
✓ src/signing/canonical.test.ts  (33 tests)
✓ src/signing/cache.test.ts      (21 tests)
✓ src/signing/v4.test.ts         (19 tests)
✓ src/signing/error.test.ts      (17 tests)

Total: 90 tests passed
```

## AWS Compliance

The implementation follows the official AWS Signature Version 4 specification:

- ✅ Canonical request creation per AWS spec
- ✅ URI encoding matches AWS requirements
- ✅ Header canonicalization (lowercase, sorted, trimmed)
- ✅ Query string parameter sorting
- ✅ Signing key derivation algorithm
- ✅ Authorization header format
- ✅ Validated against AWS test vectors

## Performance Optimizations

1. **Signing Key Cache**
   - Caches derived keys for 24 hours (configurable)
   - Reduces HMAC operations from 4 to 0 for cached keys
   - Thread-safe Map-based storage

2. **Web Crypto API**
   - Native browser/Node.js crypto
   - Hardware acceleration where available
   - Non-blocking async operations

3. **Lazy Computation**
   - Only computes payload hash when needed
   - Request body read only once
   - Headers processed efficiently

## Error Handling

The module provides comprehensive error handling:

```typescript
try {
  const signed = await signRequest(request, params);
} catch (error) {
  if (isSigningError(error)) {
    switch (error.code) {
      case 'MISSING_HEADER':
        // Handle missing required header
        break;
      case 'INVALID_URL':
        // Handle invalid URL
        break;
      case 'SIGNING_FAILED':
        // Handle signing failure
        break;
    }
  }
}
```

## Dependencies

**Runtime:**
- None (uses Web standards)

**Dev Dependencies:**
- vitest (testing)
- typescript (type checking)

## Browser Compatibility

The module is compatible with:
- ✅ Node.js 18+ (native fetch and Web Crypto API)
- ✅ Modern browsers (Chrome, Firefox, Safari, Edge)
- ✅ Edge runtime (Cloudflare Workers, Vercel Edge)
- ✅ Deno
- ✅ Bun

## Known Limitations

1. **TypeScript Configuration**: The tsconfig.json doesn't include DOM types, which causes some type errors during strict checking. However, the code works correctly at runtime in Node.js 18+.

2. **Request Body**: The Request body can only be read once. The implementation handles this by reading the body once and storing it.

## Future Enhancements

Potential improvements for future versions:

1. **Presigned URLs**: Add support for generating presigned URLs
2. **Streaming Bodies**: Support for streaming request bodies
3. **Browser Storage**: Use IndexedDB for cache in browsers
4. **Metrics**: Add optional metrics collection
5. **Debug Mode**: Enhanced logging for troubleshooting

## References

- [AWS Signature Version 4](https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html)
- [Canonical Request](https://docs.aws.amazon.com/general/latest/gr/sigv4-create-canonical-request.html)
- [String to Sign](https://docs.aws.amazon.com/general/latest/gr/sigv4-create-string-to-sign.html)
- [Calculate Signature](https://docs.aws.amazon.com/general/latest/gr/sigv4-calculate-signature.html)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

## License

MIT
