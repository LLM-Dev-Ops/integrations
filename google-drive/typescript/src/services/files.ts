/**
 * Files service for Google Drive API.
 *
 * Provides comprehensive file operations including CRUD, upload, download,
 * folder management, and export functionality.
 */

import {
  DriveFile,
  FileList,
  CreateFileRequest,
  CreateFileWithContentRequest,
  CreateMultipartRequest,
  CreateResumableRequest,
  UpdateFileRequest,
  CopyFileRequest,
  CreateFolderRequest,
  GetFileParams,
  DownloadParams,
  ListFilesParams,
  DeleteFileParams,
  GenerateIdsParams,
  EmptyTrashParams,
  GeneratedIds,
  DriveMimeTypes,
} from '../types';
import { ResumableUploadSession } from './upload';

/**
 * HTTP transport interface for file operations.
 */
export interface FileTransport {
  /**
   * Make a JSON request.
   */
  request<T>(url: string, options: RequestOptions): Promise<T>;

  /**
   * Download binary content.
   */
  download(url: string, options?: RequestOptions): Promise<ArrayBuffer>;

  /**
   * Download as a stream.
   */
  downloadStream(url: string, options?: RequestOptions): AsyncIterable<Uint8Array>;

  /**
   * Upload with multipart.
   */
  uploadMultipart(url: string, metadata: any, content: ArrayBuffer, contentType: string): Promise<any>;

  /**
   * Initiate resumable upload.
   */
  initiateResumableUpload(url: string, metadata: any, contentType: string, contentLength: number): Promise<string>;
}

/**
 * Request options for HTTP transport.
 */
export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, string | number | boolean>;
}

/**
 * Files service interface.
 */
export interface FilesService {
  /**
   * Create a new file (metadata only).
   *
   * @param request - File creation request
   * @returns The created file
   */
  create(request: CreateFileRequest): Promise<DriveFile>;

  /**
   * Create a file with content (simple upload, <= 5MB).
   *
   * @param request - File creation request with content
   * @returns The created file
   */
  createWithContent(request: CreateFileWithContentRequest): Promise<DriveFile>;

  /**
   * Create a file with content using multipart upload (metadata + content).
   *
   * @param request - Multipart upload request
   * @returns The created file
   */
  createMultipart(request: CreateMultipartRequest): Promise<DriveFile>;

  /**
   * Create a file with content using resumable upload (large files).
   *
   * @param request - Resumable upload request
   * @returns A resumable upload session
   */
  createResumable(request: CreateResumableRequest): Promise<ResumableUploadSession>;

  /**
   * Get file metadata.
   *
   * @param fileId - File ID
   * @param params - Optional parameters
   * @returns The file metadata
   */
  get(fileId: string, params?: GetFileParams): Promise<DriveFile>;

  /**
   * Download file content.
   *
   * @param fileId - File ID
   * @param params - Optional download parameters
   * @returns The file content
   */
  download(fileId: string, params?: DownloadParams): Promise<ArrayBuffer>;

  /**
   * Download file content as a stream.
   *
   * @param fileId - File ID
   * @returns Async iterable of content chunks
   */
  downloadStream(fileId: string): AsyncIterable<Uint8Array>;

  /**
   * List files with optional query.
   *
   * @param params - Optional list parameters
   * @returns File list with pagination
   */
  list(params?: ListFilesParams): Promise<FileList>;

  /**
   * List all files with auto-pagination.
   *
   * @param params - Optional list parameters
   * @returns Async iterable of files
   */
  listAll(params?: ListFilesParams): AsyncIterable<DriveFile>;

  /**
   * Update file metadata.
   *
   * @param fileId - File ID
   * @param request - Update request
   * @returns The updated file
   */
  update(fileId: string, request: UpdateFileRequest): Promise<DriveFile>;

  /**
   * Update file content.
   *
   * @param fileId - File ID
   * @param content - New content
   * @returns The updated file
   */
  updateContent(fileId: string, content: ArrayBuffer): Promise<DriveFile>;

