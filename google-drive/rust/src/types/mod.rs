//! Type definitions for Google Drive API.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Google Drive file representation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveFile {
    /// Resource kind (always "drive#file").
    pub kind: String,

    /// File ID.
    pub id: String,

    /// File name.
    pub name: String,

    /// MIME type.
    pub mime_type: String,

    /// File description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Whether the file is starred.
    #[serde(default)]
    pub starred: bool,

    /// Whether the file is in trash.
    #[serde(default)]
    pub trashed: bool,

    /// Whether the file was explicitly trashed.
    #[serde(default)]
    pub explicitly_trashed: bool,

    /// Parent folder IDs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parents: Option<Vec<String>>,

    /// Custom properties (key-value pairs).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub properties: Option<HashMap<String, String>>,

    /// App-specific properties.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_properties: Option<HashMap<String, String>>,

    /// Spaces containing the file.
    pub spaces: Vec<String>,

    /// Version number (monotonically increasing).
    pub version: String,

    /// Link to download content.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub web_content_link: Option<String>,

    /// Link to view in Drive.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub web_view_link: Option<String>,

    /// Icon URL.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_link: Option<String>,

    /// Whether the file has a thumbnail.
    #[serde(default)]
    pub has_thumbnail: bool,

    /// Thumbnail URL.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_link: Option<String>,

    /// Thumbnail version.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_version: Option<String>,

    /// Whether viewed by the user.
    #[serde(default)]
    pub viewed_by_me: bool,

    /// Last viewed time.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub viewed_by_me_time: Option<DateTime<Utc>>,

    /// Creation time.
    pub created_time: DateTime<Utc>,

    /// Last modification time.
    pub modified_time: DateTime<Utc>,

    /// Last modified by me time.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_by_me_time: Option<DateTime<Utc>>,

    /// Whether modified by the user.
    #[serde(default)]
    pub modified_by_me: bool,

    /// Time when shared with me.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shared_with_me_time: Option<DateTime<Utc>>,

    /// User who shared the file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sharing_user: Option<User>,

    /// File owners.
    pub owners: Vec<User>,

    /// Team drive ID (deprecated).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_drive_id: Option<String>,

    /// Shared drive ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drive_id: Option<String>,

    /// Last modifying user.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_modifying_user: Option<User>,

    /// Whether the file is shared.
    #[serde(default)]
    pub shared: bool,

    /// Whether owned by the user.
    #[serde(default)]
    pub owned_by_me: bool,

    /// User capabilities on the file.
    pub capabilities: FileCapabilities,

    /// Whether viewers can copy content.
    #[serde(default)]
    pub viewers_can_copy_content: bool,

    /// Whether copying requires writer permission.
    #[serde(default)]
    pub copy_requires_writer_permission: bool,

    /// Whether writers can share.
    #[serde(default)]
    pub writers_can_share: bool,

    /// Permissions list.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permissions: Option<Vec<Permission>>,

    /// Permission IDs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permission_ids: Option<Vec<String>>,

    /// Whether the file has augmented permissions.
    #[serde(default)]
    pub has_augmented_permissions: bool,

    /// Original filename.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_filename: Option<String>,

    /// Full file extension.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub full_file_extension: Option<String>,

    /// File extension.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_extension: Option<String>,

    /// MD5 checksum.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub md5_checksum: Option<String>,

    /// SHA1 checksum.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha1_checksum: Option<String>,

    /// SHA256 checksum.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256_checksum: Option<String>,

    /// File size in bytes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,

    /// Quota bytes used.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quota_bytes_used: Option<String>,

    /// Head revision ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub head_revision_id: Option<String>,

    /// Content hints.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_hints: Option<ContentHints>,

    /// Image metadata.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_media_metadata: Option<ImageMediaMetadata>,

    /// Video metadata.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_media_metadata: Option<VideoMediaMetadata>,

    /// Whether the app is authorized.
    #[serde(default)]
    pub is_app_authorized: bool,

    /// Export links.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub export_links: Option<HashMap<String, String>>,

    /// Shortcut details.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shortcut_details: Option<ShortcutDetails>,

    /// Content restrictions.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_restrictions: Option<Vec<ContentRestriction>>,

    /// Resource key.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_key: Option<String>,

    /// Link share metadata.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link_share_metadata: Option<LinkShareMetadata>,
}

