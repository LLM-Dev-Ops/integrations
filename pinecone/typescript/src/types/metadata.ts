/**
 * Valid metadata value types in Pinecone
 */
export type MetadataValue = string | number | boolean | string[];

/**
 * Metadata associated with a vector
 *
 * Metadata is a set of key-value pairs that can be attached to vectors.
 * These can be used for filtering during queries and provide additional
 * context about the vectors.
 */
export type Metadata = Record<string, MetadataValue>;
