//! Test fixtures for Slack API responses.
//!
//! Provides realistic test data for unit tests.

use crate::types::*;
use serde_json::json;

/// Create a fixture channel
pub fn channel() -> Channel {
    Channel {
        id: ChannelId::new("C1234567890"),
        name: Some("general".to_string()),
        name_normalized: Some("general".to_string()),
        is_channel: true,
        is_group: false,
        is_im: false,
        is_mpim: false,
        is_private: false,
        is_archived: false,
        is_general: true,
        is_shared: false,
        is_ext_shared: false,
        is_org_shared: false,
        is_pending_ext_shared: false,
        is_member: true,
        creator: Some(UserId::new("U1234567890")),
        created: Some(1234567890),
        unread_count: Some(5),
        unread_count_display: Some(3),
        last_read: Some(Timestamp::new("1234567890.123456")),
        topic: Some(ChannelTopic {
            value: "General discussion".to_string(),
            creator: UserId::new("U1234567890"),
            last_set: 1234567890,
        }),
        purpose: Some(ChannelPurpose {
            value: "A channel for general discussions".to_string(),
            creator: UserId::new("U1234567890"),
            last_set: 1234567890,
        }),
        previous_names: vec![],
        num_members: Some(42),
        locale: None,
        priority: None,
        user: None,
        context_team_id: Some(TeamId::new("T1234567890")),
        conversation_host_id: None,
        internal_team_ids: vec![TeamId::new("T1234567890")],
        pending_shared: vec![],
        shared_team_ids: vec![],
        pending_connected_team_ids: vec![],
        is_open: None,
    }
}

/// Create a fixture private channel
pub fn private_channel() -> Channel {
    let mut ch = channel();
    ch.id = ChannelId::new("G1234567890");
    ch.name = Some("private-channel".to_string());
    ch.is_channel = false;
    ch.is_group = true;
    ch.is_private = true;
    ch.is_general = false;
    ch
}

/// Create a fixture DM channel
pub fn dm_channel() -> Channel {
    Channel {
        id: ChannelId::new("D1234567890"),
        name: None,
        name_normalized: None,
        is_channel: false,
        is_group: false,
        is_im: true,
        is_mpim: false,
        is_private: true,
        is_archived: false,
        is_general: false,
        is_shared: false,
        is_ext_shared: false,
        is_org_shared: false,
        is_pending_ext_shared: false,
        is_member: true,
        creator: None,
        created: Some(1234567890),
        unread_count: None,
        unread_count_display: None,
        last_read: None,
        topic: None,
        purpose: None,
        previous_names: vec![],
        num_members: None,
        locale: None,
        priority: Some(0.5),
        user: Some(UserId::new("U1234567890")),
        context_team_id: Some(TeamId::new("T1234567890")),
        conversation_host_id: None,
        internal_team_ids: vec![],
        pending_shared: vec![],
        shared_team_ids: vec![],
        pending_connected_team_ids: vec![],
        is_open: Some(true),
    }
}

/// Create a fixture message
pub fn message() -> Message {
    Message {
        message_type: "message".to_string(),
        subtype: None,
        text: Some("Hello, World!".to_string()),
        user: Some(UserId::new("U1234567890")),
        bot_id: None,
        ts: Timestamp::new("1234567890.123456"),
        thread_ts: None,
        parent_user_id: None,
        reply_count: None,
        reply_users_count: None,
        latest_reply: None,
        reply_users: vec![],
        is_starred: None,
        reactions: vec![],
        attachments: vec![],
        blocks: vec![],
        files: vec![],
        channel: Some(ChannelId::new("C1234567890")),
        team: Some("T1234567890".to_string()),
        edited: None,
        permalink: Some("https://team.slack.com/archives/C1234567890/p1234567890123456".to_string()),
        bot_profile: None,
        app_id: None,
        icons: None,
        username: None,
        metadata: None,
    }
}

/// Create a fixture thread reply
pub fn thread_reply() -> Message {
    let mut msg = message();
    msg.ts = Timestamp::new("1234567890.654321");
    msg.thread_ts = Some(Timestamp::new("1234567890.123456"));
    msg.parent_user_id = Some(UserId::new("U1234567890"));
    msg.text = Some("This is a reply".to_string());
    msg
}

