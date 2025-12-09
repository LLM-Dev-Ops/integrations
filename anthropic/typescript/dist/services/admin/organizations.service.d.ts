import { HttpTransport } from '../../transport/index.js';
import { AuthManager } from '../../auth/index.js';
import { ResilienceOrchestrator } from '../../resilience/index.js';
import { Organization, UpdateOrganizationRequest } from './types.js';
export interface OrganizationsService {
    get(): Promise<Organization>;
    update(request: UpdateOrganizationRequest): Promise<Organization>;
}
export declare class OrganizationsServiceImpl implements OrganizationsService {
    private transport;
    private authManager;
    private resilience;
    constructor(transport: HttpTransport, authManager: AuthManager, resilience: ResilienceOrchestrator);
    get(): Promise<Organization>;
    update(request: UpdateOrganizationRequest): Promise<Organization>;
}
//# sourceMappingURL=organizations.service.d.ts.map