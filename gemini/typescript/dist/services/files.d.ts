/**
 * Files service for Gemini API.
 */
import type { GeminiFile, UploadFileRequest, ListFilesParams, ListFilesResponse } from '../types/index.js';
import type { HttpClient } from '../client/index.js';
import type { ResolvedGeminiConfig } from '../config/index.js';
import { BaseServiceWithConfig } from './base.js';
/**
 * Service for file upload and management.
 */
export interface FilesService {
    /**
     * Upload a file.
     * @param request - The upload request
     * @returns The uploaded file metadata
     */
    upload(request: UploadFileRequest): Promise<GeminiFile>;
    /**
     * List uploaded files.
     * @param params - Optional pagination parameters
     * @returns The list of files
     */
    list(params?: ListFilesParams): Promise<ListFilesResponse>;
    /**
     * Get file metadata.
     * @param fileName - The file name
     * @returns The file metadata
     */
    get(fileName: string): Promise<GeminiFile>;
    /**
     * Delete a file.
     * @param fileName - The file name
     */
    delete(fileName: string): Promise<void>;
    /**
     * Wait for a file to reach ACTIVE state.
     * @param fileName - The file name
     * @param timeout - Maximum time to wait in milliseconds (default: 120000)
     * @param pollInterval - Polling interval in milliseconds (default: 1000)
     * @returns The file metadata when ACTIVE
     */
    waitForActive(fileName: string, timeout?: number, pollInterval?: number): Promise<GeminiFile>;
}
/**
 * Implementation of FilesService.
 */
export declare class FilesServiceImpl extends BaseServiceWithConfig implements FilesService {
    private static readonly DEFAULT_WAIT_TIMEOUT;
    private static readonly DEFAULT_POLL_INTERVAL;
    private readonly uploadBaseUrl;
    constructor(httpClient: HttpClient, config: ResolvedGeminiConfig);
    upload(request: UploadFileRequest): Promise<GeminiFile>;
    list(params?: ListFilesParams): Promise<ListFilesResponse>;
    get(fileName: string): Promise<GeminiFile>;
    delete(fileName: string): Promise<void>;
    waitForActive(fileName: string, timeout?: number, pollInterval?: number): Promise<GeminiFile>;
}
//# sourceMappingURL=files.d.ts.map