/// Create a fixture bot message
pub fn bot_message() -> Message {
    let mut msg = message();
    msg.subtype = Some("bot_message".to_string());
    msg.user = None;
    msg.bot_id = Some("B1234567890".to_string());
    msg.username = Some("Test Bot".to_string());
    msg.bot_profile = Some(BotProfile {
        id: "B1234567890".to_string(),
        app_id: Some("A1234567890".to_string()),
        name: Some("Test Bot".to_string()),
        icons: None,
        deleted: false,
        team_id: Some("T1234567890".to_string()),
    });
    msg
}

/// Create a fixture user
pub fn user() -> User {
    User {
        id: UserId::new("U1234567890"),
        team_id: Some(TeamId::new("T1234567890")),
        name: Some("jdoe".to_string()),
        real_name: Some("John Doe".to_string()),
        display_name: Some("John".to_string()),
        deleted: false,
        color: Some("9f69e7".to_string()),
        tz: Some("America/New_York".to_string()),
        tz_label: Some("Eastern Standard Time".to_string()),
        tz_offset: Some(-18000),
        profile: Some(user_profile()),
        is_admin: false,
        is_owner: false,
        is_primary_owner: false,
        is_restricted: false,
        is_ultra_restricted: false,
        is_bot: false,
        is_app_user: false,
        has_2fa: true,
        updated: Some(1234567890),
        is_email_confirmed: Some(true),
        who_can_share_contact_card: None,
        locale: Some("en-US".to_string()),
    }
}

/// Create a fixture user profile
pub fn user_profile() -> UserProfile {
    UserProfile {
        avatar_hash: Some("abc123".to_string()),
        status_text: Some("Working".to_string()),
        status_emoji: Some(":computer:".to_string()),
        status_expiration: None,
        real_name: Some("John Doe".to_string()),
        real_name_normalized: Some("John Doe".to_string()),
        display_name: Some("John".to_string()),
        display_name_normalized: Some("john".to_string()),
        email: Some("john.doe@example.com".to_string()),
        first_name: Some("John".to_string()),
        last_name: Some("Doe".to_string()),
        title: Some("Software Engineer".to_string()),
        phone: Some("+1234567890".to_string()),
        skype: None,
        image_24: Some("https://example.com/avatar_24.png".to_string()),
        image_32: Some("https://example.com/avatar_32.png".to_string()),
        image_48: Some("https://example.com/avatar_48.png".to_string()),
        image_72: Some("https://example.com/avatar_72.png".to_string()),
        image_192: Some("https://example.com/avatar_192.png".to_string()),
        image_512: Some("https://example.com/avatar_512.png".to_string()),
        image_1024: None,
        image_original: None,
        team: Some(TeamId::new("T1234567890")),
        bot_id: None,
        api_app_id: None,
        always_active: false,
        huddle_state: None,
        huddle_state_expiration_ts: None,
        fields: None,
    }
}

/// Create a fixture bot user
pub fn bot_user() -> User {
    let mut u = user();
    u.id = UserId::new("B1234567890");
    u.name = Some("testbot".to_string());
    u.real_name = Some("Test Bot".to_string());
    u.is_bot = true;
    u.is_app_user = true;
    u
}

/// Create a fixture file
pub fn file() -> File {
    File {
        id: FileId::new("F1234567890"),
        name: Some("document.pdf".to_string()),
        title: Some("Important Document".to_string()),
        mimetype: Some("application/pdf".to_string()),
        filetype: Some("pdf".to_string()),
        pretty_type: Some("PDF".to_string()),
        user: Some(UserId::new("U1234567890")),
        mode: Some("hosted".to_string()),
        editable: false,
        is_external: false,
        external_type: None,
        size: Some(1024000),
        url_private: Some("https://files.slack.com/files-pri/T1234567890-F1234567890/document.pdf".to_string()),
        url_private_download: Some("https://files.slack.com/files-pri/T1234567890-F1234567890/download/document.pdf".to_string()),
        original_w: None,
        original_h: None,
        thumb_64: None,
        thumb_80: None,
        thumb_360: None,
        thumb_480: None,
        thumb_720: None,
        thumb_960: None,
        thumb_1024: None,
        permalink: Some("https://team.slack.com/files/U1234567890/F1234567890/document.pdf".to_string()),
        permalink_public: None,
        created: Some(1234567890),
        timestamp: Some(1234567890),
        channels: vec![ChannelId::new("C1234567890")],
        groups: vec![],
        ims: vec![],
    }
}

