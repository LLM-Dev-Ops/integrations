/**
 * Model-related types for the Gemini API.
 */
/** Model information */
export interface Model {
    name: string;
    version?: string;
    displayName?: string;
    description?: string;
    inputTokenLimit?: number;
    outputTokenLimit?: number;
    supportedGenerationMethods?: string[];
    temperature?: number;
    topP?: number;
    topK?: number;
    maxTemperature?: number;
}
/** Parameters for listing models */
export interface ListModelsParams {
    pageSize?: number;
    pageToken?: string;
}
/** Response from listing models */
export interface ListModelsResponse {
    models: Model[];
    nextPageToken?: string;
}
//# sourceMappingURL=models.d.ts.map