/**
 * Jenkins services module.
 *
 * Re-exports all service implementations following the SPARC specification.
 */

import type { JenkinsClient } from '../client/index.js';
import { JobService } from './jobs.js';
import { BuildService } from './builds.js';
import { PipelineService } from './pipelines.js';
import { QueueService } from './queue.js';
import { ArtifactService } from './artifacts.js';
import { ConsoleService } from './console.js';

export { JobService } from './jobs.js';
export type { TriggerBuildOptions } from './jobs.js';
export { BuildService } from './builds.js';
export { PipelineService } from './pipelines.js';
export type { InputSubmitParams } from './pipelines.js';
export { QueueService } from './queue.js';
export { ArtifactService } from './artifacts.js';
export { ConsoleService } from './console.js';
export type { ProgressiveConsoleResponse, ConsoleChunk } from './console.js';

/**
 * Container for all Jenkins services.
 */
export interface JenkinsServices {
  /** Job management service */
  jobs: JobService;
  /** Build management service */
  builds: BuildService;
  /** Pipeline management service */
  pipelines: PipelineService;
  /** Queue management service */
  queue: QueueService;
  /** Artifact management service */
  artifacts: ArtifactService;
  /** Console output service */
  console: ConsoleService;
}

/**
 * Creates all Jenkins services with a shared client.
 *
 * @param client - Jenkins client instance
 * @returns Object containing all service instances
 */
export function createServices(client: JenkinsClient): JenkinsServices {
  return {
    jobs: new JobService(client),
    builds: new BuildService(client),
    pipelines: new PipelineService(client),
    queue: new QueueService(client),
    artifacts: new ArtifactService(client),
    console: new ConsoleService(client),
  };
}
