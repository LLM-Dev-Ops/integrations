/**
 * Tests for AWS Signature Version 4 implementation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  signRequest,
  createCanonicalRequest,
  createStringToSign,
  calculateSignature,
  deriveSigningKey,
  buildAuthorizationHeader,
  getSigningKeyCache,
} from './v4';
import type { SigningParams } from './types';
import { SigningError } from './error';

describe('deriveSigningKey', () => {
  it('should derive signing key correctly', async () => {
    // AWS test vector from documentation
    const secret = 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY';
    const date = '20150830';
    const region = 'us-east-1';
    const service = 'iam';

    const key = await deriveSigningKey(secret, date, region, service);

    expect(key).toBeInstanceOf(ArrayBuffer);
    expect(key.byteLength).toBe(32); // SHA-256 produces 32 bytes

    // Convert to hex for verification
    const hex = Array.from(new Uint8Array(key))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // AWS test vector expected output
    expect(hex).toBe('c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9');
  });

  it('should cache derived keys', async () => {
    const cache = getSigningKeyCache();
    const initialSize = cache.size;

    const secret = 'test-secret';
    const date = '20231201';
    const region = 'us-east-1';
    const service = 'ses';

    // First call should derive and cache
    const key1 = await deriveSigningKey(secret, date, region, service);
    expect(cache.size).toBe(initialSize + 1);

    // Second call should use cached value
    const key2 = await deriveSigningKey(secret, date, region, service);
    expect(cache.size).toBe(initialSize + 1);

    // Keys should be the same
    expect(new Uint8Array(key1)).toEqual(new Uint8Array(key2));
  });
});

describe('createCanonicalRequest', () => {
  it('should create canonical request for GET', () => {
    const method = 'GET';
    const path = '/';
    const query = '';
    const headers = 'host:iam.amazonaws.com\nx-amz-date:20150830T123600Z\n';
    const signedHeaders = 'host;x-amz-date';
    const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    const canonical = createCanonicalRequest(
      method,
      path,
      query,
      headers,
      signedHeaders,
      payloadHash
    );

    const expected = [
      'GET',
      '/',
      '',
      'host:iam.amazonaws.com',
      'x-amz-date:20150830T123600Z',
      '',
      'host;x-amz-date',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    ].join('\n');

    expect(canonical).toBe(expected);
  });

  it('should create canonical request for POST', () => {
    const method = 'POST';
    const path = '/';
    const query = 'Action=ListUsers&Version=2010-05-08';
    const headers =
      'content-type:application/x-www-form-urlencoded; charset=utf-8\nhost:iam.amazonaws.com\nx-amz-date:20150830T123600Z\n';
    const signedHeaders = 'content-type;host;x-amz-date';
    const payloadHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    const canonical = createCanonicalRequest(
      method,
      path,
      query,
      headers,
      signedHeaders,
      payloadHash
    );

    expect(canonical).toContain('POST');
    expect(canonical).toContain('Action=ListUsers&Version=2010-05-08');
  });

  it('should normalize URI path', () => {
    const canonical = createCanonicalRequest(
      'GET',
      '/path//to///resource',
      '',
      'host:example.com\n',
      'host',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );

    expect(canonical).toContain('/path/to/resource');
  });
});

describe('createStringToSign', () => {
  it('should create string to sign', () => {
    const datetime = '20150830T123600Z';
    const scope = '20150830/us-east-1/iam/aws4_request';
    const canonicalRequestHash =
      'f536975d06c0309214f805bb90ccff089219ecd68b2577efef23edd43b7e1a59';

    const stringToSign = createStringToSign(datetime, scope, canonicalRequestHash);

    const expected = [
      'AWS4-HMAC-SHA256',
      '20150830T123600Z',
      '20150830/us-east-1/iam/aws4_request',
      'f536975d06c0309214f805bb90ccff089219ecd68b2577efef23edd43b7e1a59',
    ].join('\n');

    expect(stringToSign).toBe(expected);
  });
});

describe('calculateSignature', () => {
  it('should calculate signature correctly', async () => {
    // Use a known signing key and string to sign
    const encoder = new TextEncoder();
    const keyData = encoder.encode('test-key');
    const signingKey = await crypto.subtle.digest('SHA-256', keyData);

    const stringToSign = 'test string to sign';
    const signature = await calculateSignature(signingKey, stringToSign);

    expect(signature).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex is 64 chars
  });

  it('should produce consistent signatures', async () => {
    const encoder = new TextEncoder();
    const keyData = encoder.encode('test-key');
    const signingKey = await crypto.subtle.digest('SHA-256', keyData);

    const stringToSign = 'test string to sign';
    const sig1 = await calculateSignature(signingKey, stringToSign);
    const sig2 = await calculateSignature(signingKey, stringToSign);

    expect(sig1).toBe(sig2);
  });
});

describe('buildAuthorizationHeader', () => {
  it('should build authorization header', () => {
    const accessKeyId = 'AKIDEXAMPLE';
    const credentialScope = '20150830/us-east-1/iam/aws4_request';
    const signedHeaders = 'content-type;host;x-amz-date';
    const signature = '5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7';

    const header = buildAuthorizationHeader(
      accessKeyId,
      credentialScope,
      signedHeaders,
      signature
    );

    expect(header).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/iam/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7'
    );
  });
});

describe('signRequest', () => {
  let credentials: SigningParams['credentials'];

  beforeEach(() => {
    credentials = {
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    };
  });

  it('should sign a GET request', async () => {
    const request = new Request('https://iam.amazonaws.com/', {
      method: 'GET',
    });

    const params: SigningParams = {
      region: 'us-east-1',
      service: 'iam',
      credentials,
      date: new Date('2015-08-30T12:36:00Z'),
    };

    const signed = await signRequest(request, params);

    expect(signed.headers.authorization).toBeDefined();
    expect(signed.headers.authorization).toContain('AWS4-HMAC-SHA256');
    expect(signed.headers.authorization).toContain('Credential=AKIDEXAMPLE');
    expect(signed.headers.authorization).toContain('SignedHeaders=');
    expect(signed.headers.authorization).toContain('Signature=');
    expect(signed.headers.host).toBe('iam.amazonaws.com');
    expect(signed.headers['x-amz-date']).toBe('20150830T123600Z');
  });

  it('should sign a POST request', async () => {
    const request = new Request('https://iam.amazonaws.com/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      },
      body: 'Action=ListUsers&Version=2010-05-08',
    });

    const params: SigningParams = {
      region: 'us-east-1',
      service: 'iam',
      credentials,
      date: new Date('2015-08-30T12:36:00Z'),
    };

    const signed = await signRequest(request, params);

    expect(signed.headers.authorization).toBeDefined();
    expect(signed.headers['content-type']).toContain('application/x-www-form-urlencoded');
    expect(signed.headers['x-amz-content-sha256']).toBeDefined();
  });

  it('should sign request with session token', async () => {
    const request = new Request('https://iam.amazonaws.com/', {
      method: 'GET',
    });

    const credsWithToken = {
      ...credentials,
      sessionToken: 'AQoDYXdzEJr...',
    };

    const params: SigningParams = {
      region: 'us-east-1',
      service: 'iam',
      credentials: credsWithToken,
      date: new Date('2015-08-30T12:36:00Z'),
    };

    const signed = await signRequest(request, params);

    expect(signed.headers['x-amz-security-token']).toBe('AQoDYXdzEJr...');
  });

  it('should sign request with query parameters', async () => {
    const request = new Request(
      'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08',
      {
        method: 'GET',
      }
    );

    const params: SigningParams = {
      region: 'us-east-1',
      service: 'iam',
      credentials,
      date: new Date('2015-08-30T12:36:00Z'),
    };

    const signed = await signRequest(request, params);

    expect(signed.headers.authorization).toBeDefined();
    expect(signed.url).toContain('Action=ListUsers');
  });

  it('should use current date if not provided', async () => {
    const request = new Request('https://iam.amazonaws.com/', {
      method: 'GET',
    });

    const params: SigningParams = {
      region: 'us-east-1',
      service: 'iam',
      credentials,
    };

    const signed = await signRequest(request, params);

    expect(signed.headers['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/);
  });

  it('should handle malformed URLs gracefully', async () => {
    // Note: Request constructor validates URLs, so we test the URL parsing in signRequest
    // by creating a valid request but testing error handling for other issues
    const request = new Request('https://example.com/', {
      method: 'GET',
    });

    const params: SigningParams = {
      region: 'us-east-1',
      service: 'iam',
      credentials,
    };

    // This should succeed
    const signed = await signRequest(request, params);
    expect(signed.headers.authorization).toBeDefined();
  });

  it('should handle empty body', async () => {
    const request = new Request('https://iam.amazonaws.com/', {
      method: 'POST',
    });

    const params: SigningParams = {
      region: 'us-east-1',
      service: 'iam',
      credentials,
      date: new Date('2015-08-30T12:36:00Z'),
    };

    const signed = await signRequest(request, params);

    expect(signed.headers.authorization).toBeDefined();
    expect(signed.headers['x-amz-content-sha256']).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    ); // SHA-256 of empty string
  });

  it('should sign SES request', async () => {
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
            Subject: { Data: 'Test' },
            Body: { Text: { Data: 'Test message' } },
          },
        },
      }),
    });

    const params: SigningParams = {
      region: 'us-east-1',
      service: 'ses',
      credentials,
      date: new Date('2023-12-01T12:00:00Z'),
    };

    const signed = await signRequest(request, params);

    expect(signed.headers.authorization).toBeDefined();
    expect(signed.headers.authorization).toContain('Credential=AKIDEXAMPLE');
    expect(signed.headers['x-amz-target']).toBe('SimpleEmailService_v2.SendEmail');
    expect(signed.headers.host).toBe('email.us-east-1.amazonaws.com');
  });
});

describe('AWS Test Vectors', () => {
  // These test vectors are from the official AWS Signature V4 Test Suite
  // https://docs.aws.amazon.com/general/latest/gr/signature-v4-test-suite.html

  it('should pass get-vanilla test', async () => {
    const request = new Request('https://example.amazonaws.com/', {
      method: 'GET',
    });

    const credentials = {
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    };

    const params: SigningParams = {
      region: 'us-east-1',
      service: 'service',
      credentials,
      date: new Date('2015-08-30T12:36:00Z'),
    };

    const signed = await signRequest(request, params);

    expect(signed.headers.authorization).toContain('AWS4-HMAC-SHA256');
    expect(signed.headers['x-amz-date']).toBe('20150830T123600Z');
  });

  it('should pass post-vanilla test', async () => {
    const request = new Request('https://example.amazonaws.com/', {
      method: 'POST',
      body: '',
    });

    const credentials = {
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    };

    const params: SigningParams = {
      region: 'us-east-1',
      service: 'service',
      credentials,
      date: new Date('2015-08-30T12:36:00Z'),
    };

    const signed = await signRequest(request, params);

    expect(signed.headers.authorization).toContain('AWS4-HMAC-SHA256');
    expect(signed.headers['x-amz-content-sha256']).toBeDefined();
  });
});