/// File list response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileList {
    /// Resource kind (always "drive#fileList").
    pub kind: String,

    /// Next page token.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_page_token: Option<String>,

    /// Whether the search was incomplete.
    #[serde(default)]
    pub incomplete_search: bool,

    /// List of files.
    pub files: Vec<DriveFile>,
}

/// User representation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    /// Resource kind.
    pub kind: String,

    /// Display name.
    pub display_name: String,

    /// Photo link.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub photo_link: Option<String>,

    /// Whether this is the authenticated user.
    #[serde(default)]
    pub me: bool,

    /// Permission ID.
    pub permission_id: String,

    /// Email address.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email_address: Option<String>,
}

/// File capabilities.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileCapabilities {
    /// Can add children.
    #[serde(default)]
    pub can_add_children: bool,

    /// Can add folder from another drive.
    #[serde(default)]
    pub can_add_folder_from_another_drive: bool,

    /// Can add my drive parent.
    #[serde(default)]
    pub can_add_my_drive_parent: bool,

    /// Can change copy requires writer permission.
    #[serde(default)]
    pub can_change_copy_requires_writer_permission: bool,

    /// Can change security update enabled.
    #[serde(default)]
    pub can_change_security_update_enabled: bool,

    /// Can change viewers can copy content.
    #[serde(default)]
    pub can_change_viewers_can_copy_content: bool,

    /// Can comment.
    #[serde(default)]
    pub can_comment: bool,

    /// Can copy.
    #[serde(default)]
    pub can_copy: bool,

    /// Can delete.
    #[serde(default)]
    pub can_delete: bool,

    /// Can delete children.
    #[serde(default)]
    pub can_delete_children: bool,

    /// Can download.
    #[serde(default)]
    pub can_download: bool,

    /// Can edit.
    #[serde(default)]
    pub can_edit: bool,

    /// Can list children.
    #[serde(default)]
    pub can_list_children: bool,

    /// Can modify content.
    #[serde(default)]
    pub can_modify_content: bool,

    /// Can modify content restriction.
    #[serde(default)]
    pub can_modify_content_restriction: bool,

    /// Can modify labels.
    #[serde(default)]
    pub can_modify_labels: bool,

    /// Can move children out of drive.
    #[serde(default)]
    pub can_move_children_out_of_drive: bool,

    /// Can move children out of team drive.
    #[serde(default)]
    pub can_move_children_out_of_team_drive: bool,

    /// Can move children within drive.
    #[serde(default)]
    pub can_move_children_within_drive: bool,

    /// Can move children within team drive.
    #[serde(default)]
    pub can_move_children_within_team_drive: bool,

    /// Can move item into team drive.
    #[serde(default)]
    pub can_move_item_into_team_drive: bool,

    /// Can move item out of drive.
    #[serde(default)]
    pub can_move_item_out_of_drive: bool,

    /// Can move item out of team drive.
    #[serde(default)]
    pub can_move_item_out_of_team_drive: bool,

    /// Can move item within drive.
    #[serde(default)]
    pub can_move_item_within_drive: bool,

    /// Can move item within team drive.
    #[serde(default)]
    pub can_move_item_within_team_drive: bool,

    /// Can move team drive item.
    #[serde(default)]
    pub can_move_team_drive_item: bool,

    /// Can read drive.
    #[serde(default)]
    pub can_read_drive: bool,

    /// Can read labels.
    #[serde(default)]
    pub can_read_labels: bool,

    /// Can read revisions.
    #[serde(default)]
    pub can_read_revisions: bool,

    /// Can read team drive.
    #[serde(default)]
    pub can_read_team_drive: bool,

    /// Can remove children.
    #[serde(default)]
    pub can_remove_children: bool,

    /// Can remove my drive parent.
    #[serde(default)]
    pub can_remove_my_drive_parent: bool,

    /// Can rename.
    #[serde(default)]
    pub can_rename: bool,

    /// Can share.
    #[serde(default)]
    pub can_share: bool,

    /// Can trash.
    #[serde(default)]
    pub can_trash: bool,

    /// Can trash children.
    #[serde(default)]
    pub can_trash_children: bool,

    /// Can untrash.
    #[serde(default)]
    pub can_untrash: bool,
}

