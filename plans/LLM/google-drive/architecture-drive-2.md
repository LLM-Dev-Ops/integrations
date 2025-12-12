# Google Drive Integration - Architecture Document (Part 2)

**SPARC Phase 3: Architecture - Core Interfaces & Data Flow**
**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/google-drive`

---

## Table of Contents

7. [Core Interfaces - TypeScript](#7-core-interfaces---typescript)
8. [Data Flow Architecture](#8-data-flow-architecture)
9. [Authentication Architecture](#9-authentication-architecture)
10. [State Management](#10-state-management)

---

## 7. Core Interfaces - TypeScript

### 7.1 GoogleDriveClient Interface

```typescript
/**
 * Main client for interacting with Google Drive API.
 */
interface GoogleDriveClient {
  /** Access the files service. */
  readonly files: FilesService;

  /** Access the permissions service. */
  readonly permissions: PermissionsService;

  /** Access the comments service. */
  readonly comments: CommentsService;

  /** Access the replies service. */
  readonly replies: RepliesService;

  /** Access the revisions service. */
  readonly revisions: RevisionsService;

  /** Access the changes service. */
  readonly changes: ChangesService;

  /** Access the drives service (shared drives). */
  readonly drives: DrivesService;

  /** Access the about service. */
  readonly about: AboutService;

  /** Get storage quota information. */
  getStorageQuota(): Promise<StorageQuota>;
}
```

### 7.2 AuthProvider Interface

```typescript
/**
 * Authentication provider abstraction.
 */
interface AuthProvider {
  /** Get an access token for API requests. */
  getAccessToken(): Promise<AccessToken>;

  /** Force refresh the access token. */
  refreshToken(): Promise<AccessToken>;

  /** Check if the current token is expired. */
  isExpired(): boolean;
}

/**
 * Access token with metadata.
 */
interface AccessToken {
  token: string;
  tokenType: string;
  expiresAt: Date;
  scopes: string[];
}

/**
 * OAuth 2.0 credentials.
 */
interface OAuth2Credentials {
  type: 'oauth2';
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
  expiresAt?: Date;
}

/**
 * Service account credentials.
 */
interface ServiceAccountCredentials {
  type: 'service_account';
  clientEmail: string;
  privateKey: string;
  privateKeyId?: string;
  projectId?: string;
  scopes: string[];
  subject?: string; // For domain-wide delegation
}
```

### 7.3 Service Interfaces

#### 7.3.1 FilesService

```typescript
interface FilesService {
  /** Create a new file (metadata only). */
  create(request: CreateFileRequest): Promise<DriveFile>;

  /** Create a file with content (simple upload, ≤5MB). */
  createWithContent(request: CreateFileWithContentRequest): Promise<DriveFile>;

  /** Create a file with content using multipart upload. */
  createMultipart(request: CreateMultipartRequest): Promise<DriveFile>;

  /** Create a file with content using resumable upload (large files). */
  createResumable(request: CreateResumableRequest): Promise<ResumableUploadSession>;

  /** Get file metadata. */
  get(fileId: string, params?: GetFileParams): Promise<DriveFile>;

  /** Download file content. */
  download(fileId: string, params?: DownloadParams): Promise<ArrayBuffer>;

  /** Download file content as a stream. */
  downloadStream(fileId: string, params?: DownloadParams): Promise<ReadableStream<Uint8Array>>;

  /** List files with optional query. */
  list(params?: ListFilesParams): Promise<FileList>;

  /** List all files with auto-pagination. */
  listAll(params?: ListFilesParams): AsyncIterable<DriveFile>;

  /** Update file metadata. */
  update(fileId: string, request: UpdateFileRequest): Promise<DriveFile>;

  /** Delete a file permanently. */
  delete(fileId: string, params?: DeleteFileParams): Promise<void>;

  /** Copy a file. */
  copy(fileId: string, request: CopyFileRequest): Promise<DriveFile>;

  /** Export a Google Workspace file. */
  export(fileId: string, mimeType: string): Promise<ArrayBuffer>;

  /** Move a file to a different folder. */
  moveFile(fileId: string, addParents: string[], removeParents: string[]): Promise<DriveFile>;

  /** Create a folder. */
  createFolder(request: CreateFolderRequest): Promise<DriveFile>;
}
```

#### 7.3.2 PermissionsService

```typescript
interface PermissionsService {
  /** Create a new permission. */
  create(fileId: string, request: CreatePermissionRequest): Promise<Permission>;

