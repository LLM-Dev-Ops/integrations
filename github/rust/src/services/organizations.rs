//! Organization operations.

use crate::client::GitHubClient;
use crate::errors::GitHubResult;
use crate::types::{Organization, Repository, Team, TeamPrivacy, User};
use serde::{Deserialize, Serialize};

/// Service for organization operations.
pub struct OrganizationsService<'a> {
    client: &'a GitHubClient,
}

impl<'a> OrganizationsService<'a> {
    /// Creates a new organizations service.
    pub fn new(client: &'a GitHubClient) -> Self {
        Self { client }
    }

    /// Lists organizations for the authenticated user.
    pub async fn list(&self) -> GitHubResult<Vec<Organization>> {
        self.client.get("/user/orgs").await
    }

    /// Gets an organization.
    pub async fn get(&self, org: &str) -> GitHubResult<Organization> {
        self.client.get(&format!("/orgs/{}", org)).await
    }

    /// Updates an organization.
    pub async fn update(
        &self,
        org: &str,
        request: &UpdateOrgRequest,
    ) -> GitHubResult<Organization> {
        self.client.patch(&format!("/orgs/{}", org), request).await
    }

    // Members

    /// Lists members of an organization.
    pub async fn list_members(&self, org: &str) -> GitHubResult<Vec<User>> {
        self.client.get(&format!("/orgs/{}/members", org)).await
    }

    /// Checks if a user is a member.
    pub async fn check_membership(&self, org: &str, username: &str) -> GitHubResult<bool> {
        let response = self
            .client
            .raw_request(
                reqwest::Method::GET,
                &format!("/orgs/{}/members/{}", org, username),
                Option::<()>::None,
            )
            .await;

        match response {
            Ok(_) => Ok(true),
            Err(e) if e.status_code() == Some(404) => Ok(false),
            Err(e) => Err(e),
        }
    }

    /// Gets membership for a user.
    pub async fn get_membership(&self, org: &str, username: &str) -> GitHubResult<Membership> {
        self.client
            .get(&format!("/orgs/{}/memberships/{}", org, username))
            .await
    }

    /// Sets membership for a user.
    pub async fn set_membership(
        &self,
        org: &str,
        username: &str,
        role: MembershipRole,
    ) -> GitHubResult<Membership> {
        let request = SetMembershipRequest { role };
        self.client
            .put(&format!("/orgs/{}/memberships/{}", org, username), &request)
            .await
    }

    /// Removes a member from an organization.
    pub async fn remove_member(&self, org: &str, username: &str) -> GitHubResult<()> {
        self.client
            .delete(&format!("/orgs/{}/members/{}", org, username))
            .await
    }

    // Teams

    /// Lists teams in an organization.
    pub async fn list_teams(&self, org: &str) -> GitHubResult<Vec<Team>> {
        self.client.get(&format!("/orgs/{}/teams", org)).await
    }

    /// Gets a team by slug.
    pub async fn get_team(&self, org: &str, team_slug: &str) -> GitHubResult<Team> {
        self.client
            .get(&format!("/orgs/{}/teams/{}", org, team_slug))
            .await
    }

    /// Creates a team.
    pub async fn create_team(&self, org: &str, request: &CreateTeamRequest) -> GitHubResult<Team> {
        self.client
            .post(&format!("/orgs/{}/teams", org), request)
            .await
    }

    /// Updates a team.
    pub async fn update_team(
        &self,
        org: &str,
        team_slug: &str,
        request: &UpdateTeamRequest,
    ) -> GitHubResult<Team> {
        self.client
            .patch(&format!("/orgs/{}/teams/{}", org, team_slug), request)
            .await
    }

    /// Deletes a team.
    pub async fn delete_team(&self, org: &str, team_slug: &str) -> GitHubResult<()> {
        self.client
            .delete(&format!("/orgs/{}/teams/{}", org, team_slug))
            .await
    }

    // Team Members

    /// Lists members of a team.
    pub async fn list_team_members(&self, org: &str, team_slug: &str) -> GitHubResult<Vec<User>> {
        self.client
            .get(&format!("/orgs/{}/teams/{}/members", org, team_slug))
            .await
    }

    /// Gets team membership for a user.
    pub async fn get_team_membership(
        &self,
        org: &str,
        team_slug: &str,
        username: &str,
    ) -> GitHubResult<TeamMembership> {
        self.client
            .get(&format!(
                "/orgs/{}/teams/{}/memberships/{}",
                org, team_slug, username
            ))
            .await
    }

