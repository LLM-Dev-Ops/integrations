/**
 * Drives service for Google Drive API.
 *
 * Manages shared drives (formerly Team Drives).
 */

import {
  Drive,
  DriveList,
  CreateDriveRequest,
  UpdateDriveRequest,
  ListDrivesParams,
  GetDriveParams,
  DeleteDriveParams,
} from '../types';

/**
 * HTTP transport interface.
 */
export interface DriveTransport {
  request<T>(url: string, options: RequestOptions): Promise<T>;
}

/**
 * Request options.
 */
export interface RequestOptions {
  method?: string;
  body?: any;
  params?: Record<string, any>;
}

/**
 * Drives service interface.
 */
export interface DrivesService {
  /**
   * Create a new shared drive.
   *
   * @param request - Drive creation request
   * @returns The created drive
   */
  create(request: CreateDriveRequest): Promise<Drive>;

  /**
   * List shared drives.
   *
   * @param params - Optional list parameters
   * @returns Drive list with pagination
   */
  list(params?: ListDrivesParams): Promise<DriveList>;

  /**
   * Get a specific shared drive.
   *
   * @param driveId - Drive ID
   * @param params - Optional parameters
   * @returns The drive
   */
  get(driveId: string, params?: GetDriveParams): Promise<Drive>;

  /**
   * Update a shared drive.
   *
   * @param driveId - Drive ID
   * @param request - Update request
   * @returns The updated drive
   */
  update(driveId: string, request: UpdateDriveRequest): Promise<Drive>;

  /**
   * Delete a shared drive.
   *
   * @param driveId - Drive ID
   * @param params - Optional delete parameters
   */
  delete(driveId: string, params?: DeleteDriveParams): Promise<void>;

  /**
   * Hide a shared drive.
   *
   * @param driveId - Drive ID
   * @returns The updated drive
   */
  hide(driveId: string): Promise<Drive>;

  /**
   * Unhide a shared drive.
   *
   * @param driveId - Drive ID
   * @returns The updated drive
   */
  unhide(driveId: string): Promise<Drive>;
}

/**
 * Implementation of DrivesService.
 */
export class DrivesServiceImpl implements DrivesService {
  private readonly baseUrl = 'https://www.googleapis.com/drive/v3';

  constructor(private transport: DriveTransport) {}

  async create(request: CreateDriveRequest): Promise<Drive> {
    return this.transport.request<Drive>(`${this.baseUrl}/drives`, {
      method: 'POST',
      params: { requestId: request.requestId },
      body: {
        name: request.name,
        themeId: request.themeId,
        colorRgb: request.colorRgb,
        backgroundImageFile: request.backgroundImageFile,
      },
    });
  }

  async list(params?: ListDrivesParams): Promise<DriveList> {
    return this.transport.request<DriveList>(`${this.baseUrl}/drives`, {
      method: 'GET',
      params: params as any,
    });
  }

  async get(driveId: string, params?: GetDriveParams): Promise<Drive> {
    return this.transport.request<Drive>(`${this.baseUrl}/drives/${driveId}`, {
      method: 'GET',
      params: params as any,
    });
  }

  async update(driveId: string, request: UpdateDriveRequest): Promise<Drive> {
    return this.transport.request<Drive>(`${this.baseUrl}/drives/${driveId}`, {
      method: 'PATCH',
      body: request,
    });
  }

  async delete(driveId: string, params?: DeleteDriveParams): Promise<void> {
    await this.transport.request<void>(`${this.baseUrl}/drives/${driveId}`, {
      method: 'DELETE',
      params: params as any,
    });
  }

  async hide(driveId: string): Promise<Drive> {
    return this.transport.request<Drive>(`${this.baseUrl}/drives/${driveId}/hide`, {
      method: 'POST',
    });
  }

  async unhide(driveId: string): Promise<Drive> {
    return this.transport.request<Drive>(`${this.baseUrl}/drives/${driveId}/unhide`, {
      method: 'POST',
    });
  }
}

/**
 * Mock implementation for testing.
 */
export class MockDrivesService implements DrivesService {
  private drives = new Map<string, Drive>();
  private nextId = 1;

  async create(request: CreateDriveRequest): Promise<Drive> {
    const drive: Drive = {
      kind: 'drive#drive',
      id: `drive-${this.nextId++}`,
      name: request.name,
      themeId: request.themeId,
      colorRgb: request.colorRgb,
      backgroundImageFile: request.backgroundImageFile,
      createdTime: new Date().toISOString(),
      hidden: false,
      capabilities: {
        canAddChildren: true,
        canChangeCopyRequiresWriterPermissionRestriction: true,
        canChangeDomainUsersOnlyRestriction: true,
        canChangeDriveBackground: true,
        canChangeDriveMembersOnlyRestriction: true,
        canComment: true,
        canCopy: true,
        canDeleteChildren: true,
        canDeleteDrive: true,
        canDownload: true,
        canEdit: true,
        canListChildren: true,
        canManageMembers: true,
        canReadRevisions: true,
        canRename: true,
        canRenameDrive: true,
        canResetDriveRestrictions: true,
        canShare: true,
        canTrashChildren: true,
      },
    };

    this.drives.set(drive.id, drive);
    return drive;
  }

  async list(params?: ListDrivesParams): Promise<DriveList> {
    const drives = Array.from(this.drives.values()).filter(d => !d.hidden);
    return {
      kind: 'drive#driveList',
      drives,
    };
  }

  async get(driveId: string, params?: GetDriveParams): Promise<Drive> {
    const drive = this.drives.get(driveId);
    if (!drive) {
      throw new Error(`Drive not found: ${driveId}`);
    }
    return drive;
  }

  async update(driveId: string, request: UpdateDriveRequest): Promise<Drive> {
    const drive = await this.get(driveId);
    Object.assign(drive, request);
    return drive;
  }

  async delete(driveId: string, params?: DeleteDriveParams): Promise<void> {
    this.drives.delete(driveId);
  }

  async hide(driveId: string): Promise<Drive> {
    const drive = await this.get(driveId);
    drive.hidden = true;
    return drive;
  }

  async unhide(driveId: string): Promise<Drive> {
    const drive = await this.get(driveId);
    drive.hidden = false;
    return drive;
  }
}

/**
 * Create a mock drives service.
 */
export function createMockDrivesService(): DrivesService {
  return new MockDrivesService();
}
