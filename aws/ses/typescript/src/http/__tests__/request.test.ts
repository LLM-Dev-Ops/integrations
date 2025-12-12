/**
 * Tests for SesRequest
 */

import { describe, it, expect } from 'vitest';
import { SesRequest } from '../request.js';

describe('SesRequest', () => {
  describe('Constructor', () => {
    it('should create a GET request', () => {
      const request = new SesRequest('GET', '/v2/email/identities');

      expect(request.method).toBe('GET');
      expect(request.path).toBe('/v2/email/identities');
      expect(request.getBody()).toBeUndefined();
    });

    it('should create a POST request with body', () => {
      const body = { test: 'data' };
      const request = new SesRequest('POST', '/v2/email/outbound-emails', body);

      expect(request.method).toBe('POST');
      expect(request.getBody()).toBe(JSON.stringify(body));
    });
  });

  describe('Static factory methods', () => {
    it('should create GET request via static method', () => {
      const request = SesRequest.get('/v2/email/identities');

      expect(request.method).toBe('GET');
      expect(request.path).toBe('/v2/email/identities');
    });

    it('should create POST request via static method', () => {
      const request = SesRequest.post('/v2/email/outbound-emails', { test: 'data' });

      expect(request.method).toBe('POST');
      expect(request.getBody()).toContain('test');
    });

    it('should create PUT request via static method', () => {
      const request = SesRequest.put('/v2/email/identities/example.com', { test: 'data' });

      expect(request.method).toBe('PUT');
    });

    it('should create DELETE request via static method', () => {
      const request = SesRequest.delete('/v2/email/identities/example.com');

      expect(request.method).toBe('DELETE');
    });

    it('should create PATCH request via static method', () => {
      const request = SesRequest.patch('/v2/email/configuration-sets/default', { test: 'data' });

      expect(request.method).toBe('PATCH');
    });
  });

  describe('Query parameters', () => {
    it('should add a single query parameter', () => {
      const request = SesRequest.get('/v2/email/identities')
        .withQuery('PageSize', '100');

      const params = request.getQueryParams();
      expect(params.get('PageSize')).toBe('100');
    });

    it('should add multiple query parameters', () => {
      const request = SesRequest.get('/v2/email/identities')
        .withQuery('PageSize', '100')
        .withQuery('NextToken', 'abc123');

      const params = request.getQueryParams();
      expect(params.get('PageSize')).toBe('100');
      expect(params.get('NextToken')).toBe('abc123');
    });

    it('should add query parameters from object', () => {
      const request = SesRequest.get('/v2/email/identities')
        .withQueryParams({
          PageSize: '100',
          NextToken: 'abc123',
        });

      const params = request.getQueryParams();
      expect(params.get('PageSize')).toBe('100');
      expect(params.get('NextToken')).toBe('abc123');
    });
  });

  describe('Headers', () => {
    it('should add a single header', () => {
      const request = SesRequest.post('/v2/email/outbound-emails')
        .withHeader('Content-Type', 'application/json');

      const headers = request.getHeaders();
      expect(headers.get('Content-Type')).toBe('application/json');
    });

    it('should add multiple headers', () => {
      const request = SesRequest.post('/v2/email/outbound-emails')
        .withHeader('Content-Type', 'application/json')
        .withHeader('X-Custom-Header', 'value');

      const headers = request.getHeaders();
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('X-Custom-Header')).toBe('value');
    });

    it('should add headers from object', () => {
      const request = SesRequest.post('/v2/email/outbound-emails')
        .withHeaders({
          'Content-Type': 'application/json',
          'X-Custom-Header': 'value',
        });

      const headers = request.getHeaders();
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('X-Custom-Header')).toBe('value');
    });
  });

  describe('Body', () => {
    it('should set body as string', () => {
      const request = SesRequest.post('/v2/email/outbound-emails')
        .withBody('test body');

      expect(request.getBody()).toBe('test body');
    });

    it('should set body as JSON', () => {
      const data = { test: 'data', number: 42 };
      const request = SesRequest.post('/v2/email/outbound-emails')
        .withJsonBody(data);

      expect(request.getBody()).toBe(JSON.stringify(data));
      expect(request.getHeaders().get('Content-Type')).toBe('application/json');
    });
  });

  describe('URL building', () => {
    it('should build URL without query parameters', () => {
      const request = SesRequest.get('/v2/email/identities');
      const url = request.buildUrl('https://email.us-east-1.amazonaws.com');

      expect(url).toBe('https://email.us-east-1.amazonaws.com/v2/email/identities');
    });

    it('should build URL with query parameters', () => {
      const request = SesRequest.get('/v2/email/identities')
        .withQuery('PageSize', '100')
        .withQuery('NextToken', 'abc123');

      const url = request.buildUrl('https://email.us-east-1.amazonaws.com');

      expect(url).toContain('PageSize=100');
      expect(url).toContain('NextToken=abc123');
    });

    it('should encode query parameter values', () => {
      const request = SesRequest.get('/v2/email/identities')
        .withQuery('Filter', 'name=test value');

      const url = request.buildUrl('https://email.us-east-1.amazonaws.com');

      expect(url).toContain('Filter=name%3Dtest%20value');
    });

    it('should handle trailing slash in base URL', () => {
      const request = SesRequest.get('/v2/email/identities');
      const url = request.buildUrl('https://email.us-east-1.amazonaws.com/');

      expect(url).toBe('https://email.us-east-1.amazonaws.com/v2/email/identities');
    });
  });

  describe('toHttpRequest', () => {
    it('should convert to HttpRequest', () => {
      const sesRequest = SesRequest.post('/v2/email/outbound-emails', { test: 'data' })
        .withHeader('X-Custom', 'value')
        .withQuery('param', 'value');

      const httpRequest = sesRequest.toHttpRequest('https://email.us-east-1.amazonaws.com');

      expect(httpRequest.method).toBe('POST');
      expect(httpRequest.url).toContain('/v2/email/outbound-emails');
      expect(httpRequest.url).toContain('param=value');
      expect(httpRequest.headers['X-Custom']).toBe('value');
      expect(httpRequest.headers['Content-Type']).toBe('application/json');
      expect(httpRequest.body).toContain('test');
    });

    it('should handle requests without body', () => {
      const sesRequest = SesRequest.get('/v2/email/identities');
      const httpRequest = sesRequest.toHttpRequest('https://email.us-east-1.amazonaws.com');

      expect(httpRequest.body).toBeUndefined();
    });
  });

  describe('Fluent interface', () => {
    it('should support method chaining', () => {
      const request = SesRequest.post('/v2/email/outbound-emails')
        .withHeader('Content-Type', 'application/json')
        .withQuery('param1', 'value1')
        .withQuery('param2', 'value2')
        .withJsonBody({ test: 'data' });

      expect(request.getHeaders().size).toBeGreaterThan(0);
      expect(request.getQueryParams().size).toBe(2);
      expect(request.getBody()).toBeTruthy();
    });
  });
});