/// Create a fixture image file
pub fn image_file() -> File {
    let mut f = file();
    f.id = FileId::new("F0987654321");
    f.name = Some("screenshot.png".to_string());
    f.title = Some("Screenshot".to_string());
    f.mimetype = Some("image/png".to_string());
    f.filetype = Some("png".to_string());
    f.pretty_type = Some("PNG".to_string());
    f.original_w = Some(1920);
    f.original_h = Some(1080);
    f.thumb_360 = Some("https://files.slack.com/files-tmb/T1234567890-F0987654321-abc/screenshot_360.png".to_string());
    f
}

/// Create a fixture reaction
pub fn reaction() -> Reaction {
    Reaction {
        name: "thumbsup".to_string(),
        users: vec![
            UserId::new("U1234567890"),
            UserId::new("U0987654321"),
        ],
        count: 2,
    }
}

/// Create fixture JSON responses
pub mod responses {
    use super::*;

    /// Create an OK response
    pub fn ok() -> serde_json::Value {
        json!({ "ok": true })
    }

    /// Create a conversations.list response
    pub fn conversations_list() -> serde_json::Value {
        json!({
            "ok": true,
            "channels": [
                {
                    "id": "C1234567890",
                    "name": "general",
                    "is_channel": true,
                    "is_member": true,
                    "created": 1234567890
                },
                {
                    "id": "C0987654321",
                    "name": "random",
                    "is_channel": true,
                    "is_member": true,
                    "created": 1234567890
                }
            ],
            "response_metadata": {
                "next_cursor": ""
            }
        })
    }

    /// Create a chat.postMessage response
    pub fn post_message() -> serde_json::Value {
        json!({
            "ok": true,
            "channel": "C1234567890",
            "ts": "1234567890.123456",
            "message": {
                "type": "message",
                "text": "Hello, World!",
                "user": "U1234567890",
                "ts": "1234567890.123456"
            }
        })
    }

    /// Create a users.list response
    pub fn users_list() -> serde_json::Value {
        json!({
            "ok": true,
            "members": [
                {
                    "id": "U1234567890",
                    "name": "jdoe",
                    "real_name": "John Doe",
                    "is_bot": false
                },
                {
                    "id": "U0987654321",
                    "name": "jsmith",
                    "real_name": "Jane Smith",
                    "is_bot": false
                }
            ],
            "response_metadata": {
                "next_cursor": ""
            }
        })
    }

    /// Create an auth.test response
    pub fn auth_test() -> serde_json::Value {
        json!({
            "ok": true,
            "url": "https://team.slack.com/",
            "team": "Test Team",
            "user": "testbot",
            "team_id": "T1234567890",
            "user_id": "U1234567890",
            "bot_id": "B1234567890"
        })
    }

    /// Create an error response
    pub fn error(code: &str) -> serde_json::Value {
        json!({
            "ok": false,
            "error": code
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_channel_fixture() {
        let ch = channel();
        assert_eq!(ch.id.as_str(), "C1234567890");
        assert_eq!(ch.name.as_deref(), Some("general"));
        assert!(ch.is_channel);
        assert!(ch.is_member);
    }

    #[test]
    fn test_user_fixture() {
        let u = user();
        assert_eq!(u.id.as_str(), "U1234567890");
        assert_eq!(u.name.as_deref(), Some("jdoe"));
        assert!(!u.is_bot);
    }

    #[test]
    fn test_message_fixture() {
        let msg = message();
        assert_eq!(msg.ts.as_str(), "1234567890.123456");
        assert!(!msg.is_thread_reply());
        assert!(!msg.is_bot_message());
    }

    #[test]
    fn test_thread_reply_fixture() {
        let reply = thread_reply();
        assert!(reply.is_thread_reply());
    }
}
