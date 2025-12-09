import { HttpTransport } from '../../transport/index.js';
import { AuthManager } from '../../auth/index.js';
import { ResilienceOrchestrator } from '../../resilience/index.js';
import {
  Invite,
  CreateInviteRequest,
  ListParams,
  ListResponse,
} from './types.js';

export interface InvitesService {
  list(params?: ListParams): Promise<ListResponse<Invite>>;
  get(inviteId: string): Promise<Invite>;
  create(request: CreateInviteRequest): Promise<Invite>;
  delete(inviteId: string): Promise<void>;
}

export class InvitesServiceImpl implements InvitesService {
  constructor(
    private transport: HttpTransport,
    private authManager: AuthManager,
    private resilience: ResilienceOrchestrator,
  ) {}

  async list(params?: ListParams): Promise<ListResponse<Invite>> {
    const headers = this.authManager.getHeaders();
    const queryParams = this.buildQueryParams(params);
    const endpoint = `/v1/invites${queryParams}`;

    return this.resilience.execute(() =>
      this.transport.request('GET', endpoint, undefined, headers)
    );
  }

  async get(inviteId: string): Promise<Invite> {
    const headers = this.authManager.getHeaders();
    return this.resilience.execute(() =>
      this.transport.request('GET', `/v1/invites/${inviteId}`, undefined, headers)
    );
  }

  async create(request: CreateInviteRequest): Promise<Invite> {
    const headers = this.authManager.getHeaders();
    return this.resilience.execute(() =>
      this.transport.request('POST', '/v1/invites', request, headers)
    );
  }

  async delete(inviteId: string): Promise<void> {
    const headers = this.authManager.getHeaders();
    return this.resilience.execute(() =>
      this.transport.request('DELETE', `/v1/invites/${inviteId}`, undefined, headers)
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
