/**
 * File types for Mistral API.
 */

/**
 * Purpose of an uploaded file.
 */
export type FilePurpose = 'fine_tune' | 'batch';

/**
 * Uploaded file information.
 */
export interface FileObject {
  /** File ID. */
  id: string;
  /** Object type. */
  object: string;
  /** File size in bytes. */
  bytes: number;
  /** Creation timestamp. */
  created_at: number;
  /** Filename. */
  filename: string;
  /** File purpose. */
  purpose: FilePurpose;
  /** Sample type for fine-tuning files. */
  sample_type?: string;
  /** Number of lines in the file. */
  num_lines?: number;
  /** Source of the file. */
  source?: string;
}

/**
 * Response from listing files.
 */
export interface FileListResponse {
  /** Object type. */
  object: string;
  /** List of files. */
  data: FileObject[];
}

/**
 * Response from deleting a file.
 */
export interface FileDeleteResponse {
  /** File ID. */
  id: string;
  /** Object type. */
  object: string;
  /** Whether the file was deleted. */
  deleted: boolean;
}

/**
 * Signed URL response for file download.
 */
export interface FileSignedUrlResponse {
  /** The signed URL. */
  url: string;
  /** Expiration timestamp. */
  expires_at: number;
}

/**
 * File upload options.
 */
export interface FileUploadOptions {
  /** The file content as a Buffer or Blob. */
  file: Buffer | Blob;
  /** The filename. */
  filename: string;
  /** The purpose of the file. */
  purpose: FilePurpose;
}
