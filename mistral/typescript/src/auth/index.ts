/**
 * Authentication module for the Mistral client.
 */

/**
 * Authentication provider interface.
 */
export interface AuthProvider {
  /** Gets the authorization header value. */
  getAuthHeader(): Promise<string>;

  /** Refreshes the authentication if needed. */
  refresh?(): Promise<void>;
}

/**
 * Bearer token authentication provider.
 */
export class BearerAuthProvider implements AuthProvider {
  constructor(private readonly apiKey: string) {}

  async getAuthHeader(): Promise<string> {
    return `Bearer ${this.apiKey}`;
  }
}

/**
 * Creates a bearer auth provider.
 */
export function createBearerAuth(apiKey: string): AuthProvider {
  return new BearerAuthProvider(apiKey);
}

export { BearerAuthProvider as default };
