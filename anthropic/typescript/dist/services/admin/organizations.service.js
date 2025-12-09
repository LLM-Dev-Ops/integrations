export class OrganizationsServiceImpl {
    transport;
    authManager;
    resilience;
    constructor(transport, authManager, resilience) {
        this.transport = transport;
        this.authManager = authManager;
        this.resilience = resilience;
    }
    async get() {
        const headers = this.authManager.getHeaders();
        return this.resilience.execute(() => this.transport.request('GET', '/v1/organizations/me', undefined, headers));
    }
    async update(request) {
        const headers = this.authManager.getHeaders();
        return this.resilience.execute(() => this.transport.request('POST', '/v1/organizations/me', request, headers));
    }
}
//# sourceMappingURL=organizations.service.js.map