/**
 * Authentication providers for the Groq client.
 */

/**
 * Authentication provider interface.
 */
export interface AuthProvider {
  /**
   * Returns the authorization header value.
   */
  getAuthHeader(): string;

  /**
   * Returns a hint of the API key for debugging (last 4 chars).
   */
  getApiKeyHint(): string;
}

/**
 * Bearer token authentication provider.
 */
export class BearerAuthProvider implements AuthProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error('API key cannot be empty');
    }
    this.apiKey = apiKey;
  }

  getAuthHeader(): string {
    return `Bearer ${this.apiKey}`;
  }

  getApiKeyHint(): string {
    if (this.apiKey.length > 4) {
      return `...${this.apiKey.slice(-4)}`;
    }
    return '****';
  }
}

/**
 * Creates a bearer auth provider from an API key.
 */
export function createBearerAuth(apiKey: string): AuthProvider {
  return new BearerAuthProvider(apiKey);
}
