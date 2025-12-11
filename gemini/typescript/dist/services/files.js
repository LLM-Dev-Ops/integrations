/**
 * Files service for Gemini API.
 */
import { ValidationError, FileProcessingError, GeminiError } from '../error/index.js';
import { BaseServiceWithConfig } from './base.js';
/**
 * Implementation of FilesService.
 */
export class FilesServiceImpl extends BaseServiceWithConfig {
    static DEFAULT_WAIT_TIMEOUT = 120_000; // 2 minutes
    static DEFAULT_POLL_INTERVAL = 1_000; // 1 second
    uploadBaseUrl;
    constructor(httpClient, config) {
        super(httpClient, config);
        // Files use a different base URL
        this.uploadBaseUrl = 'https://generativelanguage.googleapis.com';
    }
    async upload(request) {
        if (!request.fileData || request.fileData.length === 0) {
            throw new ValidationError('File data cannot be empty');
        }
        if (!request.mimeType) {
            throw new ValidationError('MIME type is required');
        }
        // Create multipart form data
        const boundary = `----WebKitFormBoundary${Date.now()}${Math.random().toString(36)}`;
        const formData = [];
        // Add metadata part
        const metadata = {};
        if (request.displayName) {
            metadata.file = { displayName: request.displayName };
        }
        formData.push(`--${boundary}`);
        formData.push('Content-Type: application/json; charset=UTF-8');
        formData.push('');
        formData.push(JSON.stringify(metadata));
        // Add file data part
        formData.push(`--${boundary}`);
        formData.push(`Content-Type: ${request.mimeType}`);
        formData.push('');
        formData.push(''); // Will be replaced with binary data
        const textParts = formData.join('\r\n');
        const ending = `\r\n--${boundary}--\r\n`;
        // Combine text and binary parts
        const encoder = new TextEncoder();
        const textBytes = encoder.encode(textParts);
        const endingBytes = encoder.encode(ending);
        const totalLength = textBytes.length + request.fileData.length + endingBytes.length;
        const body = new Uint8Array(totalLength);
        let offset = 0;
        body.set(textBytes, offset);
        offset += textBytes.length;
        body.set(request.fileData, offset);
        offset += request.fileData.length;
        body.set(endingBytes, offset);
        // Build URL with API key
        const url = new URL(`${this.uploadBaseUrl}/upload/${this.config.apiVersion}/files`);
        if (this.config.authMethod === 'queryParam') {
            url.searchParams.set('key', this.config.apiKey);
        }
        const headers = {
            'Content-Type': `multipart/related; boundary=${boundary}`,
            'Content-Length': totalLength.toString(),
        };
        if (this.config.authMethod === 'header') {
            headers['x-goog-api-key'] = this.config.apiKey;
        }
        const response = await this.fetch(url.toString(), {
            method: 'POST',
            headers,
            body,
        });
        const data = await response.json();
        return data.file;
    }
    async list(params) {
        if (params?.pageSize !== undefined && params.pageSize < 1) {
            throw new ValidationError('PageSize must be positive');
        }
        const queryParams = {};
        if (params?.pageSize !== undefined) {
            queryParams.pageSize = params.pageSize.toString();
        }
        if (params?.pageToken) {
            queryParams.pageToken = params.pageToken;
        }
        const url = this.buildUrl('files', queryParams);
        const headers = this.getHeaders();
        const response = await this.fetch(url, {
            method: 'GET',
            headers,
        });
        const data = await response.json();
        return data;
    }
    async get(fileName) {
        if (!fileName) {
            throw new ValidationError('File name cannot be empty');
        }
        // Normalize file name
        const name = fileName.startsWith('files/') ? fileName : `files/${fileName}`;
        const url = this.buildUrl(name);
        const headers = this.getHeaders();
        const response = await this.fetch(url, {
            method: 'GET',
            headers,
        });
        const data = await response.json();
        return data;
    }
    async delete(fileName) {
        if (!fileName) {
            throw new ValidationError('File name cannot be empty');
        }
        // Normalize file name
        const name = fileName.startsWith('files/') ? fileName : `files/${fileName}`;
        const url = this.buildUrl(name);
        const headers = this.getHeaders();
        await this.fetch(url, {
            method: 'DELETE',
            headers,
        });
    }
    async waitForActive(fileName, timeout = FilesServiceImpl.DEFAULT_WAIT_TIMEOUT, pollInterval = FilesServiceImpl.DEFAULT_POLL_INTERVAL) {
        if (timeout < 0) {
            throw new ValidationError('Timeout must be non-negative');
        }
        if (pollInterval < 100) {
            throw new ValidationError('Poll interval must be at least 100ms');
        }
        const startTime = Date.now();
        while (true) {
            const file = await this.get(fileName);
            if (file.state === 'ACTIVE') {
                return file;
            }
            if (file.state === 'FAILED') {
                throw new FileProcessingError(fileName, 'File processing failed');
            }
            const elapsed = Date.now() - startTime;
            if (elapsed >= timeout) {
                throw new GeminiError({
                    type: 'timeout_error',
                    message: `File did not become active within ${timeout}ms`,
                    isRetryable: false,
                });
            }
            // Wait before polling again
            await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }
    }
}
//# sourceMappingURL=files.js.map