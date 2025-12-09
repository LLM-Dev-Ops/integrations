import { HttpTransport } from '../../transport/index.js';
import { AuthManager } from '../../auth/index.js';
import { ResilienceOrchestrator } from '../../resilience/index.js';
import { User, ListParams, ListResponse } from './types.js';
export interface UsersService {
    list(params?: ListParams): Promise<ListResponse<User>>;
    get(userId: string): Promise<User>;
    getMe(): Promise<User>;
}
export declare class UsersServiceImpl implements UsersService {
    private transport;
    private authManager;
    private resilience;
    constructor(transport: HttpTransport, authManager: AuthManager, resilience: ResilienceOrchestrator);
    list(params?: ListParams): Promise<ListResponse<User>>;
    get(userId: string): Promise<User>;
    getMe(): Promise<User>;
    private buildQueryParams;
}
//# sourceMappingURL=users.service.d.ts.map