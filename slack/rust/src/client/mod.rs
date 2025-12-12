//! Slack client implementation.
//!
//! Provides the main entry point for interacting with Slack APIs.

use crate::auth::AuthManager;
use crate::config::SlackConfig;
use crate::errors::{SlackError, SlackResult};
use crate::resilience::ResilienceOrchestrator;
use crate::services::{
    AppsService, AuthService, BookmarksService, ConversationsService, FilesService,
    MessagesService, OAuthService, PinsService, ReactionsService, RemindersService,
    SearchService, StarsService, TeamService, UsergroupsService, UsersService, ViewsService,
};
use crate::transport::{HttpTransport, ReqwestTransport};
use std::sync::Arc;

/// Trait defining the Slack client interface
pub trait SlackClient: Send + Sync {
    /// Get the configuration
    fn config(&self) -> &SlackConfig;

    /// Get the authentication manager
    fn auth_manager(&self) -> &AuthManager;

    /// Get the conversations service
    fn conversations(&self) -> &dyn crate::services::conversations::ConversationsServiceTrait;

    /// Get the messages service
    fn messages(&self) -> &dyn crate::services::messages::MessagesServiceTrait;

    /// Get the users service
    fn users(&self) -> &dyn crate::services::users::UsersServiceTrait;

    /// Get the files service
    fn files(&self) -> &dyn crate::services::files::FilesServiceTrait;

    /// Get the reactions service
    fn reactions(&self) -> &dyn crate::services::reactions::ReactionsServiceTrait;

    /// Get the pins service
    fn pins(&self) -> &dyn crate::services::pins::PinsServiceTrait;

    /// Get the views service
    fn views(&self) -> &dyn crate::services::views::ViewsServiceTrait;

    /// Get the auth service
    fn auth_service(&self) -> &dyn crate::services::auth_service::AuthServiceTrait;

    /// Get the bookmarks service
    fn bookmarks(&self) -> &dyn crate::services::bookmarks::BookmarksServiceTrait;

    /// Get the team service
    fn team(&self) -> &dyn crate::services::team::TeamServiceTrait;

    /// Get the apps service
    fn apps(&self) -> &dyn crate::services::apps::AppsServiceTrait;

    /// Get the oauth service
    fn oauth(&self) -> &dyn crate::services::oauth::OAuthServiceTrait;

    /// Get the reminders service
    fn reminders(&self) -> &dyn crate::services::reminders::RemindersServiceTrait;

    /// Get the search service
    fn search(&self) -> &dyn crate::services::search::SearchServiceTrait;

    /// Get the stars service
    fn stars(&self) -> &dyn crate::services::stars::StarsServiceTrait;

    /// Get the usergroups service
    fn usergroups(&self) -> &dyn crate::services::usergroups::UsergroupsServiceTrait;
}

/// Main Slack client implementation
pub struct SlackClientImpl {
    config: Arc<SlackConfig>,
    auth: AuthManager,
    transport: Arc<dyn HttpTransport>,
    // Service instances
    conversations_service: ConversationsService,
    messages_service: MessagesService,
    users_service: UsersService,
    files_service: FilesService,
    reactions_service: ReactionsService,
    pins_service: PinsService,
    views_service: ViewsService,
    auth_service: AuthService,
    bookmarks_service: BookmarksService,
    team_service: TeamService,
    apps_service: AppsService,
    oauth_service: OAuthService,
    reminders_service: RemindersService,
    search_service: SearchService,
    stars_service: StarsService,
    usergroups_service: UsergroupsService,
}

impl SlackClientImpl {
    /// Create a new Slack client with the given configuration
    pub fn new(config: SlackConfig) -> SlackResult<Self> {
        let config = Arc::new(config);
        let auth = AuthManager::new(config.clone());
        let transport = Arc::new(ReqwestTransport::new(config.timeout)?);

        // Create resilience orchestrator for all services
        let resilience = Arc::new(ResilienceOrchestrator::new(Default::default()));
        let base_url = config.build_url("");

        // Initialize services
        let conversations_service = ConversationsService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let messages_service = MessagesService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let users_service = UsersService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let files_service = FilesService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let reactions_service = ReactionsService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let pins_service = PinsService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let views_service = ViewsService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let auth_service = AuthService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let bookmarks_service = BookmarksService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let team_service = TeamService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let apps_service = AppsService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let oauth_service = OAuthService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let reminders_service = RemindersService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let search_service = SearchService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let stars_service = StarsService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let usergroups_service = UsergroupsService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );

