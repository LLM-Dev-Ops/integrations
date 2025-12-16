/**
 * Buildkite artifact types.
 *
 * @module types/artifact
 */

/**
 * Artifact state.
 */
export enum ArtifactState {
  /** New artifact. */
  New = 'new',
  /** Error processing artifact. */
  Error = 'error',
  /** Artifact finished processing. */
  Finished = 'finished',
  /** Artifact was deleted. */
  Deleted = 'deleted',
}

/**
 * Buildkite artifact.
 */
export interface Artifact {
  /** Artifact ID. */
  readonly id: string;
  /** Job ID that created this artifact. */
  readonly job_id: string;
  /** Artifact path. */
  readonly path: string;
  /** Artifact state. */
  readonly state: ArtifactState;
  /** SHA1 checksum. */
  readonly sha1sum: string;
  /** File size in bytes. */
  readonly file_size: number;
  /** Glob path pattern. */
  readonly glob_path: string;
  /** Original path. */
  readonly original_path: string;
  /** Download URL. */
  readonly download_url: string;
}

/**
 * Artifact with content.
 */
export interface ArtifactContent {
  /** Artifact metadata. */
  readonly artifact: Artifact;
  /** Artifact binary content. */
  readonly content: Uint8Array;
}
