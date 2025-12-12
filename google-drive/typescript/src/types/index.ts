/**
 * Type definitions and Zod schemas for Google Drive integration.
 */

import { z } from "zod";

/**
 * User representation in Google Drive.
 */
export interface User {
  kind?: "drive#user";
  displayName?: string;
  photoLink?: string;
  me?: boolean;
  permissionId?: string;
  emailAddress?: string;
}

export const UserSchema = z.object({
  kind: z.literal("drive#user").optional(),
  displayName: z.string().optional(),
  photoLink: z.string().optional(),
  me: z.boolean().optional(),
  permissionId: z.string().optional(),
  emailAddress: z.string().optional(),
});

export type UserInferred = z.infer<typeof UserSchema>;

// =============================================================================
// Supporting File Types
// =============================================================================

/**
 * Content hints for a file.
 */
export interface ContentHints {
  indexableText?: string;
  thumbnail?: {
    image?: string; // Base64 encoded
    mimeType?: string;
  };
}

export const ContentHintsSchema = z.object({
  indexableText: z.string().optional(),
  thumbnail: z.object({
    image: z.string().optional(),
    mimeType: z.string().optional(),
  }).optional(),
});

/**
 * Image metadata for image files.
 */
export interface ImageMediaMetadata {
  width?: number;
  height?: number;
  rotation?: number;
  location?: {
    latitude?: number;
    longitude?: number;
    altitude?: number;
  };
  time?: string;
  cameraMake?: string;
  cameraModel?: string;
  exposureTime?: number;
  aperture?: number;
  flashUsed?: boolean;
  focalLength?: number;
  isoSpeed?: number;
  meteringMode?: string;
  sensor?: string;
  exposureMode?: string;
  colorSpace?: string;
  whiteBalance?: string;
  exposureBias?: number;
  maxApertureValue?: number;
  subjectDistance?: number;
  lens?: string;
}

export const ImageMediaMetadataSchema = z.object({
  width: z.number().optional(),
  height: z.number().optional(),
  rotation: z.number().optional(),
  location: z.object({
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    altitude: z.number().optional(),
  }).optional(),
  time: z.string().optional(),
  cameraMake: z.string().optional(),
  cameraModel: z.string().optional(),
  exposureTime: z.number().optional(),
  aperture: z.number().optional(),
  flashUsed: z.boolean().optional(),
  focalLength: z.number().optional(),
  isoSpeed: z.number().optional(),
  meteringMode: z.string().optional(),
  sensor: z.string().optional(),
  exposureMode: z.string().optional(),
  colorSpace: z.string().optional(),
  whiteBalance: z.string().optional(),
  exposureBias: z.number().optional(),
  maxApertureValue: z.number().optional(),
  subjectDistance: z.number().optional(),
  lens: z.string().optional(),
});

/**
 * Video metadata for video files.
 */
export interface VideoMediaMetadata {
  width?: number;
  height?: number;
  durationMillis?: string;
}

export const VideoMediaMetadataSchema = z.object({
  width: z.number().optional(),
  height: z.number().optional(),
  durationMillis: z.string().optional(),
});

/**
 * Shortcut details for shortcut files.
 */
export interface ShortcutDetails {
  targetId?: string;
  targetMimeType?: string;
  targetResourceKey?: string;
}

export const ShortcutDetailsSchema = z.object({
  targetId: z.string().optional(),
  targetMimeType: z.string().optional(),
  targetResourceKey: z.string().optional(),
});

/**
 * Content restriction on a file.
 */
export interface ContentRestriction {
  readOnly?: boolean;
  reason?: string;
  restrictingUser?: User;
  restrictionTime?: string;
  type?: string;
}

export const ContentRestrictionSchema = z.object({
  readOnly: z.boolean().optional(),
  reason: z.string().optional(),
  restrictingUser: UserSchema.optional(),
  restrictionTime: z.string().optional(),
  type: z.string().optional(),
});

/**
 * Link share metadata.
 */
export interface LinkShareMetadata {
  securityUpdateEligible?: boolean;
  securityUpdateEnabled?: boolean;
}

export const LinkShareMetadataSchema = z.object({
  securityUpdateEligible: z.boolean().optional(),
  securityUpdateEnabled: z.boolean().optional(),
});

/**
 * Label information.
 */