  /** List permissions for a file. */
  list(fileId: string, params?: ListPermissionsParams): Promise<PermissionList>;

  /** Get a specific permission. */
  get(fileId: string, permissionId: string, params?: GetPermissionParams): Promise<Permission>;

  /** Update a permission. */
  update(fileId: string, permissionId: string, request: UpdatePermissionRequest): Promise<Permission>;

  /** Delete a permission. */
  delete(fileId: string, permissionId: string, params?: DeletePermissionParams): Promise<void>;
}
```

#### 7.3.3 ChangesService

```typescript
interface ChangesService {
  /** Get the start page token for change tracking. */
  getStartPageToken(params?: GetStartPageTokenParams): Promise<StartPageToken>;

  /** List changes since a page token. */
  list(pageToken: string, params?: ListChangesParams): Promise<ChangeList>;

  /** List all changes with auto-pagination. */
  listAll(startPageToken: string, params?: ListChangesParams): AsyncIterable<Change>;

  /** Watch for changes via push notifications. */
  watch(pageToken: string, request: WatchChangesRequest): Promise<Channel>;

  /** Stop watching for changes. */
  stopWatch(channel: Channel): Promise<void>;
}
```

### 7.4 Zod Schemas

```typescript
import { z } from 'zod';

/**
 * Drive file schema.
 */
const DriveFileSchema = z.object({
  kind: z.literal('drive#file'),
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  description: z.string().optional(),
  starred: z.boolean(),
  trashed: z.boolean(),
  explicitlyTrashed: z.boolean(),
  parents: z.array(z.string()).optional(),
  properties: z.record(z.string()).optional(),
  appProperties: z.record(z.string()).optional(),
  spaces: z.array(z.string()),
  version: z.string(),
  webContentLink: z.string().optional(),
  webViewLink: z.string().optional(),
  iconLink: z.string().optional(),
  hasThumbnail: z.boolean(),
  thumbnailLink: z.string().optional(),
  viewedByMe: z.boolean(),
  viewedByMeTime: z.string().optional(),
  createdTime: z.string(),
  modifiedTime: z.string(),
  modifiedByMeTime: z.string().optional(),
  modifiedByMe: z.boolean(),
  shared: z.boolean(),
  ownedByMe: z.boolean(),
  size: z.string().optional(),
  quotaBytesUsed: z.string().optional(),
  headRevisionId: z.string().optional(),
  md5Checksum: z.string().optional(),
  sha1Checksum: z.string().optional(),
  sha256Checksum: z.string().optional(),
  capabilities: z.record(z.boolean()).optional(),
});

/**
 * Permission schema.
 */
const PermissionSchema = z.object({
  kind: z.literal('drive#permission'),
  id: z.string(),
  type: z.enum(['user', 'group', 'domain', 'anyone']),
  role: z.enum(['owner', 'organizer', 'fileOrganizer', 'writer', 'commenter', 'reader']),
  emailAddress: z.string().email().optional(),
  domain: z.string().optional(),
  displayName: z.string().optional(),
  photoLink: z.string().url().optional(),
  expirationTime: z.string().optional(),
  deleted: z.boolean().optional(),
  pendingOwner: z.boolean().optional(),
});

/**
 * File list schema.
 */
const FileListSchema = z.object({
  kind: z.literal('drive#fileList'),
  nextPageToken: z.string().optional(),
  incompleteSearch: z.boolean(),
  files: z.array(DriveFileSchema),
});

/**
 * Change schema.
 */
const ChangeSchema = z.object({
  kind: z.literal('drive#change'),
  removed: z.boolean(),
  file: DriveFileSchema.optional(),
  fileId: z.string(),
  time: z.string(),
  type: z.enum(['file', 'drive']),
  changeType: z.string().optional(),
  driveId: z.string().optional(),
});

/**
 * Change list schema.
 */
const ChangeListSchema = z.object({
  kind: z.literal('drive#changeList'),
  nextPageToken: z.string().optional(),
  newStartPageToken: z.string().optional(),
  changes: z.array(ChangeSchema),
});

/**
 * Storage quota schema.
 */
const StorageQuotaSchema = z.object({
  limit: z.string(),
  usage: z.string(),
  usageInDrive: z.string().optional(),
  usageInDriveTrash: z.string().optional(),
});

