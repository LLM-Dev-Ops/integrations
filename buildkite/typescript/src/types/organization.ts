/**
 * Buildkite organization types.
 *
 * @module types/organization
 */

/**
 * Buildkite organization.
 */
export interface Organization {
  /** Organization ID. */
  readonly id: string;
  /** GraphQL ID. */
  readonly graphql_id: string;
  /** Organization slug (URL-friendly identifier). */
  readonly slug: string;
  /** Organization name. */
  readonly name: string;
  /** API URL. */
  readonly url: string;
  /** Web URL. */
  readonly web_url: string;
  /** Pipelines API URL. */
  readonly pipelines_url: string;
  /** Agents API URL. */
  readonly agents_url: string;
  /** Creation time. */
  readonly created_at: string;
}
