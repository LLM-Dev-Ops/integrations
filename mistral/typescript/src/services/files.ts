/**
 * Files service.
 */

import type { HttpTransport } from '../transport';
import type {
  FileObject,
  FileListResponse,
  FileDeleteResponse,
  FileSignedUrlResponse,
  FileUploadOptions,
} from '../types/files';

/**
 * Files service interface.
 */
export interface FilesService {
  /** Lists all uploaded files. */
  list(): Promise<FileListResponse>;

  /** Retrieves a specific file. */
  retrieve(fileId: string): Promise<FileObject>;

  /** Uploads a file. */
  upload(options: FileUploadOptions): Promise<FileObject>;

  /** Deletes a file. */
  delete(fileId: string): Promise<FileDeleteResponse>;

  /** Gets a signed URL for downloading a file. */
  getSignedUrl(fileId: string): Promise<FileSignedUrlResponse>;
}

/**
 * Default implementation of the files service.
 */
export class DefaultFilesService implements FilesService {
  constructor(private readonly transport: HttpTransport) {}

  async list(): Promise<FileListResponse> {
    const body = await this.transport.get('/v1/files');
    return JSON.parse(body) as FileListResponse;
  }

  async retrieve(fileId: string): Promise<FileObject> {
    const body = await this.transport.get(`/v1/files/${fileId}`);
    return JSON.parse(body) as FileObject;
  }

  async upload(options: FileUploadOptions): Promise<FileObject> {
    const body = await this.transport.uploadFile(
      '/v1/files',
      options.file,
      options.filename,
      options.purpose
    );
    return JSON.parse(body) as FileObject;
  }

  async delete(fileId: string): Promise<FileDeleteResponse> {
    const body = await this.transport.delete(`/v1/files/${fileId}`);
    return JSON.parse(body) as FileDeleteResponse;
  }

  async getSignedUrl(fileId: string): Promise<FileSignedUrlResponse> {
    const body = await this.transport.get(`/v1/files/${fileId}/url`);
    return JSON.parse(body) as FileSignedUrlResponse;
  }
}

/**
 * Creates a files service.
 */
export function createFilesService(transport: HttpTransport): FilesService {
  return new DefaultFilesService(transport);
}