/**
 * Request schemas.
 */
const CreateFileRequestSchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().optional(),
  description: z.string().optional(),
  parents: z.array(z.string()).optional(),
  properties: z.record(z.string()).optional(),
  appProperties: z.record(z.string()).optional(),
  starred: z.boolean().optional(),
});

const ListFilesParamsSchema = z.object({
  corpora: z.enum(['user', 'drive', 'allDrives']).optional(),
  driveId: z.string().optional(),
  includeItemsFromAllDrives: z.boolean().optional(),
  orderBy: z.string().optional(),
  pageSize: z.number().int().min(1).max(1000).optional(),
  pageToken: z.string().optional(),
  q: z.string().optional(),
  spaces: z.string().optional(),
  supportsAllDrives: z.boolean().optional(),
  fields: z.string().optional(),
});
```

---

## 8. Data Flow Architecture

### 8.1 Request Pipeline

```
┌─────────────┐
│   Client    │
│  (User Code)│
└──────┬──────┘
       │ 1. Call service method
       │    files.create(request)
       ▼
┌─────────────────────┐
│  FilesService       │
│  - Validate request │
│  - Build metadata   │
└──────┬──────────────┘
       │ 2. Build API request
       │    ApiRequest { method, path, body, headers }
       ▼
┌─────────────────────┐
│  RequestExecutor    │
│  - Add auth token   │
│  - Apply resilience │
└──────┬──────────────┘
       │ 3. Execute with retry/circuit breaker
       │
       ▼
┌─────────────────────┐
│   AuthProvider      │
│  - Get token        │
│  - Refresh if needed│
└──────┬──────────────┘
       │ 4. Add Authorization header
       │    "Bearer <access_token>"
       ▼
┌─────────────────────┐
│  HttpTransport      │
│  - Send HTTP request│
│  - Connection pool  │
└──────┬──────────────┘
       │ 5. HTTPS request
       │    POST /drive/v3/files
       ▼
┌─────────────────────┐
│  Google Drive API   │
│  (Remote Server)    │
└─────────────────────┘
```

**Step-by-Step Flow:**

1. **Client Invocation**: User calls `files.create({ name: "doc.pdf", ... })`
2. **Service Layer**: FilesService validates request and builds API request object
3. **Request Executor**: Applies retry logic, circuit breaker, rate limiting
4. **Auth Layer**: AuthProvider adds `Authorization: Bearer <token>` header
5. **Transport Layer**: HttpTransport sends HTTPS request to Google API
6. **Response**: Flows back through the same layers (see Response Pipeline)

### 8.2 Response Pipeline

```
┌─────────────────────┐
│  Google Drive API   │
│  (Remote Server)    │
└──────┬──────────────┘
       │ 1. HTTP response
       │    200 OK + JSON body
       ▼
┌─────────────────────┐
│  HttpTransport      │
│  - Receive response │
│  - Extract body     │
└──────┬──────────────┘
       │ 2. Raw response
       │    { status: 200, body: bytes, headers }
       ▼
┌─────────────────────┐
│  RequestExecutor    │
│  - Check status     │
│  - Map errors       │
└──────┬──────────────┘
       │ 3. Parse JSON
       │
       ├─ Success (200-299) ─┐
       │                      ▼
       │              ┌──────────────┐
       │              │ Parse JSON   │
       │              │ Deserialize  │
       │              └──────┬───────┘
       │                     │ 4. Type-checked object
       │                     ▼
       │              ┌──────────────┐
       │              │ FilesService │
       │              │ Return File  │
       │              └──────┬───────┘
       │                     │ 5. Domain object
       │                     ▼
       │              ┌──────────────┐
       │              │   Client     │
       │              │  (User Code) │
       │              └──────────────┘
       │
       └─ Error (400-599) ──┐
                            ▼
                     ┌──────────────┐
                     │ ErrorMapper  │
                     │ Map to typed │
                     │ error        │
                     └──────┬───────┘
                            │ 6. GoogleDriveError
                            ▼
                     ┌──────────────┐
                     │   Client     │
                     │  (Catch err) │
                     └──────────────┘