export interface LabelInfo {
  labels?: Array<{
    id?: string;
    revisionId?: string;
    kind?: string;
    fields?: Record<string, unknown>;
  }>;
}

export const LabelInfoSchema = z.object({
  labels: z.array(z.object({
    id: z.string().optional(),
    revisionId: z.string().optional(),
    kind: z.string().optional(),
    fields: z.record(z.unknown()).optional(),
  })).optional(),
});

/**
 * User capabilities on a file.
 */
export interface FileCapabilities {
  canAddChildren?: boolean;
  canAddFolderFromAnotherDrive?: boolean;
  canAddMyDriveParent?: boolean;
  canChangeCopyRequiresWriterPermission?: boolean;
  canChangeSecurityUpdateEnabled?: boolean;
  canChangeViewersCanCopyContent?: boolean;
  canComment?: boolean;
  canCopy?: boolean;
  canDelete?: boolean;
  canDeleteChildren?: boolean;
  canDownload?: boolean;
  canEdit?: boolean;
  canListChildren?: boolean;
  canModifyContent?: boolean;
  canModifyContentRestriction?: boolean;
  canModifyLabels?: boolean;
  canMoveChildrenOutOfDrive?: boolean;
  canMoveChildrenOutOfTeamDrive?: boolean;
  canMoveChildrenWithinDrive?: boolean;
  canMoveChildrenWithinTeamDrive?: boolean;
  canMoveItemIntoTeamDrive?: boolean;
  canMoveItemOutOfDrive?: boolean;
  canMoveItemOutOfTeamDrive?: boolean;
  canMoveItemWithinDrive?: boolean;
  canMoveItemWithinTeamDrive?: boolean;
  canMoveTeamDriveItem?: boolean;
  canReadDrive?: boolean;
  canReadLabels?: boolean;
  canReadRevisions?: boolean;
  canReadTeamDrive?: boolean;
  canRemoveChildren?: boolean;
  canRemoveMyDriveParent?: boolean;
  canRename?: boolean;
  canShare?: boolean;
  canTrash?: boolean;
  canTrashChildren?: boolean;
  canUntrash?: boolean;
}

export const FileCapabilitiesSchema = z.object({
  canAddChildren: z.boolean().optional(),
  canAddFolderFromAnotherDrive: z.boolean().optional(),
  canAddMyDriveParent: z.boolean().optional(),
  canChangeCopyRequiresWriterPermission: z.boolean().optional(),
  canChangeSecurityUpdateEnabled: z.boolean().optional(),
  canChangeViewersCanCopyContent: z.boolean().optional(),
  canComment: z.boolean().optional(),
  canCopy: z.boolean().optional(),
  canDelete: z.boolean().optional(),
  canDeleteChildren: z.boolean().optional(),
  canDownload: z.boolean().optional(),
  canEdit: z.boolean().optional(),
  canListChildren: z.boolean().optional(),
  canModifyContent: z.boolean().optional(),
  canModifyContentRestriction: z.boolean().optional(),
  canModifyLabels: z.boolean().optional(),
  canMoveChildrenOutOfDrive: z.boolean().optional(),
  canMoveChildrenOutOfTeamDrive: z.boolean().optional(),
  canMoveChildrenWithinDrive: z.boolean().optional(),
  canMoveChildrenWithinTeamDrive: z.boolean().optional(),
  canMoveItemIntoTeamDrive: z.boolean().optional(),
  canMoveItemOutOfDrive: z.boolean().optional(),
  canMoveItemOutOfTeamDrive: z.boolean().optional(),
  canMoveItemWithinDrive: z.boolean().optional(),
  canMoveItemWithinTeamDrive: z.boolean().optional(),
  canMoveTeamDriveItem: z.boolean().optional(),
  canReadDrive: z.boolean().optional(),
  canReadLabels: z.boolean().optional(),
  canReadRevisions: z.boolean().optional(),
  canReadTeamDrive: z.boolean().optional(),
  canRemoveChildren: z.boolean().optional(),
  canRemoveMyDriveParent: z.boolean().optional(),
  canRename: z.boolean().optional(),
  canShare: z.boolean().optional(),
  canTrash: z.boolean().optional(),
  canTrashChildren: z.boolean().optional(),
  canUntrash: z.boolean().optional(),
});

// =============================================================================
// File Types
// =============================================================================

