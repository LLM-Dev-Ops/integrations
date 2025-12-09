import { HttpTransport } from '../../transport/index.js';
import { AuthManager } from '../../auth/index.js';
import { ResilienceOrchestrator } from '../../resilience/index.js';
import { Organization, UpdateOrganizationRequest } from './types.js';

export interface OrganizationsService {
  get(): Promise<Organization>;
  update(request: UpdateOrganizationRequest): Promise<Organization>;
}

export class OrganizationsServiceImpl implements OrganizationsService {
  constructor(
    private transport: HttpTransport,
    private authManager: AuthManager,
    private resilience: ResilienceOrchestrator,
  ) {}

  async get(): Promise<Organization> {
    const headers = this.authManager.getHeaders();
    return this.resilience.execute(() =>
      this.transport.request('GET', '/v1/organizations/me', undefined, headers)
    );
  }

  async update(request: UpdateOrganizationRequest): Promise<Organization> {
    const headers = this.authManager.getHeaders();
    return this.resilience.execute(() =>
      this.transport.request('POST', '/v1/organizations/me', request, headers)
    );
  }
}