```

**Error Mapping:**

| Status | API Reason             | Mapped Error                          |
|--------|------------------------|---------------------------------------|
| 400    | `badRequest`           | `RequestError::ValidationError`       |
| 401    | `authError`            | `AuthenticationError::InvalidToken`   |
| 403    | `insufficientPermissions` | `AuthorizationError::InsufficientPermissions` |
| 403    | `userRateLimitExceeded` | `QuotaError::UserRateLimitExceeded` |
| 404    | `notFound`             | `ResourceError::FileNotFound`         |
| 429    | `rateLimitExceeded`    | `QuotaError::UserRateLimitExceeded`   |
| 500    | `internalError`        | `ServerError::InternalError`          |
| 503    | `serviceUnavailable`   | `ServerError::ServiceUnavailable`     |

### 8.3 Upload Flows

#### 8.3.1 Simple Upload (≤5MB)

```
Client
  │
  │ files.createWithContent({ name, content })
  ▼
FilesService
  │
  │ 1. Validate size ≤ 5MB
  │ 2. Detect MIME type
  ▼
RequestExecutor
  │
  │ POST /upload/drive/v3/files?uploadType=media
  │ Content-Type: application/pdf
  │ Body: <file bytes>
  ▼
Google Drive API
  │
  │ 200 OK + File metadata
  ▼
FilesService
  │
  │ 3. If additional metadata needed:
  │    PATCH /drive/v3/files/{id}
  │    (description, parents, etc.)
  ▼
Client (File object returned)
```

#### 8.3.2 Multipart Upload

```
Client
  │
  │ files.createMultipart({ name, content, metadata })
  ▼
FilesService
  │
  │ 1. Build multipart body:
  │    --boundary
  │    Content-Type: application/json
  │    { name, description, parents }
  │    --boundary
  │    Content-Type: application/pdf
  │    <file bytes>
  │    --boundary--
  ▼
RequestExecutor
  │
  │ POST /upload/drive/v3/files?uploadType=multipart
  │ Content-Type: multipart/related; boundary=<boundary>
  │ Body: <multipart body>
  ▼
Google Drive API
  │
  │ 200 OK + File metadata
  ▼
Client (File object returned)
```

#### 8.3.3 Resumable Upload (Large Files) - State Diagram

```
                   ┌──────────────┐
                   │  INITIATED   │
                   │              │
                   │ - upload_uri │
                   │ - total_size │
                   └──────┬───────┘
                          │
                          │ upload_chunk()
                          ▼
             ┌────────────────────────┐
             │    UPLOADING           │
             │                        │
             │ - bytes_uploaded       │
             │ - chunk in progress    │
             └────┬──────────────┬────┘
                  │              │
        Success   │              │ Network Error
        (308)     │              │
                  ▼              ▼
       ┌──────────────┐   ┌──────────────┐
       │ IN_PROGRESS  │   │ INTERRUPTED  │
       │              │   │              │
       │ bytes_rcvd   │   │ last_offset  │
       └──────┬───────┘   └──────┬───────┘
              │                  │
              │                  │ resume()
              │                  │ query_status()
              │ ◄────────────────┘
              │
              │ Continue uploading
              │
              ▼
    ┌──────────────────┐
    │    UPLOADING     │
    │  (next chunk)    │
    └──────┬───────────┘
           │
           │ Final chunk
           │ Success (200/201)
           ▼
    ┌──────────────┐
    │  COMPLETE    │
    │              │
    │ - File obj   │
    └──────────────┘
```

**Resumable Upload Algorithm:**

```
1. Initiate Upload:
   POST /upload/drive/v3/files?uploadType=resumable
   X-Upload-Content-Type: application/pdf
   X-Upload-Content-Length: 104857600
   Body: { name, metadata }

   Response: 200 OK
   Location: https://www.googleapis.com/upload/drive/v3/files?uploadId=<id>

2. Upload Chunks:
   LOOP offset = 0; offset < total_size; offset += chunk_size:
     chunk = content[offset : offset + chunk_size]

     PUT <upload_uri>
     Content-Length: <chunk_size>
     Content-Range: bytes <start>-<end>/<total>
     Body: <chunk>

     Response:
       308 Resume Incomplete → continue
       200/201 OK → upload complete, return File
       5xx → retry with exponential backoff

3. On Interruption:
   PUT <upload_uri>
   Content-Length: 0
   Content-Range: bytes */<total>

   Response: 308 Resume Incomplete
   Range: bytes=0-<bytes_received>

   Resume from bytes_received + 1
```

### 8.4 Download Flows

#### 8.4.1 Full Download

```
Client
  │
  │ files.download(fileId)
  ▼