/**
 * Google Drive file representation (comprehensive - all 50+ fields).
 */
export interface DriveFile {
  kind?: "drive#file";
  id: string;
  name: string;
  mimeType: string;
  description?: string;
  starred?: boolean;
  trashed?: boolean;
  explicitlyTrashed?: boolean;
  parents?: string[];
  properties?: Record<string, string>;
  appProperties?: Record<string, string>;
  spaces?: string[];
  version?: string;
  webContentLink?: string;
  webViewLink?: string;
  iconLink?: string;
  hasThumbnail?: boolean;
  thumbnailLink?: string;
  thumbnailVersion?: string;
  viewedByMe?: boolean;
  viewedByMeTime?: string;
  createdTime?: string;
  modifiedTime?: string;
  modifiedByMeTime?: string;
  modifiedByMe?: boolean;
  sharedWithMeTime?: string;
  sharingUser?: User;
  owners?: User[];
  teamDriveId?: string;
  driveId?: string;
  lastModifyingUser?: User;
  shared?: boolean;
  ownedByMe?: boolean;
  capabilities?: FileCapabilities;
  viewersCanCopyContent?: boolean;
  copyRequiresWriterPermission?: boolean;
  writersCanShare?: boolean;
  permissions?: Permission[];
  permissionIds?: string[];
  hasAugmentedPermissions?: boolean;
  folderColorRgb?: string;
  originalFilename?: string;
  fullFileExtension?: string;
  fileExtension?: string;
  md5Checksum?: string;
  sha1Checksum?: string;
  sha256Checksum?: string;
  size?: string;
  quotaBytesUsed?: string;
  headRevisionId?: string;
  contentHints?: ContentHints;
  imageMediaMetadata?: ImageMediaMetadata;
  videoMediaMetadata?: VideoMediaMetadata;
  isAppAuthorized?: boolean;
  exportLinks?: Record<string, string>;
  shortcutDetails?: ShortcutDetails;
  contentRestrictions?: ContentRestriction[];
  resourceKey?: string;
  linkShareMetadata?: LinkShareMetadata;
  labelInfo?: LabelInfo;
}

export const DriveFileSchema = z.object({
  kind: z.literal("drive#file").optional(),
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  description: z.string().optional(),
  starred: z.boolean().optional(),
  trashed: z.boolean().optional(),
  explicitlyTrashed: z.boolean().optional(),
  parents: z.array(z.string()).optional(),
  properties: z.record(z.string()).optional(),
  appProperties: z.record(z.string()).optional(),
  spaces: z.array(z.string()).optional(),
  version: z.string().optional(),
  webContentLink: z.string().optional(),
  webViewLink: z.string().optional(),
  iconLink: z.string().optional(),
  hasThumbnail: z.boolean().optional(),
  thumbnailLink: z.string().optional(),
  thumbnailVersion: z.string().optional(),
  viewedByMe: z.boolean().optional(),
  viewedByMeTime: z.string().optional(),
  createdTime: z.string().optional(),
  modifiedTime: z.string().optional(),
  modifiedByMeTime: z.string().optional(),
  modifiedByMe: z.boolean().optional(),
  sharedWithMeTime: z.string().optional(),
  sharingUser: UserSchema.optional(),
  owners: z.array(UserSchema).optional(),
  teamDriveId: z.string().optional(),
  driveId: z.string().optional(),
  lastModifyingUser: UserSchema.optional(),
  shared: z.boolean().optional(),
  ownedByMe: z.boolean().optional(),
  capabilities: z.lazy(() => FileCapabilitiesSchema).optional(),
  viewersCanCopyContent: z.boolean().optional(),
  copyRequiresWriterPermission: z.boolean().optional(),
  writersCanShare: z.boolean().optional(),
  permissions: z.array(z.lazy(() => PermissionSchema)).optional(),
  permissionIds: z.array(z.string()).optional(),
  hasAugmentedPermissions: z.boolean().optional(),
  folderColorRgb: z.string().optional(),
  originalFilename: z.string().optional(),
  fullFileExtension: z.string().optional(),
  fileExtension: z.string().optional(),
  md5Checksum: z.string().optional(),
  sha1Checksum: z.string().optional(),
  sha256Checksum: z.string().optional(),
  size: z.string().optional(),
  quotaBytesUsed: z.string().optional(),
  headRevisionId: z.string().optional(),
  contentHints: z.lazy(() => ContentHintsSchema).optional(),
  imageMediaMetadata: z.lazy(() => ImageMediaMetadataSchema).optional(),
  videoMediaMetadata: z.lazy(() => VideoMediaMetadataSchema).optional(),
  isAppAuthorized: z.boolean().optional(),
  exportLinks: z.record(z.string()).optional(),
  shortcutDetails: z.lazy(() => ShortcutDetailsSchema).optional(),
  contentRestrictions: z.array(z.lazy(() => ContentRestrictionSchema)).optional(),
  resourceKey: z.string().optional(),
  linkShareMetadata: z.lazy(() => LinkShareMetadataSchema).optional(),
  labelInfo: z.lazy(() => LabelInfoSchema).optional(),
});

