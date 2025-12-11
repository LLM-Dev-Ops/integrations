/**
 * PKCE Generator
 *
 * RFC 7636 Proof Key for Code Exchange implementation.
 */

import * as crypto from "crypto";

/**
 * PKCE challenge method.
 */
export type PkceMethod = "S256" | "plain";

/**
 * PKCE parameters.
 */
export interface PkceParams {
  /** Code verifier (keep secret until token exchange) */
  codeVerifier: string;
  /** Code challenge (sent in authorization URL) */
  codeChallenge: string;
  /** Challenge method used */
  codeChallengeMethod: PkceMethod;
}

/**
 * PKCE generator interface (for dependency injection).
 */
export interface PkceGenerator {
  /**
   * Generate PKCE parameters.
   */
  generate(method?: PkceMethod): PkceParams;

  /**
   * Compute challenge from verifier.
   */
  computeChallenge(verifier: string, method: PkceMethod): string;
}

/**
 * Default PKCE generator implementation.
 */
export class DefaultPkceGenerator implements PkceGenerator {
  private verifierLength: number;

  constructor(options?: { verifierLength?: number }) {
    // RFC 7636: verifier must be 43-128 characters
    const length = options?.verifierLength ?? 64;
    if (length < 43 || length > 128) {
      throw new Error("PKCE verifier length must be between 43 and 128");
    }
    this.verifierLength = length;
  }

  generate(method: PkceMethod = "S256"): PkceParams {
    const codeVerifier = this.generateVerifier();
    const codeChallenge = this.computeChallenge(codeVerifier, method);

    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: method,
    };
  }

  computeChallenge(verifier: string, method: PkceMethod): string {
    if (method === "plain") {
      return verifier;
    }

    // S256: BASE64URL(SHA256(code_verifier))
    const hash = crypto.createHash("sha256").update(verifier).digest();
    return hash.toString("base64url");
  }

  private generateVerifier(): string {
    // Generate random bytes and encode as base64url
    // Each byte gives ~1.33 characters in base64
    const bytesNeeded = Math.ceil(this.verifierLength * 0.75);
    const randomBytes = crypto.randomBytes(bytesNeeded);
    const verifier = randomBytes.toString("base64url");

    // Trim to exact length
    return verifier.slice(0, this.verifierLength);
  }
}

/**
 * Mock PKCE generator for testing.
 */
export class MockPkceGenerator implements PkceGenerator {
  private nextVerifier?: string;
  private generateHistory: PkceParams[] = [];

  /**
   * Set the next verifier to generate.
   */
  setNextVerifier(verifier: string): this {
    this.nextVerifier = verifier;
    return this;
  }

  /**
   * Get generate history.
   */
  getGenerateHistory(): PkceParams[] {
    return [...this.generateHistory];
  }

  generate(method: PkceMethod = "S256"): PkceParams {
    const codeVerifier = this.nextVerifier ?? "mock-verifier-" + Date.now();
    this.nextVerifier = undefined;

    const codeChallenge = this.computeChallenge(codeVerifier, method);

    const params: PkceParams = {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: method,
    };

    this.generateHistory.push(params);
    return params;
  }

  computeChallenge(verifier: string, method: PkceMethod): string {
    if (method === "plain") {
      return verifier;
    }
    const hash = crypto.createHash("sha256").update(verifier).digest();
    return hash.toString("base64url");
  }
}

/**
 * Validate PKCE verifier format.
 */
export function isValidVerifier(verifier: string): boolean {
  // RFC 7636: verifier must be 43-128 characters
  if (verifier.length < 43 || verifier.length > 128) {
    return false;
  }

  // Must only contain unreserved characters: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
  const validChars = /^[A-Za-z0-9\-._~]+$/;
  return validChars.test(verifier);
}

/**
 * Create production PKCE generator.
 */
export function createPkceGenerator(verifierLength?: number): PkceGenerator {
  return new DefaultPkceGenerator({ verifierLength });
}

/**
 * Create mock PKCE generator for testing.
 */
export function createMockPkceGenerator(): MockPkceGenerator {
  return new MockPkceGenerator();
}
