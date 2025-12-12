/**
 * About service for Google Drive API.
 *
 * Provides information about the user's Drive account and storage quota.
 */

import { About, GetAboutParams, StorageQuota } from '../types';

/**
 * HTTP transport interface.
 */
export interface AboutTransport {
  request<T>(url: string, options: RequestOptions): Promise<T>;
}

/**
 * Request options.
 */
export interface RequestOptions {
  method?: string;
  params?: Record<string, any>;
}

/**
 * About service interface.
 */
export interface AboutService {
  /**
   * Get information about the user's Drive account.
   *
   * @param params - Optional parameters (typically fields to include)
   * @returns About information including storage quota
   */
  get(params?: GetAboutParams): Promise<About>;

  /**
   * Get storage quota information.
   *
   * @returns Storage quota details
   */
  getStorageQuota(): Promise<StorageQuota>;
}

/**
 * Implementation of AboutService.
 */
export class AboutServiceImpl implements AboutService {
  private readonly baseUrl = 'https://www.googleapis.com/drive/v3';

  constructor(private transport: AboutTransport) {}

  async get(params?: GetAboutParams): Promise<About> {
    // Always request storageQuota if fields not specified
    const fields = params?.fields || '*';
    return this.transport.request<About>(`${this.baseUrl}/about`, {
      method: 'GET',
      params: { fields, ...params } as any,
    });
  }

  async getStorageQuota(): Promise<StorageQuota> {
    const about = await this.get({ fields: 'storageQuota' });
    return about.storageQuota;
  }
}

/**
 * Mock implementation for testing.
 */
export class MockAboutService implements AboutService {
  private mockData: About = {
    kind: 'drive#about',
    user: {
      kind: 'drive#user',
      displayName: 'Mock User',
      photoLink: 'https://example.com/photo.jpg',
      me: true,
      permissionId: 'permission-1',
      emailAddress: 'user@example.com',
    },
    storageQuota: {
      limit: '15000000000', // 15GB
      usage: '5000000000', // 5GB
      usageInDrive: '4000000000',
      usageInDriveTrash: '1000000000',
    },
    importFormats: {
      'text/plain': ['application/vnd.google-apps.document'],
      'text/csv': ['application/vnd.google-apps.spreadsheet'],
    },
    exportFormats: {
      'application/vnd.google-apps.document': [
        'text/plain',
        'application/pdf',
        'text/html',
      ],
      'application/vnd.google-apps.spreadsheet': [
        'text/csv',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
    },
    maxImportSizes: {
      'text/plain': '10485760', // 10MB
    },
    maxUploadSize: '5497558138880', // 5TB
    appInstalled: true,
    folderColorPalette: [
      '#ac725e',
      '#d06b64',
      '#f83a22',
      '#fa573c',
      '#ff6f00',
      '#ffad46',
    ],
    canCreateDrives: true,
    canCreateTeamDrives: true,
  };

  async get(params?: GetAboutParams): Promise<About> {
    return this.mockData;
  }

  async getStorageQuota(): Promise<StorageQuota> {
    return this.mockData.storageQuota;
  }

  /**
   * Helper method to update mock storage quota.
   */
  setStorageQuota(quota: Partial<StorageQuota>): void {
    Object.assign(this.mockData.storageQuota, quota);
  }

  /**
   * Helper method to update mock user.
   */
  setUser(user: Partial<About['user']>): void {
    Object.assign(this.mockData.user, user);
  }
}

/**
 * Create a mock about service.
 */
export function createMockAboutService(): MockAboutService {
  return new MockAboutService();
}
