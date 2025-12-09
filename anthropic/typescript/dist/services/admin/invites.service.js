export class InvitesServiceImpl {
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
        const endpoint = `/v1/invites${queryParams}`;
        return this.resilience.execute(() => this.transport.request('GET', endpoint, undefined, headers));
    }
    async get(inviteId) {
        const headers = this.authManager.getHeaders();
        return this.resilience.execute(() => this.transport.request('GET', `/v1/invites/${inviteId}`, undefined, headers));
    }
    async create(request) {
        const headers = this.authManager.getHeaders();
        return this.resilience.execute(() => this.transport.request('POST', '/v1/invites', request, headers));
    }
    async delete(inviteId) {
        const headers = this.authManager.getHeaders();
        return this.resilience.execute(() => this.transport.request('DELETE', `/v1/invites/${inviteId}`, undefined, headers));
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
//# sourceMappingURL=invites.service.js.map