/// Permission representation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Permission {
    /// Resource kind (always "drive#permission").
    pub kind: String,

    /// Permission ID.
    pub id: String,

    /// Permission type.
    #[serde(rename = "type")]
    pub permission_type: PermissionType,

    /// Permission role.
    pub role: PermissionRole,

    /// Email address (for user/group type).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email_address: Option<String>,

    /// Domain (for domain type).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<String>,

    /// Display name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,

    /// Photo link.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub photo_link: Option<String>,

    /// Expiration time.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expiration_time: Option<DateTime<Utc>>,

    /// Permission details.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permission_details: Option<Vec<PermissionDetails>>,

    /// Allow file discovery.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_file_discovery: Option<bool>,

    /// Whether deleted.
    #[serde(default)]
    pub deleted: bool,

    /// View type.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub view: Option<String>,

    /// Whether pending owner.
    #[serde(default)]
    pub pending_owner: bool,
}

/// Permission type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PermissionType {
    /// Specific user.
    User,
    /// Google Group.
    Group,
    /// Entire domain.
    Domain,
    /// Anyone with link.
    Anyone,
}

/// Permission role.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionRole {
    /// Full ownership.
    Owner,
    /// Shared drive organizer.
    Organizer,
    /// File organizer.
    FileOrganizer,
    /// Can edit.
    Writer,
    /// Can comment.
    Commenter,
    /// Can view.
    Reader,
}

/// Permission details.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionDetails {
    /// Permission type.
    #[serde(rename = "type")]
    pub permission_type: PermissionType,

    /// Role.
    pub role: PermissionRole,

    /// Inherited from.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inherited_from: Option<String>,

    /// Inherited.
    #[serde(default)]
    pub inherited: bool,
}

/// Permission list response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionList {
    /// Resource kind.
    pub kind: String,

    /// Next page token.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_page_token: Option<String>,

    /// Permissions.
    pub permissions: Vec<Permission>,
}

/// Comment representation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    /// Resource kind.
    pub kind: String,

    /// Comment ID.
    pub id: String,

    /// Creation time.
    pub created_time: DateTime<Utc>,

    /// Modification time.
    pub modified_time: DateTime<Utc>,

    /// Author.
    pub author: User,

    /// HTML content.
    pub html_content: String,

    /// Plain text content.
    pub content: String,

    /// Whether deleted.
    #[serde(default)]
    pub deleted: bool,

    /// Whether resolved.
    #[serde(default)]
    pub resolved: bool,

    /// Quoted file content.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quoted_file_content: Option<QuotedFileContent>,

    /// Anchor.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchor: Option<String>,

    /// Replies.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replies: Option<Vec<Reply>>,
}

/// Reply to a comment.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reply {
    /// Resource kind.
    pub kind: String,

    /// Reply ID.
    pub id: String,

    /// Creation time.
    pub created_time: DateTime<Utc>,

    /// Modification time.
    pub modified_time: DateTime<Utc>,

    /// Author.
    pub author: User,

    /// HTML content.
    pub html_content: String,

    /// Plain text content.
    pub content: String,

    /// Whether deleted.
    #[serde(default)]
    pub deleted: bool,

    /// Action (resolve/reopen).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
}

/// Quoted file content.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotedFileContent {
    /// MIME type.
    pub mime_type: String,

    /// Value.
    pub value: String,
}

/// Revision representation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Revision {
    /// Resource kind (always "drive#revision").
    pub kind: String,

    /// Revision ID.
    pub id: String,

    /// MIME type.
    pub mime_type: String,

    /// Modification time.
    pub modified_time: DateTime<Utc>,

    /// Keep forever.
    #[serde(default)]
    pub keep_forever: bool,

    /// Whether published.
    #[serde(default)]
    pub published: bool,

    /// Published link.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_link: Option<String>,

    /// Auto-publish.
    #[serde(default)]
    pub publish_auto: bool,

    /// Published outside domain.
    #[serde(default)]
    pub published_outside_domain: bool,

    /// Last modifying user.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_modifying_user: Option<User>,

    /// Original filename.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_filename: Option<String>,

    /// MD5 checksum.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub md5_checksum: Option<String>,

    /// Size in bytes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,

    /// Export links.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub export_links: Option<HashMap<String, String>>,
}

