/**
 * Authentication mechanisms for Jenkins API.
 * @module auth
 */

/**
 * Secret string wrapper to prevent accidental exposure.
 */
export class SecretString {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  /**
   * Exposes the secret value.
   * Use with caution - avoid logging or displaying.
   */
  expose(): string {
    return this.value;
  }

  /**
   * Returns a safe representation for logging.
   */
  toString(): string {
    return '***';
  }

  /**
   * Custom JSON serialization to prevent accidental exposure.
   */
  toJSON(): string {
    return '***';
  }
}

/**
 * Jenkins credentials using username and API token.
 */
export interface JenkinsCredentials {
  /** Jenkins username. */
  username: string;
  /** Jenkins API token. */
  token: SecretString;
}

/**
 * Credential provider interface for dynamic credential resolution.
 */
export interface CredentialProvider {
  /**
   * Gets the current credentials.
   */
  getCredentials(): Promise<JenkinsCredentials>;

  /**
   * Invalidates cached credentials if applicable.
   */
  invalidate(): Promise<void>;
}

/**
 * Static credential provider using fixed credentials.
 */
export class StaticCredentialProvider implements CredentialProvider {
  private readonly credentials: JenkinsCredentials;

  constructor(username: string, token: string) {
    this.credentials = {
      username,
      token: new SecretString(token),
    };
  }

  async getCredentials(): Promise<JenkinsCredentials> {
    return this.credentials;
  }

  async invalidate(): Promise<void> {
    // Static credentials cannot be invalidated
  }
}

/**
 * Environment variable credential provider.
 */
export class EnvCredentialProvider implements CredentialProvider {
  private readonly usernameVar: string;
  private readonly tokenVar: string;

  /**
   * Creates a provider from JENKINS_USERNAME and JENKINS_TOKEN environment variables.
   */
  static fromDefaults(): EnvCredentialProvider {
    return new EnvCredentialProvider('JENKINS_USERNAME', 'JENKINS_TOKEN');
  }

  /**
   * Creates a provider from custom environment variables.
   */
  constructor(usernameVar: string = 'JENKINS_USERNAME', tokenVar: string = 'JENKINS_TOKEN') {
    this.usernameVar = usernameVar;
    this.tokenVar = tokenVar;
  }

  async getCredentials(): Promise<JenkinsCredentials> {
    const username = process.env[this.usernameVar];
    const token = process.env[this.tokenVar];

    if (!username) {
      throw new Error(
        `Environment variable ${this.usernameVar} not set`
      );
    }

    if (!token) {
      throw new Error(
        `Environment variable ${this.tokenVar} not set`
      );
    }

    return {
      username,
      token: new SecretString(token),
    };
  }

  async invalidate(): Promise<void> {
    // Environment variables are re-read each time
  }
}

/**
 * Factory function to create static credentials.
 * @param username - Jenkins username.
 * @param token - Jenkins API token.
 * @returns A static credential provider.
 */
export function createStaticCredentials(username: string, token: string): CredentialProvider {
  return new StaticCredentialProvider(username, token);
}

/**
 * Factory function to create environment-based credentials.
 * @param usernameVar - Environment variable name for username (default: JENKINS_USERNAME).
 * @param tokenVar - Environment variable name for token (default: JENKINS_TOKEN).
 * @returns An environment credential provider.
 */
export function createEnvCredentials(
  usernameVar?: string,
  tokenVar?: string
): CredentialProvider {
  return usernameVar || tokenVar
    ? new EnvCredentialProvider(usernameVar, tokenVar)
    : EnvCredentialProvider.fromDefaults();
}
