import { HttpTransport } from '../../transport/index.js';
import { AuthManager } from '../../auth/index.js';
import { ResilienceOrchestrator } from '../../resilience/index.js';
import {
  Workspace,
  WorkspaceMember,
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
  AddWorkspaceMemberRequest,
  UpdateWorkspaceMemberRequest,
  ListParams,
  ListResponse,
} from './types.js';

export interface WorkspacesService {
  list(params?: ListParams): Promise<ListResponse<Workspace>>;
  get(workspaceId: string): Promise<Workspace>;
  create(request: CreateWorkspaceRequest): Promise<Workspace>;
  update(workspaceId: string, request: UpdateWorkspaceRequest): Promise<Workspace>;
  archive(workspaceId: string): Promise<Workspace>;
  listMembers(workspaceId: string, params?: ListParams): Promise<ListResponse<WorkspaceMember>>;
  addMember(workspaceId: string, request: AddWorkspaceMemberRequest): Promise<WorkspaceMember>;
  getMember(workspaceId: string, userId: string): Promise<WorkspaceMember>;
  updateMember(workspaceId: string, userId: string, request: UpdateWorkspaceMemberRequest): Promise<WorkspaceMember>;
  removeMember(workspaceId: string, userId: string): Promise<void>;
}

export class WorkspacesServiceImpl implements WorkspacesService {
  constructor(
    private transport: HttpTransport,
    private authManager: AuthManager,
    private resilience: ResilienceOrchestrator,
  ) {}

  async list(params?: ListParams): Promise<ListResponse<Workspace>> {
    const headers = this.authManager.getHeaders();
    const queryParams = this.buildQueryParams(params);
    const endpoint = `/v1/workspaces${queryParams}`;

    return this.resilience.execute(() =>
      this.transport.request('GET', endpoint, undefined, headers)
    );
  }

  async get(workspaceId: string): Promise<Workspace> {
    const headers = this.authManager.getHeaders();
    return this.resilience.execute(() =>
      this.transport.request('GET', `/v1/workspaces/${workspaceId}`, undefined, headers)
    );
  }

  async create(request: CreateWorkspaceRequest): Promise<Workspace> {
    const headers = this.authManager.getHeaders();
    return this.resilience.execute(() =>
      this.transport.request('POST', '/v1/workspaces', request, headers)
    );
  }

  async update(workspaceId: string, request: UpdateWorkspaceRequest): Promise<Workspace> {
    const headers = this.authManager.getHeaders();
    return this.resilience.execute(() =>
      this.transport.request('POST', `/v1/workspaces/${workspaceId}`, request, headers)
    );
  }

  async archive(workspaceId: string): Promise<Workspace> {
    const headers = this.authManager.getHeaders();
    return this.resilience.execute(() =>
      this.transport.request('POST', `/v1/workspaces/${workspaceId}/archive`, undefined, headers)
    );
  }

  async listMembers(workspaceId: string, params?: ListParams): Promise<ListResponse<WorkspaceMember>> {
    const headers = this.authManager.getHeaders();
    const queryParams = this.buildQueryParams(params);
    const endpoint = `/v1/workspaces/${workspaceId}/members${queryParams}`;

    return this.resilience.execute(() =>
      this.transport.request('GET', endpoint, undefined, headers)
    );
  }

  async addMember(workspaceId: string, request: AddWorkspaceMemberRequest): Promise<WorkspaceMember> {
    const headers = this.authManager.getHeaders();
    return this.resilience.execute(() =>
      this.transport.request('POST', `/v1/workspaces/${workspaceId}/members`, request, headers)
    );
  }

  async getMember(workspaceId: string, userId: string): Promise<WorkspaceMember> {
    const headers = this.authManager.getHeaders();
    return this.resilience.execute(() =>
      this.transport.request('GET', `/v1/workspaces/${workspaceId}/members/${userId}`, undefined, headers)
    );
  }

  async updateMember(workspaceId: string, userId: string, request: UpdateWorkspaceMemberRequest): Promise<WorkspaceMember> {
    const headers = this.authManager.getHeaders();
    return this.resilience.execute(() =>
      this.transport.request('POST', `/v1/workspaces/${workspaceId}/members/${userId}`, request, headers)
    );
  }

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    const headers = this.authManager.getHeaders();
    return this.resilience.execute(() =>
      this.transport.request('DELETE', `/v1/workspaces/${workspaceId}/members/${userId}`, undefined, headers)
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