    /// Adds or updates team membership for a user.
    pub async fn add_team_member(
        &self,
        org: &str,
        team_slug: &str,
        username: &str,
        role: TeamMemberRole,
    ) -> GitHubResult<TeamMembership> {
        let request = AddTeamMemberRequest { role };
        self.client
            .put(
                &format!("/orgs/{}/teams/{}/memberships/{}", org, team_slug, username),
                &request,
            )
            .await
    }

    /// Removes a user from a team.
    pub async fn remove_team_member(
        &self,
        org: &str,
        team_slug: &str,
        username: &str,
    ) -> GitHubResult<()> {
        self.client
            .delete(&format!(
                "/orgs/{}/teams/{}/memberships/{}",
                org, team_slug, username
            ))
            .await
    }

    // Team Repos

    /// Lists repositories for a team.
    pub async fn list_team_repos(
        &self,
        org: &str,
        team_slug: &str,
    ) -> GitHubResult<Vec<Repository>> {
        self.client
            .get(&format!("/orgs/{}/teams/{}/repos", org, team_slug))
            .await
    }

    /// Adds a repository to a team.
    pub async fn add_team_repo(
        &self,
        org: &str,
        team_slug: &str,
        owner: &str,
        repo: &str,
        permission: TeamRepoPermission,
    ) -> GitHubResult<()> {
        let request = AddTeamRepoRequest { permission };
        self.client
            .put_no_response(
                &format!("/orgs/{}/teams/{}/repos/{}/{}", org, team_slug, owner, repo),
                &request,
            )
            .await
    }

    /// Removes a repository from a team.
    pub async fn remove_team_repo(
        &self,
        org: &str,
        team_slug: &str,
        owner: &str,
        repo: &str,
    ) -> GitHubResult<()> {
        self.client
            .delete(&format!(
                "/orgs/{}/teams/{}/repos/{}/{}",
                org, team_slug, owner, repo
            ))
            .await
    }
}

/// Request to update an organization.
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateOrgRequest {
    /// Billing email.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_email: Option<String>,
    /// Company.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub company: Option<String>,
    /// Email.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    /// Twitter username.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub twitter_username: Option<String>,
    /// Location.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    /// Name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Blog URL.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub blog: Option<String>,
}

/// Organization membership.
#[derive(Debug, Clone, Deserialize)]
pub struct Membership {
    /// State.
    pub state: MembershipState,
    /// Role.
    pub role: MembershipRole,
    /// Organization URL.
    pub organization_url: String,
    /// User.
    pub user: User,
    /// Organization.
    pub organization: Organization,
}

/// Membership state.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MembershipState {
    Active,
    Pending,
}

/// Membership role.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MembershipRole {
    Admin,
    Member,
}

#[derive(Debug, Clone, Serialize)]
struct SetMembershipRequest {
    role: MembershipRole,
}

/// Request to create a team.
#[derive(Debug, Clone, Serialize)]
pub struct CreateTeamRequest {
    /// Team name.
    pub name: String,
    /// Team description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Maintainers (usernames).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub maintainers: Option<Vec<String>>,
    /// Repository names.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo_names: Option<Vec<String>>,
    /// Privacy level.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub privacy: Option<TeamPrivacy>,
    /// Parent team ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_team_id: Option<u64>,
}

/// Request to update a team.
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateTeamRequest {
    /// Team name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Team description.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Privacy level.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub privacy: Option<TeamPrivacy>,
    /// Parent team ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_team_id: Option<u64>,
}

/// Team membership.
#[derive(Debug, Clone, Deserialize)]
pub struct TeamMembership {
    /// State.
    pub state: MembershipState,
    /// Role.
    pub role: TeamMemberRole,
    /// URL.
    pub url: String,
}

/// Team member role.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TeamMemberRole {
    Member,
    Maintainer,
}

#[derive(Debug, Clone, Serialize)]
struct AddTeamMemberRequest {
    role: TeamMemberRole,
}

/// Team repository permission.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TeamRepoPermission {
    Pull,
    Push,
    Admin,
    Maintain,
    Triage,
}

#[derive(Debug, Clone, Serialize)]
struct AddTeamRepoRequest {
    permission: TeamRepoPermission,
}
