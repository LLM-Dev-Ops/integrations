/**
 * File-related types for the Gemini API.
 */
/** File processing state */
export type FileState = 'PROCESSING' | 'ACTIVE' | 'FAILED';
/** File metadata */
export interface GeminiFile {
    name: string;
    displayName?: string;
    mimeType?: string;
    sizeBytes?: string;
    createTime?: string;
    updateTime?: string;
    expirationTime?: string;
    sha256Hash?: string;
    uri?: string;
    state?: FileState;
}
/** Request for file upload */
export interface UploadFileRequest {
    displayName?: string;
    fileData: Uint8Array;
    mimeType: string;
}
/** Parameters for listing files */
export interface ListFilesParams {
    pageSize?: number;
    pageToken?: string;
}
/** Response from listing files */
export interface ListFilesResponse {
    files: GeminiFile[];
    nextPageToken?: string;
}
//# sourceMappingURL=files.d.ts.map