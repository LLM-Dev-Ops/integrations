/**
 * Azure Files Types Module
 *
 * Re-exports all types for Azure Files operations.
 */

export {
  type FileInfo,
  type FileContent,
  type FileProperties,
  type DirectoryInfo,
  type DirectoryListing,
  type DirectoryEntry,
  type Lease,
  type LeaseGuard,
  type ByteRange,
  type CopyStatus,
  type ShareInfo,
  isFile,
  isDirectory,
  getEntryName,
  parseFileInfo,
  parseFileProperties,
  parseDirectoryInfo,
} from "./common.js";

export {
  type CreateFileRequest,
  type ReadFileRequest,
  type WriteFileRequest,
  type DeleteFileRequest,
  type GetPropertiesRequest,
  type SetMetadataRequest,
  type CopyFileRequest,
  type CreateDirectoryRequest,
  type DeleteDirectoryRequest,
  type ListDirectoryRequest,
  type AcquireLeaseRequest,
  type BreakLeaseRequest,
  type UploadStreamRequest,
  type DownloadStreamRequest,
  type DownloadRangeRequest,
  type ConditionalUpdateRequest,
  createFileRequest,
  readFileRequest,
  writeFileRequest,
  deleteFileRequest,
  acquireLeaseRequest,
  listDirectoryRequest,
} from "./requests.js";