        Ok(Self {
            config,
            auth,
            transport,
            conversations_service,
            messages_service,
            users_service,
            files_service,
            reactions_service,
            pins_service,
            views_service,
            auth_service,
            bookmarks_service,
            team_service,
            apps_service,
            oauth_service,
            reminders_service,
            search_service,
            stars_service,
            usergroups_service,
        })
    }

    /// Create a new Slack client with a custom transport
    pub fn with_transport(
        config: SlackConfig,
        transport: Arc<dyn HttpTransport>,
    ) -> SlackResult<Self> {
        let config = Arc::new(config);
        let auth = AuthManager::new(config.clone());

        // Create resilience orchestrator for all services
        let resilience = Arc::new(ResilienceOrchestrator::new(Default::default()));
        let base_url = config.build_url("");

        // Initialize services
        let conversations_service = ConversationsService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let messages_service = MessagesService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let users_service = UsersService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let files_service = FilesService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let reactions_service = ReactionsService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let pins_service = PinsService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let views_service = ViewsService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let auth_service = AuthService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let bookmarks_service = BookmarksService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let team_service = TeamService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let apps_service = AppsService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let oauth_service = OAuthService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let reminders_service = RemindersService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let search_service = SearchService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let stars_service = StarsService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );
        let usergroups_service = UsergroupsService::new(
            transport.clone(),
            auth.clone(),
            base_url.clone(),
            resilience.clone(),
        );

        Ok(Self {
            config,
            auth,
            transport,
            conversations_service,
            messages_service,
            users_service,
            files_service,
            reactions_service,
            pins_service,
            views_service,
            auth_service,
            bookmarks_service,
            team_service,
            apps_service,
            oauth_service,
            reminders_service,
            search_service,
            stars_service,
            usergroups_service,
        })
    }

    /// Get a reference to the HTTP transport
    pub fn transport(&self) -> &Arc<dyn HttpTransport> {
        &self.transport
    }

    /// Get a reference to the base URL
    pub fn base_url(&self) -> &str {
        self.config.base_url.as_str()
    }

    /// Build a full URL for an endpoint
    pub fn build_url(&self, endpoint: &str) -> String {
        self.config.build_url(endpoint)
    }

    /// Get the conversations service
    pub fn conversations(&self) -> &ConversationsService {
        &self.conversations_service
    }

    /// Get the messages service
    pub fn messages(&self) -> &MessagesService {
        &self.messages_service
    }

    /// Get the users service
    pub fn users(&self) -> &UsersService {
        &self.users_service
    }

    /// Get the files service
    pub fn files(&self) -> &FilesService {
        &self.files_service
    }

    /// Get the reactions service
    pub fn reactions(&self) -> &ReactionsService {
        &self.reactions_service
    }

    /// Get the pins service
    pub fn pins(&self) -> &PinsService {
        &self.pins_service
    }

    /// Get the views service
    pub fn views(&self) -> &ViewsService {
        &self.views_service
    }

    /// Get the auth service
    pub fn auth_service(&self) -> &AuthService {
        &self.auth_service
    }

    /// Get the bookmarks service
    pub fn bookmarks(&self) -> &BookmarksService {
        &self.bookmarks_service
    }

    /// Get the team service
    pub fn team(&self) -> &TeamService {
        &self.team_service
    }

    /// Get the apps service
    pub fn apps(&self) -> &AppsService {
        &self.apps_service
    }

    /// Get the oauth service
    pub fn oauth(&self) -> &OAuthService {
        &self.oauth_service
    }

    /// Get the reminders service
    pub fn reminders(&self) -> &RemindersService {
        &self.reminders_service
    }

    /// Get the search service
    pub fn search(&self) -> &SearchService {
        &self.search_service
    }

    /// Get the stars service
    pub fn stars(&self) -> &StarsService {
        &self.stars_service
    }

    /// Get the usergroups service
    pub fn usergroups(&self) -> &UsergroupsService {
        &self.usergroups_service
    }
}

impl SlackClient for SlackClientImpl {
    fn config(&self) -> &SlackConfig {
        &self.config
    }

    fn auth_manager(&self) -> &AuthManager {
        &self.auth
    }

    fn conversations(&self) -> &dyn crate::services::conversations::ConversationsServiceTrait {
        &self.conversations_service
    }

    fn messages(&self) -> &dyn crate::services::messages::MessagesServiceTrait {
        &self.messages_service
    }

    fn users(&self) -> &dyn crate::services::users::UsersServiceTrait {
        &self.users_service
    }

    fn files(&self) -> &dyn crate::services::files::FilesServiceTrait {
        &self.files_service
    }

    fn reactions(&self) -> &dyn crate::services::reactions::ReactionsServiceTrait {
        &self.reactions_service
    }

