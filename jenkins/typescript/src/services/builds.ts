/**
 * Jenkins Build Service
 * Provides operations for accessing build information, managing builds,
 * and retrieving build parameters and status.
 */

import type { JenkinsClient } from '../client/index.js';
import type { JobRef, BuildRef } from '../types/refs.js';
import type { Build, BuildSummary } from '../types/resources.js';
import type { BuildStatus } from '../types/status.js';
import { jobRefToPath, buildRefToPath } from '../types/refs.js';
import { buildResultFromString, completedStatus, buildingStatus, unknownStatus } from '../types/status.js';

/**
 * Build service for managing Jenkins builds.
 */
export class BuildService {
  constructor(private readonly client: JenkinsClient) {}

  /**
   * Gets detailed information about a build.
   *
   * @param jobRef - Job reference (name or path)
   * @param buildRef - Build reference (number or symbolic)
   * @returns Build details
   */
  async getBuild(jobRef: JobRef, buildRef: BuildRef): Promise<Build> {
    const jobPath = jobRefToPath(jobRef);
    const buildPath = buildRefToPath(buildRef);
    const response = await this.client.get<Build>(`/${jobPath}/${buildPath}/api/json`);
    return response.data;
  }

  /**
   * Gets the status of a build.
   *
   * @param jobRef - Job reference (name or path)
   * @param buildRef - Build reference (number or symbolic)
   * @returns Build status
   */
  async getBuildStatus(jobRef: JobRef, buildRef: BuildRef): Promise<BuildStatus> {
    const build = await this.getBuild(jobRef, buildRef);

    if (build.building) {
      return buildingStatus(build.estimatedDuration);
    }

    if (build.result) {
      const result = buildResultFromString(build.result);
      return completedStatus(result, build.duration);
    }

    return unknownStatus();
  }

  /**
   * Lists recent builds for a job.
   *
   * @param jobRef - Job reference (name or path)
   * @param limit - Maximum number of builds to return
   * @returns Array of build summaries
   */
  async listBuilds(jobRef: JobRef, limit?: number): Promise<BuildSummary[]> {
    const jobPath = jobRefToPath(jobRef);
    const tree = limit
      ? `builds[number,url,result,timestamp,duration]{0,${limit}}`
      : 'builds[number,url,result,timestamp,duration]';

    const response = await this.client.get<{ builds: BuildSummary[] }>(
      `/${jobPath}/api/json`,
      { query: { tree } }
    );

    return response.data.builds || [];
  }

  /**
   * Aborts a running build.
   *
   * @param jobRef - Job reference (name or path)
   * @param buildRef - Build reference (number or symbolic)
   */
  async abortBuild(jobRef: JobRef, buildRef: BuildRef): Promise<void> {
    const jobPath = jobRefToPath(jobRef);
    const buildPath = buildRefToPath(buildRef);
    await this.client.post(`/${jobPath}/${buildPath}/stop`);
  }

  /**
   * Gets build parameters.
   *
   * @param jobRef - Job reference (name or path)
   * @param buildRef - Build reference (number or symbolic)
   * @returns Build parameters as key-value pairs
   */
  async getBuildParameters(jobRef: JobRef, buildRef: BuildRef): Promise<Record<string, string>> {
    const build = await this.getBuild(jobRef, buildRef);
    const parameters: Record<string, string> = {};

    if (build.actions) {
      for (const action of build.actions) {
        if (action._class === 'hudson.model.ParametersAction' && action.parameters) {
          for (const param of action.parameters) {
            if (param.name && param.value !== undefined) {
              parameters[param.name] = String(param.value);
            }
          }
        }
      }
    }

    return parameters;
  }
}
