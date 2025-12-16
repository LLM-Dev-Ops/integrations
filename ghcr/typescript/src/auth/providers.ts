/**
 * Credential providers for GitHub Container Registry authentication.
 * @module auth/providers
 */

import { GhcrError, GhcrErrorKind } from '../errors.js';
import { SecretString } from './token-manager.js';

/**
 * GHCR credentials.
 */
export interface GhcrCredentials {
  /** Username (GitHub username) */
  readonly username: string;
  /** Token (PAT or GITHUB_TOKEN) */
  readonly token: SecretString;
}

/**
 * Credential provider interface.
 */
export interface CredentialProvider {
  /**
   * Gets the current credentials.
   */
  getCredentials(): Promise<GhcrCredentials>;

  /**
   * Invalidates cached credentials (if any).
   */
  invalidate(): void;

  /**
   * Checks if credentials are available.
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Static credential provider with fixed credentials.
 */
export class StaticCredentialProvider implements CredentialProvider {
  private readonly credentials: GhcrCredentials;

  constructor(username: string, token: string) {
    this.credentials = {
      username,
      token: new SecretString(token),
    };
  }

  async getCredentials(): Promise<GhcrCredentials> {
    return this.credentials;
  }

  invalidate(): void {
    // Static credentials cannot be invalidated
  }

  async isAvailable(): Promise<boolean> {
    return !this.credentials.token.isEmpty();
  }

  /**
   * Creates a provider from a PAT.
   */
  static fromPat(username: string, pat: string): StaticCredentialProvider {
    return new StaticCredentialProvider(username, pat);
  }
}

/**
 * Environment variable credential provider.
 */
export class EnvCredentialProvider implements CredentialProvider {
  private readonly usernameVar: string;
  private readonly tokenVar: string;

  constructor(usernameVar: string, tokenVar: string) {
    this.usernameVar = usernameVar;
    this.tokenVar = tokenVar;
  }

  async getCredentials(): Promise<GhcrCredentials> {
    const username = process.env[this.usernameVar];
    const token = process.env[this.tokenVar];

    if (!username) {
      throw new GhcrError(
        GhcrErrorKind.InvalidCredentials,
        `Environment variable ${this.usernameVar} not set`
      );
    }

    if (!token) {
      throw new GhcrError(
        GhcrErrorKind.InvalidCredentials,
        `Environment variable ${this.tokenVar} not set`
      );
    }

    return {
      username,
      token: new SecretString(token),
    };
  }

  invalidate(): void {
    // Environment variables are re-read each time
  }

  async isAvailable(): Promise<boolean> {
    return (
      process.env[this.usernameVar] !== undefined &&
      process.env[this.tokenVar] !== undefined
    );
  }

  /**
   * Creates a provider from GHCR_USERNAME and GHCR_TOKEN.
   */
  static fromGhcrEnv(): EnvCredentialProvider {
    return new EnvCredentialProvider('GHCR_USERNAME', 'GHCR_TOKEN');
  }

  /**
   * Creates a provider from GITHUB_ACTOR and GITHUB_TOKEN (for Actions).
   */
  static fromGitHubActions(): EnvCredentialProvider {
    return new EnvCredentialProvider('GITHUB_ACTOR', 'GITHUB_TOKEN');
  }
}

/**
 * Chain of credential providers.
 * Tries each provider in order until one succeeds.
 */
export class ChainCredentialProvider implements CredentialProvider {
  private readonly providers: CredentialProvider[];
  private cachedCredentials?: GhcrCredentials;

  constructor(providers: CredentialProvider[]) {
    if (providers.length === 0) {
      throw new GhcrError(
        GhcrErrorKind.InvalidConfig,
        'ChainCredentialProvider requires at least one provider'
      );
    }
    this.providers = providers;
  }

  async getCredentials(): Promise<GhcrCredentials> {
    if (this.cachedCredentials) {
      return this.cachedCredentials;
    }

    const errors: Error[] = [];

    for (const provider of this.providers) {
      try {
        const available = await provider.isAvailable();
        if (!available) {
          continue;
        }

        const credentials = await provider.getCredentials();
        this.cachedCredentials = credentials;
        return credentials;
      } catch (error) {
        errors.push(error as Error);
      }
    }

    throw new GhcrError(
      GhcrErrorKind.InvalidCredentials,
      `No credential provider succeeded. Tried ${this.providers.length} providers.`,
      { context: { errors: errors.map(e => e.message) } }
    );
  }

  invalidate(): void {
    this.cachedCredentials = undefined;
    for (const provider of this.providers) {
      provider.invalidate();
    }
  }

  async isAvailable(): Promise<boolean> {
    for (const provider of this.providers) {
      if (await provider.isAvailable()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Creates a default chain that tries:
   * 1. GitHub Actions environment
   * 2. GHCR_USERNAME/GHCR_TOKEN environment
   */
  static defaultChain(): ChainCredentialProvider {
    return new ChainCredentialProvider([
      EnvCredentialProvider.fromGitHubActions(),
      EnvCredentialProvider.fromGhcrEnv(),
    ]);
  }
}

/**
 * Creates a credential provider from environment.
 * Automatically detects the best provider.
 */
export function createCredentialProvider(): CredentialProvider {
  // Check if running in GitHub Actions
  if (process.env['GITHUB_ACTIONS'] === 'true') {
    return EnvCredentialProvider.fromGitHubActions();
  }

  // Use default chain
  return ChainCredentialProvider.defaultChain();
}