FilesService
  │
  │ GET /drive/v3/files/{id}?alt=media
  ▼
HttpTransport
  │
  │ Receive full response body
  ▼
Client (ArrayBuffer/Bytes returned)
```

#### 8.4.2 Streaming Download

```
Client
  │
  │ files.downloadStream(fileId)
  ▼
FilesService
  │
  │ GET /drive/v3/files/{id}?alt=media
  ▼
HttpTransport
  │
  │ Return streaming response
  │
  ▼
ProgressTrackingStream
  │
  │ Wrap stream with progress tracking
  │
  ▼
Client
  │
  │ FOR AWAIT chunk OF stream:
  │   process(chunk)
  │   metrics.increment(bytes_downloaded)
  ▼
Done
```

### 8.5 Pagination Flow

#### 8.5.1 NextPageToken Handling

```
Request 1:
  GET /drive/v3/files?pageSize=100

  Response:
  {
    "files": [ file1, file2, ..., file100 ],
    "nextPageToken": "token_abc123"
  }

Request 2:
  GET /drive/v3/files?pageSize=100&pageToken=token_abc123

  Response:
  {
    "files": [ file101, file102, ..., file200 ],
    "nextPageToken": "token_def456"
  }

Request 3:
  GET /drive/v3/files?pageSize=100&pageToken=token_def456

  Response:
  {
    "files": [ file201, file202, ..., file250 ],
    "nextPageToken": null  // No more pages
  }
```

#### 8.5.2 PageIterator Pattern

```typescript
class PageIterator<T> implements AsyncIterable<T> {
  private currentPageToken?: string;
  private buffer: T[] = [];
  private bufferIndex = 0;

  async *[Symbol.asyncIterator]() {
    while (true) {
      // Return from buffer if available
      if (this.bufferIndex < this.buffer.length) {
        yield this.buffer[this.bufferIndex++];
        continue;
      }

      // Check if we have more pages
      if (this.currentPageToken === null) {
        return; // No more pages
      }

      // Fetch next page
      const response = await this.fetchPage(this.currentPageToken);

      // Update state
      this.buffer = response.items;
      this.bufferIndex = 0;
      this.currentPageToken = response.nextPageToken ?? null;

      // Yield first item
      if (this.buffer.length > 0) {
        yield this.buffer[this.bufferIndex++];
      }
    }
  }

  async collectAll(): Promise<T[]> {
    const results: T[] = [];
    for await (const item of this) {
      results.push(item);
    }
    return results;
  }
}

// Usage:
for await (const file of files.listAll({ q: "trashed=false" })) {
  console.log(file.name);
}
```

---

## 9. Authentication Architecture

### 9.1 OAuth 2.0 Flow

```
┌──────────────────────────────────────────────────────────┐
│  OAuth 2.0 Token Exchange                                │
└──────────────────────────────────────────────────────────┘

Initial State:
  - client_id: "abc123.apps.googleusercontent.com"
  - client_secret: "secret_xyz"
  - refresh_token: "1//refresh_token_abc"
  - cached_token: null

Request 1 (No cached token):
  │
  │ getAccessToken()
  ▼
OAuth2Provider
  │
  │ 1. Check cache: null → need to refresh
  │
  │ 2. POST https://oauth2.googleapis.com/token
  │    grant_type=refresh_token
  │    client_id=<client_id>
  │    client_secret=<client_secret>
  │    refresh_token=<refresh_token>
  ▼
Google OAuth2 Server
  │
  │ 200 OK
  │ {
  │   "access_token": "ya29.a0AfH6SMBx...",
  │   "expires_in": 3599,
  │   "scope": "https://www.googleapis.com/auth/drive",
  │   "token_type": "Bearer"
  │ }
  ▼
OAuth2Provider
  │
  │ 3. Cache token:
  │    cached_token = {
  │      token: "ya29.a0AfH6SMBx...",
  │      expiresAt: now + 3599s,
  │      scopes: ["drive"]
  │    }
  │
  │ 4. Return token
  ▼
Client (uses token for API calls)


Request 2 (Cached token valid):
  │
  │ getAccessToken()
  ▼
OAuth2Provider
  │
  │ 1. Check cache: exists
  │ 2. Check expiry: now < expiresAt → valid
  │ 3. Return cached_token
  ▼
Client (immediate return)


Request 3 (Cached token expired):
  │
  │ getAccessToken()
  ▼
