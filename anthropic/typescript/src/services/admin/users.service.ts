import { HttpTransport } from '../../transport/index.js';
import { AuthManager } from '../../auth/index.js';
import { ResilienceOrchestrator } from '../../resilience/index.js';
import {
  User,
  ListParams,
  ListResponse,
} from './types.js';

export interface UsersService {
  list(params?: ListParams): Promise<ListResponse<User>>;
  get(userId: string): Promise<User>;
  getMe(): Promise<User>;
}

export class UsersServiceImpl implements UsersService {
  constructor(
    private transport: HttpTransport,
    private authManager: AuthManager,
    private resilience: ResilienceOrchestrator,
  ) {}

  async list(params?: ListParams): Promise<ListResponse<User>> {
    const headers = this.authManager.getHeaders();
    const queryParams = this.buildQueryParams(params);
    const endpoint = `/v1/users${queryParams}`;

    return this.resilience.execute(() =>
      this.transport.request('GET', endpoint, undefined, headers)
    );
  }

  async get(userId: string): Promise<User> {
    const headers = this.authManager.getHeaders();
    return this.resilience.execute(() =>
      this.transport.request('GET', `/v1/users/${userId}`, undefined, headers)
    );
  }

  async getMe(): Promise<User> {
    const headers = this.authManager.getHeaders();
    return this.resilience.execute(() =>
      this.transport.request('GET', '/v1/users/me', undefined, headers)
    );
  }

  private buildQueryParams(params?: ListParams): string {
    if (!params) {
      return '';
    }

    const queryParts: string[] = [];
    if (params.before_id) {
      queryParts.push(`before_id=${encodeURIComponent(params.before_id)}`);
    }
    if (params.after_id) {
      queryParts.push(`after_id=${encodeURIComponent(params.after_id)}`);
    }
    if (params.limit !== undefined) {
      queryParts.push(`limit=${params.limit}`);
    }

    return queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  }
}
