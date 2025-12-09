import { HttpTransport } from '../../transport/index.js';
import { AuthManager } from '../../auth/index.js';
import { ResilienceOrchestrator } from '../../resilience/index.js';
import { Workspace, WorkspaceMember, CreateWorkspaceRequest, UpdateWorkspaceRequest, AddWorkspaceMemberRequest, UpdateWorkspaceMemberRequest, ListParams, ListResponse } from './types.js';
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
export declare class WorkspacesServiceImpl implements WorkspacesService {
    private transport;
    private authManager;
    private resilience;
    constructor(transport: HttpTransport, authManager: AuthManager, resilience: ResilienceOrchestrator);
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
    private buildQueryParams;
}
//# sourceMappingURL=workspaces.service.d.ts.map