  /**
   * Delete a file permanently.
   *
   * @param fileId - File ID
   * @param params - Optional delete parameters
   */
  delete(fileId: string, params?: DeleteFileParams): Promise<void>;

  /**
   * Copy a file.
   *
   * @param fileId - Source file ID
   * @param request - Copy request with optional overrides
   * @returns The copied file
   */
  copy(fileId: string, request: CopyFileRequest): Promise<DriveFile>;

  /**
   * Export a Google Workspace file.
   *
   * @param fileId - File ID (must be a Google Workspace file)
   * @param mimeType - Target MIME type
   * @returns The exported content
   */
  export(fileId: string, mimeType: string): Promise<ArrayBuffer>;

  /**
   * Create a folder.
   *
   * @param request - Folder creation request
   * @returns The created folder
   */
  createFolder(request: CreateFolderRequest): Promise<DriveFile>;

  /**
   * Move a file to different folders.
   *
   * @param fileId - File ID
   * @param addParents - Parent IDs to add
   * @param removeParents - Parent IDs to remove
   * @returns The updated file
   */
  moveFile(fileId: string, addParents: string[], removeParents: string[]): Promise<DriveFile>;

  /**
   * Generate file IDs for pre-creating files.
   *
   * @param params - Optional generation parameters
   * @returns Generated file IDs
   */
  generateIds(params?: GenerateIdsParams): Promise<GeneratedIds>;

  /**
   * Empty the trash.
   *
   * @param params - Optional parameters
   */
  emptyTrash(params?: EmptyTrashParams): Promise<void>;
}

/**
 * Implementation of FilesService.
 */
export class FilesServiceImpl implements FilesService {
  private readonly baseUrl = 'https://www.googleapis.com/drive/v3';
  private readonly uploadUrl = 'https://www.googleapis.com/upload/drive/v3';

  constructor(
    private transport: FileTransport,
    private createUploadSession: (uri: string) => ResumableUploadSession
  ) {}

  async create(request: CreateFileRequest): Promise<DriveFile> {
    return this.transport.request<DriveFile>(`${this.baseUrl}/files`, {
      method: 'POST',
      body: request,
    });
  }

  async createWithContent(request: CreateFileWithContentRequest): Promise<DriveFile> {
    const url = `${this.uploadUrl}/files?uploadType=media`;
    return this.transport.request<DriveFile>(url, {
      method: 'POST',
      headers: {
        'Content-Type': request.mimeType,
      },
      body: request.content,
    });
  }

  async createMultipart(request: CreateMultipartRequest): Promise<DriveFile> {
    const url = `${this.uploadUrl}/files?uploadType=multipart`;
    return this.transport.uploadMultipart(
      url,
      request.metadata,
      request.content,
      request.contentType
    );
  }

  async createResumable(request: CreateResumableRequest): Promise<ResumableUploadSession> {
    const url = `${this.uploadUrl}/files?uploadType=resumable`;
    const uploadUri = await this.transport.initiateResumableUpload(
      url,
      request.metadata,
      request.contentType,
      request.contentLength
    );
    return this.createUploadSession(uploadUri);
  }

  async get(fileId: string, params?: GetFileParams): Promise<DriveFile> {
    return this.transport.request<DriveFile>(`${this.baseUrl}/files/${fileId}`, {
      method: 'GET',
      params: params as any,
    });
  }

  async download(fileId: string, params?: DownloadParams): Promise<ArrayBuffer> {
    const headers: Record<string, string> = {};
    if (params?.range) {
      headers['Range'] = params.range;
    }

    return this.transport.download(`${this.baseUrl}/files/${fileId}?alt=media`, {
      method: 'GET',
      params: { acknowledgeAbuse: params?.acknowledgeAbuse } as any,
      headers,
    });
  }

  async *downloadStream(fileId: string): AsyncIterable<Uint8Array> {
    yield* this.transport.downloadStream(`${this.baseUrl}/files/${fileId}?alt=media`);
  }

