/**
 * GitHub Integration Services
 *
 * This module exports all GitHub API service classes for repositories,
 * issues, pull requests, actions, users, organizations, and gists management.
 *
 * @module services
 */

// Export all services
export { RepositoriesService } from './repositories';
export { IssuesService } from './issues';
export { PullRequestsService } from './pullRequests';
export { ActionsService } from './actions';
export { UsersService } from './users';
export { OrganizationsService } from './organizations';
export { GistsService } from './gists';
export { WebhooksService } from './webhooks';
export { GitDataService } from './gitData';
export { SearchService } from './search';
export { GraphQLClient, createGraphQLClient, fragments } from './graphql';

// Export types from repositories service
export type {
  ListReposParams,
  CreateRepoRequest,
  UpdateRepoRequest,
  CreateOrUpdateFileRequest,
  CreateReleaseRequest,
  UpdateReleaseRequest,
  Repository,
  Branch,
  ContentItem,
  Release,
  Paginated
} from './repositories';

// Export types from issues service
export type {
  ListIssuesParams,
  CreateIssueRequest,
  UpdateIssueRequest,
  LockReason,
  CreateCommentRequest as CreateIssueCommentRequest,
  UpdateCommentRequest as UpdateIssueCommentRequest,
  CreateLabelRequest,
  UpdateLabelRequest,
  CreateMilestoneRequest,
  UpdateMilestoneRequest,
  Issue,
  IssueComment,
  Label,
  Milestone
} from './issues';

// Export types from pull requests service
export type {
  ListPullRequestsParams,
  CreatePullRequestRequest,
  UpdatePullRequestRequest,
  MergePullRequestRequest,
  MergeResult,
  CreateReviewRequest,
  ReviewComment,
  UpdateReviewRequest,
  SubmitReviewRequest,
  DismissReviewRequest,
  CreateReviewCommentRequest,
  PullRequest,
  PullRequestRef,
  Review,
  PullRequestReviewComment
} from './pullRequests';

// Export types from actions service
export type {
  Workflow,
  WorkflowList,
  WorkflowDispatchRequest,
  WorkflowRun,
  WorkflowRunList,
  ListWorkflowRunsParams,
  Job,
  JobList,
  Artifact,
  ArtifactList,
  ListArtifactsParams,
  PublicKey,
  Secret,
  SecretList,
  Variable,
  VariableList,
  CreateVariableRequest,
  UpdateVariableRequest
} from './actions';

// Export types from users service
export type {
  User,
  UpdateUserRequest,
  ListUsersParams,
  Email,
  SetPrimaryEmailRequest,
  SshKey,
  CreateSshKeyRequest,
  GpgKey,
  CreateGpgKeyRequest,
  ListFollowersParams
} from './users';

// Export types from organizations service
export type {
  Organization,
  UpdateOrganizationRequest,
  ListOrganizationsParams,
  Member,
  Membership,
  UpdateMembershipRequest,
  ListMembersParams,
  Team,
  CreateTeamRequest,
  UpdateTeamRequest,
  ListTeamsParams,
  TeamMembership,
  AddTeamMemberRequest
} from './organizations';

// Export types from gists service
export type {
  Gist,
  GistFile,
  GistFileInput,
  CreateGistRequest,
  UpdateGistRequest,
  ListGistsParams,
  GistFork,
  GistComment,
  CreateGistCommentRequest,
  UpdateGistCommentRequest
} from './gists';

// Export types from webhooks service
export type {
  WebhookConfig,
  WebhookEvent,
  Webhook,
  CreateWebhookRequest,
  UpdateWebhookRequest,
  WebhookDelivery,
  WebhookPingResponse
} from './webhooks';

// Export types from git data service
export type {
  Blob,
  CreateBlobRequest,
  CreateBlobResponse,
  Tree,
  TreeEntry,
  CreateTreeEntry,
  CreateTreeRequest,
  Commit,
  GitUser,
  CreateCommitRequest,
  GitRef,
  CreateRefRequest,
  UpdateRefRequest,
  GitTag,
  CreateTagRequest
} from './gitData';

// Export types from search service
export type {
  SearchParams,
  SearchResult,
  RepositorySearchParams,
  Repository as SearchRepository,
  CodeSearchParams,
  CodeResult,
  TextMatch,
  CommitSearchParams,
  CommitResult,
  IssueSearchParams,
  IssueResult,
  UserSearchParams,
  UserResult,
  TopicSearchParams,
  TopicResult
} from './search';

// Export types from graphql service
export type {
  GraphQLRequest,
  GraphQLResponse,
  GraphQLError,
  RateLimitInfo,
  RateLimitStatus
} from './graphql';
