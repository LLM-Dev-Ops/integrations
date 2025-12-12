//! Service implementations for Slack API endpoints.
//!
//! Each service module provides methods for interacting with a specific
//! category of Slack API endpoints.

pub mod apps;
pub mod auth_service;
pub mod bookmarks;
pub mod conversations;
pub mod files;
pub mod messages;
pub mod oauth;
pub mod pins;
pub mod reactions;
pub mod reminders;
pub mod search;
pub mod stars;
pub mod team;
pub mod usergroups;
pub mod users;
pub mod views;

pub use apps::AppsService;
pub use auth_service::AuthService;
pub use bookmarks::BookmarksService;
pub use conversations::ConversationsService;
pub use files::FilesService;
pub use messages::MessagesService;
pub use oauth::OAuthService;
pub use pins::PinsService;
pub use reactions::ReactionsService;
pub use reminders::RemindersService;
pub use search::SearchService;
pub use stars::StarsService;
pub use team::TeamService;
pub use usergroups::UsergroupsService;
pub use users::UsersService;
pub use views::ViewsService;