/// Change representation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    /// Resource kind.
    pub kind: String,

    /// Whether removed.
    #[serde(default)]
    pub removed: bool,

    /// File (if not removed).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file: Option<DriveFile>,

    /// File ID.
    pub file_id: String,

    /// Change time.
    pub time: DateTime<Utc>,

    /// Change type.
    #[serde(rename = "type")]
    pub change_type: String,

    /// Drive ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drive_id: Option<String>,

    /// Drive.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drive: Option<Drive>,
}

/// Change list response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeList {
    /// Resource kind.
    pub kind: String,

    /// Next page token.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_page_token: Option<String>,

    /// New start page token.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_start_page_token: Option<String>,

    /// Changes.
    pub changes: Vec<Change>,
}

/// Shared drive representation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Drive {
    /// Resource kind (always "drive#drive").
    pub kind: String,

    /// Drive ID.
    pub id: String,

    /// Drive name.
    pub name: String,

    /// Theme ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme_id: Option<String>,

    /// Color RGB.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_rgb: Option<String>,

    /// Background image file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_image_file: Option<BackgroundImageFile>,

    /// Background image link.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_image_link: Option<String>,

    /// Capabilities.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<DriveCapabilities>,

    /// Creation time.
    pub created_time: DateTime<Utc>,

    /// Whether hidden.
    #[serde(default)]
    pub hidden: bool,

    /// Restrictions.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub restrictions: Option<DriveRestrictions>,

    /// Organization unit ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub org_unit_id: Option<String>,
}

/// Background image file for a shared drive.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundImageFile {
    /// File ID.
    pub id: String,

    /// X coordinate.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x_coordinate: Option<f64>,

    /// Y coordinate.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y_coordinate: Option<f64>,

    /// Width.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
}

/// Drive capabilities.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveCapabilities {
    /// Can add children.
    #[serde(default)]
    pub can_add_children: bool,

    /// Can comment.
    #[serde(default)]
    pub can_comment: bool,

    /// Can copy.
    #[serde(default)]
    pub can_copy: bool,

    /// Can delete drive.
    #[serde(default)]
    pub can_delete_drive: bool,

    /// Can download.
    #[serde(default)]
    pub can_download: bool,

    /// Can edit.
    #[serde(default)]
    pub can_edit: bool,

    /// Can list children.
    #[serde(default)]
    pub can_list_children: bool,

    /// Can manage members.
    #[serde(default)]
    pub can_manage_members: bool,

    /// Can read revisions.
    #[serde(default)]
    pub can_read_revisions: bool,

    /// Can rename.
    #[serde(default)]
    pub can_rename: bool,

    /// Can rename drive.
    #[serde(default)]
    pub can_rename_drive: bool,

    /// Can share.
    #[serde(default)]
    pub can_share: bool,
}

/// Drive restrictions.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveRestrictions {
    /// Admin managed restrictions.
    #[serde(default)]
    pub admin_managed_restrictions: bool,

    /// Copy requires writer permission.
    #[serde(default)]
    pub copy_requires_writer_permission: bool,

    /// Domain users only.
    #[serde(default)]
    pub domain_users_only: bool,

    /// Drive members only.
    #[serde(default)]
    pub drive_members_only: bool,
}

/// Storage quota information.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageQuota {
    /// Total storage limit in bytes.
    pub limit: String,

    /// Current usage in bytes.
    pub usage: String,

    /// Usage in Drive.
    pub usage_in_drive: String,

    /// Usage in trash.
    pub usage_in_drive_trash: String,
}

/// Content hints.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentHints {
    /// Indexable text.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub indexable_text: Option<String>,

    /// Thumbnail.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<Thumbnail>,
}

/// Thumbnail.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Thumbnail {
    /// Image data (base64 encoded).
    pub image: String,

    /// MIME type.
    pub mime_type: String,
}

/// Image media metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMediaMetadata {
    /// Width in pixels.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<i32>,

    /// Height in pixels.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<i32>,

    /// Rotation in degrees.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rotation: Option<i32>,
}

/// Video media metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoMediaMetadata {
    /// Width in pixels.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<i32>,

    /// Height in pixels.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<i32>,

    /// Duration in milliseconds.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_millis: Option<i64>,
}

