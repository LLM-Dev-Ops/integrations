/**
 * HTTP Transport Layer for Firestore
 *
 * Provides HTTP request/response handling for Firestore REST API operations.
 * Firestore uses REST API at https://firestore.googleapis.com/v1/
 */

import { NetworkError } from "../error/index.js";
import type { FirestoreConfig } from "../config/index.js";

/**
 * HTTP request.
 */
export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string | Buffer;
  timeout?: number;
}

/**
 * HTTP response.
 */
export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Transport interface.
 */
export interface HttpTransport {
  /**
   * Send an HTTP request.
   */
  send(request: HttpRequest): Promise<HttpResponse>;
}

/**
 * Check if HTTP status indicates success.
 * @param status - HTTP status code
 * @returns True if status is in 2xx range
 */
export function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * Get request ID from response headers.
 * @param response - HTTP response
 * @returns Request ID if present
 */
export function getRequestId(response: HttpResponse): string | undefined {
  return getHeader(response, "x-goog-request-id") ?? getHeader(response, "x-request-id");
}

/**
 * Get a header value (case-insensitive).
 * @param response - HTTP response
 * @param name - Header name
 * @returns Header value if present
 */
export function getHeader(response: HttpResponse, name: string): string | undefined {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(response.headers)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }
  return undefined;
}

/**
 * Get content type from response.
 * @param response - HTTP response
 * @returns Content type header value
 */
export function getContentType(response: HttpResponse): string | undefined {
  return getHeader(response, "content-type");
}

/**
 * Fetch-based HTTP transport for Firestore.
 * Handles timeout via AbortController and converts responses to our format.
 */
export class FetchTransport implements HttpTransport {
  private defaultTimeout: number;

  /**
   * Create a new FetchTransport.
   * @param defaultTimeout - Default timeout in milliseconds (default: 60000)
   */
  constructor(defaultTimeout: number = 60000) {
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Send an HTTP request.
   * @param request - HTTP request to send
   * @returns HTTP response
   * @throws {NetworkError} If the request fails
   */
  async send(request: HttpRequest): Promise<HttpResponse> {
    const timeout = request.timeout ?? this.defaultTimeout;

    try {
      // Convert Buffer to string if needed for fetch
      const requestBody = request.body
        ? Buffer.isBuffer(request.body)
          ? request.body.toString("utf-8")
          : request.body
        : undefined;

      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: requestBody,
        signal: AbortSignal.timeout(timeout),
      });

      // Convert headers to plain object
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      // Read body as text
      const responseBody = await response.text();

      return {
        status: response.status,
        headers,
        body: responseBody,
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError" || error.name === "TimeoutError") {
          throw new NetworkError(`Request timeout after ${timeout}ms`, "Timeout");
        }
        if (error.message.includes("ENOTFOUND") || error.message.includes("DNS")) {
          throw new NetworkError(
            `DNS resolution failed: ${error.message}`,
            "DnsResolutionFailed"
          );
        }
        if (error.message.includes("ECONNREFUSED") || error.message.includes("ECONNRESET")) {
          throw new NetworkError(`Connection failed: ${error.message}`, "ConnectionFailed");
        }
        if (error.message.includes("TLS") || error.message.includes("SSL")) {
          throw new NetworkError(`TLS error: ${error.message}`, "TlsError");
        }
        throw new NetworkError(error.message, "ConnectionFailed");
      }
      throw new NetworkError(String(error), "ConnectionFailed");
    }
  }
}

/**
 * Create an HTTP request for Firestore API.
 * @param method - HTTP method (GET, POST, PATCH, DELETE)
 * @param path - API path (e.g., "/documents/collection/doc")
 * @param config - Firestore configuration
 * @param body - Optional request body
 * @returns HTTP request object
 */
export function createRequest(
  method: string,
  path: string,
  config: FirestoreConfig,
  body?: string | Buffer
): HttpRequest {
  const url = buildFirestoreUrl(config, path);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Add authorization header if not using emulator
  if (!config.use_emulator) {
    // Authorization header will be added by the caller with the access token
    // This is just the base request creation
  }

  return {
    method,
    url,
    headers,
    body,
    timeout: config.request_timeout_ms,
  };
}

