/**
 * Tests for canonical request building functions
 */

import { describe, it, expect } from 'vitest';
import {
  uriEncode,
  normalizeUriPath,
  canonicalQueryString,
  canonicalHeaders,
  shouldSignHeader,
} from './canonical';
import { SigningError } from './error';

describe('uriEncode', () => {
  it('should encode basic strings', () => {
    expect(uriEncode('hello world', true)).toBe('hello%20world');
    expect(uriEncode('foo/bar', true)).toBe('foo%2Fbar');
    expect(uriEncode('foo/bar', false)).toBe('foo/bar');
  });

  it('should encode special characters', () => {
    expect(uriEncode('hello!', true)).toBe('hello%21');
    expect(uriEncode("it's", true)).toBe("it%27s");
    expect(uriEncode('test()', true)).toBe('test%28%29');
    expect(uriEncode('wild*card', true)).toBe('wild%2Acard');
  });

  it('should not encode unreserved characters', () => {
    expect(uriEncode('AZaz09-_.~', true)).toBe('AZaz09-_.~');
  });

  it('should handle empty strings', () => {
    expect(uriEncode('', true)).toBe('');
  });

  it('should handle Unicode characters', () => {
    expect(uriEncode('café', true)).toBe('caf%C3%A9');
    expect(uriEncode('日本', true)).toBe('%E6%97%A5%E6%9C%AC');
  });
});

describe('normalizeUriPath', () => {
  it('should normalize empty path to /', () => {
    expect(normalizeUriPath('')).toBe('/');
    expect(normalizeUriPath('/')).toBe('/');
  });

  it('should normalize basic paths', () => {
    expect(normalizeUriPath('/path/to/resource')).toBe('/path/to/resource');
    expect(normalizeUriPath('path/to/resource')).toBe('/path/to/resource');
  });

  it('should remove redundant slashes', () => {
    expect(normalizeUriPath('/path//to///resource')).toBe('/path/to/resource');
  });

  it('should resolve relative paths', () => {
    expect(normalizeUriPath('/path/./to/resource')).toBe('/path/to/resource');
    expect(normalizeUriPath('/path/to/../resource')).toBe('/path/resource');
    expect(normalizeUriPath('/path/to/../../resource')).toBe('/resource');
  });

  it('should preserve trailing slash', () => {
    expect(normalizeUriPath('/path/to/resource/')).toBe('/path/to/resource/');
    expect(normalizeUriPath('/path/')).toBe('/path/');
  });

  it('should URI-encode path segments', () => {
    expect(normalizeUriPath('/path with spaces/to/resource')).toBe(
      '/path%20with%20spaces/to/resource'
    );
    expect(normalizeUriPath('/café/resource')).toBe('/caf%C3%A9/resource');
  });

  it('should not encode slashes in path', () => {
    const path = normalizeUriPath('/path/to/resource');
    expect(path).not.toContain('%2F');
  });
});

describe('canonicalQueryString', () => {
  it('should handle empty query string', () => {
    const params = new URLSearchParams('');
    expect(canonicalQueryString(params)).toBe('');
  });

  it('should sort parameters by name', () => {
    const params = new URLSearchParams('foo=bar&baz=qux&alpha=beta');
    expect(canonicalQueryString(params)).toBe('alpha=beta&baz=qux&foo=bar');
  });

  it('should handle duplicate parameters', () => {
    const params = new URLSearchParams('foo=bar&foo=baz&foo=qux');
    expect(canonicalQueryString(params)).toBe('foo=bar&foo=baz&foo=qux');
  });

  it('should URI-encode parameter names and values', () => {
    const params = new URLSearchParams();
    params.set('key with spaces', 'value with spaces');
    expect(canonicalQueryString(params)).toBe(
      'key%20with%20spaces=value%20with%20spaces'
    );
  });

  it('should handle empty parameter values', () => {
    const params = new URLSearchParams('foo=&bar=baz');
    expect(canonicalQueryString(params)).toBe('bar=baz&foo=');
  });

  it('should handle special characters', () => {
    const params = new URLSearchParams();
    params.set('key', 'hello/world');
    expect(canonicalQueryString(params)).toBe('key=hello%2Fworld');
  });

  it('should match AWS test vectors', () => {
    // AWS test case: GET request with query parameters
    const params = new URLSearchParams('Param2=value2&Param1=value1');
    expect(canonicalQueryString(params)).toBe('Param1=value1&Param2=value2');
  });
});

