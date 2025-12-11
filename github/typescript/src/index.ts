/**
 * GitHub Integration Library
 *
 * A production-ready GitHub API client with:
 * - Full REST API coverage (Repositories, Issues, PRs, Actions, etc.)
 * - GraphQL API support with cost-based rate limiting
 * - Multiple authentication methods (PAT, GitHub App, OAuth, Actions)
 * - Automatic pagination handling
 * - Webhook signature verification
 * - Resilience patterns (retry, circuit breaker, rate limiting)
 * - Comprehensive observability
 *
 * @example
 * ```typescript
 * import { GitHubClient, GitHubConfig, AuthMethod } from '@integrations/github';
 *
 * // Create client with personal access token
 * const config = GitHubConfig.builder()
 *   .auth(AuthMethod.pat('ghp_xxxxxxxxxxxx'))
 *   .build();
 *
 * const client = new GitHubClient(config);
 *
 * // List repositories
 * const repos = await client.repositories().listForUser('octocat');
 * for (const repo of repos) {
 *   console.log(repo.full_name);
 * }
 * ```
 *
 * @module @integrations/github
 */

// Core modules
export * from './config.js';
export * from './errors.js';
export * from './auth.js';
export * from './client.js';
export * from './pagination.js';
export * from './resilience.js';
export * from './types.js';

// Services
export * from './services/index.js';

// Webhooks module
export * from './webhooks/index.js';
