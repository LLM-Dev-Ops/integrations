# GitHub Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/github`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Module Purpose and Scope](#2-module-purpose-and-scope)
3. [Dependency Policy](#3-dependency-policy)
4. [API Coverage](#4-api-coverage)
5. [Interface Definitions](#5-interface-definitions)
6. [Error Taxonomy](#6-error-taxonomy)
7. [Resilience Hooks](#7-resilience-hooks)
8. [Security Requirements](#8-security-requirements)
9. [Observability Requirements](#9-observability-requirements)
10. [Performance Requirements](#10-performance-requirements)
11. [Future-Proofing](#11-future-proofing)
12. [Acceptance Criteria](#12-acceptance-criteria)

---

## 1. Overview

### 1.1 Document Purpose

This specification defines the requirements, interfaces, and constraints for the GitHub Integration Module within the LLM-Dev-Ops Integration Repository. It serves as the authoritative source for what the module must accomplish when interacting with GitHub's REST API and GraphQL API.

### 1.2 Audience

- Implementation developers (Rust and TypeScript)
- QA engineers designing test strategies
- Architects reviewing integration patterns
- Security reviewers assessing credential handling
- DevOps engineers integrating with CI/CD workflows

### 1.3 Methodology

This specification follows:
- **SPARC Methodology**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first design enabling mock-based testing
- **SOLID Principles**: Clean, maintainable, extensible design

### 1.4 GitHub API Overview

GitHub provides two primary API surfaces:
- **REST API**: Traditional HTTP-based API following REST conventions (API version: `2022-11-28`)
- **GraphQL API**: Flexible query language for precise data retrieval

This module focuses primarily on the REST API with selected GraphQL support for complex queries.

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The GitHub Integration Module provides a production-ready, type-safe interface for interacting with GitHub's REST and GraphQL APIs. It abstracts HTTP communication, handles authentication (Personal Access Tokens, GitHub Apps, OAuth), manages resilience patterns, and provides comprehensive observability—all while maintaining clean dependency boundaries.

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **API Abstraction** | Type-safe wrappers for GitHub REST and GraphQL API endpoints |
| **Authentication** | Secure management of PATs, GitHub App credentials, and OAuth tokens |
| **Transport** | HTTP/HTTPS communication with connection pooling |
| **Pagination** | Automatic handling of link-based and cursor-based pagination |
| **Rate Limiting** | Client-side rate limit tracking and throttling |
| **Serialization** | JSON serialization/deserialization with strict type validation |
| **Resilience Integration** | Hooks for retry, circuit breaker, and rate limiting primitives |
| **Observability** | Tracing spans, metrics emission, structured logging |
| **Error Mapping** | Translation of API errors to typed domain errors |
| **Webhook Handling** | Webhook payload parsing and signature verification |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Repositories API | CRUD operations, contents, branches, tags, releases |
| Issues API | Issues, comments, labels, milestones, assignees |
| Pull Requests API | PRs, reviews, review comments, merge operations |
| Git Data API | Blobs, trees, commits, refs, tags |
| Actions API | Workflows, runs, jobs, artifacts, secrets |
| Users API | User profiles, emails, SSH keys, GPG keys |
| Organizations API | Org management, members, teams, roles |
| Search API | Code, commits, issues, repositories, users search |
| Gists API | Gist CRUD, comments, forks, stars |
| Projects API | Projects (classic and new), columns, cards |
| Webhooks | Payload parsing, signature verification |
| GraphQL API | Selected complex queries (sponsor info, project boards) |
| Dual Language | Rust (primary) and TypeScript implementations |

#### Out of Scope

| Item | Reason |
|------|--------|
| Other VCS providers | Separate integration modules (GitLab, Bitbucket) |
| ruvbase (Layer 0) | External dependency, not implemented here |
| Business logic | Application-layer concern |
| Git operations (clone, push, pull) | Use native git/libgit2, not API |
| GitHub Copilot API | Separate product/service |
| GitHub Packages API | Specialized container/package registry |
| GitHub Classroom | Educational features, limited scope |
| GitHub Sponsors (write) | Sensitive financial operations |
| Enterprise Server custom endpoints | Focus on github.com |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| No direct HTTP client dependency exposure | Encapsulation, testability |
| Async-first design | I/O-bound operations, efficiency |
| Zero `unsafe` in public API (Rust) | Safety guarantees |
| No panics in production paths | Reliability |
| Trait-based abstractions | London-School TDD, mockability |
| Semantic versioning | API stability |
| Pagination abstraction | Hide complexity from consumers |
| Respect rate limits | Avoid abuse, maintain access |

---

## 3. Dependency Policy

### 3.1 Allowed Dependencies

The module may depend ONLY on the following Integration Repo primitives:

| Primitive | Purpose | Import Path |
|-----------|---------|-------------|
| `integrations-errors` | Base error types and traits | `integrations_errors` |
| `integrations-retry` | Retry executor with backoff strategies | `integrations_retry` |
| `integrations-circuit-breaker` | Circuit breaker state machine | `integrations_circuit_breaker` |
| `integrations-rate-limit` | Rate limiting (token bucket, sliding window) | `integrations_rate_limit` |
| `integrations-tracing` | Distributed tracing abstraction | `integrations_tracing` |
| `integrations-logging` | Structured logging abstraction | `integrations_logging` |
| `integrations-types` | Shared type definitions | `integrations_types` |
| `integrations-config` | Configuration management | `integrations_config` |

### 3.2 External Dependencies (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| `tokio` | 1.x | Async runtime |
| `reqwest` | 0.12+ | HTTP client (behind transport trait) |
| `serde` | 1.x | Serialization |
| `serde_json` | 1.x | JSON handling |
| `async-trait` | 0.1+ | Async trait support |
| `thiserror` | 1.x | Error derivation |
| `secrecy` | 0.8+ | Secret string handling |
| `url` | 2.x | URL parsing |
| `bytes` | 1.x | Byte buffer handling |
| `futures` | 0.3+ | Stream utilities |
| `chrono` | 0.4+ | Date/time handling |
| `base64` | 0.21+ | Base64 encoding (JWT, content) |
| `ring` | 0.17+ | Cryptographic operations (webhook signatures) |
| `jsonwebtoken` | 9.x | JWT handling for GitHub Apps |
| `graphql_client` | 0.13+ | GraphQL query generation |

### 3.3 External Dependencies (TypeScript)

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | 5.x | Language |
| `node-fetch` / native fetch | Latest | HTTP client |
| `zod` | 3.x | Runtime type validation |
| `jose` | 5.x | JWT handling |
| `@octokit/graphql-schema` | Latest | GraphQL type definitions |

### 3.4 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `ruvbase` | Layer 0, external to this module |
| `integrations-openai` | No cross-integration dependencies |
| `integrations-anthropic` | No cross-integration dependencies |
| `@octokit/rest` | This module IS the GitHub integration |
| `@octokit/core` | Avoid external SDK dependencies |
| Any LLM-specific crate | This module is VCS integration only |

---

## 4. API Coverage

### 4.1 Repositories API

Primary API for managing GitHub repositories.

#### 4.1.1 Repository Operations

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List user repos | `/user/repos` | GET | List repos for authenticated user |
| List org repos | `/orgs/{org}/repos` | GET | List repos for organization |
| Get repo | `/repos/{owner}/{repo}` | GET | Get repository details |
| Create repo | `/user/repos` | POST | Create user repository |
| Create org repo | `/orgs/{org}/repos` | POST | Create organization repository |
| Update repo | `/repos/{owner}/{repo}` | PATCH | Update repository settings |
| Delete repo | `/repos/{owner}/{repo}` | DELETE | Delete repository |
| Transfer repo | `/repos/{owner}/{repo}/transfer` | POST | Transfer ownership |

#### 4.1.2 Repository Contents

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| Get contents | `/repos/{owner}/{repo}/contents/{path}` | GET | Get file or directory |
| Create/update file | `/repos/{owner}/{repo}/contents/{path}` | PUT | Create or update file |
| Delete file | `/repos/{owner}/{repo}/contents/{path}` | DELETE | Delete file |
| Get README | `/repos/{owner}/{repo}/readme` | GET | Get repository README |
| Download archive | `/repos/{owner}/{repo}/tarball/{ref}` | GET | Download tarball |
| Download archive | `/repos/{owner}/{repo}/zipball/{ref}` | GET | Download zipball |

#### 4.1.3 Branches and Tags

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List branches | `/repos/{owner}/{repo}/branches` | GET | List all branches |
| Get branch | `/repos/{owner}/{repo}/branches/{branch}` | GET | Get branch details |
| Get branch protection | `/repos/{owner}/{repo}/branches/{branch}/protection` | GET | Get protection rules |
| Update branch protection | `/repos/{owner}/{repo}/branches/{branch}/protection` | PUT | Update protection |
| Delete branch protection | `/repos/{owner}/{repo}/branches/{branch}/protection` | DELETE | Remove protection |
| List tags | `/repos/{owner}/{repo}/tags` | GET | List all tags |

#### 4.1.4 Releases

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List releases | `/repos/{owner}/{repo}/releases` | GET | List all releases |
| Get release | `/repos/{owner}/{repo}/releases/{release_id}` | GET | Get release by ID |
| Get latest release | `/repos/{owner}/{repo}/releases/latest` | GET | Get latest release |
| Get release by tag | `/repos/{owner}/{repo}/releases/tags/{tag}` | GET | Get release by tag |
| Create release | `/repos/{owner}/{repo}/releases` | POST | Create new release |
| Update release | `/repos/{owner}/{repo}/releases/{release_id}` | PATCH | Update release |
| Delete release | `/repos/{owner}/{repo}/releases/{release_id}` | DELETE | Delete release |
| List release assets | `/repos/{owner}/{repo}/releases/{release_id}/assets` | GET | List assets |
| Upload release asset | `/repos/{owner}/{repo}/releases/{release_id}/assets` | POST | Upload asset |
| Get release asset | `/repos/{owner}/{repo}/releases/assets/{asset_id}` | GET | Get asset |
| Delete release asset | `/repos/{owner}/{repo}/releases/assets/{asset_id}` | DELETE | Delete asset |

#### 4.1.5 Collaborators and Permissions

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List collaborators | `/repos/{owner}/{repo}/collaborators` | GET | List collaborators |
| Check collaborator | `/repos/{owner}/{repo}/collaborators/{username}` | GET | Check if collaborator |
| Add collaborator | `/repos/{owner}/{repo}/collaborators/{username}` | PUT | Add collaborator |
| Remove collaborator | `/repos/{owner}/{repo}/collaborators/{username}` | DELETE | Remove collaborator |
| Get permissions | `/repos/{owner}/{repo}/collaborators/{username}/permission` | GET | Get permission level |

### 4.2 Issues API

Full issue management capabilities.

#### 4.2.1 Issue Operations

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List repo issues | `/repos/{owner}/{repo}/issues` | GET | List repository issues |
| List user issues | `/issues` | GET | List issues for authenticated user |
| Get issue | `/repos/{owner}/{repo}/issues/{issue_number}` | GET | Get issue details |
| Create issue | `/repos/{owner}/{repo}/issues` | POST | Create new issue |
| Update issue | `/repos/{owner}/{repo}/issues/{issue_number}` | PATCH | Update issue |
| Lock issue | `/repos/{owner}/{repo}/issues/{issue_number}/lock` | PUT | Lock issue |
| Unlock issue | `/repos/{owner}/{repo}/issues/{issue_number}/lock` | DELETE | Unlock issue |

**Issue Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `state` | string | `open`, `closed`, `all` |
| `labels` | string | Comma-separated label names |
| `assignee` | string | Username or `*` for any, `none` |
| `creator` | string | Username of issue creator |
| `mentioned` | string | Username mentioned in issue |
| `milestone` | string | Milestone number or `*`, `none` |
| `sort` | string | `created`, `updated`, `comments` |
| `direction` | string | `asc` or `desc` |
| `since` | string | ISO 8601 timestamp |

#### 4.2.2 Issue Comments

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List comments | `/repos/{owner}/{repo}/issues/{issue_number}/comments` | GET | List issue comments |
| Get comment | `/repos/{owner}/{repo}/issues/comments/{comment_id}` | GET | Get specific comment |
| Create comment | `/repos/{owner}/{repo}/issues/{issue_number}/comments` | POST | Create comment |
| Update comment | `/repos/{owner}/{repo}/issues/comments/{comment_id}` | PATCH | Update comment |
| Delete comment | `/repos/{owner}/{repo}/issues/comments/{comment_id}` | DELETE | Delete comment |

#### 4.2.3 Labels

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List repo labels | `/repos/{owner}/{repo}/labels` | GET | List all labels |
| Get label | `/repos/{owner}/{repo}/labels/{name}` | GET | Get label details |
| Create label | `/repos/{owner}/{repo}/labels` | POST | Create new label |
| Update label | `/repos/{owner}/{repo}/labels/{name}` | PATCH | Update label |
| Delete label | `/repos/{owner}/{repo}/labels/{name}` | DELETE | Delete label |
| List issue labels | `/repos/{owner}/{repo}/issues/{issue_number}/labels` | GET | List labels on issue |
| Add labels | `/repos/{owner}/{repo}/issues/{issue_number}/labels` | POST | Add labels to issue |
| Set labels | `/repos/{owner}/{repo}/issues/{issue_number}/labels` | PUT | Replace all labels |
| Remove label | `/repos/{owner}/{repo}/issues/{issue_number}/labels/{name}` | DELETE | Remove label |
| Remove all labels | `/repos/{owner}/{repo}/issues/{issue_number}/labels` | DELETE | Remove all labels |

#### 4.2.4 Milestones

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List milestones | `/repos/{owner}/{repo}/milestones` | GET | List all milestones |
| Get milestone | `/repos/{owner}/{repo}/milestones/{milestone_number}` | GET | Get milestone |
| Create milestone | `/repos/{owner}/{repo}/milestones` | POST | Create milestone |
| Update milestone | `/repos/{owner}/{repo}/milestones/{milestone_number}` | PATCH | Update milestone |
| Delete milestone | `/repos/{owner}/{repo}/milestones/{milestone_number}` | DELETE | Delete milestone |

#### 4.2.5 Assignees

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List assignees | `/repos/{owner}/{repo}/assignees` | GET | List available assignees |
| Check assignee | `/repos/{owner}/{repo}/assignees/{assignee}` | GET | Check if user can be assigned |
| Add assignees | `/repos/{owner}/{repo}/issues/{issue_number}/assignees` | POST | Add assignees |
| Remove assignees | `/repos/{owner}/{repo}/issues/{issue_number}/assignees` | DELETE | Remove assignees |

### 4.3 Pull Requests API

Full pull request management.

#### 4.3.1 Pull Request Operations

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List PRs | `/repos/{owner}/{repo}/pulls` | GET | List pull requests |
| Get PR | `/repos/{owner}/{repo}/pulls/{pull_number}` | GET | Get PR details |
| Create PR | `/repos/{owner}/{repo}/pulls` | POST | Create pull request |
| Update PR | `/repos/{owner}/{repo}/pulls/{pull_number}` | PATCH | Update pull request |
| List PR commits | `/repos/{owner}/{repo}/pulls/{pull_number}/commits` | GET | List commits in PR |
| List PR files | `/repos/{owner}/{repo}/pulls/{pull_number}/files` | GET | List changed files |
| Check if merged | `/repos/{owner}/{repo}/pulls/{pull_number}/merge` | GET | Check merge status |
| Merge PR | `/repos/{owner}/{repo}/pulls/{pull_number}/merge` | PUT | Merge pull request |
| Update PR branch | `/repos/{owner}/{repo}/pulls/{pull_number}/update-branch` | PUT | Update from base |

**Pull Request Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `state` | string | `open`, `closed`, `all` |
| `head` | string | Filter by head user/branch |
| `base` | string | Filter by base branch |
| `sort` | string | `created`, `updated`, `popularity`, `long-running` |
| `direction` | string | `asc` or `desc` |

**Merge Methods:**

| Method | Description |
|--------|-------------|
| `merge` | Create merge commit |
| `squash` | Squash and merge |
| `rebase` | Rebase and merge |

#### 4.3.2 PR Reviews

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List reviews | `/repos/{owner}/{repo}/pulls/{pull_number}/reviews` | GET | List all reviews |
| Get review | `/repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}` | GET | Get review |
| Create review | `/repos/{owner}/{repo}/pulls/{pull_number}/reviews` | POST | Create review |
| Update review | `/repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}` | PUT | Update review |
| Delete review | `/repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}` | DELETE | Delete pending review |
| Submit review | `/repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/events` | POST | Submit review |
| Dismiss review | `/repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/dismissals` | PUT | Dismiss review |
| List review comments | `/repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/comments` | GET | Get review comments |

**Review Events:**

| Event | Description |
|-------|-------------|
| `APPROVE` | Approve the PR |
| `REQUEST_CHANGES` | Request changes |
| `COMMENT` | General comment |

#### 4.3.3 PR Review Comments

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List PR comments | `/repos/{owner}/{repo}/pulls/{pull_number}/comments` | GET | List all PR comments |
| List repo PR comments | `/repos/{owner}/{repo}/pulls/comments` | GET | List all repo PR comments |
| Get comment | `/repos/{owner}/{repo}/pulls/comments/{comment_id}` | GET | Get comment |
| Create comment | `/repos/{owner}/{repo}/pulls/{pull_number}/comments` | POST | Create comment |
| Create reply | `/repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies` | POST | Reply to comment |
| Update comment | `/repos/{owner}/{repo}/pulls/comments/{comment_id}` | PATCH | Update comment |
| Delete comment | `/repos/{owner}/{repo}/pulls/comments/{comment_id}` | DELETE | Delete comment |

#### 4.3.4 Review Requests

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List requested reviewers | `/repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers` | GET | List requested reviewers |
| Request reviewers | `/repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers` | POST | Request review |
| Remove reviewers | `/repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers` | DELETE | Remove reviewer request |

### 4.4 Git Data API

Low-level Git operations.

#### 4.4.1 Blobs

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| Create blob | `/repos/{owner}/{repo}/git/blobs` | POST | Create blob object |
| Get blob | `/repos/{owner}/{repo}/git/blobs/{sha}` | GET | Get blob by SHA |

#### 4.4.2 Trees

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| Create tree | `/repos/{owner}/{repo}/git/trees` | POST | Create tree object |
| Get tree | `/repos/{owner}/{repo}/git/trees/{tree_sha}` | GET | Get tree by SHA |

**Tree Entry Modes:**

| Mode | Description |
|------|-------------|
| `100644` | File (blob) |
| `100755` | Executable file |
| `040000` | Subdirectory (tree) |
| `160000` | Submodule (commit) |
| `120000` | Symlink |

#### 4.4.3 Commits

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| Create commit | `/repos/{owner}/{repo}/git/commits` | POST | Create commit object |
| Get commit | `/repos/{owner}/{repo}/git/commits/{commit_sha}` | GET | Get commit by SHA |
| List commits | `/repos/{owner}/{repo}/commits` | GET | List commits |
| Get commit (full) | `/repos/{owner}/{repo}/commits/{ref}` | GET | Get commit with diff |
| Compare commits | `/repos/{owner}/{repo}/compare/{base}...{head}` | GET | Compare two commits |

#### 4.4.4 References

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List refs | `/repos/{owner}/{repo}/git/refs` | GET | List all references |
| Get ref | `/repos/{owner}/{repo}/git/ref/{ref}` | GET | Get single reference |
| Create ref | `/repos/{owner}/{repo}/git/refs` | POST | Create reference |
| Update ref | `/repos/{owner}/{repo}/git/refs/{ref}` | PATCH | Update reference |
| Delete ref | `/repos/{owner}/{repo}/git/refs/{ref}` | DELETE | Delete reference |

#### 4.4.5 Tags

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| Create tag | `/repos/{owner}/{repo}/git/tags` | POST | Create tag object |
| Get tag | `/repos/{owner}/{repo}/git/tags/{tag_sha}` | GET | Get tag by SHA |

### 4.5 GitHub Actions API

Workflow and CI/CD management.

#### 4.5.1 Workflows

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List workflows | `/repos/{owner}/{repo}/actions/workflows` | GET | List all workflows |
| Get workflow | `/repos/{owner}/{repo}/actions/workflows/{workflow_id}` | GET | Get workflow |
| Disable workflow | `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/disable` | PUT | Disable workflow |
| Enable workflow | `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/enable` | PUT | Enable workflow |
| Create workflow dispatch | `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches` | POST | Trigger workflow |

#### 4.5.2 Workflow Runs

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List workflow runs | `/repos/{owner}/{repo}/actions/runs` | GET | List all runs |
| List runs for workflow | `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs` | GET | List workflow runs |
| Get workflow run | `/repos/{owner}/{repo}/actions/runs/{run_id}` | GET | Get run details |
| Delete workflow run | `/repos/{owner}/{repo}/actions/runs/{run_id}` | DELETE | Delete run |
| Re-run workflow | `/repos/{owner}/{repo}/actions/runs/{run_id}/rerun` | POST | Re-run workflow |
| Re-run failed jobs | `/repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs` | POST | Re-run failed jobs |
| Cancel workflow run | `/repos/{owner}/{repo}/actions/runs/{run_id}/cancel` | POST | Cancel run |
| Get run usage | `/repos/{owner}/{repo}/actions/runs/{run_id}/timing` | GET | Get timing info |
| Download run logs | `/repos/{owner}/{repo}/actions/runs/{run_id}/logs` | GET | Download logs |
| Delete run logs | `/repos/{owner}/{repo}/actions/runs/{run_id}/logs` | DELETE | Delete logs |

**Workflow Run Statuses:**

| Status | Description |
|--------|-------------|
| `queued` | Run is queued |
| `in_progress` | Run is executing |
| `completed` | Run finished |

**Workflow Run Conclusions:**

| Conclusion | Description |
|------------|-------------|
| `success` | All jobs passed |
| `failure` | One or more jobs failed |
| `cancelled` | Run was cancelled |
| `skipped` | Run was skipped |
| `timed_out` | Run exceeded time limit |
| `action_required` | Manual approval needed |

#### 4.5.3 Workflow Jobs

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List jobs for run | `/repos/{owner}/{repo}/actions/runs/{run_id}/jobs` | GET | List jobs in run |
| Get job | `/repos/{owner}/{repo}/actions/jobs/{job_id}` | GET | Get job details |
| Download job logs | `/repos/{owner}/{repo}/actions/jobs/{job_id}/logs` | GET | Download job logs |
| Re-run job | `/repos/{owner}/{repo}/actions/jobs/{job_id}/rerun` | POST | Re-run job |

#### 4.5.4 Artifacts

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List repo artifacts | `/repos/{owner}/{repo}/actions/artifacts` | GET | List all artifacts |
| List run artifacts | `/repos/{owner}/{repo}/actions/runs/{run_id}/artifacts` | GET | List run artifacts |
| Get artifact | `/repos/{owner}/{repo}/actions/artifacts/{artifact_id}` | GET | Get artifact |
| Download artifact | `/repos/{owner}/{repo}/actions/artifacts/{artifact_id}/zip` | GET | Download artifact |
| Delete artifact | `/repos/{owner}/{repo}/actions/artifacts/{artifact_id}` | DELETE | Delete artifact |

#### 4.5.5 Secrets

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| Get repo public key | `/repos/{owner}/{repo}/actions/secrets/public-key` | GET | Get encryption key |
| List repo secrets | `/repos/{owner}/{repo}/actions/secrets` | GET | List secrets (names only) |
| Get repo secret | `/repos/{owner}/{repo}/actions/secrets/{secret_name}` | GET | Get secret metadata |
| Create/update secret | `/repos/{owner}/{repo}/actions/secrets/{secret_name}` | PUT | Set secret |
| Delete secret | `/repos/{owner}/{repo}/actions/secrets/{secret_name}` | DELETE | Delete secret |
| List org secrets | `/orgs/{org}/actions/secrets` | GET | List org secrets |

#### 4.5.6 Variables

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List repo variables | `/repos/{owner}/{repo}/actions/variables` | GET | List variables |
| Get repo variable | `/repos/{owner}/{repo}/actions/variables/{name}` | GET | Get variable |
| Create repo variable | `/repos/{owner}/{repo}/actions/variables` | POST | Create variable |
| Update repo variable | `/repos/{owner}/{repo}/actions/variables/{name}` | PATCH | Update variable |
| Delete repo variable | `/repos/{owner}/{repo}/actions/variables/{name}` | DELETE | Delete variable |

### 4.6 Users API

User profile and account management.

#### 4.6.1 User Operations

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| Get authenticated user | `/user` | GET | Get current user |
| Update authenticated user | `/user` | PATCH | Update current user |
| Get user | `/users/{username}` | GET | Get user by username |
| List users | `/users` | GET | List all users |

#### 4.6.2 Emails

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List emails | `/user/emails` | GET | List user emails |
| Add emails | `/user/emails` | POST | Add emails |
| Delete emails | `/user/emails` | DELETE | Delete emails |
| Set primary email visibility | `/user/email/visibility` | PATCH | Set visibility |

#### 4.6.3 SSH Keys

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List SSH keys | `/user/keys` | GET | List user SSH keys |
| Get SSH key | `/user/keys/{key_id}` | GET | Get SSH key |
| Create SSH key | `/user/keys` | POST | Add SSH key |
| Delete SSH key | `/user/keys/{key_id}` | DELETE | Delete SSH key |

#### 4.6.4 GPG Keys

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List GPG keys | `/user/gpg_keys` | GET | List GPG keys |
| Get GPG key | `/user/gpg_keys/{gpg_key_id}` | GET | Get GPG key |
| Create GPG key | `/user/gpg_keys` | POST | Add GPG key |
| Delete GPG key | `/user/gpg_keys/{gpg_key_id}` | DELETE | Delete GPG key |

#### 4.6.5 Followers

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List followers | `/user/followers` | GET | List followers |
| List following | `/user/following` | GET | List following |
| Check following | `/user/following/{username}` | GET | Check if following |
| Follow user | `/user/following/{username}` | PUT | Follow user |
| Unfollow user | `/user/following/{username}` | DELETE | Unfollow user |

### 4.7 Organizations API

Organization management.

#### 4.7.1 Organization Operations

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List user orgs | `/user/orgs` | GET | List user organizations |
| List orgs | `/organizations` | GET | List all organizations |
| Get org | `/orgs/{org}` | GET | Get organization |
| Update org | `/orgs/{org}` | PATCH | Update organization |

#### 4.7.2 Members

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List members | `/orgs/{org}/members` | GET | List org members |
| Check membership | `/orgs/{org}/members/{username}` | GET | Check if member |
| Remove member | `/orgs/{org}/members/{username}` | DELETE | Remove member |
| Get membership | `/orgs/{org}/memberships/{username}` | GET | Get membership details |
| Set membership | `/orgs/{org}/memberships/{username}` | PUT | Add/update membership |
| Remove membership | `/orgs/{org}/memberships/{username}` | DELETE | Remove membership |

#### 4.7.3 Teams

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List teams | `/orgs/{org}/teams` | GET | List org teams |
| Get team | `/orgs/{org}/teams/{team_slug}` | GET | Get team |
| Create team | `/orgs/{org}/teams` | POST | Create team |
| Update team | `/orgs/{org}/teams/{team_slug}` | PATCH | Update team |
| Delete team | `/orgs/{org}/teams/{team_slug}` | DELETE | Delete team |
| List team members | `/orgs/{org}/teams/{team_slug}/members` | GET | List members |
| Get team membership | `/orgs/{org}/teams/{team_slug}/memberships/{username}` | GET | Get membership |
| Add team member | `/orgs/{org}/teams/{team_slug}/memberships/{username}` | PUT | Add member |
| Remove team member | `/orgs/{org}/teams/{team_slug}/memberships/{username}` | DELETE | Remove member |
| List team repos | `/orgs/{org}/teams/{team_slug}/repos` | GET | List team repos |
| Check team repo | `/orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}` | GET | Check permission |
| Add team repo | `/orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}` | PUT | Add repo to team |
| Remove team repo | `/orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}` | DELETE | Remove repo |

### 4.8 Search API

GitHub search functionality.

#### 4.8.1 Search Operations

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| Search repositories | `/search/repositories` | GET | Search repos |
| Search code | `/search/code` | GET | Search code |
| Search commits | `/search/commits` | GET | Search commits |
| Search issues | `/search/issues` | GET | Search issues/PRs |
| Search users | `/search/users` | GET | Search users |
| Search topics | `/search/topics` | GET | Search topics |
| Search labels | `/search/labels` | GET | Search labels |

**Search Query Syntax:**

| Qualifier | Example | Description |
|-----------|---------|-------------|
| `repo:` | `repo:owner/name` | Specific repository |
| `user:` | `user:username` | User's repos |
| `org:` | `org:orgname` | Org's repos |
| `language:` | `language:rust` | By language |
| `stars:` | `stars:>1000` | By star count |
| `created:` | `created:>2024-01-01` | By creation date |
| `pushed:` | `pushed:>2024-01-01` | By last push |
| `is:` | `is:public`, `is:private` | Visibility |
| `archived:` | `archived:false` | Archive status |

**Search Response:**

| Field | Type | Description |
|-------|------|-------------|
| `total_count` | integer | Total results |
| `incomplete_results` | boolean | Partial results |
| `items` | array | Result items |

### 4.9 Gists API

Gist management.

#### 4.9.1 Gist Operations

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List user gists | `/gists` | GET | List user gists |
| List public gists | `/gists/public` | GET | List public gists |
| List starred gists | `/gists/starred` | GET | List starred gists |
| Get gist | `/gists/{gist_id}` | GET | Get gist |
| Create gist | `/gists` | POST | Create gist |
| Update gist | `/gists/{gist_id}` | PATCH | Update gist |
| Delete gist | `/gists/{gist_id}` | DELETE | Delete gist |
| Star gist | `/gists/{gist_id}/star` | PUT | Star gist |
| Unstar gist | `/gists/{gist_id}/star` | DELETE | Unstar gist |
| Check starred | `/gists/{gist_id}/star` | GET | Check if starred |
| Fork gist | `/gists/{gist_id}/forks` | POST | Fork gist |
| List gist forks | `/gists/{gist_id}/forks` | GET | List forks |

#### 4.9.2 Gist Comments

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List comments | `/gists/{gist_id}/comments` | GET | List comments |
| Get comment | `/gists/{gist_id}/comments/{comment_id}` | GET | Get comment |
| Create comment | `/gists/{gist_id}/comments` | POST | Create comment |
| Update comment | `/gists/{gist_id}/comments/{comment_id}` | PATCH | Update comment |
| Delete comment | `/gists/{gist_id}/comments/{comment_id}` | DELETE | Delete comment |

### 4.10 Webhooks

Webhook management and payload handling.

#### 4.10.1 Repository Webhooks

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List webhooks | `/repos/{owner}/{repo}/hooks` | GET | List webhooks |
| Get webhook | `/repos/{owner}/{repo}/hooks/{hook_id}` | GET | Get webhook |
| Create webhook | `/repos/{owner}/{repo}/hooks` | POST | Create webhook |
| Update webhook | `/repos/{owner}/{repo}/hooks/{hook_id}` | PATCH | Update webhook |
| Delete webhook | `/repos/{owner}/{repo}/hooks/{hook_id}` | DELETE | Delete webhook |
| Ping webhook | `/repos/{owner}/{repo}/hooks/{hook_id}/pings` | POST | Ping webhook |
| Test webhook | `/repos/{owner}/{repo}/hooks/{hook_id}/tests` | POST | Test push event |

#### 4.10.2 Organization Webhooks

| Operation | Endpoint | Method | Description |
|-----------|----------|--------|-------------|
| List org webhooks | `/orgs/{org}/hooks` | GET | List webhooks |
| Get org webhook | `/orgs/{org}/hooks/{hook_id}` | GET | Get webhook |
| Create org webhook | `/orgs/{org}/hooks` | POST | Create webhook |
| Update org webhook | `/orgs/{org}/hooks/{hook_id}` | PATCH | Update webhook |
| Delete org webhook | `/orgs/{org}/hooks/{hook_id}` | DELETE | Delete webhook |
| Ping org webhook | `/orgs/{org}/hooks/{hook_id}/pings` | POST | Ping webhook |

#### 4.10.3 Webhook Events

| Event | Description |
|-------|-------------|
| `push` | Push to repository |
| `pull_request` | PR activity |
| `issues` | Issue activity |
| `issue_comment` | Issue/PR comment |
| `create` | Branch/tag created |
| `delete` | Branch/tag deleted |
| `release` | Release activity |
| `workflow_run` | Actions workflow run |
| `workflow_job` | Actions job activity |
| `check_run` | Check run activity |
| `check_suite` | Check suite activity |
| `deployment` | Deployment activity |
| `deployment_status` | Deployment status |
| `repository` | Repository activity |
| `member` | Collaborator changes |
| `team` | Team changes |
| `organization` | Organization changes |

#### 4.10.4 Webhook Signature Verification

Webhooks include a signature for verification:

| Header | Description |
|--------|-------------|
| `X-Hub-Signature` | SHA-1 HMAC (deprecated) |
| `X-Hub-Signature-256` | SHA-256 HMAC (recommended) |
| `X-GitHub-Event` | Event type |
| `X-GitHub-Delivery` | Unique delivery ID |

**Verification Algorithm:**
```
expected = HMAC-SHA256(secret, request_body)
signature = X-Hub-Signature-256 header (format: "sha256=<hex>")
verify = constant_time_compare(expected, signature)
```

### 4.11 GraphQL API

Selected GraphQL operations for complex queries.

#### 4.11.1 Supported Queries

| Query | Description |
|-------|-------------|
| `viewer` | Get authenticated user details |
| `repository` | Get repository with nested data |
| `organization` | Get organization with nested data |
| `user` | Get user profile with nested data |
| `search` | Complex search with facets |
| `node` | Get any node by global ID |
| `nodes` | Get multiple nodes by IDs |

#### 4.11.2 Supported Mutations

| Mutation | Description |
|----------|-------------|
| `addComment` | Add comment to issue/PR |
| `addReaction` | Add reaction |
| `createIssue` | Create issue |
| `updateIssue` | Update issue |
| `closeIssue` | Close issue |
| `reopenIssue` | Reopen issue |
| `createPullRequest` | Create PR |
| `mergePullRequest` | Merge PR |
| `createBranch` | Create branch |
| `deleteBranch` | Delete branch |

#### 4.11.3 GraphQL Rate Limiting

| Aspect | Value |
|--------|-------|
| Points per hour | 5,000 |
| Point calculation | Query complexity |
| Max query cost | 500,000 points |
| Max nodes per request | 500,000 |

---

## 5. Interface Definitions

### 5.1 Rust Interfaces

#### 5.1.1 Client Interface

```rust
/// Main client for interacting with GitHub's API.
#[async_trait]
pub trait GitHubClient: Send + Sync {
    /// Access the repositories service.
    fn repositories(&self) -> &dyn RepositoriesService;

    /// Access the issues service.
    fn issues(&self) -> &dyn IssuesService;

    /// Access the pull requests service.
    fn pull_requests(&self) -> &dyn PullRequestsService;

    /// Access the git data service.
    fn git(&self) -> &dyn GitDataService;

    /// Access the actions service.
    fn actions(&self) -> &dyn ActionsService;

    /// Access the users service.
    fn users(&self) -> &dyn UsersService;

    /// Access the organizations service.
    fn organizations(&self) -> &dyn OrganizationsService;

    /// Access the search service.
    fn search(&self) -> &dyn SearchService;

    /// Access the gists service.
    fn gists(&self) -> &dyn GistsService;

    /// Access the webhooks service.
    fn webhooks(&self) -> &dyn WebhooksService;

    /// Execute a GraphQL query.
    async fn graphql<Q: GraphQLQuery>(&self, query: Q) -> Result<Q::Response, GitHubError>;

    /// Get current rate limit status.
    async fn rate_limit(&self) -> Result<RateLimitStatus, GitHubError>;
}

/// Factory for creating GitHub clients.
pub trait GitHubClientFactory: Send + Sync {
    /// Create a new client with the given configuration.
    fn create(&self, config: GitHubConfig) -> Result<Arc<dyn GitHubClient>, GitHubError>;
}
```

#### 5.1.2 Repositories Service Interface

```rust
/// Service for repository operations.
#[async_trait]
pub trait RepositoriesService: Send + Sync {
    /// List repositories for the authenticated user.
    async fn list_for_user(
        &self,
        params: Option<ListReposParams>,
    ) -> Result<Paginated<Repository>, GitHubError>;

    /// List repositories for an organization.
    async fn list_for_org(
        &self,
        org: &str,
        params: Option<ListReposParams>,
    ) -> Result<Paginated<Repository>, GitHubError>;

    /// Get a repository by owner and name.
    async fn get(
        &self,
        owner: &str,
        repo: &str,
    ) -> Result<Repository, GitHubError>;

    /// Create a new repository.
    async fn create(
        &self,
        request: CreateRepositoryRequest,
    ) -> Result<Repository, GitHubError>;

    /// Create a repository in an organization.
    async fn create_for_org(
        &self,
        org: &str,
        request: CreateRepositoryRequest,
    ) -> Result<Repository, GitHubError>;

    /// Update a repository.
    async fn update(
        &self,
        owner: &str,
        repo: &str,
        request: UpdateRepositoryRequest,
    ) -> Result<Repository, GitHubError>;

    /// Delete a repository.
    async fn delete(
        &self,
        owner: &str,
        repo: &str,
    ) -> Result<(), GitHubError>;

    /// Get repository contents.
    fn contents(&self) -> &dyn ContentsService;

    /// Get branch operations.
    fn branches(&self) -> &dyn BranchesService;

    /// Get release operations.
    fn releases(&self) -> &dyn ReleasesService;

    /// Get collaborator operations.
    fn collaborators(&self) -> &dyn CollaboratorsService;
}
```

#### 5.1.3 Issues Service Interface

```rust
/// Service for issue operations.
#[async_trait]
pub trait IssuesService: Send + Sync {
    /// List issues for a repository.
    async fn list(
        &self,
        owner: &str,
        repo: &str,
        params: Option<ListIssuesParams>,
    ) -> Result<Paginated<Issue>, GitHubError>;

    /// Get an issue by number.
    async fn get(
        &self,
        owner: &str,
        repo: &str,
        issue_number: u64,
    ) -> Result<Issue, GitHubError>;

    /// Create an issue.
    async fn create(
        &self,
        owner: &str,
        repo: &str,
        request: CreateIssueRequest,
    ) -> Result<Issue, GitHubError>;

    /// Update an issue.
    async fn update(
        &self,
        owner: &str,
        repo: &str,
        issue_number: u64,
        request: UpdateIssueRequest,
    ) -> Result<Issue, GitHubError>;

    /// Lock an issue.
    async fn lock(
        &self,
        owner: &str,
        repo: &str,
        issue_number: u64,
        reason: Option<LockReason>,
    ) -> Result<(), GitHubError>;

    /// Unlock an issue.
    async fn unlock(
        &self,
        owner: &str,
        repo: &str,
        issue_number: u64,
    ) -> Result<(), GitHubError>;

    /// Get comment operations.
    fn comments(&self) -> &dyn IssueCommentsService;

    /// Get label operations.
    fn labels(&self) -> &dyn LabelsService;

    /// Get milestone operations.
    fn milestones(&self) -> &dyn MilestonesService;

    /// Get assignee operations.
    fn assignees(&self) -> &dyn AssigneesService;
}
```

#### 5.1.4 Pull Requests Service Interface

```rust
/// Service for pull request operations.
#[async_trait]
pub trait PullRequestsService: Send + Sync {
    /// List pull requests for a repository.
    async fn list(
        &self,
        owner: &str,
        repo: &str,
        params: Option<ListPullRequestsParams>,
    ) -> Result<Paginated<PullRequest>, GitHubError>;

    /// Get a pull request by number.
    async fn get(
        &self,
        owner: &str,
        repo: &str,
        pull_number: u64,
    ) -> Result<PullRequest, GitHubError>;

    /// Create a pull request.
    async fn create(
        &self,
        owner: &str,
        repo: &str,
        request: CreatePullRequestRequest,
    ) -> Result<PullRequest, GitHubError>;

    /// Update a pull request.
    async fn update(
        &self,
        owner: &str,
        repo: &str,
        pull_number: u64,
        request: UpdatePullRequestRequest,
    ) -> Result<PullRequest, GitHubError>;

    /// List commits in a pull request.
    async fn list_commits(
        &self,
        owner: &str,
        repo: &str,
        pull_number: u64,
    ) -> Result<Paginated<Commit>, GitHubError>;

    /// List files changed in a pull request.
    async fn list_files(
        &self,
        owner: &str,
        repo: &str,
        pull_number: u64,
    ) -> Result<Paginated<PullRequestFile>, GitHubError>;

    /// Check if a pull request is merged.
    async fn is_merged(
        &self,
        owner: &str,
        repo: &str,
        pull_number: u64,
    ) -> Result<bool, GitHubError>;

    /// Merge a pull request.
    async fn merge(
        &self,
        owner: &str,
        repo: &str,
        pull_number: u64,
        request: MergePullRequestRequest,
    ) -> Result<MergeResult, GitHubError>;

    /// Update a pull request branch.
    async fn update_branch(
        &self,
        owner: &str,
        repo: &str,
        pull_number: u64,
        expected_head_sha: Option<&str>,
    ) -> Result<UpdateBranchResult, GitHubError>;

    /// Get review operations.
    fn reviews(&self) -> &dyn ReviewsService;

    /// Get review comment operations.
    fn review_comments(&self) -> &dyn ReviewCommentsService;

    /// Get review request operations.
    fn review_requests(&self) -> &dyn ReviewRequestsService;
}
```

#### 5.1.5 Actions Service Interface

```rust
/// Service for GitHub Actions operations.
#[async_trait]
pub trait ActionsService: Send + Sync {
    /// Get workflow operations.
    fn workflows(&self) -> &dyn WorkflowsService;

    /// Get workflow run operations.
    fn runs(&self) -> &dyn WorkflowRunsService;

    /// Get job operations.
    fn jobs(&self) -> &dyn JobsService;

    /// Get artifact operations.
    fn artifacts(&self) -> &dyn ArtifactsService;

    /// Get secrets operations.
    fn secrets(&self) -> &dyn SecretsService;

    /// Get variables operations.
    fn variables(&self) -> &dyn VariablesService;
}

#[async_trait]
pub trait WorkflowsService: Send + Sync {
    async fn list(
        &self,
        owner: &str,
        repo: &str,
    ) -> Result<Paginated<Workflow>, GitHubError>;

    async fn get(
        &self,
        owner: &str,
        repo: &str,
        workflow_id: WorkflowId,
    ) -> Result<Workflow, GitHubError>;

    async fn dispatch(
        &self,
        owner: &str,
        repo: &str,
        workflow_id: WorkflowId,
        request: WorkflowDispatchRequest,
    ) -> Result<(), GitHubError>;

    async fn enable(
        &self,
        owner: &str,
        repo: &str,
        workflow_id: WorkflowId,
    ) -> Result<(), GitHubError>;

    async fn disable(
        &self,
        owner: &str,
        repo: &str,
        workflow_id: WorkflowId,
    ) -> Result<(), GitHubError>;
}

#[async_trait]
pub trait WorkflowRunsService: Send + Sync {
    async fn list(
        &self,
        owner: &str,
        repo: &str,
        params: Option<ListWorkflowRunsParams>,
    ) -> Result<WorkflowRunList, GitHubError>;

    async fn get(
        &self,
        owner: &str,
        repo: &str,
        run_id: u64,
    ) -> Result<WorkflowRun, GitHubError>;

    async fn rerun(
        &self,
        owner: &str,
        repo: &str,
        run_id: u64,
    ) -> Result<(), GitHubError>;

    async fn rerun_failed_jobs(
        &self,
        owner: &str,
        repo: &str,
        run_id: u64,
    ) -> Result<(), GitHubError>;

    async fn cancel(
        &self,
        owner: &str,
        repo: &str,
        run_id: u64,
    ) -> Result<(), GitHubError>;

    async fn delete(
        &self,
        owner: &str,
        repo: &str,
        run_id: u64,
    ) -> Result<(), GitHubError>;

    async fn download_logs(
        &self,
        owner: &str,
        repo: &str,
        run_id: u64,
    ) -> Result<Bytes, GitHubError>;
}
```

#### 5.1.6 Transport Interface

```rust
/// HTTP transport abstraction for testability.
#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Send an HTTP request and receive a response.
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError>;

    /// Send a request and receive raw bytes (for downloads).
    async fn send_raw(&self, request: HttpRequest) -> Result<Bytes, TransportError>;
}

/// HTTP request representation.
pub struct HttpRequest {
    pub method: HttpMethod,
    pub url: Url,
    pub headers: HeaderMap,
    pub body: Option<Bytes>,
    pub timeout: Option<Duration>,
}

/// HTTP response representation.
pub struct HttpResponse {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: Bytes,
}

/// Rate limit information from response headers.
pub struct RateLimitInfo {
    pub limit: u32,
    pub remaining: u32,
    pub reset: DateTime<Utc>,
    pub used: u32,
    pub resource: String,
}
```

#### 5.1.7 Pagination Interface

```rust
/// Paginated results from GitHub API.
pub struct Paginated<T> {
    /// Current page items.
    pub items: Vec<T>,

    /// Total count (if available).
    pub total_count: Option<u64>,

    /// Link to next page.
    pub next_page: Option<String>,

    /// Link to previous page.
    pub prev_page: Option<String>,

    /// Link to first page.
    pub first_page: Option<String>,

    /// Link to last page.
    pub last_page: Option<String>,
}

impl<T> Paginated<T> {
    /// Check if there are more pages.
    pub fn has_next(&self) -> bool {
        self.next_page.is_some()
    }
}

/// Async iterator over all pages.
#[async_trait]
pub trait PageIterator<T>: Send {
    /// Fetch the next page of results.
    async fn next_page(&mut self) -> Option<Result<Vec<T>, GitHubError>>;

    /// Collect all remaining items.
    async fn collect_all(&mut self) -> Result<Vec<T>, GitHubError>;
}
```

#### 5.1.8 Configuration Types

```rust
/// Configuration for the GitHub client.
#[derive(Clone)]
pub struct GitHubConfig {
    /// Authentication configuration.
    pub auth: AuthConfig,

    /// Base URL for the API.
    pub base_url: Url,

    /// GraphQL endpoint URL.
    pub graphql_url: Url,

    /// API version header value.
    pub api_version: String,

    /// Default timeout for requests.
    pub timeout: Duration,

    /// Maximum retries for transient failures.
    pub max_retries: u32,

    /// Retry configuration.
    pub retry_config: RetryConfig,

    /// Circuit breaker configuration.
    pub circuit_breaker_config: CircuitBreakerConfig,

    /// Rate limit configuration.
    pub rate_limit_config: Option<RateLimitConfig>,

    /// User agent string.
    pub user_agent: String,
}

impl Default for GitHubConfig {
    fn default() -> Self {
        Self {
            auth: AuthConfig::None,
            base_url: Url::parse("https://api.github.com").unwrap(),
            graphql_url: Url::parse("https://api.github.com/graphql").unwrap(),
            api_version: "2022-11-28".to_string(),
            timeout: Duration::from_secs(30),
            max_retries: 3,
            retry_config: RetryConfig::default(),
            circuit_breaker_config: CircuitBreakerConfig::default(),
            rate_limit_config: None,
            user_agent: format!("integrations-github/{}", env!("CARGO_PKG_VERSION")),
        }
    }
}

/// Authentication configuration.
#[derive(Clone)]
pub enum AuthConfig {
    /// No authentication (public endpoints only).
    None,

    /// Personal access token authentication.
    PersonalAccessToken(SecretString),

    /// GitHub App authentication.
    GitHubApp {
        app_id: u64,
        private_key: SecretString,
        installation_id: Option<u64>,
    },

    /// OAuth token authentication.
    OAuthToken(SecretString),

    /// GitHub Actions GITHUB_TOKEN.
    ActionsToken(SecretString),
}

/// Rate limit status for all resources.
pub struct RateLimitStatus {
    pub core: RateLimitResource,
    pub search: RateLimitResource,
    pub graphql: RateLimitResource,
    pub code_scanning_upload: RateLimitResource,
    pub actions_runner_registration: RateLimitResource,
}

pub struct RateLimitResource {
    pub limit: u32,
    pub remaining: u32,
    pub reset: DateTime<Utc>,
    pub used: u32,
}
```

#### 5.1.9 Webhook Types

```rust
/// Webhook payload parser and verifier.
pub trait WebhookHandler: Send + Sync {
    /// Verify webhook signature.
    fn verify_signature(
        &self,
        payload: &[u8],
        signature: &str,
        secret: &SecretString,
    ) -> Result<bool, GitHubError>;

    /// Parse webhook payload.
    fn parse_payload(
        &self,
        event_type: &str,
        payload: &[u8],
    ) -> Result<WebhookEvent, GitHubError>;
}

/// Parsed webhook event.
pub enum WebhookEvent {
    Push(PushEvent),
    PullRequest(PullRequestEvent),
    Issues(IssuesEvent),
    IssueComment(IssueCommentEvent),
    Create(CreateEvent),
    Delete(DeleteEvent),
    Release(ReleaseEvent),
    WorkflowRun(WorkflowRunEvent),
    WorkflowJob(WorkflowJobEvent),
    CheckRun(CheckRunEvent),
    CheckSuite(CheckSuiteEvent),
    Deployment(DeploymentEvent),
    DeploymentStatus(DeploymentStatusEvent),
    Repository(RepositoryEvent),
    Member(MemberEvent),
    Team(TeamEvent),
    Organization(OrganizationEvent),
    Unknown { event_type: String, payload: serde_json::Value },
}
```

### 5.2 TypeScript Interfaces

#### 5.2.1 Client Interface

```typescript
/**
 * Main client for interacting with GitHub's API.
 */
interface GitHubClient {
  /** Access the repositories service. */
  readonly repositories: RepositoriesService;

  /** Access the issues service. */
  readonly issues: IssuesService;

  /** Access the pull requests service. */
  readonly pullRequests: PullRequestsService;

  /** Access the git data service. */
  readonly git: GitDataService;

  /** Access the actions service. */
  readonly actions: ActionsService;

  /** Access the users service. */
  readonly users: UsersService;

  /** Access the organizations service. */
  readonly organizations: OrganizationsService;

  /** Access the search service. */
  readonly search: SearchService;

  /** Access the gists service. */
  readonly gists: GistsService;

  /** Access the webhooks service. */
  readonly webhooks: WebhooksService;

  /** Execute a GraphQL query. */
  graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>;

  /** Get current rate limit status. */
  rateLimit(): Promise<RateLimitStatus>;
}

/**
 * Factory for creating GitHub clients.
 */
interface GitHubClientFactory {
  create(config: GitHubConfig): GitHubClient;
}
```

#### 5.2.2 Configuration Types

```typescript
/**
 * Configuration for the GitHub client.
 */
interface GitHubConfig {
  /** Authentication configuration. */
  auth: AuthConfig;

  /** Base URL for the API. */
  baseUrl?: string;

  /** GraphQL endpoint URL. */
  graphqlUrl?: string;

  /** API version header value. */
  apiVersion?: string;

  /** Default timeout in milliseconds. */
  timeout?: number;

  /** Maximum retries for transient failures. */
  maxRetries?: number;

  /** Retry configuration. */
  retryConfig?: RetryConfig;

  /** Circuit breaker configuration. */
  circuitBreakerConfig?: CircuitBreakerConfig;

  /** Rate limit configuration. */
  rateLimitConfig?: RateLimitConfig;

  /** User agent string. */
  userAgent?: string;
}

/**
 * Authentication configuration.
 */
type AuthConfig =
  | { type: 'none' }
  | { type: 'token'; token: string }
  | { type: 'github-app'; appId: number; privateKey: string; installationId?: number }
  | { type: 'oauth'; token: string }
  | { type: 'actions'; token: string };
```

#### 5.2.3 Repository Types

```typescript
/**
 * Repository representation.
 */
interface Repository {
  id: number;
  nodeId: string;
  name: string;
  fullName: string;
  owner: User;
  private: boolean;
  htmlUrl: string;
  description: string | null;
  fork: boolean;
  url: string;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  gitUrl: string;
  sshUrl: string;
  cloneUrl: string;
  language: string | null;
  forksCount: number;
  stargazersCount: number;
  watchersCount: number;
  size: number;
  defaultBranch: string;
  openIssuesCount: number;
  topics: string[];
  hasIssues: boolean;
  hasProjects: boolean;
  hasWiki: boolean;
  hasDownloads: boolean;
  archived: boolean;
  disabled: boolean;
  visibility: 'public' | 'private' | 'internal';
  license: License | null;
}

/**
 * Request to create a repository.
 */
interface CreateRepositoryRequest {
  name: string;
  description?: string;
  homepage?: string;
  private?: boolean;
  visibility?: 'public' | 'private' | 'internal';
  hasIssues?: boolean;
  hasProjects?: boolean;
  hasWiki?: boolean;
  hasDownloads?: boolean;
  isTemplate?: boolean;
  teamId?: number;
  autoInit?: boolean;
  gitignoreTemplate?: string;
  licenseTemplate?: string;
  allowSquashMerge?: boolean;
  allowMergeCommit?: boolean;
  allowRebaseMerge?: boolean;
  allowAutoMerge?: boolean;
  deleteBranchOnMerge?: boolean;
}
```

#### 5.2.4 Issue Types

```typescript
/**
 * Issue representation.
 */
interface Issue {
  id: number;
  nodeId: string;
  url: string;
  repositoryUrl: string;
  labelsUrl: string;
  commentsUrl: string;
  eventsUrl: string;
  htmlUrl: string;
  number: number;
  state: 'open' | 'closed';
  stateReason: 'completed' | 'not_planned' | 'reopened' | null;
  title: string;
  body: string | null;
  user: User;
  labels: Label[];
  assignee: User | null;
  assignees: User[];
  milestone: Milestone | null;
  locked: boolean;
  activeLockReason: string | null;
  comments: number;
  pullRequest?: {
    url: string;
    htmlUrl: string;
    diffUrl: string;
    patchUrl: string;
  };
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  closedBy: User | null;
  authorAssociation: AuthorAssociation;
}

/**
 * Request to create an issue.
 */
interface CreateIssueRequest {
  title: string;
  body?: string;
  assignee?: string;
  assignees?: string[];
  milestone?: number;
  labels?: string[];
}

/**
 * Request to update an issue.
 */
interface UpdateIssueRequest {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  stateReason?: 'completed' | 'not_planned' | 'reopened';
  assignee?: string | null;
  assignees?: string[];
  milestone?: number | null;
  labels?: string[];
}
```

#### 5.2.5 Pull Request Types

```typescript
/**
 * Pull request representation.
 */
interface PullRequest {
  id: number;
  nodeId: string;
  url: string;
  htmlUrl: string;
  diffUrl: string;
  patchUrl: string;
  issueUrl: string;
  number: number;
  state: 'open' | 'closed';
  locked: boolean;
  title: string;
  user: User;
  body: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
  mergeCommitSha: string | null;
  assignee: User | null;
  assignees: User[];
  requestedReviewers: User[];
  requestedTeams: Team[];
  labels: Label[];
  milestone: Milestone | null;
  draft: boolean;
  head: PullRequestRef;
  base: PullRequestRef;
  authorAssociation: AuthorAssociation;
  autoMerge: AutoMerge | null;
  merged: boolean;
  mergeable: boolean | null;
  rebaseable: boolean | null;
  mergeableState: string;
  mergedBy: User | null;
  comments: number;
  reviewComments: number;
  maintainerCanModify: boolean;
  commits: number;
  additions: number;
  deletions: number;
  changedFiles: number;
}

/**
 * Request to create a pull request.
 */
interface CreatePullRequestRequest {
  title: string;
  body?: string;
  head: string;
  base: string;
  headRepo?: string;
  maintainerCanModify?: boolean;
  draft?: boolean;
}

/**
 * Request to merge a pull request.
 */
interface MergePullRequestRequest {
  commitTitle?: string;
  commitMessage?: string;
  sha?: string;
  mergeMethod?: 'merge' | 'squash' | 'rebase';
}
```

#### 5.2.6 Webhook Types

```typescript
/**
 * Webhook event handler.
 */
interface WebhookHandler {
  /**
   * Verify webhook signature.
   */
  verifySignature(payload: string | Buffer, signature: string, secret: string): boolean;

  /**
   * Parse webhook payload.
   */
  parsePayload(eventType: string, payload: string | Buffer): WebhookEvent;
}

/**
 * Parsed webhook event.
 */
type WebhookEvent =
  | { type: 'push'; payload: PushEvent }
  | { type: 'pull_request'; payload: PullRequestEvent }
  | { type: 'issues'; payload: IssuesEvent }
  | { type: 'issue_comment'; payload: IssueCommentEvent }
  | { type: 'create'; payload: CreateEvent }
  | { type: 'delete'; payload: DeleteEvent }
  | { type: 'release'; payload: ReleaseEvent }
  | { type: 'workflow_run'; payload: WorkflowRunEvent }
  | { type: 'workflow_job'; payload: WorkflowJobEvent }
  | { type: 'check_run'; payload: CheckRunEvent }
  | { type: 'check_suite'; payload: CheckSuiteEvent }
  | { type: 'deployment'; payload: DeploymentEvent }
  | { type: 'deployment_status'; payload: DeploymentStatusEvent }
  | { type: 'repository'; payload: RepositoryEvent }
  | { type: 'member'; payload: MemberEvent }
  | { type: 'team'; payload: TeamEvent }
  | { type: 'organization'; payload: OrganizationEvent }
  | { type: 'unknown'; eventType: string; payload: unknown };
```

#### 5.2.7 Pagination Types

```typescript
/**
 * Paginated results from GitHub API.
 */
interface Paginated<T> {
  /** Current page items. */
  items: T[];

  /** Total count (if available). */
  totalCount?: number;

  /** Link to next page. */
  nextPage?: string;

  /** Link to previous page. */
  prevPage?: string;

  /** Link to first page. */
  firstPage?: string;

  /** Link to last page. */
  lastPage?: string;

  /** Check if there are more pages. */
  hasNext(): boolean;
}

/**
 * Async iterator over all pages.
 */
interface PageIterator<T> extends AsyncIterable<T[]> {
  /** Fetch the next page of results. */
  nextPage(): Promise<T[] | null>;

  /** Collect all remaining items. */
  collectAll(): Promise<T[]>;
}
```

---

## 6. Error Taxonomy

### 6.1 Error Hierarchy

```
GitHubError
├── ConfigurationError
│   ├── MissingAuth
│   ├── InvalidBaseUrl
│   ├── InvalidAppCredentials
│   └── InvalidConfiguration
│
├── AuthenticationError
│   ├── InvalidToken
│   ├── ExpiredToken
│   ├── InsufficientScopes
│   ├── BadCredentials
│   └── AppAuthenticationFailed
│
├── AuthorizationError
│   ├── Forbidden
│   ├── ResourceNotAccessible
│   └── SsoRequired
│
├── RequestError
│   ├── ValidationError
│   ├── InvalidParameter
│   ├── MissingParameter
│   └── UnprocessableEntity
│
├── ResourceError
│   ├── NotFound
│   ├── Gone
│   ├── Conflict
│   └── AlreadyExists
│
├── RateLimitError
│   ├── PrimaryRateLimitExceeded
│   ├── SecondaryRateLimitExceeded
│   └── AbuseDetected
│
├── NetworkError
│   ├── ConnectionFailed
│   ├── Timeout
│   ├── DnsResolutionFailed
│   └── TlsError
│
├── ServerError
│   ├── InternalError
│   ├── BadGateway
│   └── ServiceUnavailable
│
├── ResponseError
│   ├── DeserializationError
│   ├── UnexpectedFormat
│   └── InvalidJson
│
├── WebhookError
│   ├── InvalidSignature
│   ├── UnsupportedEvent
│   └── PayloadParseError
│
└── GraphQLError
    ├── QueryError
    ├── RateLimitExceeded
    └── NodeLimitExceeded
```

### 6.2 Error Type Definitions (Rust)

```rust
/// Top-level error type for the GitHub integration.
#[derive(Debug, thiserror::Error)]
pub enum GitHubError {
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    #[error("Authentication error: {0}")]
    Authentication(#[from] AuthenticationError),

    #[error("Authorization error: {0}")]
    Authorization(#[from] AuthorizationError),

    #[error("Request error: {0}")]
    Request(#[from] RequestError),

    #[error("Resource error: {0}")]
    Resource(#[from] ResourceError),

    #[error("Rate limit error: {0}")]
    RateLimit(#[from] RateLimitError),

    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    #[error("Server error: {0}")]
    Server(#[from] ServerError),

    #[error("Response error: {0}")]
    Response(#[from] ResponseError),

    #[error("Webhook error: {0}")]
    Webhook(#[from] WebhookError),

    #[error("GraphQL error: {0}")]
    GraphQL(#[from] GraphQLError),
}

impl GitHubError {
    /// Returns true if the error is retryable.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            GitHubError::RateLimit(RateLimitError::PrimaryRateLimitExceeded { .. })
                | GitHubError::Network(NetworkError::Timeout { .. })
                | GitHubError::Network(NetworkError::ConnectionFailed { .. })
                | GitHubError::Server(ServerError::InternalError { .. })
                | GitHubError::Server(ServerError::BadGateway { .. })
                | GitHubError::Server(ServerError::ServiceUnavailable { .. })
        )
    }

    /// Returns the retry delay hint if available.
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            GitHubError::RateLimit(e) => e.retry_after(),
            GitHubError::Server(ServerError::ServiceUnavailable { retry_after, .. }) => {
                *retry_after
            }
            _ => None,
        }
    }

    /// Returns the HTTP status code if applicable.
    pub fn status_code(&self) -> Option<StatusCode> {
        match self {
            GitHubError::Authentication(_) => Some(StatusCode::UNAUTHORIZED),
            GitHubError::Authorization(_) => Some(StatusCode::FORBIDDEN),
            GitHubError::Request(_) => Some(StatusCode::BAD_REQUEST),
            GitHubError::Resource(ResourceError::NotFound { .. }) => Some(StatusCode::NOT_FOUND),
            GitHubError::Resource(ResourceError::Gone { .. }) => Some(StatusCode::GONE),
            GitHubError::Resource(ResourceError::Conflict { .. }) => Some(StatusCode::CONFLICT),
            GitHubError::RateLimit(_) => Some(StatusCode::TOO_MANY_REQUESTS),
            GitHubError::Server(ServerError::InternalError { .. }) => {
                Some(StatusCode::INTERNAL_SERVER_ERROR)
            }
            GitHubError::Server(ServerError::BadGateway { .. }) => Some(StatusCode::BAD_GATEWAY),
            GitHubError::Server(ServerError::ServiceUnavailable { .. }) => {
                Some(StatusCode::SERVICE_UNAVAILABLE)
            }
            _ => None,
        }
    }

    /// Returns the GitHub error documentation URL if available.
    pub fn documentation_url(&self) -> Option<&str> {
        match self {
            GitHubError::RateLimit(e) => e.documentation_url(),
            _ => None,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum RateLimitError {
    #[error("Primary rate limit exceeded: {message}")]
    PrimaryRateLimitExceeded {
        message: String,
        limit: u32,
        remaining: u32,
        reset: DateTime<Utc>,
        documentation_url: Option<String>,
    },

    #[error("Secondary rate limit exceeded: {message}")]
    SecondaryRateLimitExceeded {
        message: String,
        retry_after: Option<Duration>,
        documentation_url: Option<String>,
    },

    #[error("Abuse detection triggered: {message}")]
    AbuseDetected {
        message: String,
        retry_after: Option<Duration>,
        documentation_url: Option<String>,
    },
}

impl RateLimitError {
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            Self::PrimaryRateLimitExceeded { reset, .. } => {
                let now = Utc::now();
                if *reset > now {
                    Some((*reset - now).to_std().ok()?)
                } else {
                    None
                }
            }
            Self::SecondaryRateLimitExceeded { retry_after, .. } => *retry_after,
            Self::AbuseDetected { retry_after, .. } => *retry_after,
        }
    }

    pub fn documentation_url(&self) -> Option<&str> {
        match self {
            Self::PrimaryRateLimitExceeded { documentation_url, .. }
            | Self::SecondaryRateLimitExceeded { documentation_url, .. }
            | Self::AbuseDetected { documentation_url, .. } => documentation_url.as_deref(),
        }
    }
}
```

### 6.3 Error Mapping from HTTP

| HTTP Status | Error Type | Retryable |
|-------------|------------|-----------|
| 400 | `RequestError::ValidationError` | No |
| 401 | `AuthenticationError::*` | No |
| 403 (rate limit) | `RateLimitError::*` | Yes |
| 403 (other) | `AuthorizationError::Forbidden` | No |
| 404 | `ResourceError::NotFound` | No |
| 409 | `ResourceError::Conflict` | No |
| 410 | `ResourceError::Gone` | No |
| 422 | `RequestError::UnprocessableEntity` | No |
| 429 | `RateLimitError::SecondaryRateLimitExceeded` | Yes |
| 500 | `ServerError::InternalError` | Yes (limited) |
| 502 | `ServerError::BadGateway` | Yes |
| 503 | `ServerError::ServiceUnavailable` | Yes |

---

## 7. Resilience Hooks

### 7.1 Retry Integration

The module integrates with `integrations-retry` for automatic retry of transient failures.

```rust
/// Retry configuration for GitHub requests.
pub struct GitHubRetryConfig {
    /// Base configuration from primitives.
    pub base: RetryConfig,

    /// Override retry behavior per error type.
    pub error_overrides: HashMap<ErrorCategory, RetryBehavior>,

    /// Respect Retry-After headers.
    pub respect_retry_after: bool,
}

/// How to handle retries for a specific error category.
pub enum RetryBehavior {
    /// Use default retry logic.
    Default,
    /// Never retry this error.
    NoRetry,
    /// Retry with specific configuration.
    Custom(RetryConfig),
}
```

**Default Retry Behavior:**

| Error Type | Retry | Max Attempts | Base Delay |
|------------|-------|--------------|------------|
| `RateLimitError::Primary` | Yes | 1 | Use reset time |
| `RateLimitError::Secondary` | Yes | 3 | Use `retry-after` or 60s |
| `NetworkError::Timeout` | Yes | 3 | 1s |
| `NetworkError::Connection` | Yes | 3 | 1s |
| `ServerError::5xx` | Yes | 3 | 5s |
| All others | No | - | - |

### 7.2 Circuit Breaker Integration

The module integrates with `integrations-circuit-breaker` to prevent cascading failures.

```rust
/// Circuit breaker configuration for GitHub.
pub struct GitHubCircuitBreakerConfig {
    /// Base configuration from primitives.
    pub base: CircuitBreakerConfig,

    /// Failure threshold before opening.
    pub failure_threshold: u32,

    /// Success threshold to close.
    pub success_threshold: u32,

    /// Time before attempting half-open.
    pub reset_timeout: Duration,

    /// Separate circuit breakers per resource type.
    pub per_resource: bool,
}

impl Default for GitHubCircuitBreakerConfig {
    fn default() -> Self {
        Self {
            base: CircuitBreakerConfig::default(),
            failure_threshold: 5,
            success_threshold: 3,
            reset_timeout: Duration::from_secs(60),
            per_resource: false,
        }
    }
}
```

**State Transitions:**

```
CLOSED --[failures >= threshold]--> OPEN
OPEN --[reset_timeout elapsed]--> HALF_OPEN
HALF_OPEN --[success >= threshold]--> CLOSED
HALF_OPEN --[any failure]--> OPEN
```

### 7.3 Rate Limit Integration

The module integrates with `integrations-rate-limit` for client-side rate limiting.

```rust
/// Rate limit configuration for GitHub.
pub struct GitHubRateLimitConfig {
    /// Track rate limits from response headers.
    pub track_from_headers: bool,

    /// Pre-emptive rate limiting based on tracked state.
    pub preemptive_throttling: bool,

    /// Buffer percentage before hitting limit (0-100).
    pub throttle_buffer_percent: u8,

    /// Maximum concurrent requests.
    pub max_concurrent_requests: Option<u32>,

    /// Per-endpoint rate limits.
    pub endpoint_limits: HashMap<String, u32>,
}
```

**Rate Limit Headers:**

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests per hour |
| `X-RateLimit-Remaining` | Remaining requests |
| `X-RateLimit-Reset` | Unix timestamp when limit resets |
| `X-RateLimit-Used` | Requests used this period |
| `X-RateLimit-Resource` | Rate limit category |
| `Retry-After` | Seconds to wait (429 responses) |

**Rate Limit Handling:**

1. **Track from headers**: Parse rate limit info from every response
2. **Pre-emptive throttling**: Slow down when approaching limits
3. **Respect Retry-After**: Honor server-specified delays
4. **Secondary limits**: Handle abuse detection (403/429 without standard headers)

---

## 8. Security Requirements

### 8.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Tokens never logged | Use `SecretString`, redact in Debug |
| Tokens not in stack traces | Zero on drop, no Display impl |
| Private keys encrypted | Delegate to config primitive |
| Tokens in memory protected | `secrecy` crate with `Zeroize` |
| App private keys secured | Never store unencrypted |

### 8.2 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ only | Configure in HTTP client |
| Certificate validation | Enable by default |
| No insecure fallback | Fail on TLS errors |
| Certificate pinning | Optional for high-security |

### 8.3 Webhook Security

| Requirement | Implementation |
|-------------|----------------|
| Signature verification | Required before processing |
| Use SHA-256 | Prefer `X-Hub-Signature-256` |
| Constant-time comparison | Prevent timing attacks |
| Validate event type | Check `X-GitHub-Event` header |
| Replay protection | Check `X-GitHub-Delivery` uniqueness |

### 8.4 Input Validation

| Requirement | Implementation |
|-------------|----------------|
| Validate all user input | Before sending to API |
| Sanitize for logging | Truncate, redact PII |
| Prevent injection | Type-safe builders |
| Validate file paths | Prevent path traversal |

### 8.5 Output Handling

| Requirement | Implementation |
|-------------|----------------|
| Response validation | Type-checked deserialization |
| Sanitize user content | Escape for display |
| Error message safety | No credential exposure |

---

## 9. Observability Requirements

### 9.1 Tracing

Every API call must create a trace span with:

| Attribute | Type | Description |
|-----------|------|-------------|
| `github.service` | string | Service name (e.g., "repositories") |
| `github.operation` | string | Operation name (e.g., "get") |
| `github.owner` | string | Repository owner (if applicable) |
| `github.repo` | string | Repository name (if applicable) |
| `github.endpoint` | string | API endpoint path |
| `github.method` | string | HTTP method |
| `github.request_id` | string | GitHub request ID |
| `github.rate_limit.remaining` | integer | Remaining rate limit |
| `github.rate_limit.limit` | integer | Rate limit maximum |
| `http.status_code` | integer | HTTP response status |
| `error.type` | string | Error category (if failed) |
| `error.message` | string | Error message (if failed) |

### 9.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `github_requests_total` | Counter | `service`, `operation`, `method`, `status` |
| `github_request_duration_seconds` | Histogram | `service`, `operation`, `method` |
| `github_errors_total` | Counter | `service`, `error_type` |
| `github_rate_limit_remaining` | Gauge | `resource` |
| `github_rate_limit_used` | Counter | `resource` |
| `github_rate_limit_hits_total` | Counter | `type` (primary/secondary) |
| `github_circuit_breaker_state` | Gauge | `resource`, `state` |
| `github_pagination_requests_total` | Counter | `service`, `operation` |
| `github_webhook_events_total` | Counter | `event_type`, `action` |
| `github_webhook_verification_failures_total` | Counter | - |

### 9.3 Logging

| Level | When |
|-------|------|
| `ERROR` | Non-retryable failures, configuration errors, webhook verification failures |
| `WARN` | Rate limits, circuit breaker trips, retryable failures |
| `INFO` | Request completion, webhook events received |
| `DEBUG` | Request/response details (sanitized), pagination progress |
| `TRACE` | Raw HTTP details, header parsing |

**Log Fields:**

| Field | Description |
|-------|-------------|
| `request_id` | GitHub request ID |
| `owner` | Repository owner |
| `repo` | Repository name |
| `operation` | API operation |
| `duration_ms` | Request duration |
| `status_code` | HTTP status |
| `rate_limit.remaining` | Remaining requests |
| `rate_limit.reset` | Reset timestamp |
| `error.type` | Error category |
| `retry.attempt` | Current retry attempt |

---

## 10. Performance Requirements

### 10.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Request serialization | < 1ms | < 5ms |
| Response deserialization | < 5ms | < 20ms |
| Signature verification | < 1ms | < 5ms |
| JWT generation | < 10ms | < 50ms |
| Pagination iteration | < 1ms overhead | < 5ms overhead |

### 10.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Concurrent requests | 100+ (configurable) |
| Sequential pagination | Line-rate with API |
| Webhook processing | 1000+ events/second |
| GraphQL queries | Match API limits |

### 10.3 Resource Limits

| Resource | Limit |
|----------|-------|
| Memory per request | < 1MB typical |
| Memory per pagination | < 10KB per page |
| Connection pool size | Configurable (default: 20) |
| Request body size | Match API limits (100MB max) |
| Response body size | Configurable limit |

---

## 11. Future-Proofing

### 11.1 Extensibility Points

| Extension Point | Mechanism |
|-----------------|-----------|
| New API endpoints | Add new service trait + implementation |
| New webhook events | Extend `WebhookEvent` enum |
| New auth methods | Extend `AuthConfig` enum |
| Custom transport | Implement `HttpTransport` trait |
| Custom retry logic | Implement retry hooks |
| GraphQL extensions | Query composition |

### 11.2 Version Compatibility

| Aspect | Strategy |
|--------|----------|
| API version header | Configurable, default to latest stable |
| Response fields | `#[serde(flatten)]` for unknown fields |
| Request fields | Builder pattern with optional fields |
| Breaking changes | Major version bump, migration guide |
| Preview features | Behind feature flag |

### 11.3 Deprecation Policy

1. **Announce**: Minimum 1 minor version before removal
2. **Warn**: Log warning when deprecated feature used
3. **Document**: Migration path in release notes
4. **Remove**: Only in major version

---

## 12. Acceptance Criteria

### 12.1 Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| FC-1 | List repositories works | Integration test |
| FC-2 | Create/update/delete repository works | Integration test |
| FC-3 | List/create/update issues works | Integration test |
| FC-4 | List/create/merge pull requests works | Integration test |
| FC-5 | PR review workflow works | Integration test |
| FC-6 | Git data operations (blobs, trees, commits, refs) work | Integration test |
| FC-7 | Actions workflow management works | Integration test |
| FC-8 | Actions run management works | Integration test |
| FC-9 | Secrets/variables management works | Integration test |
| FC-10 | User/org operations work | Integration test |
| FC-11 | Search operations work | Integration test |
| FC-12 | Gist operations work | Integration test |
| FC-13 | Webhook signature verification works | Unit tests |
| FC-14 | All webhook events parsed | Unit tests |
| FC-15 | Pagination (link-based) works | Integration test |
| FC-16 | GraphQL queries work | Integration test |
| FC-17 | All auth methods work | Integration tests |
| FC-18 | GitHub App JWT auth works | Integration test |
| FC-19 | All error types mapped correctly | Unit tests |
| FC-20 | Rate limit tracking works | Integration test |

### 12.2 Non-Functional Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| NFC-1 | No panics in production paths | Fuzzing, review |
| NFC-2 | Memory bounded during pagination | Profiling |
| NFC-3 | Credentials never logged | Audit, tests |
| NFC-4 | TLS 1.2+ enforced | Configuration |
| NFC-5 | Retry respects backoff | Mock tests |
| NFC-6 | Circuit breaker trips correctly | State tests |
| NFC-7 | Rate limiting works | Timing tests |
| NFC-8 | Webhook signatures verified correctly | Security tests |
| NFC-9 | All requests traced | Integration tests |
| NFC-10 | Metrics emitted correctly | Integration tests |
| NFC-11 | Test coverage > 80% | Coverage report |

### 12.3 Documentation Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| DC-1 | All public APIs documented | Doc coverage |
| DC-2 | Examples for common operations | Doc review |
| DC-3 | Error handling documented | Doc review |
| DC-4 | Configuration options documented | Doc review |
| DC-5 | Authentication methods documented | Doc review |
| DC-6 | Webhook handling documented | Doc review |
| DC-7 | Migration guides for breaking changes | Release notes |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial specification |

---

**End of Specification Phase**

*The next phase (Pseudocode) will provide detailed algorithmic descriptions for implementing each component.*
