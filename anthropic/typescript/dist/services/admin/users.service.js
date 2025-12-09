export class UsersServiceImpl {
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
        const endpoint = `/v1/users${queryParams}`;
        return this.resilience.execute(() => this.transport.request('GET', endpoint, undefined, headers));
    }
    async get(userId) {
        const headers = this.authManager.getHeaders();
        return this.resilience.execute(() => this.transport.request('GET', `/v1/users/${userId}`, undefined, headers));
    }
    async getMe() {
        const headers = this.authManager.getHeaders();
        return this.resilience.execute(() => this.transport.request('GET', '/v1/users/me', undefined, headers));
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
//# sourceMappingURL=users.service.js.map