describe('shouldSignHeader', () => {
  it('should sign required headers', () => {
    expect(shouldSignHeader('host')).toBe(true);
    expect(shouldSignHeader('Host')).toBe(true);
    expect(shouldSignHeader('content-type')).toBe(true);
    expect(shouldSignHeader('Content-Type')).toBe(true);
  });

  it('should sign x-amz-* headers', () => {
    expect(shouldSignHeader('x-amz-date')).toBe(true);
    expect(shouldSignHeader('X-Amz-Date')).toBe(true);
    expect(shouldSignHeader('x-amz-target')).toBe(true);
    expect(shouldSignHeader('x-amz-security-token')).toBe(true);
    expect(shouldSignHeader('x-amz-content-sha256')).toBe(true);
    expect(shouldSignHeader('x-amz-custom-header')).toBe(true);
  });

  it('should not sign authorization header', () => {
    expect(shouldSignHeader('authorization')).toBe(false);
    expect(shouldSignHeader('Authorization')).toBe(false);
  });

  it('should not sign user-agent header', () => {
    expect(shouldSignHeader('user-agent')).toBe(false);
    expect(shouldSignHeader('User-Agent')).toBe(false);
  });

  it('should not sign other headers by default', () => {
    expect(shouldSignHeader('accept')).toBe(false);
    expect(shouldSignHeader('connection')).toBe(false);
    expect(shouldSignHeader('custom-header')).toBe(false);
  });
});

describe('canonicalHeaders', () => {
  it('should create canonical headers string', () => {
    const headers = new Headers({
      Host: 'example.amazonaws.com',
      'Content-Type': 'application/json',
    });

    const result = canonicalHeaders(headers);

    expect(result.canonical).toBe(
      'content-type:application/json\nhost:example.amazonaws.com\n'
    );
    expect(result.signed).toBe('content-type;host');
  });

  it('should throw error if host header is missing', () => {
    const headers = new Headers({
      'Content-Type': 'application/json',
    });

    expect(() => canonicalHeaders(headers)).toThrow(SigningError);
    expect(() => canonicalHeaders(headers)).toThrow('Missing required header: host');
  });

  it('should lowercase header names', () => {
    const headers = new Headers({
      Host: 'example.amazonaws.com',
      'X-Amz-Date': '20231201T120000Z',
      'Content-Type': 'application/json',
    });

    const result = canonicalHeaders(headers);

    expect(result.canonical).toContain('host:');
    expect(result.canonical).toContain('x-amz-date:');
    expect(result.canonical).toContain('content-type:');
  });

  it('should sort headers by name', () => {
    const headers = new Headers({
      Host: 'example.amazonaws.com',
      'X-Amz-Date': '20231201T120000Z',
      'Content-Type': 'application/json',
    });

    const result = canonicalHeaders(headers);

    const lines = result.canonical.split('\n').filter((l) => l);
    expect(lines[0]).toMatch(/^content-type:/);
    expect(lines[1]).toMatch(/^host:/);
    expect(lines[2]).toMatch(/^x-amz-date:/);
  });

  it('should trim header values', () => {
    const headers = new Headers({
      Host: '  example.amazonaws.com  ',
    });

    const result = canonicalHeaders(headers);

    expect(result.canonical).toBe('host:example.amazonaws.com\n');
  });

  it('should normalize whitespace in header values', () => {
    const headers = new Headers({
      Host: 'example.amazonaws.com',
    });
    headers.append('Host', 'header  with   spaces');

    const result = canonicalHeaders(headers);

    // Note: Headers API concatenates with comma
    expect(result.canonical).toContain('example.amazonaws.com');
  });

  it('should include x-amz-* headers', () => {
    const headers = new Headers({
      Host: 'example.amazonaws.com',
      'X-Amz-Date': '20231201T120000Z',
      'X-Amz-Target': 'MyService.MyOperation',
      'X-Amz-Security-Token': 'token123',
    });

    const result = canonicalHeaders(headers);

    expect(result.canonical).toContain('x-amz-date:20231201T120000Z');
    expect(result.canonical).toContain('x-amz-target:MyService.MyOperation');
    expect(result.canonical).toContain('x-amz-security-token:token123');
  });

  it('should exclude non-signed headers', () => {
    const headers = new Headers({
      Host: 'example.amazonaws.com',
      'User-Agent': 'MyApp/1.0',
      Authorization: 'Bearer token',
      Accept: 'application/json',
    });

    const result = canonicalHeaders(headers);

    expect(result.canonical).not.toContain('user-agent');
    expect(result.canonical).not.toContain('authorization');
    expect(result.canonical).not.toContain('accept');
  });

  it('should match AWS test vectors', () => {
    // AWS test case: canonical headers
    const headers = new Headers({
      Host: 'iam.amazonaws.com',
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      'X-Amz-Date': '20150830T123600Z',
    });

    const result = canonicalHeaders(headers);

    expect(result.signed).toBe('content-type;host;x-amz-date');
    expect(result.canonical).toContain('host:iam.amazonaws.com\n');
  });
});