OAuth2Provider
  │
  │ 1. Check cache: exists
  │ 2. Check expiry: now >= expiresAt → expired
  │ 3. Refresh token (same as Request 1)
  │ 4. Update cache
  │ 5. Return new token
  ▼
Client
```

### 9.2 Service Account Flow

```
┌──────────────────────────────────────────────────────────┐
│  Service Account JWT Flow                                │
└──────────────────────────────────────────────────────────┘

Initial State:
  - service_account_email: "sa@project.iam.gserviceaccount.com"
  - private_key: "-----BEGIN PRIVATE KEY-----..."
  - scopes: ["https://www.googleapis.com/auth/drive"]
  - subject: "user@example.com" (optional, for domain-wide delegation)
  - cached_token: null

Request 1:
  │
  │ getAccessToken()
  ▼
ServiceAccountProvider
  │
  │ 1. Check cache: null → need to create JWT
  │
  │ 2. Build JWT header:
  │    {
  │      "alg": "RS256",
  │      "typ": "JWT"
  │    }
  │
  │ 3. Build JWT claim set:
  │    {
  │      "iss": "sa@project.iam.gserviceaccount.com",
  │      "sub": "user@example.com",  // if domain-wide delegation
  │      "scope": "https://www.googleapis.com/auth/drive",
  │      "aud": "https://oauth2.googleapis.com/token",
  │      "iat": 1609459200,  // current timestamp
  │      "exp": 1609462800   // iat + 3600 (1 hour)
  │    }
  │
  │ 4. Sign JWT with private key (RS256):
  │    signature = RSA_SHA256(private_key, base64(header) + "." + base64(claims))
  │    jwt = base64(header) + "." + base64(claims) + "." + base64(signature)
  │
  │ 5. POST https://oauth2.googleapis.com/token
  │    grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
  │    assertion=<jwt>
  ▼
Google OAuth2 Server
  │
  │ 1. Verify JWT signature
  │ 2. Validate claims (iss, aud, exp)
  │ 3. Check service account permissions
  │
  │ 200 OK
  │ {
  │   "access_token": "ya29.c.Kl6iB...",
  │   "expires_in": 3599,
  │   "token_type": "Bearer"
  │ }
  ▼
ServiceAccountProvider
  │
  │ 6. Cache token:
  │    cached_token = {
  │      token: "ya29.c.Kl6iB...",
  │      expiresAt: now + 3599s
  │    }
  │
  │ 7. Return token
  ▼
Client
```

**Domain-Wide Delegation:**
- Used when service account needs to impersonate a user
- Requires admin to grant domain-wide delegation in Google Workspace Admin Console
- `subject` field in JWT must be the user email to impersonate
- Service account must have necessary OAuth scopes authorized

### 9.3 Token Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│  Token Lifecycle Management                                 │
└─────────────────────────────────────────────────────────────┘

Timeline:
  t=0           t=3000        t=3300         t=3599        t=3600
  │             │             │              │             │
  │             │             │              │             │
  ▼             ▼             ▼              ▼             ▼
Token      Still valid   Proactive      Grace period   Expired
created                  refresh
                         threshold
                         (300s before)

State Transitions:

┌──────────────┐
│   NO_TOKEN   │  Initial state, no token cached
└──────┬───────┘
       │
       │ refresh()
       ▼
┌──────────────┐
│    VALID     │  Token exists and not expired
│              │  expiresAt > now + 300s
└──────┬───────┘
       │
       │ Time passes
       │ now + 300s >= expiresAt
       ▼
┌──────────────┐
│NEEDS_REFRESH │  Token approaching expiry
│              │  expiresAt - now < 300s
│              │  expiresAt > now
└──────┬───────┘
       │
       │ refresh() (proactive)
       │ OR wait for expiry
       ▼
┌──────────────┐
│   EXPIRED    │  Token has expired
│              │  expiresAt <= now
└──────┬───────┘
       │
       │ refresh() (forced)
       │
       └──────► Back to VALID
```

**Proactive Refresh Strategy:**

