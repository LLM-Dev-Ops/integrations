/**
 * Jenkins Pipeline Service
 * Provides operations for accessing pipeline workflow API, managing pipeline stages,
 * retrieving stage logs, and handling pipeline input steps.
 */

import type { JenkinsClient } from '../client/index.js';
import type { JobRef, BuildRef } from '../types/refs.js';
import type { PipelineRun, Stage } from '../types/resources.js';
import { jobRefToPath, buildRefToPath } from '../types/refs.js';

/**
 * Input submission parameters.
 */
export interface InputSubmitParams {
  /** Input parameters */
  parameters?: Record<string, unknown>;
}

/**
 * Pipeline service for managing Jenkins pipelines.
 */
export class PipelineService {
  constructor(private readonly client: JenkinsClient) {}

  /**
   * Gets pipeline run information using the Workflow API.
   *
   * @param jobRef - Job reference (name or path)
   * @param buildRef - Build reference (number or symbolic)
   * @returns Pipeline run details
   */
  async getPipelineRun(jobRef: JobRef, buildRef: BuildRef): Promise<PipelineRun> {
    const jobPath = jobRefToPath(jobRef);
    const buildPath = buildRefToPath(buildRef);
    const response = await this.client.get<PipelineRun>(
      `/${jobPath}/${buildPath}/wfapi/describe`
    );
    return response.data;
  }

  /**
   * Gets pipeline stages.
   *
   * @param jobRef - Job reference (name or path)
   * @param buildRef - Build reference (number or symbolic)
   * @returns Array of pipeline stages
   */
  async getPipelineStages(jobRef: JobRef, buildRef: BuildRef): Promise<Stage[]> {
    const pipelineRun = await this.getPipelineRun(jobRef, buildRef);
    return pipelineRun.stages || [];
  }

  /**
   * Gets logs for a specific pipeline stage.
   *
   * @param jobRef - Job reference (name or path)
   * @param buildRef - Build reference (number or symbolic)
   * @param stageId - Stage identifier
   * @returns Stage log content
   */
  async getStageLogs(
    jobRef: JobRef,
    buildRef: BuildRef,
    stageId: string
  ): Promise<string> {
    const jobPath = jobRefToPath(jobRef);
    const buildPath = buildRefToPath(buildRef);
    const response = await this.client.get<string>(
      `/${jobPath}/${buildPath}/execution/node/${stageId}/wfapi/log`,
      { headers: { Accept: 'text/plain' } }
    );
    return response.data;
  }

  /**
   * Submits input for a pipeline waiting for user input.
   *
   * @param jobRef - Job reference (name or path)
   * @param buildRef - Build reference (number or symbolic)
   * @param inputId - Input step identifier
   * @param params - Input parameters
   */
  async submitInput(
    jobRef: JobRef,
    buildRef: BuildRef,
    inputId: string,
    params?: InputSubmitParams
  ): Promise<void> {
    const jobPath = jobRefToPath(jobRef);
    const buildPath = buildRefToPath(buildRef);

    await this.client.post(
      `/${jobPath}/${buildPath}/input/${inputId}/submit`,
      params?.parameters || {}
    );
  }

  /**
   * Aborts a pipeline input step.
   *
   * @param jobRef - Job reference (name or path)
   * @param buildRef - Build reference (number or symbolic)
   * @param inputId - Input step identifier
   */
  async abortInput(
    jobRef: JobRef,
    buildRef: BuildRef,
    inputId: string
  ): Promise<void> {
    const jobPath = jobRefToPath(jobRef);
    const buildPath = buildRefToPath(buildRef);

    await this.client.post(`/${jobPath}/${buildPath}/input/${inputId}/abort`);
  }
}
