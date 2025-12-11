/**
 * Authentication mechanisms for the SMTP client.
 */

import { createHmac } from 'crypto';
import { SmtpError, SmtpErrorKind } from '../errors';
import { AuthMethod } from '../config';

/**
 * Secure string wrapper for credentials.
 * Prevents accidental logging of sensitive values.
 */
export class SecretString {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  /** Gets the secret value. */
  expose(): string {
    return this.value;
  }

  /** Prevents accidental logging. */
  toString(): string {
    return '[REDACTED]';
  }

  /** Prevents accidental JSON serialization. */
  toJSON(): string {
    return '[REDACTED]';
  }
}

/**
 * SMTP credentials.
 */
export interface Credentials {
  /** Username for authentication. */
  username: string;
  /** Password (wrapped in SecretString). */
  password: SecretString;
}

/**
 * Creates credentials from plain strings.
 */
export function createCredentials(username: string, password: string): Credentials {
  return {
    username,
    password: new SecretString(password),
  };
}

/**
 * OAuth2 token for authentication.
 */
export interface OAuth2Token {
  /** Access token. */
  accessToken: SecretString;
  /** Token expiration time. */
  expiresAt?: Date;
  /** Refresh token (optional). */
  refreshToken?: SecretString;
}

/**
 * Creates an OAuth2 token.
 */
export function createOAuth2Token(
  accessToken: string,
  expiresAt?: Date,
  refreshToken?: string
): OAuth2Token {
  return {
    accessToken: new SecretString(accessToken),
    expiresAt,
    refreshToken: refreshToken ? new SecretString(refreshToken) : undefined,
  };
}

/**
 * Credential provider interface for dynamic credential resolution.
 */
export interface CredentialProvider {
  /** Gets credentials for authentication. */
  getCredentials(): Promise<Credentials>;
  /** Checks if credentials are still valid. */
  isValid(): Promise<boolean>;
  /** Refreshes credentials if needed. */
  refresh?(): Promise<void>;
}

/**
 * OAuth2 provider interface for OAuth-based authentication.
 */
export interface OAuth2Provider {
  /** Gets the current OAuth2 token. */
  getToken(): Promise<OAuth2Token>;
  /** Refreshes the token if expired or about to expire. */
  refreshToken(): Promise<OAuth2Token>;
  /** Checks if the token is still valid. */
  isTokenValid(): boolean;
}

/**
 * Static credential provider using fixed credentials.
 */
export class StaticCredentialProvider implements CredentialProvider {
  private readonly credentials: Credentials;

  constructor(username: string, password: string) {
    this.credentials = createCredentials(username, password);
  }

  async getCredentials(): Promise<Credentials> {
    return this.credentials;
  }

  async isValid(): Promise<boolean> {
    return true;
  }
}

/**
 * Static OAuth2 provider using a fixed token.
 */
export class StaticOAuth2Provider implements OAuth2Provider {
  private token: OAuth2Token;

  constructor(accessToken: string, expiresAt?: Date) {
    this.token = createOAuth2Token(accessToken, expiresAt);
  }

  async getToken(): Promise<OAuth2Token> {
    return this.token;
  }

  async refreshToken(): Promise<OAuth2Token> {
    throw new SmtpError(
      SmtpErrorKind.CredentialsExpired,
      'Static OAuth2 provider cannot refresh tokens'
    );
  }

  isTokenValid(): boolean {
    if (!this.token.expiresAt) {
      return true;
    }
    return this.token.expiresAt > new Date();
  }
}

/**
 * Result of an authentication attempt.
 */
export interface AuthResult {
  /** Whether authentication succeeded. */
  success: boolean;
  /** Error message if failed. */
  error?: string;
  /** Method used for authentication. */
  method: AuthMethod;
}

/**
 * Authenticator handles SMTP authentication.
 */
export class Authenticator {
  private readonly preferredMethod?: AuthMethod;
  private credentialProvider?: CredentialProvider;
  private oauth2Provider?: OAuth2Provider;

  constructor(preferredMethod?: AuthMethod) {
    this.preferredMethod = preferredMethod;
  }

  /** Sets the credential provider. */
  withCredentials(provider: CredentialProvider): this {
    this.credentialProvider = provider;
    return this;
  }

  /** Sets the OAuth2 provider. */
  withOAuth2(provider: OAuth2Provider): this {
    this.oauth2Provider = provider;
    return this;
  }

  /**
   * Selects the best authentication method from server capabilities.
   */
  selectMethod(serverMethods: string[]): AuthMethod | undefined {
    // If user specified a preferred method, use it if available
    if (this.preferredMethod && serverMethods.includes(this.preferredMethod)) {
      return this.preferredMethod;
    }

    // Priority order for credential-based auth
    const credentialMethods: AuthMethod[] = [
      AuthMethod.CramMd5,
      AuthMethod.Plain,
      AuthMethod.Login,
    ];

    // Priority order for OAuth-based auth
    const oauthMethods: AuthMethod[] = [AuthMethod.OAuthBearer, AuthMethod.XOAuth2];

    // Try OAuth methods first if OAuth2 provider is available
    if (this.oauth2Provider) {
      for (const method of oauthMethods) {
        if (serverMethods.includes(method)) {
          return method;
        }
      }
    }

    // Fall back to credential methods
    if (this.credentialProvider) {
      for (const method of credentialMethods) {
        if (serverMethods.includes(method)) {
          return method;
        }
      }
    }

    return undefined;
  }

