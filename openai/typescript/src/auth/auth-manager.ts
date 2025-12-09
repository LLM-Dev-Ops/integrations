import { AuthenticationError } from '../errors/categories.js';

export interface AuthManager {
  applyAuth(headers: Record<string, string>): void;
  validate(): void;
}

export interface AuthConfig {
  apiKey: string;
  organizationId?: string;
  projectId?: string;
}

export class BearerAuthManager implements AuthManager {
  constructor(private readonly config: AuthConfig) {}

  applyAuth(headers: Record<string, string>): void {
    headers['Authorization'] = `Bearer ${this.config.apiKey}`;

    if (this.config.organizationId) {
      headers['OpenAI-Organization'] = this.config.organizationId;
    }

    if (this.config.projectId) {
      headers['OpenAI-Project'] = this.config.projectId;
    }
  }

  validate(): void {
    if (!this.config.apiKey) {
      throw new AuthenticationError('API key is required');
    }
    if (!this.config.apiKey.startsWith('sk-')) {
      throw new AuthenticationError('Invalid API key format. API key should start with "sk-"');
    }
  }
}

export function createAuthManager(config: AuthConfig): AuthManager {
  const manager = new BearerAuthManager(config);
  manager.validate();
  return manager;
}