/**
 * Build Firestore API URL.
 * @param config - Firestore configuration
 * @param path - API path
 * @returns Full URL
 */
export function buildFirestoreUrl(config: FirestoreConfig, path: string): string {
  // Use emulator endpoint if configured
  if (config.use_emulator && config.endpoint) {
    const base = config.endpoint.endsWith("/") ? config.endpoint.slice(0, -1) : config.endpoint;
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${base}/v1${cleanPath}`;
  }

  // Use production Firestore API
  const base = "https://firestore.googleapis.com";
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}/v1${cleanPath}`;
}

/**
 * Build the parent path for Firestore operations.
 * Format: projects/{project_id}/databases/{database_id}
 * @param config - Firestore configuration
 * @returns Parent path
 */
export function buildParentPath(config: FirestoreConfig): string {
  return `projects/${config.project_id}/databases/${config.database_id}`;
}

/**
 * Build the documents path for Firestore operations.
 * Format: projects/{project_id}/databases/{database_id}/documents
 * @param config - Firestore configuration
 * @returns Documents path
 */
export function buildDocumentsPath(config: FirestoreConfig): string {
  return `${buildParentPath(config)}/documents`;
}

/**
 * Build the full document path for a specific document.
 * Format: projects/{project_id}/databases/{database_id}/documents/{collection_path}/{document_id}
 * @param config - Firestore configuration
 * @param collectionPath - Collection path (may include subcollections)
 * @param documentId - Document ID
 * @returns Full document path
 */
export function buildDocumentPath(
  config: FirestoreConfig,
  collectionPath: string,
  documentId: string
): string {
  const documentsPath = buildDocumentsPath(config);
  const cleanCollectionPath = collectionPath.startsWith("/")
    ? collectionPath.slice(1)
    : collectionPath;
  return `${documentsPath}/${cleanCollectionPath}/${documentId}`;
}

/**
 * Build the collection path.
 * Format: projects/{project_id}/databases/{database_id}/documents/{collection_path}
 * @param config - Firestore configuration
 * @param collectionPath - Collection path
 * @returns Full collection path
 */
export function buildCollectionPath(config: FirestoreConfig, collectionPath: string): string {
  const documentsPath = buildDocumentsPath(config);
  const cleanCollectionPath = collectionPath.startsWith("/")
    ? collectionPath.slice(1)
    : collectionPath;
  return `${documentsPath}/${cleanCollectionPath}`;
}

/**
 * Parse a Firestore document name into components.
 * @param documentName - Full document name/path
 * @returns Parsed components
 */
export function parseDocumentName(documentName: string): {
  projectId: string;
  databaseId: string;
  collectionPath: string;
  documentId: string;
} {
  const pattern = /^projects\/([^/]+)\/databases\/([^/]+)\/documents\/(.+)\/([^/]+)$/;
  const match = documentName.match(pattern);

  if (!match) {
    throw new Error(`Invalid document name: ${documentName}`);
  }

  return {
    projectId: match[1],
    databaseId: match[2],
    collectionPath: match[3],
    documentId: match[4],
  };
}

/**
 * Create a fetch-based transport.
 * @param timeout - Optional timeout in milliseconds
 * @returns HTTP transport instance
 */
export function createTransport(timeout?: number): HttpTransport {
  return new FetchTransport(timeout);
}

/**
 * Add authorization header to request.
 * @param request - HTTP request
 * @param accessToken - Access token
 * @returns Request with authorization header
 */
export function withAuthorization(request: HttpRequest, accessToken: string): HttpRequest {
  return {
    ...request,
    headers: {
      ...request.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

/**
 * Add query parameters to URL.
 * @param url - Base URL
 * @param params - Query parameters
 * @returns URL with query parameters
 */
export function addQueryParams(url: string, params: Record<string, string>): string {
  const urlObj = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      urlObj.searchParams.set(key, value);
    }
  }
  return urlObj.toString();
}