    fn pins(&self) -> &dyn crate::services::pins::PinsServiceTrait {
        &self.pins_service
    }

    fn views(&self) -> &dyn crate::services::views::ViewsServiceTrait {
        &self.views_service
    }

    fn auth_service(&self) -> &dyn crate::services::auth_service::AuthServiceTrait {
        &self.auth_service
    }

    fn bookmarks(&self) -> &dyn crate::services::bookmarks::BookmarksServiceTrait {
        &self.bookmarks_service
    }

    fn team(&self) -> &dyn crate::services::team::TeamServiceTrait {
        &self.team_service
    }

    fn apps(&self) -> &dyn crate::services::apps::AppsServiceTrait {
        &self.apps_service
    }

    fn oauth(&self) -> &dyn crate::services::oauth::OAuthServiceTrait {
        &self.oauth_service
    }

    fn reminders(&self) -> &dyn crate::services::reminders::RemindersServiceTrait {
        &self.reminders_service
    }

    fn search(&self) -> &dyn crate::services::search::SearchServiceTrait {
        &self.search_service
    }

    fn stars(&self) -> &dyn crate::services::stars::StarsServiceTrait {
        &self.stars_service
    }

    fn usergroups(&self) -> &dyn crate::services::usergroups::UsergroupsServiceTrait {
        &self.usergroups_service
    }
}

impl std::fmt::Debug for SlackClientImpl {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SlackClientImpl")
            .field("config", &self.config)
            .field("auth", &self.auth)
            .finish()
    }
}

impl Clone for SlackClientImpl {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            auth: self.auth.clone(),
            transport: self.transport.clone(),
            conversations_service: self.conversations_service.clone(),
            messages_service: self.messages_service.clone(),
            users_service: self.users_service.clone(),
            files_service: self.files_service.clone(),
            reactions_service: self.reactions_service.clone(),
            pins_service: self.pins_service.clone(),
            views_service: self.views_service.clone(),
            auth_service: self.auth_service.clone(),
            bookmarks_service: self.bookmarks_service.clone(),
            team_service: self.team_service.clone(),
            apps_service: self.apps_service.clone(),
            oauth_service: self.oauth_service.clone(),
            reminders_service: self.reminders_service.clone(),
            search_service: self.search_service.clone(),
            stars_service: self.stars_service.clone(),
            usergroups_service: self.usergroups_service.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::SlackConfigBuilder;

    fn test_config() -> SlackConfig {
        SlackConfigBuilder::new()
            .bot_token("xoxb-test-token-123")
            .unwrap()
            .build_unchecked()
    }

    #[test]
    fn test_client_creation() {
        let client = SlackClientImpl::new(test_config()).unwrap();
        assert!(client.config().bot_token().is_some());
    }

    #[test]
    fn test_build_url() {
        let client = SlackClientImpl::new(test_config()).unwrap();
        assert_eq!(
            client.build_url("chat.postMessage"),
            "https://slack.com/api/chat.postMessage"
        );
    }

    #[test]
    fn test_client_clone() {
        let client = SlackClientImpl::new(test_config()).unwrap();
        let cloned = client.clone();
        assert_eq!(client.base_url(), cloned.base_url());
    }

    #[test]
    fn test_service_accessors() {
        let client = SlackClientImpl::new(test_config()).unwrap();

        // Verify all service accessors return valid references
        let _ = client.conversations();
        let _ = client.messages();
        let _ = client.users();
        let _ = client.files();
        let _ = client.reactions();
        let _ = client.pins();
        let _ = client.views();
        let _ = client.auth_service();
        let _ = client.bookmarks();
        let _ = client.team();
        let _ = client.apps();
        let _ = client.oauth();
        let _ = client.reminders();
        let _ = client.search();
        let _ = client.stars();
        let _ = client.usergroups();
    }

    #[test]
    fn test_trait_service_accessors() {
        let client = SlackClientImpl::new(test_config()).unwrap();
        let client_trait: &dyn SlackClient = &client;

        // Verify all trait service accessors return valid references
        let _ = client_trait.conversations();
        let _ = client_trait.messages();
        let _ = client_trait.users();
        let _ = client_trait.files();
        let _ = client_trait.reactions();
        let _ = client_trait.pins();
        let _ = client_trait.views();
        let _ = client_trait.auth_service();
        let _ = client_trait.bookmarks();
        let _ = client_trait.team();
        let _ = client_trait.apps();
        let _ = client_trait.oauth();
        let _ = client_trait.reminders();
        let _ = client_trait.search();
        let _ = client_trait.stars();
        let _ = client_trait.usergroups();
    }
}