  async list(params?: ListFilesParams): Promise<FileList> {
    return this.transport.request<FileList>(`${this.baseUrl}/files`, {
      method: 'GET',
      params: params as any,
    });
  }

  async *listAll(params?: ListFilesParams): AsyncIterable<DriveFile> {
    let pageToken: string | undefined = params?.pageToken;

    do {
      const response = await this.list({
        ...params,
        pageToken,
      });

      for (const file of response.files) {
        yield file;
      }

      pageToken = response.nextPageToken;
    } while (pageToken);
  }

  async update(fileId: string, request: UpdateFileRequest): Promise<DriveFile> {
    return this.transport.request<DriveFile>(`${this.baseUrl}/files/${fileId}`, {
      method: 'PATCH',
      body: request,
    });
  }

  async updateContent(fileId: string, content: ArrayBuffer): Promise<DriveFile> {
    return this.transport.request<DriveFile>(
      `${this.uploadUrl}/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        body: content,
      }
    );
  }

  async delete(fileId: string, params?: DeleteFileParams): Promise<void> {
    await this.transport.request<void>(`${this.baseUrl}/files/${fileId}`, {
      method: 'DELETE',
      params: params as any,
    });
  }

  async copy(fileId: string, request: CopyFileRequest): Promise<DriveFile> {
    return this.transport.request<DriveFile>(`${this.baseUrl}/files/${fileId}/copy`, {
      method: 'POST',
      body: request,
    });
  }

  async export(fileId: string, mimeType: string): Promise<ArrayBuffer> {
    return this.transport.download(`${this.baseUrl}/files/${fileId}/export`, {
      params: { mimeType },
    });
  }

  async createFolder(request: CreateFolderRequest): Promise<DriveFile> {
    return this.create({
      ...request,
      mimeType: DriveMimeTypes.FOLDER,
    });
  }

  async moveFile(fileId: string, addParents: string[], removeParents: string[]): Promise<DriveFile> {
    const params: any = {};
    if (addParents.length > 0) {
      params.addParents = addParents.join(',');
    }
    if (removeParents.length > 0) {
      params.removeParents = removeParents.join(',');
    }

    return this.transport.request<DriveFile>(`${this.baseUrl}/files/${fileId}`, {
      method: 'PATCH',
      params,
    });
  }

  async generateIds(params?: GenerateIdsParams): Promise<GeneratedIds> {
    return this.transport.request<GeneratedIds>(`${this.baseUrl}/files/generateIds`, {
      method: 'GET',
      params: params as any,
    });
  }

  async emptyTrash(params?: EmptyTrashParams): Promise<void> {
    await this.transport.request<void>(`${this.baseUrl}/files/trash`, {
      method: 'DELETE',
      params: params as any,
    });
  }
}

/**
 * Mock implementation for testing.
 */
export class MockFilesService implements FilesService {
  private files = new Map<string, DriveFile>();
  private nextId = 1;

  async create(request: CreateFileRequest): Promise<DriveFile> {
    const file: DriveFile = {
      kind: 'drive#file',
      id: `file-${this.nextId++}`,
      name: request.name,
      mimeType: request.mimeType || 'application/octet-stream',
      description: request.description,
      starred: request.starred || false,
      trashed: false,
      explicitlyTrashed: false,
      parents: request.parents,
      properties: request.properties,
      appProperties: request.appProperties,
      spaces: ['drive'],
      version: '1',
      createdTime: new Date().toISOString(),
      modifiedTime: new Date().toISOString(),
      modifiedByMe: true,
      viewedByMe: false,
      shared: false,
      ownedByMe: true,
      owners: [],
      capabilities: {} as any,
      viewersCanCopyContent: true,
      copyRequiresWriterPermission: false,
      writersCanShare: true,
      permissionIds: [],
      hasAugmentedPermissions: false,
      isAppAuthorized: true,
      hasThumbnail: false,
    };

    this.files.set(file.id, file);
    return file;
  }

  async createWithContent(request: CreateFileWithContentRequest): Promise<DriveFile> {
    const file = await this.create(request.metadata);
    file.size = request.content.byteLength.toString();
    return file;
  }

  async createMultipart(request: CreateMultipartRequest): Promise<DriveFile> {
    const file = await this.create(request.metadata);
    file.size = request.content.byteLength.toString();
    return file;
  }

  async createResumable(request: CreateResumableRequest): Promise<ResumableUploadSession> {
    // Return a mock session - actual implementation would be injected
    throw new Error('Mock resumable upload not implemented');
  }

  async get(fileId: string, params?: GetFileParams): Promise<DriveFile> {
    const file = this.files.get(fileId);
    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }
    return file;
  }

  async download(fileId: string, params?: DownloadParams): Promise<ArrayBuffer> {
    const file = await this.get(fileId);
    return new ArrayBuffer(parseInt(file.size || '0', 10));
  }

  async *downloadStream(fileId: string): AsyncIterable<Uint8Array> {
    const data = await this.download(fileId);
    yield new Uint8Array(data);
  }

  async list(params?: ListFilesParams): Promise<FileList> {
    const files = Array.from(this.files.values());
    return {
      kind: 'drive#fileList',
      incompleteSearch: false,
      files,
    };
  }

  async *listAll(params?: ListFilesParams): AsyncIterable<DriveFile> {
    const response = await this.list(params);
    for (const file of response.files) {
      yield file;
    }
  }

  async update(fileId: string, request: UpdateFileRequest): Promise<DriveFile> {
    const file = await this.get(fileId);
    Object.assign(file, request);
    file.modifiedTime = new Date().toISOString();
    return file;
  }

  async updateContent(fileId: string, content: ArrayBuffer): Promise<DriveFile> {
    const file = await this.get(fileId);
    file.size = content.byteLength.toString();
    file.modifiedTime = new Date().toISOString();
    return file;
  }

  async delete(fileId: string, params?: DeleteFileParams): Promise<void> {
    this.files.delete(fileId);
  }

  async copy(fileId: string, request: CopyFileRequest): Promise<DriveFile> {
    const source = await this.get(fileId);
    const copy = await this.create({
      name: request.name || `Copy of ${source.name}`,
      mimeType: source.mimeType,
      description: request.description || source.description,
      parents: request.parents || source.parents,
      properties: request.properties || source.properties,
      appProperties: request.appProperties || source.appProperties,
    });
    return copy;
  }

  async export(fileId: string, mimeType: string): Promise<ArrayBuffer> {
    return new ArrayBuffer(1024);
  }

  async createFolder(request: CreateFolderRequest): Promise<DriveFile> {
    return this.create({
      ...request,
      mimeType: DriveMimeTypes.FOLDER,
    });
  }

  async moveFile(fileId: string, addParents: string[], removeParents: string[]): Promise<DriveFile> {
    const file = await this.get(fileId);
    const parents = new Set(file.parents || []);

    for (const parent of removeParents) {
      parents.delete(parent);
    }
    for (const parent of addParents) {
      parents.add(parent);
    }

    file.parents = Array.from(parents);
    return file;
  }

  async generateIds(params?: GenerateIdsParams): Promise<GeneratedIds> {
    const count = params?.count || 10;
    const ids: string[] = [];

    for (let i = 0; i < count; i++) {
      ids.push(`generated-${this.nextId++}`);
    }

    return {
      kind: 'drive#generatedIds',
      space: params?.space || 'drive',
      ids,
    };
  }

  async emptyTrash(params?: EmptyTrashParams): Promise<void> {
    for (const [id, file] of this.files) {
      if (file.trashed) {
        this.files.delete(id);
      }
    }
  }
}

/**
 * Create a mock files service.
 */
export function createMockFilesService(): FilesService {
  return new MockFilesService();
}