```typescript
class TokenCache {
  private token: AccessToken | null = null;
  private refreshThresholdSeconds = 300; // 5 minutes

  isExpired(): boolean {
    if (!this.token) return true;
    return new Date() >= this.token.expiresAt;
  }

  needsRefresh(): boolean {
    if (!this.token) return true;

    const now = new Date();
    const expiresAt = this.token.expiresAt;
    const thresholdDate = new Date(expiresAt.getTime() - this.refreshThresholdSeconds * 1000);

    return now >= thresholdDate;
  }

  async getToken(provider: AuthProvider): Promise<AccessToken> {
    // If expired or needs refresh, refresh proactively
    if (this.needsRefresh()) {
      this.token = await provider.refreshToken();
    }

    return this.token!;
  }
}
```

---

## 10. State Management

### 10.1 Token Cache State

```typescript
interface TokenCacheState {
  /** Cached access token. */
  token: string | null;

  /** Token expiration timestamp. */
  expiresAt: Date | null;

  /** Token scopes. */
  scopes: string[];

  /** Refresh in progress flag (prevents concurrent refreshes). */
  refreshInProgress: boolean;

  /** Last refresh error. */
  lastError: Error | null;
}

// Initial state:
{
  token: null,
  expiresAt: null,
  scopes: [],
  refreshInProgress: false,
  lastError: null
}

// After successful refresh:
{
  token: "ya29.a0AfH6SMBx...",
  expiresAt: Date("2025-12-12T10:59:59Z"),
  scopes: ["https://www.googleapis.com/auth/drive"],
  refreshInProgress: false,
  lastError: null
}

// During refresh (prevents concurrent):
{
  token: "ya29.old_token...",
  expiresAt: Date("2025-12-12T09:00:00Z"), // expired
  scopes: ["https://www.googleapis.com/auth/drive"],
  refreshInProgress: true,  // ← blocks concurrent refreshes
  lastError: null
}
```

### 10.2 Circuit Breaker States

```
┌──────────────────────────────────────────────────────────┐
│  Circuit Breaker State Machine                           │
└──────────────────────────────────────────────────────────┘

                    ┌─────────────┐
           ┌───────►│   CLOSED    │◄──────┐
           │        │             │       │
           │        │ Requests    │       │
           │        │ pass through│       │
           │        └──────┬──────┘       │
           │               │              │
           │               │ Failure      │
           │               │ Count >= 5   │
           │               ▼              │
           │        ┌─────────────┐       │
           │        │    OPEN     │       │
           │        │             │       │
           │        │ All requests│       │
           │        │ rejected    │       │
           │        └──────┬──────┘       │
           │               │              │
           │               │ Timeout      │
           │               │ (60s)        │
           │               ▼              │
           │        ┌─────────────┐       │
           │        │ HALF_OPEN   │       │
           │        │             │       │
           │        │ Limited     │       │
           │        │ requests    │       │
           │        └──┬───────┬──┘       │
           │           │       │          │
           │   Failure │       │ Success  │
           │           │       │ Count>=3 │
           │           │       │          │
           └───────────┘       └──────────┘

State Details:

CLOSED:
  - failure_count: 0-4
  - success_count: N/A
  - last_failure_time: null
  - Behavior: All requests pass through
  - Transition: failure_count >= 5 → OPEN

OPEN:
  - failure_count: >= 5
  - success_count: 0
  - last_failure_time: timestamp
  - Behavior: Reject all requests immediately with CircuitBreakerOpen error
  - Transition: (now - last_failure_time) >= 60s → HALF_OPEN

HALF_OPEN:
  - failure_count: reset to 0
  - success_count: 0-2
  - last_failure_time: null
  - Behavior: Allow limited requests (test if service recovered)
  - Transition:
    - Any failure → OPEN (back to open)
    - success_count >= 3 → CLOSED (service recovered)
```

**Circuit Breaker Configuration:**

```typescript
interface CircuitBreakerState {
  /** Current state. */
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';

  /** Consecutive failure count. */
  failureCount: number;

  /** Consecutive success count (in HALF_OPEN). */
  successCount: number;

  /** Last failure timestamp. */
  lastFailureTime: Date | null;

  /** Configuration. */
  config: {
    failureThreshold: 5;
    successThreshold: 3;
    resetTimeout: 60000; // ms
  };
}
```

### 10.3 Rate Limit Tracking

