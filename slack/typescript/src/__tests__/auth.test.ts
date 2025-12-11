/**
 * Tests for authentication utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  detectTokenType,
  isValidToken,
  maskToken,
  getOAuthUrl,
  SignatureVerifier,
} from '../auth';

describe('Token utilities', () => {
  describe('detectTokenType', () => {
    it('should detect bot token', () => {
      expect(detectTokenType('xoxb-123-456')).toBe('bot');
    });

    it('should detect user token', () => {
      expect(detectTokenType('xoxp-123-456')).toBe('user');
    });

    it('should detect app token', () => {
      expect(detectTokenType('xapp-123-456')).toBe('app');
    });

    it('should return undefined for unknown token', () => {
      expect(detectTokenType('invalid-token')).toBeUndefined();
    });
  });

  describe('isValidToken', () => {
    it('should validate bot tokens', () => {
      expect(isValidToken('xoxb-123')).toBe(true);
    });

    it('should validate user tokens', () => {
      expect(isValidToken('xoxp-123')).toBe(true);
    });

    it('should validate app tokens', () => {
      expect(isValidToken('xapp-123')).toBe(true);
    });

    it('should reject invalid tokens', () => {
      expect(isValidToken('invalid')).toBe(false);
      expect(isValidToken('')).toBe(false);
      expect(isValidToken('xox-123')).toBe(false);
    });
  });

  describe('maskToken', () => {
    it('should mask long tokens', () => {
      const masked = maskToken('xoxb-123456789-abcdefgh');
      expect(masked).toBe('xoxb-...efgh');
      expect(masked).not.toContain('123456789');
    });

    it('should mask short tokens completely', () => {
      expect(maskToken('short')).toBe('***');
    });
  });
});

describe('OAuth utilities', () => {
  describe('getOAuthUrl', () => {
    it('should generate OAuth URL with required params', () => {
      const url = getOAuthUrl({
        clientId: 'client123',
        clientSecret: 'secret',
        scopes: ['channels:read', 'chat:write'],
      });

      expect(url).toContain('https://slack.com/oauth/v2/authorize');
      expect(url).toContain('client_id=client123');
      expect(url).toContain('scope=channels%3Aread%2Cchat%3Awrite');
    });

    it('should include redirect_uri if provided', () => {
      const url = getOAuthUrl({
        clientId: 'client123',
        clientSecret: 'secret',
        redirectUri: 'https://example.com/callback',
      });

      expect(url).toContain('redirect_uri=https%3A%2F%2Fexample.com%2Fcallback');
    });

    it('should include state if provided', () => {
      const url = getOAuthUrl(
        {
          clientId: 'client123',
          clientSecret: 'secret',
        },
        'random-state'
      );

      expect(url).toContain('state=random-state');
    });
  });
});

describe('SignatureVerifier', () => {
  const signingSecret = 'test-signing-secret';

  describe('verify', () => {
    it('should verify valid signature', () => {
      const verifier = new SignatureVerifier(signingSecret);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = 'test-body';

      // Generate valid signature
      const crypto = require('crypto');
      const sigBaseString = `v0:${timestamp}:${body}`;
      const signature =
        'v0=' +
        crypto.createHmac('sha256', signingSecret).update(sigBaseString).digest('hex');

      expect(verifier.verify(signature, timestamp, body)).toBe(true);
    });

    it('should reject invalid signature', () => {
      const verifier = new SignatureVerifier(signingSecret);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = 'test-body';

      expect(verifier.verify('v0=invalid', timestamp, body)).toBe(false);
    });

    it('should reject old timestamps', () => {
      const verifier = new SignatureVerifier(signingSecret);
      // 10 minutes ago
      const timestamp = (Math.floor(Date.now() / 1000) - 600).toString();
      const body = 'test-body';

      const crypto = require('crypto');
      const sigBaseString = `v0:${timestamp}:${body}`;
      const signature =
        'v0=' +
        crypto.createHmac('sha256', signingSecret).update(sigBaseString).digest('hex');

      expect(verifier.verify(signature, timestamp, body)).toBe(false);
    });
  });

  describe('verifyRequest', () => {
    it('should verify request from headers', () => {
      const verifier = new SignatureVerifier(signingSecret);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = 'test-body';

      const crypto = require('crypto');
      const sigBaseString = `v0:${timestamp}:${body}`;
      const signature =
        'v0=' +
        crypto.createHmac('sha256', signingSecret).update(sigBaseString).digest('hex');

      const headers = {
        'x-slack-signature': signature,
        'x-slack-request-timestamp': timestamp,
      };

      expect(verifier.verifyRequest(headers, body)).toBe(true);
    });

    it('should reject missing headers', () => {
      const verifier = new SignatureVerifier(signingSecret);

      expect(verifier.verifyRequest({}, 'body')).toBe(false);
      expect(
        verifier.verifyRequest({ 'x-slack-signature': 'sig' }, 'body')
      ).toBe(false);
      expect(
        verifier.verifyRequest({ 'x-slack-request-timestamp': '123' }, 'body')
      ).toBe(false);
    });
  });
});
