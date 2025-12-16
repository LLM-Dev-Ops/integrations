/**
 * GitLab Integration Library
 *
 * A production-ready GitLab API client with:
 * - Full REST API v4 coverage (Repositories, MRs, Pipelines, Jobs, Issues)
 * - Multiple authentication methods (PAT, OAuth2)
 * - Webhook signature verification
 * - Resilience patterns (retry, circuit breaker, rate limiting)
 * - Real-time job log streaming
 *
 * @example
 * ```typescript
 * import { createGitLabClient, GitLabAuth, projectRefByPath } from '@integrations/gitlab';
 *
 * // Create client with personal access token
 * const client = createGitLabClient(
 *   { baseUrl: 'https://gitlab.com' },
 *   GitLabAuth.pat('glpat-xxxxxxxxxxxx')
 * );
 *
 * // Use services
 * const services = createGitLabServices(client);
 * const mrs = await services.mergeRequests.list(projectRefByPath('group/project'));
 * ```
 *
 * @module @integrations/gitlab
 */

// Core configuration
export {
  type GitLabConfig,
  type SimulationMode,
  type RateLimitConfig as GitLabRateLimitConfig,
  type CircuitBreakerConfig as GitLabCircuitBreakerConfig,
  type RetryConfig as GitLabRetryConfig,
  GitLabConfigBuilder,
  createDefaultConfig,
  createConfigFromEnv,
} from './config.js';

// Error types
export * from './errors.js';

// Authentication
export * from './auth.js';

// Client
export {
  type HttpMethod,
  type RequestOptions,
  type HttpResponse,
  type PaginationParams,
  type Page,
  GitLabClient,
  createGitLabClient,
  createGitLabClientFromEnv,
} from './client.js';

// Resilience patterns
export {
  CircuitState,
  type RateLimitConfig,
  type CircuitBreakerConfig,
  type RetryConfig,
  type RateLimitInfo,
  type ResilienceStats,
  type ExecutionOptions,
  RateLimiter,
  CircuitBreaker,
  RetryWithBackoff,
  ResilienceOrchestrator,
  parseRateLimitHeaders,
  parseRetryAfter,
} from './resilience.js';

// Type definitions
export * from './types.js';

// Services
export {
  type GitLabServices,
  createGitLabServices,
  RepositoriesService,
  createRepositoriesService,
  MergeRequestsService,
  createMergeRequestsService,
  PipelinesService,
  createPipelinesService,
  JobsService,
  createJobsService,
  IssuesService,
  createIssuesService,
  ProjectsService,
  createProjectsService,
} from './services/index.js';

// Webhooks
export * from './webhooks/index.js';