/// Shortcut details.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutDetails {
    /// Target ID.
    pub target_id: String,

    /// Target MIME type.
    pub target_mime_type: String,

    /// Target resource key.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_resource_key: Option<String>,
}

/// Content restriction.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentRestriction {
    /// Read only.
    #[serde(default)]
    pub read_only: bool,

    /// Reason.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,

    /// Restricting user.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub restricting_user: Option<User>,

    /// Restriction time.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub restriction_time: Option<DateTime<Utc>>,

    /// Type.
    #[serde(rename = "type")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub restriction_type: Option<String>,
}

/// Link share metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkShareMetadata {
    /// Security update eligible.
    #[serde(default)]
    pub security_update_eligible: bool,

    /// Security update enabled.
    #[serde(default)]
    pub security_update_enabled: bool,
}

/// Comment list response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentList {
    /// Resource kind (always "drive#commentList").
    pub kind: String,

    /// Next page token.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_page_token: Option<String>,

    /// Comments.
    pub comments: Vec<Comment>,
}

/// Reply list response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplyList {
    /// Resource kind (always "drive#replyList").
    pub kind: String,

    /// Next page token.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_page_token: Option<String>,

    /// Replies.
    pub replies: Vec<Reply>,
}

/// Revision list response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevisionList {
    /// Resource kind (always "drive#revisionList").
    pub kind: String,

    /// Next page token.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_page_token: Option<String>,

    /// Revisions.
    pub revisions: Vec<Revision>,
}

/// Start page token for change tracking.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartPageToken {
    /// Resource kind (always "drive#startPageToken").
    pub kind: String,

    /// Start page token.
    pub start_page_token: String,
}

/// Drive list response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveList {
    /// Resource kind (always "drive#driveList").
    pub kind: String,

    /// Next page token.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_page_token: Option<String>,

    /// Drives.
    pub drives: Vec<Drive>,
}

/// About resource (user and drive information).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct About {
    /// Resource kind (always "drive#about").
    pub kind: String,

    /// User information.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<User>,

    /// Storage quota.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub storage_quota: Option<StorageQuota>,

    /// Supported import formats.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub import_formats: Option<HashMap<String, Vec<String>>>,

    /// Supported export formats.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub export_formats: Option<HashMap<String, Vec<String>>>,

    /// Maximum import sizes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_import_sizes: Option<HashMap<String, String>>,

    /// Maximum upload size.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_upload_size: Option<String>,

    /// Whether app is installed.
    #[serde(default)]
    pub app_installed: bool,

    /// Folder color palette.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_color_palette: Option<Vec<String>>,

    /// Drive themes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drive_themes: Option<Vec<DriveTheme>>,

    /// Can create drives.
    #[serde(default)]
    pub can_create_drives: bool,

    /// Can create team drives (deprecated).
    #[serde(default)]
    pub can_create_team_drives: bool,
}

/// Drive theme.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveTheme {
    /// Theme ID.
    pub id: String,

    /// Background image link.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background_image_link: Option<String>,

    /// Color RGB.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_rgb: Option<String>,
}

// ============================================================================
// Request Types
// ============================================================================

/// Request to create a file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFileRequest {
    /// File name.
    pub name: String,

    /// MIME type.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,

    /// Description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Parent folder IDs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parents: Option<Vec<String>>,

    /// Custom properties.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub properties: Option<HashMap<String, String>>,

    /// App-specific properties.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_properties: Option<HashMap<String, String>>,

    /// Whether to star the file.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub starred: Option<bool>,

    /// Folder color (folders only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_color_rgb: Option<String>,

    /// Content hints.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_hints: Option<ContentHints>,

    /// Content restrictions.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_restrictions: Option<Vec<ContentRestriction>>,

    /// Whether copying requires writer permission.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub copy_requires_writer_permission: Option<bool>,

    /// Shortcut details.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shortcut_details: Option<ShortcutDetails>,

    /// Whether writers can share.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub writers_can_share: Option<bool>,
}

