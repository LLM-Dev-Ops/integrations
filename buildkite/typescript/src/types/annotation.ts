/**
 * Buildkite annotation types.
 *
 * @module types/annotation
 */

/**
 * Annotation style.
 */
export enum AnnotationStyle {
  /** Success annotation. */
  Success = 'success',
  /** Info annotation. */
  Info = 'info',
  /** Warning annotation. */
  Warning = 'warning',
  /** Error annotation. */
  Error = 'error',
}

/**
 * Buildkite annotation.
 */
export interface Annotation {
  /** Annotation ID. */
  readonly id: string;
  /** Annotation context (identifier). */
  readonly context: string;
  /** Annotation style. */
  readonly style: AnnotationStyle;
  /** Annotation body (HTML). */
  readonly body_html: string;
  /** Creation time. */
  readonly created_at: string;
  /** Last update time. */
  readonly updated_at: string;
}

/**
 * Request to create an annotation.
 */
export interface CreateAnnotationRequest {
  /** Annotation context (identifier). */
  context: string;
  /** Annotation style. */
  style: AnnotationStyle;
  /** Annotation body (markdown or HTML). */
  body: string;
  /** Whether to append to existing annotation. */
  append?: boolean;
}
