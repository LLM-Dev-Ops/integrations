/**
 * Embedding-related types for the Gemini API.
 */
import type { Content } from './content.js';
/** Task type for embeddings */
export type TaskType = 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY' | 'CLASSIFICATION' | 'CLUSTERING';
/** Request for embedding generation */
export interface EmbedContentRequest {
    model: string;
    content: Content;
    taskType?: TaskType;
    title?: string;
    outputDimensionality?: number;
}
/** Embedding vector */
export interface Embedding {
    values: number[];
}
/** Response from embedding generation */
export interface EmbedContentResponse {
    embedding: Embedding;
}
/** Response from batch embedding generation */
export interface BatchEmbedContentsResponse {
    embeddings: Embedding[];
}
//# sourceMappingURL=embeddings.d.ts.map