/// Request to update a file.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFileRequest {
    /// New name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// New MIME type.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,

    /// New description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Whether starred.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub starred: Option<bool>,

    /// Whether trashed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trashed: Option<bool>,

    /// Custom properties.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub properties: Option<HashMap<String, String>>,

    /// App-specific properties.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_properties: Option<HashMap<String, String>>,

    /// Content hints.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_hints: Option<ContentHints>,

    /// Content restrictions.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_restrictions: Option<Vec<ContentRestriction>>,

    /// Whether copying requires writer permission.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub copy_requires_writer_permission: Option<bool>,

    /// Whether writers can share.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub writers_can_share: Option<bool>,
}

/// Request to copy a file.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyFileRequest {
    /// New file name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// Destination parent folder IDs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parents: Option<Vec<String>>,

    /// Description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Custom properties.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub properties: Option<HashMap<String, String>>,

    /// App-specific properties.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_properties: Option<HashMap<String, String>>,

    /// Whether to star the copy.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub starred: Option<bool>,

    /// Content restrictions.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_restrictions: Option<Vec<ContentRestriction>>,

    /// Whether copying requires writer permission.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub copy_requires_writer_permission: Option<bool>,

    /// Whether writers can share.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub writers_can_share: Option<bool>,
}

/// Request to create a folder.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFolderRequest {
    /// Folder name.
    pub name: String,

    /// Description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Parent folder IDs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parents: Option<Vec<String>>,

    /// Folder color.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_color_rgb: Option<String>,

    /// Custom properties.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub properties: Option<HashMap<String, String>>,
}

/// Parameters for listing files.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListFilesParams {
    /// Corpora to search.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub corpora: Option<String>,

    /// Shared drive ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drive_id: Option<String>,

    /// Include items from all drives.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_items_from_all_drives: Option<bool>,

    /// Include permissions for view.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_permissions_for_view: Option<String>,

    /// Include label IDs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_labels: Option<String>,

    /// Order by clause.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order_by: Option<String>,

    /// Page size.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_size: Option<i32>,

    /// Page token.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_token: Option<String>,

    /// Query string.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub q: Option<String>,

    /// Spaces to search.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spaces: Option<String>,

    /// Support all drives.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supports_all_drives: Option<bool>,

    /// Fields to return.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<String>,
}

/// Request to create a permission.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePermissionRequest {
    /// Permission role.
    pub role: PermissionRole,

    /// Permission type.
    #[serde(rename = "type")]
    pub permission_type: PermissionType,

    /// Email address (for user/group type).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email_address: Option<String>,

    /// Domain (for domain type).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<String>,

    /// Allow file discovery.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_file_discovery: Option<bool>,

    /// Expiration time.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expiration_time: Option<DateTime<Utc>>,

    /// View type.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub view: Option<String>,

    /// Pending owner.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pending_owner: Option<bool>,
}

/// Request to update a permission.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePermissionRequest {
    /// New role.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<PermissionRole>,

    /// New expiration time.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expiration_time: Option<DateTime<Utc>>,

    /// Pending ownership.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pending_owner: Option<bool>,
}

/// Request to create a comment.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCommentRequest {
    /// Comment content (plain text).
    pub content: String,

    /// Anchor location.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anchor: Option<String>,

    /// Quoted file content.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quoted_file_content: Option<QuotedFileContent>,
}

/// Request to create a reply.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReplyRequest {
    /// Reply content (plain text).
    pub content: String,

    /// Action (resolve/reopen).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
}

/// Channel for push notifications.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Channel {
    /// Resource kind (always "api#channel").
    pub kind: String,

    /// Channel ID.
    pub id: String,

    /// Resource ID being watched.
    pub resource_id: String,

    /// Resource URI.
    pub resource_uri: String,

    /// Expiration time (milliseconds since epoch).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expiration: Option<String>,
}

/// Request to create a file with content (simple upload).
#[derive(Debug, Clone)]
pub struct CreateFileWithContentRequest {
    /// File name.
    pub name: String,

    /// MIME type.
    pub mime_type: String,

    /// File content.
    pub content: bytes::Bytes,

    /// Parent folder IDs.
    pub parents: Option<Vec<String>>,
}

/// Request to create a file with multipart upload.
#[derive(Debug, Clone)]
pub struct CreateMultipartRequest {
    /// File metadata.
    pub metadata: CreateFileRequest,

    /// MIME type.
    pub mime_type: String,

    /// File content.
    pub content: bytes::Bytes,
}
