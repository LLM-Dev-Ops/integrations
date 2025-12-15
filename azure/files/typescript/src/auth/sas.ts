/**
 * Azure SAS Token Authentication
 *
 * Implements SAS token handling for Azure Files REST API requests.
 */

import { createHmac } from "crypto";
import { API_VERSION } from "../config/index.js";

/**
 * SAS permissions for Azure Files.
 */
export interface SasPermissions {
  read?: boolean;
  write?: boolean;
  delete?: boolean;
  list?: boolean;
  create?: boolean;
}

/**
 * SAS generation options.
 */
export interface SasGenerationOptions {
  /** Permissions to grant. */
  permissions: SasPermissions;
  /** Token expiry duration in milliseconds from now. */
  expiryMs: number;
  /** Optional start time offset in milliseconds from now. */
  startMs?: number;
  /** Optional share name to scope the token. */
  share?: string;
  /** Optional path to scope the token. */
  path?: string;
  /** IP address or range to restrict access. */
  ipRange?: string;
  /** Protocol restriction (https or https,http). */
  protocol?: "https" | "https,http";
}

/**
 * Generated SAS token.
 */
export interface SasToken {
  /** The full SAS query string. */
  token: string;
  /** Token expiry time. */
  expiresAt: Date;
  /** Token start time. */
  startsAt: Date;
}

/**
 * SAS token auth provider.
 */
export class SasTokenAuthProvider {
  private readonly token: string;

  constructor(token: string) {
    // Remove leading ? if present
    this.token = token.startsWith("?") ? token.slice(1) : token;
  }

  /**
   * Apply SAS token to a URL.
   */
  applyToUrl(url: string): string {
    const parsedUrl = new URL(url);
    const separator = parsedUrl.search ? "&" : "?";
    return `${url}${separator}${this.token}`;
  }

  /**
   * Get the token string.
   */
  getToken(): string {
    return this.token;
  }

  /**
   * Check if the token is expired.
   */
  isExpired(): boolean {
    const params = new URLSearchParams(this.token);
    const se = params.get("se"); // Signed expiry
    if (!se) return false;

    const expiryDate = new Date(se);
    return expiryDate < new Date();
  }
}

/**
 * SAS generator for creating new tokens.
 */
export class SasGenerator {
  private readonly accountName: string;
  private readonly accountKey: Buffer;

  constructor(accountName: string, accountKey: string) {
    this.accountName = accountName;
    this.accountKey = Buffer.from(accountKey, "base64");
  }

  /**
   * Generate a service SAS token for Azure Files.
   */
  generateServiceSas(options: SasGenerationOptions): SasToken {
    const now = new Date();
    const startsAt = new Date(now.getTime() + (options.startMs ?? 0));
    const expiresAt = new Date(now.getTime() + options.expiryMs);

    // Build permissions string
    const permissions = this.buildPermissionsString(options.permissions);

    // Build the signature components
    const signedStart = this.formatDateTime(startsAt);
    const signedExpiry = this.formatDateTime(expiresAt);
    const signedService = "f"; // File service
    const signedResourceTypes = "sco"; // Service, container, object
    const signedProtocol = options.protocol ?? "https";

    // Build string to sign for account SAS
    const stringToSign = [
      this.accountName,
      permissions,
      signedService,
      signedResourceTypes,
      signedStart,
      signedExpiry,
      options.ipRange ?? "",
      signedProtocol,
      API_VERSION,
      "", // Additional signed fields (empty for now)
    ].join("\n");

    // Create signature
    const signature = this.sign(stringToSign);

    // Build query string
    const params = new URLSearchParams();
    params.set("sv", API_VERSION);
    params.set("ss", signedService);
    params.set("srt", signedResourceTypes);
    params.set("sp", permissions);
    params.set("st", signedStart);
    params.set("se", signedExpiry);
    params.set("spr", signedProtocol);

    if (options.ipRange) {
      params.set("sip", options.ipRange);
    }

    params.set("sig", signature);

    return {
      token: params.toString(),
      expiresAt,
      startsAt,
    };
  }

  /**
   * Generate a file/share-scoped SAS token.
   */
  generateFileSas(
    share: string,
    path: string,
    options: Omit<SasGenerationOptions, "share" | "path">
  ): SasToken {
    const now = new Date();
    const startsAt = new Date(now.getTime() + (options.startMs ?? 0));
    const expiresAt = new Date(now.getTime() + options.expiryMs);

    const permissions = this.buildPermissionsString(options.permissions);
    const signedStart = this.formatDateTime(startsAt);
    const signedExpiry = this.formatDateTime(expiresAt);
    const signedProtocol = options.protocol ?? "https";

    // Canonicalized resource for file SAS
    const canonicalizedResource = `/file/${this.accountName}/${share}/${path}`;

    // String to sign for file service SAS
    const stringToSign = [
      permissions,
      signedStart,
      signedExpiry,
      canonicalizedResource,
      "", // Identifier
      options.ipRange ?? "",
      signedProtocol,
      API_VERSION,
      "", // Cache-Control
      "", // Content-Disposition
      "", // Content-Encoding
      "", // Content-Language
      "", // Content-Type
    ].join("\n");

    const signature = this.sign(stringToSign);

    const params = new URLSearchParams();
    params.set("sv", API_VERSION);
    params.set("sp", permissions);
    params.set("st", signedStart);
    params.set("se", signedExpiry);
    params.set("sr", "f"); // Signed resource: file
    params.set("spr", signedProtocol);

    if (options.ipRange) {
      params.set("sip", options.ipRange);
    }

    params.set("sig", signature);

    return {
      token: params.toString(),
      expiresAt,
      startsAt,
    };
  }

  /**
   * Build permissions string from options.
   */
  private buildPermissionsString(perms: SasPermissions): string {
    let result = "";
    if (perms.read) result += "r";
    if (perms.write) result += "w";
    if (perms.delete) result += "d";
    if (perms.list) result += "l";
    if (perms.create) result += "c";
    return result;
  }

  /**
   * Format date for SAS token.
   */
  private formatDateTime(date: Date): string {
    return date.toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  /**
   * Sign the string with HMAC-SHA256.
   */
  private sign(stringToSign: string): string {
    const hmac = createHmac("sha256", this.accountKey);
    hmac.update(stringToSign, "utf8");
    return hmac.digest("base64");
  }
}

/**
 * Create a SAS token auth provider.
 */
export function createSasTokenAuth(token: string): SasTokenAuthProvider {
  return new SasTokenAuthProvider(token);
}

/**
 * Create a SAS generator.
 */
export function createSasGenerator(accountName: string, accountKey: string): SasGenerator {
  return new SasGenerator(accountName, accountKey);
}
