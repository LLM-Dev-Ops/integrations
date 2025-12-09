export class WorkspacesServiceImpl {
    transport;
    authManager;
    resilience;
    constructor(transport, authManager, resilience) {
        this.transport = transport;
        this.authManager = authManager;
        this.resilience = resilience;
    }
    async list(params) {
        const headers = this.authManager.getHeaders();
        const queryParams = this.buildQueryParams(params);
        const endpoint = `/v1/workspaces${queryParams}`;
        return this.resilience.execute(() => this.transport.request('GET', endpoint, undefined, headers));
    }
    async get(workspaceId) {
        const headers = this.authManager.getHeaders();
        return this.resilience.execute(() => this.transport.request('GET', `/v1/workspaces/${workspaceId}`, undefined, headers));
    }
    async create(request) {
        const headers = this.authManager.getHeaders();
        return this.resilience.execute(() => this.transport.request('POST', '/v1/workspaces', request, headers));
    }
    async update(workspaceId, request) {
        const headers = this.authManager.getHeaders();
        return this.resilience.execute(() => this.transport.request('POST', `/v1/workspaces/${workspaceId}`, request, headers));
    }
    async archive(workspaceId) {
        const headers = this.authManager.getHeaders();
        return this.resilience.execute(() => this.transport.request('POST', `/v1/workspaces/${workspaceId}/archive`, undefined, headers));
    }
    async listMembers(workspaceId, params) {
        const headers = this.authManager.getHeaders();
        const queryParams = this.buildQueryParams(params);
        const endpoint = `/v1/workspaces/${workspaceId}/members${queryParams}`;
        return this.resilience.execute(() => this.transport.request('GET', endpoint, undefined, headers));
    }
    async addMember(workspaceId, request) {
        const headers = this.authManager.getHeaders();
        return this.resilience.execute(() => this.transport.request('POST', `/v1/workspaces/${workspaceId}/members`, request, headers));
    }
    async getMember(workspaceId, userId) {
        const headers = this.authManager.getHeaders();
        return this.resilience.execute(() => this.transport.request('GET', `/v1/workspaces/${workspaceId}/members/${userId}`, undefined, headers));
    }
    async updateMember(workspaceId, userId, request) {
        const headers = this.authManager.getHeaders();
        return this.resilience.execute(() => this.transport.request('POST', `/v1/workspaces/${workspaceId}/members/${userId}`, request, headers));
    }
    async removeMember(workspaceId, userId) {
        const headers = this.authManager.getHeaders();
        return this.resilience.execute(() => this.transport.request('DELETE', `/v1/workspaces/${workspaceId}/members/${userId}`, undefined, headers));
    }
    buildQueryParams(params) {
        if (!params) {
            return '';
        }
        const queryParts = [];
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
//# sourceMappingURL=workspaces.service.js.map