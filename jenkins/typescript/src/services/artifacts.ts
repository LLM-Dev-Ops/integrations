/**
 * Jenkins Artifact Service
 * Provides operations for listing, accessing metadata, and downloading
 * build artifacts from Jenkins.
 */

import type { JenkinsClient } from '../client/index.js';
import type { JobRef, BuildRef } from '../types/refs.js';
import type { Artifact } from '../types/resources.js';
import { jobRefToPath, buildRefToPath } from '../types/refs.js';
import { JenkinsError, JenkinsErrorKind } from '../types/errors.js';

/**
 * Artifact service for managing Jenkins build artifacts.
 */
export class ArtifactService {
  constructor(private readonly client: JenkinsClient) {}

  /**
   * Lists all artifacts for a build.
   *
   * @param jobRef - Job reference (name or path)
   * @param buildRef - Build reference (number or symbolic)
   * @returns Array of artifacts
   */
  async listArtifacts(jobRef: JobRef, buildRef: BuildRef): Promise<Artifact[]> {
    const jobPath = jobRefToPath(jobRef);
    const buildPath = buildRefToPath(buildRef);

    const response = await this.client.get<{ artifacts: Artifact[] }>(
      `/${jobPath}/${buildPath}/api/json`,
      { query: { tree: 'artifacts[fileName,relativePath,displayPath]' } }
    );

    return response.data.artifacts || [];
  }

  /**
   * Gets metadata for a specific artifact.
   *
   * @param jobRef - Job reference (name or path)
   * @param buildRef - Build reference (number or symbolic)
   * @param path - Relative path to the artifact
   * @returns Artifact metadata
   */
  async getArtifactMetadata(
    jobRef: JobRef,
    buildRef: BuildRef,
    path: string
  ): Promise<Artifact> {
    const artifacts = await this.listArtifacts(jobRef, buildRef);
    const artifact = artifacts.find(a => a.relativePath === path);

    if (!artifact) {
      throw new JenkinsError(
        JenkinsErrorKind.NotFound,
        `Artifact not found: ${path}`
      );
    }

    return artifact;
  }

  /**
   * Downloads an artifact as a string.
   *
   * @param jobRef - Job reference (name or path)
   * @param buildRef - Build reference (number or symbolic)
   * @param path - Relative path to the artifact
   * @returns Artifact content as string
   */
  async downloadArtifact(
    jobRef: JobRef,
    buildRef: BuildRef,
    path: string
  ): Promise<string> {
    const jobPath = jobRefToPath(jobRef);
    const buildPath = buildRefToPath(buildRef);

    const response = await this.client.get<string>(
      `/${jobPath}/${buildPath}/artifact/${path}`,
      { headers: { Accept: '*/*' } }
    );

    return response.data;
  }
}
