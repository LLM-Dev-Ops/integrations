/**
 * Permissions service for Google Drive API.
 *
 * Manages file and folder permissions, including sharing and access control.
 */

import {
  Permission,
  PermissionList,
  CreatePermissionRequest,
  UpdatePermissionRequest,
  ListPermissionsParams,
  GetPermissionParams,
  DeletePermissionParams,
} from '../types';

/**
 * HTTP transport interface for permission operations.
 */
export interface PermissionTransport {
  request<T>(url: string, options: RequestOptions): Promise<T>;
}

/**
 * Request options.
 */
export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, any>;
}

/**
 * Permissions service interface.
 */
export interface PermissionsService {
  /**
   * Create a new permission (share a file).
   *
   * @param fileId - File ID
   * @param request - Permission creation request
   * @returns The created permission
   */
  create(fileId: string, request: CreatePermissionRequest): Promise<Permission>;

  /**
   * List permissions for a file.
   *
   * @param fileId - File ID
   * @param params - Optional list parameters
   * @returns Permission list with pagination
   */
  list(fileId: string, params?: ListPermissionsParams): Promise<PermissionList>;

  /**
   * Get a specific permission.
   *
   * @param fileId - File ID
   * @param permissionId - Permission ID
   * @param params - Optional parameters
   * @returns The permission
   */
  get(fileId: string, permissionId: string, params?: GetPermissionParams): Promise<Permission>;

  /**
   * Update a permission.
   *
   * @param fileId - File ID
   * @param permissionId - Permission ID
   * @param request - Update request
   * @returns The updated permission
   */
  update(
    fileId: string,
    permissionId: string,
    request: UpdatePermissionRequest
  ): Promise<Permission>;

  /**
   * Delete a permission (revoke access).
   *
   * @param fileId - File ID
   * @param permissionId - Permission ID
   * @param params - Optional delete parameters
   */
  delete(fileId: string, permissionId: string, params?: DeletePermissionParams): Promise<void>;
}

/**
 * Implementation of PermissionsService.
 */
export class PermissionsServiceImpl implements PermissionsService {
  private readonly baseUrl = 'https://www.googleapis.com/drive/v3';

  constructor(private transport: PermissionTransport) {}

  async create(fileId: string, request: CreatePermissionRequest): Promise<Permission> {
    const params: any = {};
    if (request.sendNotificationEmail !== undefined) {
      params.sendNotificationEmail = request.sendNotificationEmail;
    }
    if (request.emailMessage) {
      params.emailMessage = request.emailMessage;
    }
    if (request.transferOwnership) {
      params.transferOwnership = request.transferOwnership;
    }

    return this.transport.request<Permission>(
      `${this.baseUrl}/files/${fileId}/permissions`,
      {
        method: 'POST',
        body: {
          role: request.role,
          type: request.type,
          emailAddress: request.emailAddress,
          domain: request.domain,
          allowFileDiscovery: request.allowFileDiscovery,
          expirationTime: request.expirationTime,
          view: request.view,
        },
        params,
      }
    );
  }

  async list(fileId: string, params?: ListPermissionsParams): Promise<PermissionList> {
    return this.transport.request<PermissionList>(
      `${this.baseUrl}/files/${fileId}/permissions`,
      {
        method: 'GET',
        params: params as any,
      }
    );
  }

  async get(fileId: string, permissionId: string, params?: GetPermissionParams): Promise<Permission> {
    return this.transport.request<Permission>(
      `${this.baseUrl}/files/${fileId}/permissions/${permissionId}`,
      {
        method: 'GET',
        params: params as any,
      }
    );
  }

  async update(
    fileId: string,
    permissionId: string,
    request: UpdatePermissionRequest
  ): Promise<Permission> {
    return this.transport.request<Permission>(
      `${this.baseUrl}/files/${fileId}/permissions/${permissionId}`,
      {
        method: 'PATCH',
        body: request,
      }
    );
  }

  async delete(fileId: string, permissionId: string, params?: DeletePermissionParams): Promise<void> {
    await this.transport.request<void>(
      `${this.baseUrl}/files/${fileId}/permissions/${permissionId}`,
      {
        method: 'DELETE',
        params: params as any,
      }
    );
  }
}

/**
 * Mock implementation for testing.
 */
export class MockPermissionsService implements PermissionsService {
  private permissions = new Map<string, Map<string, Permission>>();
  private nextId = 1;

  async create(fileId: string, request: CreatePermissionRequest): Promise<Permission> {
    if (!this.permissions.has(fileId)) {
      this.permissions.set(fileId, new Map());
    }

    const permission: Permission = {
      kind: 'drive#permission',
      id: `permission-${this.nextId++}`,
      type: request.type,
      role: request.role,
      emailAddress: request.emailAddress,
      domain: request.domain,
      allowFileDiscovery: request.allowFileDiscovery,
      expirationTime: request.expirationTime,
      view: request.view,
    };

    this.permissions.get(fileId)!.set(permission.id, permission);
    return permission;
  }

  async list(fileId: string, params?: ListPermissionsParams): Promise<PermissionList> {
    const filePermissions = this.permissions.get(fileId);
    const permissions = filePermissions ? Array.from(filePermissions.values()) : [];

    return {
      kind: 'drive#permissionList',
      permissions,
    };
  }

  async get(fileId: string, permissionId: string, params?: GetPermissionParams): Promise<Permission> {
    const filePermissions = this.permissions.get(fileId);
    if (!filePermissions) {
      throw new Error(`File not found: ${fileId}`);
    }

    const permission = filePermissions.get(permissionId);
    if (!permission) {
      throw new Error(`Permission not found: ${permissionId}`);
    }

    return permission;
  }

  async update(
    fileId: string,
    permissionId: string,
    request: UpdatePermissionRequest
  ): Promise<Permission> {
    const permission = await this.get(fileId, permissionId);
    Object.assign(permission, request);
    return permission;
  }

  async delete(fileId: string, permissionId: string, params?: DeletePermissionParams): Promise<void> {
    const filePermissions = this.permissions.get(fileId);
    if (filePermissions) {
      filePermissions.delete(permissionId);
    }
  }
}

/**
 * Create a mock permissions service.
 */
export function createMockPermissionsService(): PermissionsService {
  return new MockPermissionsService();
}
