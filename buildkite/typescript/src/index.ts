/**
 * Buildkite Integration Library
 *
 * A production-ready Buildkite CI/CD API client with:
 * - Full REST API coverage (Organizations, Pipelines, Builds, Jobs, Artifacts)
 * - Automatic pagination handling
 * - Webhook event processing with token validation
 * - Resilience patterns (retry, circuit breaker, rate limiting)
 * - Build monitoring with adaptive polling
 * - Log streaming as jobs complete
 *
 * @example
 * ```typescript
 * import { createClient, BuildService, BuildState } from '@llm-devops/buildkite-integration';
 *
 * // Create client with API token
 * const client = createClient({
 *   organizationSlug: 'my-org',
 *   auth: { type: 'api_token', token: 'bkua_xxxxxxxxxxxx' },
 * });
 *
 * // Trigger a build
 * const buildService = new BuildService(client);
 * const build = await buildService.create('my-pipeline', {
 *   commit: 'HEAD',
 *   branch: 'main',
 *   message: 'Deployment triggered by automation',
 * });
 *
 * // Wait for completion
 * const completed = await buildService.waitForCompletion('my-pipeline', build.number);
 * console.log(`Build finished: ${completed.state}`);
 * ```
 *
 * @module @llm-devops/buildkite-integration
 */

// Core modules
export * from './config.js';
export * from './errors.js';
export * from './client.js';
export * from './pagination.js';
export * from './resilience.js';

// Types
export * from './types/index.js';

// Services
export * from './services/index.js';

// Monitoring
export * from './monitoring/index.js';
