/**
 * OIDC Discovery
 *
 * OpenID Connect Discovery (RFC 8414) implementation.
 */

import {
  OIDCDiscoveryDocument,
  ProviderConfig,
  discoveryToProviderConfig,
} from "../types";
import { ConfigurationError, ProtocolError } from "../error";
import { HttpTransport, HttpRequest } from "./transport";

/**
 * Discovery cache entry.
 */
interface DiscoveryCacheEntry {
  document: OIDCDiscoveryDocument;
  fetchedAt: Date;
  expiresAt: Date;
}

/**
 * Discovery client interface (for dependency injection).
 */
export interface DiscoveryClient {
  /**
   * Fetch discovery document for issuer.
   */
  fetch(issuer: string): Promise<OIDCDiscoveryDocument>;

  /**
   * Get provider config from discovery.
   */
  getProviderConfig(issuer: string): Promise<ProviderConfig>;

  /**
   * Clear cache for issuer.
   */
  clearCache(issuer?: string): void;
}

/**
 * Default discovery client implementation.
 */
export class DefaultDiscoveryClient implements DiscoveryClient {
  private transport: HttpTransport;
  private cache: Map<string, DiscoveryCacheEntry> = new Map();
  private cacheTtl: number;

  constructor(transport: HttpTransport, options?: { cacheTtlSeconds?: number }) {
    this.transport = transport;
    this.cacheTtl = (options?.cacheTtlSeconds ?? 3600) * 1000; // Default 1 hour
  }

  async fetch(issuer: string): Promise<OIDCDiscoveryDocument> {
    // Check cache
    const cached = this.getFromCache(issuer);
    if (cached) {
      return cached;
    }

    // Normalize issuer URL
    const normalizedIssuer = this.normalizeIssuer(issuer);
    const discoveryUrl = `${normalizedIssuer}/.well-known/openid-configuration`;

    const request: HttpRequest = {
      method: "GET",
      url: discoveryUrl,
      headers: {
        accept: "application/json",
      },
    };

    const response = await this.transport.send(request);

    if (response.status !== 200) {
      throw new ConfigurationError(
        `Discovery request failed with status ${response.status}`,
        "DiscoveryFailed"
      );
    }

    let document: OIDCDiscoveryDocument;
    try {
      document = JSON.parse(response.body);
    } catch {
      throw new ProtocolError(
        "Invalid JSON in discovery response",
        "InvalidResponse"
      );
    }

    // Validate required fields
    if (!document.authorization_endpoint || !document.token_endpoint) {
      throw new ConfigurationError(
        "Discovery document missing required endpoints",
        "DiscoveryFailed"
      );
    }

    // Validate issuer matches
    const responseIssuer = this.normalizeIssuer(document.issuer);
    if (responseIssuer !== normalizedIssuer) {
      throw new ConfigurationError(
        `Issuer mismatch: expected ${normalizedIssuer}, got ${responseIssuer}`,
        "DiscoveryFailed"
      );
    }

    // Cache the document
    this.setCache(issuer, document);

    return document;
  }

  async getProviderConfig(issuer: string): Promise<ProviderConfig> {
    const document = await this.fetch(issuer);
    return discoveryToProviderConfig(document);
  }

  clearCache(issuer?: string): void {
    if (issuer) {
      this.cache.delete(this.normalizeIssuer(issuer));
    } else {
      this.cache.clear();
    }
  }

  private getFromCache(issuer: string): OIDCDiscoveryDocument | null {
    const key = this.normalizeIssuer(issuer);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (new Date() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.document;
  }

  private setCache(issuer: string, document: OIDCDiscoveryDocument): void {
    const key = this.normalizeIssuer(issuer);
    const now = new Date();

    this.cache.set(key, {
      document,
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + this.cacheTtl),
    });
  }

  private normalizeIssuer(issuer: string): string {
    // Remove trailing slash
    return issuer.replace(/\/$/, "");
  }
}

/**
 * Mock discovery client for testing.
 */
export class MockDiscoveryClient implements DiscoveryClient {
  private documents: Map<string, OIDCDiscoveryDocument> = new Map();
  private fetchHistory: string[] = [];

  /**
   * Set discovery document for issuer.
   */
  setDocument(issuer: string, document: OIDCDiscoveryDocument): this {
    this.documents.set(issuer, document);
    return this;
  }

  /**
   * Get fetch history.
   */
  getFetchHistory(): string[] {
    return [...this.fetchHistory];
  }

  async fetch(issuer: string): Promise<OIDCDiscoveryDocument> {
    this.fetchHistory.push(issuer);

    const document = this.documents.get(issuer);
    if (!document) {
      throw new ConfigurationError(
        `No mock document for issuer: ${issuer}`,
        "DiscoveryFailed"
      );
    }

    return document;
  }

  async getProviderConfig(issuer: string): Promise<ProviderConfig> {
    const document = await this.fetch(issuer);
    return discoveryToProviderConfig(document);
  }

  clearCache(): void {
    // No-op for mock
  }
}

/**
 * Create production discovery client.
 */
export function createDiscoveryClient(
  transport: HttpTransport,
  cacheTtlSeconds?: number
): DiscoveryClient {
  return new DefaultDiscoveryClient(transport, { cacheTtlSeconds });
}

/**
 * Create mock discovery client for testing.
 */
export function createMockDiscoveryClient(): MockDiscoveryClient {
  return new MockDiscoveryClient();
}

/**
 * Create a mock OIDC discovery document for testing.
 */
export function createMockDiscoveryDocument(
  issuer: string,
  overrides?: Partial<OIDCDiscoveryDocument>
): OIDCDiscoveryDocument {
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    userinfo_endpoint: `${issuer}/userinfo`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    scopes_supported: ["openid", "profile", "email"],
    response_types_supported: ["code", "token", "id_token"],
    grant_types_supported: [
      "authorization_code",
      "refresh_token",
      "client_credentials",
    ],
    token_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post",
    ],
    revocation_endpoint: `${issuer}/revoke`,
    introspection_endpoint: `${issuer}/introspect`,
    ...overrides,
  };
}