export type DriveFileInferred = z.infer<typeof DriveFileSchema>;

export interface FileList {
  kind: "drive#fileList";
  nextPageToken?: string;
  incompleteSearch: boolean;
  files: DriveFile[];
}

export const FileListSchema = z.object({
  kind: z.literal("drive#fileList"),
  nextPageToken: z.string().optional(),
  incompleteSearch: z.boolean(),
  files: z.array(DriveFileSchema),
});

export type PermissionRole = "owner" | "organizer" | "fileOrganizer" | "writer" | "commenter" | "reader";
export type PermissionType = "user" | "group" | "domain" | "anyone";

export interface Permission {
  kind: "drive#permission";
  id: string;
  type: PermissionType;
  role: PermissionRole;
  emailAddress?: string;
  domain?: string;
  displayName?: string;
  [key: string]: unknown;
}

export const PermissionSchema = z.object({
  kind: z.literal("drive#permission"),
  id: z.string(),
  type: z.enum(["user", "group", "domain", "anyone"]),
  role: z.enum(["owner", "organizer", "fileOrganizer", "writer", "commenter", "reader"]),
}).passthrough();

export interface PermissionList {
  kind: "drive#permissionList";
  nextPageToken?: string;
  permissions: Permission[];
}

export const PermissionListSchema = z.object({
  kind: z.literal("drive#permissionList"),
  nextPageToken: z.string().optional(),
  permissions: z.array(PermissionSchema),
});

export interface Comment {
  kind: "drive#comment";
  id: string;
  content: string;
  htmlContent?: string;
  author: User;
  createdTime: string;
  modifiedTime: string;
  deleted: boolean;
  resolved: boolean;
  anchor?: string;
  quotedFileContent?: {
    mimeType: string;
    value: string;
  };
  replies?: Reply[];
}

export const CommentSchema = z.object({
  kind: z.literal("drive#comment"),
  id: z.string(),
  content: z.string(),
  htmlContent: z.string().optional(),
  author: UserSchema,
  createdTime: z.string(),
  modifiedTime: z.string(),
  deleted: z.boolean(),
  resolved: z.boolean(),
}).passthrough();

export interface Reply {
  kind: "drive#reply";
  id: string;
  content: string;
  author: User;
  createdTime: string;
  modifiedTime: string;
  deleted: boolean;
}

export const ReplySchema = z.object({
  kind: z.literal("drive#reply"),
  id: z.string(),
  content: z.string(),
  author: UserSchema,
  createdTime: z.string(),
  modifiedTime: z.string(),
  deleted: z.boolean(),
}).passthrough();

export interface Revision {
  kind: "drive#revision";
  id: string;
  mimeType: string;
  modifiedTime: string;
  keepForever: boolean;
  size?: string;
}

export const RevisionSchema = z.object({
  kind: z.literal("drive#revision"),
  id: z.string(),
  mimeType: z.string(),
  modifiedTime: z.string(),
  keepForever: z.boolean(),
}).passthrough();

export interface Change {
  kind: "drive#change";
  removed: boolean;
  file?: DriveFile;
  fileId: string;
  time: string;
  type: "file" | "drive";
}

export const ChangeSchema = z.object({
  kind: z.literal("drive#change"),
  removed: z.boolean(),
  fileId: z.string(),
  time: z.string(),
  type: z.enum(["file", "drive"]),
}).passthrough();

export interface ChangeList {
  kind: "drive#changeList";
  nextPageToken?: string;
  newStartPageToken?: string;
  changes: Change[];
}

