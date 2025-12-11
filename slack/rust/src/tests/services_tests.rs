//! Service tests.

use crate::fixtures::{channel_fixtures, message_fixtures, user_fixtures};
use crate::mocks::MockHttpTransport;
use crate::types::{Channel, Message, User};
use serde_json::json;

#[test]
fn test_channel_fixtures() {
    let public = channel_fixtures::public_channel(None);
    assert!(public.id.starts_with('C'));
    assert_eq!(public.is_channel, Some(true));
    assert_eq!(public.is_private, Some(false));

    let private = channel_fixtures::private_channel(None);
    assert!(private.id.starts_with('G'));
    assert_eq!(private.is_group, Some(true));
    assert_eq!(private.is_private, Some(true));

    let dm = channel_fixtures::direct_message(None);
    assert!(dm.id.starts_with('D'));
    assert_eq!(dm.is_im, Some(true));
}

#[test]
fn test_message_fixtures() {
    let simple = message_fixtures::simple("Hello, World!");
    assert_eq!(simple.text.as_deref(), Some("Hello, World!"));
    assert_eq!(simple.msg_type, "message");

    let thread = message_fixtures::thread_parent("Parent message", 5);
    assert!(thread.reply_count.is_some());
    assert_eq!(thread.reply_count.unwrap(), 5);

    let reply = message_fixtures::thread_reply("Reply", "1234.5678".to_string());
    assert_eq!(reply.thread_ts.as_deref(), Some("1234.5678"));

    let bot = message_fixtures::bot_message("Bot message");
    assert!(bot.bot_id.is_some());
    assert_eq!(bot.subtype.as_deref(), Some("bot_message"));
}

#[test]
fn test_user_fixtures() {
    let regular = user_fixtures::regular(None);
    assert!(!regular.is_admin.unwrap_or(false));
    assert!(!regular.is_bot.unwrap_or(false));

    let admin = user_fixtures::admin(None);
    assert!(admin.is_admin.unwrap_or(false));

    let bot = user_fixtures::bot(None);
    assert!(bot.is_bot.unwrap_or(false));

    let guest = user_fixtures::guest(None);
    assert!(guest.is_restricted.unwrap_or(false));
}

#[test]
fn test_mock_conversations_service() {
    let mut mock = MockHttpTransport::new();

    // Mock conversations.list
    let channels = vec![
        channel_fixtures::public_channel(Some("general".to_string())),
        channel_fixtures::public_channel(Some("random".to_string())),
    ];
    mock.add_response(
        "conversations.list",
        json!({
            "ok": true,
            "channels": channels,
            "response_metadata": { "next_cursor": "" }
        }),
    );

    let response = mock.get_response("conversations.list").unwrap();
    assert!(response["ok"].as_bool().unwrap());
    assert_eq!(response["channels"].as_array().unwrap().len(), 2);
}

#[test]
fn test_mock_messages_service() {
    let mut mock = MockHttpTransport::new();

    // Mock chat.postMessage
    mock.add_response(
        "chat.postMessage",
        json!({
            "ok": true,
            "channel": "C123",
            "ts": "1234.5678",
            "message": {
                "type": "message",
                "text": "Hello",
                "ts": "1234.5678"
            }
        }),
    );

    let response = mock.get_response("chat.postMessage").unwrap();
    assert!(response["ok"].as_bool().unwrap());
    assert_eq!(response["channel"].as_str().unwrap(), "C123");
}

#[test]
fn test_mock_users_service() {
    let mut mock = MockHttpTransport::new();

    let users = vec![
        user_fixtures::regular(None),
        user_fixtures::admin(None),
    ];
    mock.add_response(
        "users.list",
        json!({
            "ok": true,
            "members": users,
            "cache_ts": 1234567890,
            "response_metadata": { "next_cursor": "" }
        }),
    );

    let response = mock.get_response("users.list").unwrap();
    assert!(response["ok"].as_bool().unwrap());
    assert_eq!(response["members"].as_array().unwrap().len(), 2);
}

#[test]
fn test_mock_error_responses() {
    let mut mock = MockHttpTransport::new();

    mock.add_error_response("conversations.info", "channel_not_found");
    mock.add_error_response("users.info", "user_not_found");

    let response = mock.get_response("conversations.info").unwrap();
    assert!(!response["ok"].as_bool().unwrap());
    assert_eq!(response["error"].as_str().unwrap(), "channel_not_found");

    let response = mock.get_response("users.info").unwrap();
    assert!(!response["ok"].as_bool().unwrap());
    assert_eq!(response["error"].as_str().unwrap(), "user_not_found");
}

#[test]
fn test_mock_pagination() {
    let mut mock = MockHttpTransport::new();

    // First page
    mock.add_response(
        "conversations.list_page1",
        json!({
            "ok": true,
            "channels": [channel_fixtures::public_channel(Some("channel1".to_string()))],
            "response_metadata": { "next_cursor": "cursor_abc" }
        }),
    );

    // Second page
    mock.add_response(
        "conversations.list_page2",
        json!({
            "ok": true,
            "channels": [channel_fixtures::public_channel(Some("channel2".to_string()))],
            "response_metadata": { "next_cursor": "" }
        }),
    );

    let page1 = mock.get_response("conversations.list_page1").unwrap();
    assert_eq!(
        page1["response_metadata"]["next_cursor"].as_str().unwrap(),
        "cursor_abc"
    );

    let page2 = mock.get_response("conversations.list_page2").unwrap();
    assert!(page2["response_metadata"]["next_cursor"]
        .as_str()
        .unwrap()
        .is_empty());
}