  /**
   * Generates the initial authentication response for a given method.
   */
  async generateInitialResponse(method: AuthMethod): Promise<string> {
    switch (method) {
      case AuthMethod.Plain:
        return this.generatePlainResponse();
      case AuthMethod.Login:
        return ''; // LOGIN uses challenge-response
      case AuthMethod.CramMd5:
        return ''; // CRAM-MD5 uses challenge-response
      case AuthMethod.XOAuth2:
        return this.generateXOAuth2Response();
      case AuthMethod.OAuthBearer:
        return this.generateOAuthBearerResponse();
      default:
        throw new SmtpError(
          SmtpErrorKind.AuthMethodNotSupported,
          `Unsupported authentication method: ${method}`
        );
    }
  }

  /**
   * Generates a challenge response for challenge-response auth methods.
   */
  async generateChallengeResponse(method: AuthMethod, challenge: string): Promise<string> {
    switch (method) {
      case AuthMethod.Login:
        return this.generateLoginResponse(challenge);
      case AuthMethod.CramMd5:
        return this.generateCramMd5Response(challenge);
      default:
        throw new SmtpError(
          SmtpErrorKind.AuthMethodNotSupported,
          `Method ${method} does not support challenge-response`
        );
    }
  }

  /**
   * Generates PLAIN authentication response.
   * Format: base64(\0username\0password)
   */
  private async generatePlainResponse(): Promise<string> {
    const creds = await this.getCredentials();
    const authString = `\0${creds.username}\0${creds.password.expose()}`;
    return Buffer.from(authString, 'utf-8').toString('base64');
  }

  /**
   * Generates LOGIN authentication response.
   * Challenge can be "Username:" or "Password:"
   */
  private async generateLoginResponse(challenge: string): Promise<string> {
    const creds = await this.getCredentials();
    const decoded = Buffer.from(challenge, 'base64').toString('utf-8').toLowerCase();

    if (decoded.includes('username')) {
      return Buffer.from(creds.username, 'utf-8').toString('base64');
    } else if (decoded.includes('password')) {
      return Buffer.from(creds.password.expose(), 'utf-8').toString('base64');
    }

    throw new SmtpError(SmtpErrorKind.InvalidResponse, `Unknown LOGIN challenge: ${decoded}`);
  }

  /**
   * Generates CRAM-MD5 authentication response.
   * Format: base64(username HMAC-MD5(password, challenge))
   */
  private async generateCramMd5Response(challenge: string): Promise<string> {
    const creds = await this.getCredentials();
    const decodedChallenge = Buffer.from(challenge, 'base64');

    const hmac = createHmac('md5', creds.password.expose());
    hmac.update(decodedChallenge);
    const digest = hmac.digest('hex');

    const response = `${creds.username} ${digest}`;
    return Buffer.from(response, 'utf-8').toString('base64');
  }

  /**
   * Generates XOAUTH2 authentication response.
   * Format: base64(user=<email>\x01auth=Bearer <token>\x01\x01)
   */
  private async generateXOAuth2Response(): Promise<string> {
    const { token, user } = await this.getOAuth2Info();
    const authString = `user=${user}\x01auth=Bearer ${token.accessToken.expose()}\x01\x01`;
    return Buffer.from(authString, 'utf-8').toString('base64');
  }

  /**
   * Generates OAUTHBEARER authentication response.
   * Format: base64(n,a=<user>,\x01auth=Bearer <token>\x01\x01)
   */
  private async generateOAuthBearerResponse(): Promise<string> {
    const { token, user } = await this.getOAuth2Info();
    const authString = `n,a=${user},\x01auth=Bearer ${token.accessToken.expose()}\x01\x01`;
    return Buffer.from(authString, 'utf-8').toString('base64');
  }

  /**
   * Gets credentials from the provider.
   */
  private async getCredentials(): Promise<Credentials> {
    if (!this.credentialProvider) {
      throw new SmtpError(SmtpErrorKind.AuthenticationRequired, 'No credential provider configured');
    }
    return this.credentialProvider.getCredentials();
  }

  /**
   * Gets OAuth2 token and user info.
   */
  private async getOAuth2Info(): Promise<{ token: OAuth2Token; user: string }> {
    if (!this.oauth2Provider) {
      throw new SmtpError(SmtpErrorKind.AuthenticationRequired, 'No OAuth2 provider configured');
    }

    // Refresh token if needed
    if (!this.oauth2Provider.isTokenValid()) {
      await this.oauth2Provider.refreshToken();
    }

    const token = await this.oauth2Provider.getToken();

    // Get user from credential provider if available
    let user = '';
    if (this.credentialProvider) {
      const creds = await this.credentialProvider.getCredentials();
      user = creds.username;
    }

    return { token, user };
  }
}

/**
 * Creates an authenticator with plain credentials.
 */
export function createAuthenticator(
  username: string,
  password: string,
  preferredMethod?: AuthMethod
): Authenticator {
  return new Authenticator(preferredMethod).withCredentials(
    new StaticCredentialProvider(username, password)
  );
}

/**
 * Creates an authenticator with OAuth2.
 */
export function createOAuth2Authenticator(
  user: string,
  accessToken: string,
  expiresAt?: Date,
  preferredMethod?: AuthMethod
): Authenticator {
  return new Authenticator(preferredMethod ?? AuthMethod.XOAuth2)
    .withCredentials(new StaticCredentialProvider(user, ''))
    .withOAuth2(new StaticOAuth2Provider(accessToken, expiresAt));
}