export const ChangeListSchema = z.object({
  kind: z.literal("drive#changeList"),
  nextPageToken: z.string().optional(),
  newStartPageToken: z.string().optional(),
  changes: z.array(ChangeSchema),
});

export interface Drive {
  kind: "drive#drive";
  id: string;
  name: string;
  createdTime: string;
}

export const DriveSchema = z.object({
  kind: z.literal("drive#drive"),
  id: z.string(),
  name: z.string(),
  createdTime: z.string(),
}).passthrough();

export interface StorageQuota {
  limit: string;
  usage: string;
  usageInDrive: string;
  usageInDriveTrash: string;
}

export const StorageQuotaSchema = z.object({
  limit: z.string(),
  usage: z.string(),
  usageInDrive: z.string(),
  usageInDriveTrash: z.string(),
});

export interface About {
  kind: "drive#about";
  user: User;
  storageQuota: StorageQuota;
  importFormats?: Record<string, string[]>;
  exportFormats?: Record<string, string[]>;
  maxImportSizes?: Record<string, string>;
  maxUploadSize?: string;
  appInstalled?: boolean;
  folderColorPalette?: string[];
  driveThemes?: any[];
  canCreateDrives?: boolean;
  canCreateTeamDrives?: boolean;
}

export const AboutSchema = z.object({
  kind: z.literal("drive#about"),
  user: UserSchema,
  storageQuota: StorageQuotaSchema,
}).passthrough();

export interface ListFilesParams {
  pageSize?: number;
  pageToken?: string;
  q?: string;
  orderBy?: string;
  fields?: string;
  corpora?: "user" | "drive" | "allDrives";
  driveId?: string;
  includeItemsFromAllDrives?: boolean;
  spaces?: string;
  supportsAllDrives?: boolean;
}

export interface CreateFileRequest {
  name: string;
  mimeType?: string;
  description?: string;
  parents?: string[];
  properties?: Record<string, string>;
  starred?: boolean;
}

export interface CreatePermissionRequest {
  role: PermissionRole;
  type: PermissionType;
  emailAddress?: string;
  domain?: string;
  allowFileDiscovery?: boolean;
  expirationTime?: string;
  view?: string;
  sendNotificationEmail?: boolean;
  emailMessage?: string;
  transferOwnership?: boolean;
}

// =============================================================================
// MIME Type Constants
// =============================================================================

/**
 * Common MIME types for Google Drive.
 */
export const MIME_TYPES = {
  // Google Workspace types
  FOLDER: "application/vnd.google-apps.folder",
  DOCUMENT: "application/vnd.google-apps.document",
  SPREADSHEET: "application/vnd.google-apps.spreadsheet",
  PRESENTATION: "application/vnd.google-apps.presentation",
  DRAWING: "application/vnd.google-apps.drawing",
  FORM: "application/vnd.google-apps.form",
  SCRIPT: "application/vnd.google-apps.script",
  SITE: "application/vnd.google-apps.site",
  SHORTCUT: "application/vnd.google-apps.shortcut",

  // Common export formats
  PDF: "application/pdf",
  MS_WORD: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  MS_EXCEL: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  MS_POWERPOINT: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  TEXT_PLAIN: "text/plain",
  TEXT_HTML: "text/html",
  TEXT_CSV: "text/csv",
  IMAGE_PNG: "image/png",
  IMAGE_JPEG: "image/jpeg",
  IMAGE_SVG: "image/svg+xml",
} as const;

/**
 * Export format mappings for Google Workspace files.
 */
export const EXPORT_FORMATS = {
  [MIME_TYPES.DOCUMENT]: [
    MIME_TYPES.TEXT_PLAIN,
    MIME_TYPES.TEXT_HTML,
    MIME_TYPES.PDF,
    MIME_TYPES.MS_WORD,
    "application/rtf",
    "application/epub+zip",
  ],
  [MIME_TYPES.SPREADSHEET]: [
    MIME_TYPES.TEXT_CSV,
    "text/tab-separated-values",
    MIME_TYPES.PDF,
    MIME_TYPES.MS_EXCEL,
    "application/vnd.oasis.opendocument.spreadsheet",
  ],
  [MIME_TYPES.PRESENTATION]: [
    MIME_TYPES.PDF,
    MIME_TYPES.MS_POWERPOINT,
    MIME_TYPES.TEXT_PLAIN,
  ],
  [MIME_TYPES.DRAWING]: [
    MIME_TYPES.PDF,
    MIME_TYPES.IMAGE_PNG,
    MIME_TYPES.IMAGE_JPEG,
    MIME_TYPES.IMAGE_SVG,
  ],
  [MIME_TYPES.SCRIPT]: [
    "application/vnd.google-apps.script+json",
  ],
} as const;

