/**
 * Files service for Slack API.
 */

import { SlackClient } from '../client';
import { File, ChannelId, UserId, SlackResponse, ResponseMetadata } from '../types';

/**
 * List files parameters
 */
export interface ListFilesParams {
  channel?: ChannelId;
  user?: UserId;
  ts_from?: number;
  ts_to?: number;
  types?: string;
  count?: number;
  page?: number;
  show_files_hidden_by_limit?: boolean;
  team_id?: string;
}

/**
 * List files response
 */
export interface ListFilesResponse extends SlackResponse {
  files: File[];
  paging: {
    count: number;
    total: number;
    page: number;
    pages: number;
  };
}

/**
 * File info response
 */
export interface FileInfoResponse extends SlackResponse {
  file: File;
  comments: unknown[];
  response_metadata?: ResponseMetadata;
}

/**
 * Upload file parameters
 */
export interface UploadFileParams {
  channels?: ChannelId[];
  content?: string;
  file?: Blob | Buffer;
  filename?: string;
  filetype?: string;
  initial_comment?: string;
  thread_ts?: string;
  title?: string;
}

/**
 * Upload file response
 */
export interface UploadFileResponse extends SlackResponse {
  file: File;
}

/**
 * Remote file parameters
 */
export interface RemoteFileParams {
  external_id: string;
  external_url: string;
  title: string;
  filetype?: string;
  indexable_file_contents?: string;
  preview_image?: Blob | Buffer;
}

/**
 * Share file response
 */
export interface ShareFileResponse extends SlackResponse {
  file: File;
}

/**
 * Files service
 */
export class FilesService {
  constructor(private client: SlackClient) {}

  /**
   * List files
   */
  async list(params: ListFilesParams = {}): Promise<ListFilesResponse> {
    return this.client.get<ListFilesResponse>('files.list', params);
  }

  /**
   * Get file info
   */
  async info(
    file: string,
    options?: { count?: number; page?: number; cursor?: string }
  ): Promise<FileInfoResponse> {
    return this.client.get<FileInfoResponse>('files.info', { file, ...options });
  }

  /**
   * Upload a file
   */
  async upload(params: UploadFileParams): Promise<File> {
    const formData = new FormData();

    if (params.channels) {
      formData.append('channels', params.channels.join(','));
    }
    if (params.content) {
      formData.append('content', params.content);
    }
    if (params.file) {
      formData.append('file', params.file as Blob);
    }
    if (params.filename) {
      formData.append('filename', params.filename);
    }
    if (params.filetype) {
      formData.append('filetype', params.filetype);
    }
    if (params.initial_comment) {
      formData.append('initial_comment', params.initial_comment);
    }
    if (params.thread_ts) {
      formData.append('thread_ts', params.thread_ts);
    }
    if (params.title) {
      formData.append('title', params.title);
    }

    const response = await this.client.post<UploadFileResponse>('files.upload', formData);
    return response.file;
  }

  /**
   * Delete a file
   */
  async delete(file: string): Promise<void> {
    await this.client.post('files.delete', { file });
  }

  /**
   * Make file public
   */
  async sharedPublicURL(file: string): Promise<File> {
    const response = await this.client.post<UploadFileResponse>(
      'files.sharedPublicURL',
      { file }
    );
    return response.file;
  }

  /**
   * Revoke public URL
   */
  async revokePublicURL(file: string): Promise<File> {
    const response = await this.client.post<UploadFileResponse>(
      'files.revokePublicURL',
      { file }
    );
    return response.file;
  }

  /**
   * Add remote file
   */
  async remoteAdd(params: RemoteFileParams): Promise<File> {
    const response = await this.client.post<UploadFileResponse>('files.remote.add', params);
    return response.file;
  }

  /**
   * Get remote file info
   */
  async remoteInfo(options: { external_id?: string; file?: string }): Promise<File> {
    const response = await this.client.get<FileInfoResponse>('files.remote.info', options);
    return response.file;
  }

  /**
   * List remote files
   */
  async remoteList(params?: {
    channel?: ChannelId;
    cursor?: string;
    limit?: number;
    ts_from?: number;
    ts_to?: number;
  }): Promise<{ files: File[]; response_metadata?: ResponseMetadata }> {
    return this.client.get('files.remote.list', params);
  }

  /**
   * Remove remote file
   */
  async remoteRemove(options: { external_id?: string; file?: string }): Promise<void> {
    await this.client.post('files.remote.remove', options);
  }

  /**
   * Share remote file
   */
  async remoteShare(options: {
    channels: ChannelId[];
    external_id?: string;
    file?: string;
  }): Promise<File> {
    const response = await this.client.post<ShareFileResponse>('files.remote.share', {
      channels: options.channels.join(','),
      external_id: options.external_id,
      file: options.file,
    });
    return response.file;
  }

  /**
   * Update remote file
   */
  async remoteUpdate(params: Partial<RemoteFileParams> & { external_id?: string; file?: string }): Promise<File> {
    const response = await this.client.post<UploadFileResponse>('files.remote.update', params);
    return response.file;
  }

  /**
   * Complete upload (v2)
   */
  async completeUploadExternal(
    files: { id: string; title?: string }[],
    channel_id?: ChannelId,
    initial_comment?: string,
    thread_ts?: string
  ): Promise<{ files: File[] }> {
    return this.client.post('files.completeUploadExternal', {
      files: JSON.stringify(files),
      channel_id,
      initial_comment,
      thread_ts,
    });
  }

  /**
   * Get upload URL (v2)
   */
  async getUploadURLExternal(
    filename: string,
    length: number,
    alt_txt?: string,
    snippet_type?: string
  ): Promise<{ upload_url: string; file_id: string }> {
    return this.client.get('files.getUploadURLExternal', {
      filename,
      length,
      alt_txt,
      snippet_type,
    });
  }
}