```typescript
interface RateLimitState {
  /** User queries per 100 seconds (rolling window). */
  userQueries: {
    timestamps: number[];  // Array of request timestamps
    limit: 1000;
    window: 100000;  // 100 seconds in ms
  };

  /** Project queries per day. */
  projectQueries: {
    count: number;
    resetTime: Date;  // Midnight UTC
    limit: 10_000_000;
  };

  /** Last rate limit error. */
  lastRateLimitError: {
    type: 'user' | 'project';
    timestamp: Date;
    retryAfter: number | null;  // seconds
  } | null;
}

// Tracking algorithm:
function trackRequest(state: RateLimitState): void {
  const now = Date.now();

  // Add to user queries
  state.userQueries.timestamps.push(now);

  // Remove old timestamps outside window
  const windowStart = now - state.userQueries.window;
  state.userQueries.timestamps = state.userQueries.timestamps.filter(
    t => t >= windowStart
  );

  // Increment project queries
  if (now >= state.projectQueries.resetTime.getTime()) {
    // New day, reset counter
    state.projectQueries.count = 1;
    state.projectQueries.resetTime = getNextMidnightUTC();
  } else {
    state.projectQueries.count++;
  }
}

function canMakeRequest(state: RateLimitState): boolean {
  const now = Date.now();

  // Check user rate limit
  const windowStart = now - state.userQueries.window;
  const recentRequests = state.userQueries.timestamps.filter(
    t => t >= windowStart
  ).length;

  if (recentRequests >= state.userQueries.limit) {
    return false;  // User rate limit exceeded
  }

  // Check project rate limit
  if (state.projectQueries.count >= state.projectQueries.limit) {
    return false;  // Project rate limit exceeded
  }

  return true;
}
```

### 10.4 Resumable Upload Session State

```typescript
interface ResumableUploadSessionState {
  /** Upload URI from Google. */
  uploadUri: string;

  /** Total file size. */
  totalSize: number;

  /** Bytes uploaded so far. */
  bytesUploaded: number;

  /** Chunk size for uploads. */
  chunkSize: number;

  /** Upload status. */
  status: 'initiated' | 'uploading' | 'paused' | 'interrupted' | 'complete';

  /** Last successful chunk offset. */
  lastSuccessfulOffset: number;

  /** Content type. */
  contentType: string;

  /** Retry count for current chunk. */
  retryCount: number;

  /** Last error. */
  lastError: Error | null;
}

// State transitions:
{
  // 1. Initiated
  uploadUri: "https://www.googleapis.com/upload/drive/v3/files?uploadId=xyz",
  totalSize: 104857600,
  bytesUploaded: 0,
  chunkSize: 8388608,
  status: 'initiated',
  lastSuccessfulOffset: 0,
  contentType: "application/pdf",
  retryCount: 0,
  lastError: null
}

// 2. Uploading (chunk 1 uploaded)
{
  uploadUri: "...",
  totalSize: 104857600,
  bytesUploaded: 8388608,  // 8MB
  chunkSize: 8388608,
  status: 'uploading',
  lastSuccessfulOffset: 8388608,
  contentType: "application/pdf",
  retryCount: 0,
  lastError: null
}

// 3. Interrupted (network error during chunk 2)
{
  uploadUri: "...",
  totalSize: 104857600,
  bytesUploaded: 8388608,  // Still at 8MB (chunk 2 failed)
  chunkSize: 8388608,
  status: 'interrupted',
  lastSuccessfulOffset: 8388608,
  contentType: "application/pdf",
  retryCount: 1,
  lastError: NetworkError("Connection timeout")
}

// 4. Resume (query status before retrying)
{
  uploadUri: "...",
  totalSize: 104857600,
  bytesUploaded: 8388608,  // Confirmed from server
  chunkSize: 8388608,
  status: 'uploading',
  lastSuccessfulOffset: 8388608,
  contentType: "application/pdf",
  retryCount: 1,
  lastError: null
}

// 5. Complete
{
  uploadUri: "...",
  totalSize: 104857600,
  bytesUploaded: 104857600,  // All bytes uploaded
  chunkSize: 8388608,
  status: 'complete',
  lastSuccessfulOffset: 104857600,
  contentType: "application/pdf",
  retryCount: 0,
  lastError: null
}
```

---

## Document Control

| Version | Date       | Author          | Changes                              |
|---------|------------|-----------------|--------------------------------------|
| 1.0.0   | 2025-12-12 | SPARC Generator | Initial architecture document part 2 |

---

**End of Architecture Document Part 2**

*This document describes the TypeScript interfaces, data flow patterns, authentication flows, and state management for the Google Drive integration. Continue to Part 3 for component architecture, dependency injection, and implementation patterns.*