// Additional request/response types

export interface CreateFileWithContentRequest {
  metadata: CreateFileRequest;
  content: ArrayBuffer;
  mimeType: string;
}

export interface CreateMultipartRequest {
  metadata: CreateFileRequest;
  content: ArrayBuffer;
  contentType: string;
}

export interface CreateResumableRequest {
  metadata: CreateFileRequest;
  contentType: string;
  contentLength: number;
}

export interface UpdateFileRequest {
  name?: string;
  mimeType?: string;
  description?: string;
  starred?: boolean;
  trashed?: boolean;
  properties?: Record<string, string>;
  appProperties?: Record<string, string>;
  addParents?: string[];
  removeParents?: string[];
}

export interface GetFileParams {
  acknowledgeAbuse?: boolean;
  fields?: string;
  supportsAllDrives?: boolean;
  includePermissionsForView?: string;
  includeLabels?: string;
}

export interface DownloadParams {
  acknowledgeAbuse?: boolean;
  range?: string;
}

export interface CopyFileRequest {
  name?: string;
  description?: string;
  parents?: string[];
  properties?: Record<string, string>;
  appProperties?: Record<string, string>;
  starred?: boolean;
}

export interface CreateFolderRequest {
  name: string;
  description?: string;
  parents?: string[];
  folderColorRgb?: string;
  properties?: Record<string, string>;
}

export interface DeleteFileParams {
  supportsAllDrives?: boolean;
  enforceSingleParent?: boolean;
}

export interface GenerateIdsParams {
  count?: number;
  space?: string;
  type?: string;
}

export interface EmptyTrashParams {
  driveId?: string;
  enforceSingleParent?: boolean;
}

export interface GeneratedIds {
  kind: "drive#generatedIds";
  space: string;
  ids: string[];
}

export const DriveMimeTypes = {
  FOLDER: "application/vnd.google-apps.folder",
} as const;

// Permission types
export interface UpdatePermissionRequest {
  role?: PermissionRole;
  expirationTime?: string;
}

export interface ListPermissionsParams {
  pageSize?: number;
  pageToken?: string;
  supportsAllDrives?: boolean;
  useDomainAdminAccess?: boolean;
  includePermissionsForView?: string;
  fields?: string;
}

export interface GetPermissionParams {
  supportsAllDrives?: boolean;
  useDomainAdminAccess?: boolean;
  fields?: string;
}

export interface DeletePermissionParams {
  supportsAllDrives?: boolean;
  useDomainAdminAccess?: boolean;
}

// Comment types
export interface CommentList {
  kind: "drive#commentList";
  nextPageToken?: string;
  comments: Comment[];
}

export const CommentListSchema = z.object({
  kind: z.literal("drive#commentList"),
  nextPageToken: z.string().optional(),
  comments: z.array(CommentSchema),
});

export interface CreateCommentRequest {
  content: string;
  anchor?: string;
  quotedFileContent?: {
    mimeType: string;
    value: string;
  };
}

export interface UpdateCommentRequest {
  content: string;
}

export interface ListCommentsParams {
  includeDeleted?: boolean;
  pageSize?: number;
  pageToken?: string;
  startModifiedTime?: string;
  fields?: string;
}

export interface GetCommentParams {
  includeDeleted?: boolean;
  fields?: string;
}

// Reply types
export interface ReplyList {
  kind: "drive#replyList";
  nextPageToken?: string;
  replies: Reply[];
}

export const ReplyListSchema = z.object({
  kind: z.literal("drive#replyList"),
  nextPageToken: z.string().optional(),
  replies: z.array(ReplySchema),
});

export interface CreateReplyRequest {
  content?: string;
  action?: "resolve" | "reopen";
}

export interface UpdateReplyRequest {
  content: string;
}

export interface ListRepliesParams {
  includeDeleted?: boolean;
  pageSize?: number;
  pageToken?: string;
  fields?: string;
}

