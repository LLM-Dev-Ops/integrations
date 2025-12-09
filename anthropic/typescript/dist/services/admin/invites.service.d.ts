import { HttpTransport } from '../../transport/index.js';
import { AuthManager } from '../../auth/index.js';
import { ResilienceOrchestrator } from '../../resilience/index.js';
import { Invite, CreateInviteRequest, ListParams, ListResponse } from './types.js';
export interface InvitesService {
    list(params?: ListParams): Promise<ListResponse<Invite>>;
    get(inviteId: string): Promise<Invite>;
    create(request: CreateInviteRequest): Promise<Invite>;
    delete(inviteId: string): Promise<void>;
}
export declare class InvitesServiceImpl implements InvitesService {
    private transport;
    private authManager;
    private resilience;
    constructor(transport: HttpTransport, authManager: AuthManager, resilience: ResilienceOrchestrator);
    list(params?: ListParams): Promise<ListResponse<Invite>>;
    get(inviteId: string): Promise<Invite>;
    create(request: CreateInviteRequest): Promise<Invite>;
    delete(inviteId: string): Promise<void>;
    private buildQueryParams;
}
//# sourceMappingURL=invites.service.d.ts.map