export interface GetReplyParams {
  includeDeleted?: boolean;
  fields?: string;
}

// Revision types
export interface RevisionList {
  kind: "drive#revisionList";
  nextPageToken?: string;
  revisions: Revision[];
}

export const RevisionListSchema = z.object({
  kind: z.literal("drive#revisionList"),
  nextPageToken: z.string().optional(),
  revisions: z.array(RevisionSchema),
});

export interface ListRevisionsParams {
  pageSize?: number;
  pageToken?: string;
  fields?: string;
}

export interface GetRevisionParams {
  acknowledgeAbuse?: boolean;
  fields?: string;
}

export interface UpdateRevisionRequest {
  keepForever?: boolean;
  publishAuto?: boolean;
  published?: boolean;
  publishedOutsideDomain?: boolean;
}

// Changes types
export interface StartPageToken {
  kind: "drive#startPageToken";
  startPageToken: string;
}

export const StartPageTokenSchema = z.object({
  kind: z.literal("drive#startPageToken"),
  startPageToken: z.string(),
});

export interface ListChangesParams {
  driveId?: string;
  includeCorpusRemovals?: boolean;
  includeItemsFromAllDrives?: boolean;
  includePermissionsForView?: string;
  includeRemoved?: boolean;
  includeLabels?: string;
  pageSize?: number;
  restrictToMyDrive?: boolean;
  spaces?: string;
  supportsAllDrives?: boolean;
  fields?: string;
}

export interface GetStartPageTokenParams {
  driveId?: string;
  supportsAllDrives?: boolean;
}

export interface Channel {
  kind: "api#channel";
  id: string;
  resourceId: string;
  resourceUri: string;
  expiration?: string;
}

export const ChannelSchema = z.object({
  kind: z.literal("api#channel"),
  id: z.string(),
  resourceId: z.string(),
  resourceUri: z.string(),
  expiration: z.string().optional(),
});

export interface WatchChangesRequest {
  id: string;
  type: "web_hook";
  address: string;
  expiration?: number;
  token?: string;
  params?: Record<string, string>;
}

// Drives (shared drives) types
export interface DriveList {
  kind: "drive#driveList";
  nextPageToken?: string;
  drives: Drive[];
}

export const DriveListSchema = z.object({
  kind: z.literal("drive#driveList"),
  nextPageToken: z.string().optional(),
  drives: z.array(DriveSchema),
});

export interface ListDrivesParams {
  pageSize?: number;
  pageToken?: string;
  q?: string;
  useDomainAdminAccess?: boolean;
  fields?: string;
}

export interface GetDriveParams {
  useDomainAdminAccess?: boolean;
  fields?: string;
}

export interface CreateDriveRequest {
  name: string;
  requestId: string;
  themeId?: string;
  colorRgb?: string;
  backgroundImageFile?: any;
  restrictions?: DriveRestrictions;
}

export interface UpdateDriveRequest {
  name?: string;
  themeId?: string;
  colorRgb?: string;
  backgroundImageFile?: any;
  restrictions?: DriveRestrictions;
}

export interface DeleteDriveParams {
  useDomainAdminAccess?: boolean;
  allowItemDeletion?: boolean;
}

export interface DriveRestrictions {
  adminManagedRestrictions?: boolean;
  copyRequiresWriterPermission?: boolean;
  domainUsersOnly?: boolean;
  driveMembersOnly?: boolean;
  sharingFoldersRequiresOrganizerPermission?: boolean;
}

// About types
export interface GetAboutParams {
  fields: string;
}

// =============================================================================
// Upload Session Types
// =============================================================================

/**
 * Resumable upload session.
 */
export interface ResumableUploadSession {
  uploadUri: string;
  uploadChunk(chunk: ArrayBuffer | Uint8Array, offset: number, totalSize: number): Promise<UploadChunkResult>;
  queryStatus(): Promise<UploadStatus>;
  cancel(): Promise<void>;
}

/**
 * Result of uploading a chunk.
 */
export type UploadChunkResult =
  | { status: "in_progress"; bytesReceived: number }
  | { status: "complete"; file: DriveFile };

/**
 * Status of a resumable upload.
 */
export interface UploadStatus {
  bytesReceived: number;
  totalSize: number;
  isComplete: boolean;
}
