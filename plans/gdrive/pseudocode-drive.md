# Google Drive Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/google-drive`

---

## Table of Contents

1. [Client Initialization](#1-client-initialization)
2. [Authentication Layer](#2-authentication-layer)
3. [Transport Layer](#3-transport-layer)
4. [Files Service](#4-files-service)
5. [Resumable Upload Session](#5-resumable-upload-session)
6. [Permissions Service](#6-permissions-service)
7. [Comments and Replies Services](#7-comments-and-replies-services)
8. [Revisions Service](#8-revisions-service)
9. [Changes Service](#9-changes-service)
10. [Drives Service](#10-drives-service)
11. [About Service](#11-about-service)
12. [Pagination Handler](#12-pagination-handler)
13. [Resilience Integration](#13-resilience-integration)
14. [Error Mapping](#14-error-mapping)

---

## 1. Client Initialization

### 1.1 GoogleDriveClient Struct/Class

#### Rust Implementation

```rust
// GoogleDriveClient: Main entry point for Google Drive API
struct GoogleDriveClient {
    config: GoogleDriveConfig,
    auth_provider: Arc<dyn AuthProvider>,
    transport: Arc<dyn HttpTransport>,
    files_service: Arc<FilesServiceImpl>,
    permissions_service: Arc<PermissionsServiceImpl>,
    comments_service: Arc<CommentsServiceImpl>,
    replies_service: Arc<RepliesServiceImpl>,
    revisions_service: Arc<RevisionsServiceImpl>,
    changes_service: Arc<ChangesServiceImpl>,
    drives_service: Arc<DrivesServiceImpl>,
    about_service: Arc<AboutServiceImpl>,
}

// Create a new GoogleDriveClient
function new_google_drive_client(config: GoogleDriveConfig) -> Result<GoogleDriveClient, GoogleDriveError> {
    // 1. Validate configuration
    if config.auth_provider is None {
        return Error(ConfigurationError::MissingCredentials("auth_provider is required"))
    }

    if config.upload_chunk_size < 256 * 1024 {
        return Error(ConfigurationError::InvalidConfiguration(
            "upload_chunk_size must be at least 256KB"
        ))
    }

    if config.upload_chunk_size % (256 * 1024) != 0 {
        return Error(ConfigurationError::InvalidConfiguration(
            "upload_chunk_size must be a multiple of 256KB"
        ))
    }

    // 2. Create HTTP transport with connection pooling
    let transport = create_http_transport(&config)

    // 3. Initialize all services with shared transport
    let files_service = Arc::new(FilesServiceImpl::new(
        Arc::clone(&transport),
        Arc::clone(&config.auth_provider),
        config.base_url.clone(),
        config.upload_url.clone(),
        config.upload_chunk_size,
    ))

    let permissions_service = Arc::new(PermissionsServiceImpl::new(
        Arc::clone(&transport),
        Arc::clone(&config.auth_provider),
        config.base_url.clone(),
    ))

    let comments_service = Arc::new(CommentsServiceImpl::new(
        Arc::clone(&transport),
        Arc::clone(&config.auth_provider),
        config.base_url.clone(),
    ))

    let replies_service = Arc::new(RepliesServiceImpl::new(
        Arc::clone(&transport),
        Arc::clone(&config.auth_provider),
        config.base_url.clone(),
    ))

    let revisions_service = Arc::new(RevisionsServiceImpl::new(
        Arc::clone(&transport),
        Arc::clone(&config.auth_provider),
        config.base_url.clone(),
    ))

    let changes_service = Arc::new(ChangesServiceImpl::new(
        Arc::clone(&transport),
        Arc::clone(&config.auth_provider),
        config.base_url.clone(),
    ))

    let drives_service = Arc::new(DrivesServiceImpl::new(
        Arc::clone(&transport),
        Arc::clone(&config.auth_provider),
        config.base_url.clone(),
    ))

    let about_service = Arc::new(AboutServiceImpl::new(
        Arc::clone(&transport),
        Arc::clone(&config.auth_provider),
        config.base_url.clone(),
    ))

    // 4. Return initialized client
    return Ok(GoogleDriveClient {
        config,
        auth_provider,
        transport,
        files_service,
        permissions_service,
        comments_service,
        replies_service,
        revisions_service,
        changes_service,
        drives_service,
        about_service,
    })
}

// Create HTTP transport with reqwest
function create_http_transport(config: &GoogleDriveConfig) -> Arc<dyn HttpTransport> {
    // 1. Build reqwest client with connection pooling
    let client_builder = reqwest::Client::builder()
        .timeout(config.timeout)
        .pool_max_idle_per_host(10)
        .pool_idle_timeout(Some(Duration::from_secs(90)))
        .use_rustls_tls()  // Enforce TLS 1.2+
        .https_only(true)  // No HTTP fallback
        .user_agent(&config.user_agent)

    // 2. Build client
    let reqwest_client = client_builder.build()
        .expect("Failed to create HTTP client")

    // 3. Wrap in transport abstraction
    return Arc::new(ReqwestTransport::new(reqwest_client))
}
```

#### TypeScript Implementation

```typescript
// GoogleDriveClient: Main entry point for Google Drive API
class GoogleDriveClient {
    private config: GoogleDriveConfig;
    private authProvider: AuthProvider;
    private transport: HttpTransport;

    readonly files: FilesService;
    readonly permissions: PermissionsService;
    readonly comments: CommentsService;
    readonly replies: RepliesService;
    readonly revisions: RevisionsService;
    readonly changes: ChangesService;
    readonly drives: DrivesService;
    readonly about: AboutService;

    // Create a new GoogleDriveClient
    constructor(config: GoogleDriveConfig) {
        // 1. Validate configuration
        if (!config.auth) {
            throw new ConfigurationError("auth is required")
        }

        // 2. Set defaults
        this.config = {
            baseUrl: config.baseUrl ?? "https://www.googleapis.com/drive/v3",
            uploadUrl: config.uploadUrl ?? "https://www.googleapis.com/upload/drive/v3",
            timeout: config.timeout ?? 300000,
            maxRetries: config.maxRetries ?? 3,
            uploadChunkSize: config.uploadChunkSize ?? 8 * 1024 * 1024,
            userAgent: config.userAgent ?? `integrations-google-drive/${VERSION}`,
            ...config,
        }

        // 3. Validate upload chunk size
        if (this.config.uploadChunkSize < 256 * 1024) {
            throw new ConfigurationError("uploadChunkSize must be at least 256KB")
        }

        if (this.config.uploadChunkSize % (256 * 1024) !== 0) {
            throw new ConfigurationError("uploadChunkSize must be a multiple of 256KB")
        }

        // 4. Create auth provider from credentials or use provided
        if ('type' in config.auth) {
            // Create auth provider from credentials
            if (config.auth.type === 'oauth2') {
                this.authProvider = new OAuth2Provider(config.auth)
            } else if (config.auth.type === 'service_account') {
                this.authProvider = new ServiceAccountProvider(config.auth)
            } else {
                throw new ConfigurationError(`Unknown auth type: ${config.auth.type}`)
            }
        } else {
            this.authProvider = config.auth
        }

        // 5. Create HTTP transport
        this.transport = new FetchTransport(this.config)

        // 6. Initialize all services
        this.files = new FilesServiceImpl(
            this.transport,
            this.authProvider,
            this.config.baseUrl,
            this.config.uploadUrl,
            this.config.uploadChunkSize
        )

        this.permissions = new PermissionsServiceImpl(
            this.transport,
            this.authProvider,
            this.config.baseUrl
        )

        this.comments = new CommentsServiceImpl(
            this.transport,
            this.authProvider,
            this.config.baseUrl
        )

        this.replies = new RepliesServiceImpl(
            this.transport,
            this.authProvider,
            this.config.baseUrl
        )

        this.revisions = new RevisionsServiceImpl(
            this.transport,
            this.authProvider,
            this.config.baseUrl
        )

        this.changes = new ChangesServiceImpl(
            this.transport,
            this.authProvider,
            this.config.baseUrl
        )

        this.drives = new DrivesServiceImpl(
            this.transport,
            this.authProvider,
            this.config.baseUrl
        )

        this.about = new AboutServiceImpl(
            this.transport,
            this.authProvider,
            this.config.baseUrl
        )
    }

    // Get storage quota information
    async getStorageQuota(): Promise<StorageQuota> {
        const about = await this.about.get({ fields: 'storageQuota' })
        return about.storageQuota
    }
}
```

---

## 2. Authentication Layer

### 2.1 OAuth2Provider

#### Rust Implementation

```rust
// OAuth2Provider: Handles OAuth 2.0 token refresh and caching
struct OAuth2Provider {
    client_id: String,
    client_secret: SecretString,
    refresh_token: SecretString,
    token_url: Url,
    // Cached token with mutex for thread-safe updates
    cached_token: Arc<RwLock<Option<CachedAccessToken>>>,
    http_client: reqwest::Client,
}

struct CachedAccessToken {
    token: AccessToken,
    // Cache until 5 minutes before actual expiration
    cache_until: DateTime<Utc>,
}

// Get access token (with caching)
async function get_access_token(provider: &OAuth2Provider) -> Result<AccessToken, AuthError> {
    // 1. Check cached token first
    {
        let cached = provider.cached_token.read().await
        if let Some(cached_token) = &*cached {
            if Utc::now() < cached_token.cache_until {
                // Token is still valid, return cached
                return Ok(cached_token.token.clone())
            }
        }
    }

    // 2. No valid cached token, need to refresh
    return provider.refresh_token().await
}

// Force refresh the access token
async function refresh_token(provider: &OAuth2Provider) -> Result<AccessToken, AuthError> {
    // 1. Build token refresh request
    let params = [
        ("grant_type", "refresh_token"),
        ("refresh_token", provider.refresh_token.expose_secret()),
        ("client_id", &provider.client_id),
        ("client_secret", provider.client_secret.expose_secret()),
    ]

    // 2. Send POST request to token endpoint
    let response = provider.http_client
        .post(provider.token_url.clone())
        .form(&params)
        .send()
        .await
        .map_err(|e| AuthError::RefreshFailed(e.to_string()))?

    // 3. Check response status
    if !response.status().is_success() {
        let error_body = response.text().await.unwrap_or_default()
        return Err(AuthError::RefreshFailed(format!("Token refresh failed: {}", error_body)))
    }

    // 4. Parse token response
    let token_response: TokenResponse = response.json().await
        .map_err(|e| AuthError::InvalidGrant(e.to_string()))?

    // 5. Create AccessToken
    let expires_at = Utc::now() + Duration::seconds(token_response.expires_in as i64)
    let access_token = AccessToken {
        token: SecretString::new(token_response.access_token),
        token_type: token_response.token_type.unwrap_or("Bearer".to_string()),
        expires_at,
        scopes: token_response.scope
            .map(|s| s.split(' ').map(String::from).collect())
            .unwrap_or_default(),
    }

    // 6. Cache the token (expire from cache 5 minutes early)
    let cache_until = expires_at - Duration::minutes(5)
    {
        let mut cached = provider.cached_token.write().await
        *cached = Some(CachedAccessToken {
            token: access_token.clone(),
            cache_until,
        })
    }

    // 7. Return new token
    return Ok(access_token)
}

// Check if current token is expired
function is_expired(provider: &OAuth2Provider) -> bool {
    let cached = provider.cached_token.blocking_read()
    match &*cached {
        Some(cached_token) => Utc::now() >= cached_token.cache_until,
        None => true,
    }
}
```

#### TypeScript Implementation

```typescript
// OAuth2Provider: Handles OAuth 2.0 token refresh and caching
class OAuth2Provider implements AuthProvider {
    private clientId: string;
    private clientSecret: string;
    private refreshToken: string;
    private tokenUrl: string = "https://oauth2.googleapis.com/token";
    private cachedToken: CachedAccessToken | null = null;

    constructor(credentials: OAuth2Credentials) {
        this.clientId = credentials.clientId
        this.clientSecret = credentials.clientSecret
        this.refreshToken = credentials.refreshToken

        // If access token provided, cache it
        if (credentials.accessToken && credentials.expiresAt) {
            const cacheUntil = new Date(credentials.expiresAt.getTime() - 5 * 60 * 1000)
            this.cachedToken = {
                token: {
                    token: credentials.accessToken,
                    tokenType: "Bearer",
                    expiresAt: credentials.expiresAt,
                    scopes: [],
                },
                cacheUntil,
            }
        }
    }

    // Get access token (with caching)
    async getAccessToken(): Promise<AccessToken> {
        // 1. Check cached token first
        if (this.cachedToken && new Date() < this.cachedToken.cacheUntil) {
            return this.cachedToken.token
        }

        // 2. No valid cached token, need to refresh
        return this.refreshToken()
    }

    // Force refresh the access token
    async refreshToken(): Promise<AccessToken> {
        // 1. Build token refresh request
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: this.refreshToken,
            client_id: this.clientId,
            client_secret: this.clientSecret,
        })

        // 2. Send POST request to token endpoint
        const response = await fetch(this.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params,
        })

        // 3. Check response status
        if (!response.ok) {
            const errorBody = await response.text()
            throw new AuthError(`Token refresh failed: ${errorBody}`)
        }

        // 4. Parse token response
        const tokenResponse = await response.json()

        // 5. Create AccessToken
        const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000)
        const accessToken: AccessToken = {
            token: tokenResponse.access_token,
            tokenType: tokenResponse.token_type ?? 'Bearer',
            expiresAt,
            scopes: tokenResponse.scope ? tokenResponse.scope.split(' ') : [],
        }

        // 6. Cache the token (expire from cache 5 minutes early)
        const cacheUntil = new Date(expiresAt.getTime() - 5 * 60 * 1000)
        this.cachedToken = {
            token: accessToken,
            cacheUntil,
        }

        // 7. Return new token
        return accessToken
    }

    // Check if current token is expired
    isExpired(): boolean {
        if (!this.cachedToken) {
            return true
        }
        return new Date() >= this.cachedToken.cacheUntil
    }
}
```

### 2.2 ServiceAccountProvider

#### Rust Implementation

```rust
// ServiceAccountProvider: Handles Service Account JWT generation and signing
struct ServiceAccountProvider {
    service_account_email: String,
    private_key: SecretString,
    scopes: Vec<String>,
    subject: Option<String>,  // For domain-wide delegation
    token_url: Url,
    // Cached token
    cached_token: Arc<RwLock<Option<CachedAccessToken>>>,
    http_client: reqwest::Client,
}

// Get access token (with caching)
async function get_access_token(provider: &ServiceAccountProvider) -> Result<AccessToken, AuthError> {
    // 1. Check cached token first
    {
        let cached = provider.cached_token.read().await
        if let Some(cached_token) = &*cached {
            if Utc::now() < cached_token.cache_until {
                return Ok(cached_token.token.clone())
            }
        }
    }

    // 2. No valid cached token, generate new JWT and exchange
    return provider.refresh_token().await
}

// Generate JWT and exchange for access token
async function refresh_token(provider: &ServiceAccountProvider) -> Result<AccessToken, AuthError> {
    // 1. Create JWT claims
    let now = Utc::now().timestamp()
    let expiration = now + 3600  // 1 hour from now

    let claims = json!({
        "iss": provider.service_account_email,
        "scope": provider.scopes.join(" "),
        "aud": provider.token_url.as_str(),
        "iat": now,
        "exp": expiration,
    })

    // Add subject for domain-wide delegation
    if let Some(subject) = &provider.subject {
        claims["sub"] = json!(subject)
    }

    // 2. Sign JWT with RS256
    let private_key = provider.private_key.expose_secret()
    let encoding_key = EncodingKey::from_rsa_pem(private_key.as_bytes())
        .map_err(|e| AuthError::InvalidCredentials(e.to_string()))?

    let header = Header::new(Algorithm::RS256)
    let jwt = encode(&header, &claims, &encoding_key)
        .map_err(|e| AuthError::InvalidCredentials(e.to_string()))?

    // 3. Exchange JWT for access token
    let params = [
        ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
        ("assertion", &jwt),
    ]

    let response = provider.http_client
        .post(provider.token_url.clone())
        .form(&params)
        .send()
        .await
        .map_err(|e| AuthError::RefreshFailed(e.to_string()))?

    // 4. Check response status
    if !response.status().is_success() {
        let error_body = response.text().await.unwrap_or_default()
        return Err(AuthError::RefreshFailed(format!("JWT exchange failed: {}", error_body)))
    }

    // 5. Parse token response
    let token_response: TokenResponse = response.json().await
        .map_err(|e| AuthError::InvalidGrant(e.to_string()))?

    // 6. Create AccessToken
    let expires_at = Utc::now() + Duration::seconds(token_response.expires_in as i64)
    let access_token = AccessToken {
        token: SecretString::new(token_response.access_token),
        token_type: token_response.token_type.unwrap_or("Bearer".to_string()),
        expires_at,
        scopes: provider.scopes.clone(),
    }

    // 7. Cache the token
    let cache_until = expires_at - Duration::minutes(5)
    {
        let mut cached = provider.cached_token.write().await
        *cached = Some(CachedAccessToken {
            token: access_token.clone(),
            cache_until,
        })
    }

    return Ok(access_token)
}
```

#### TypeScript Implementation

```typescript
// ServiceAccountProvider: Handles Service Account JWT generation and signing
class ServiceAccountProvider implements AuthProvider {
    private clientEmail: string;
    private privateKey: string;
    private scopes: string[];
    private subject?: string;
    private tokenUrl: string = "https://oauth2.googleapis.com/token";
    private cachedToken: CachedAccessToken | null = null;

    constructor(credentials: ServiceAccountCredentials) {
        this.clientEmail = credentials.clientEmail
        this.privateKey = credentials.privateKey
        this.scopes = credentials.scopes
        this.subject = credentials.subject
    }

    // Get access token (with caching)
    async getAccessToken(): Promise<AccessToken> {
        // 1. Check cached token first
        if (this.cachedToken && new Date() < this.cachedToken.cacheUntil) {
            return this.cachedToken.token
        }

        // 2. No valid cached token, generate new JWT and exchange
        return this.refreshToken()
    }

    // Generate JWT and exchange for access token
    async refreshToken(): Promise<AccessToken> {
        // 1. Create JWT claims
        const now = Math.floor(Date.now() / 1000)
        const expiration = now + 3600  // 1 hour from now

        const claims: any = {
            iss: this.clientEmail,
            scope: this.scopes.join(' '),
            aud: this.tokenUrl,
            iat: now,
            exp: expiration,
        }

        // Add subject for domain-wide delegation
        if (this.subject) {
            claims.sub = this.subject
        }

        // 2. Sign JWT with RS256 using jose library
        const { SignJWT, importPKCS8 } = await import('jose')

        const privateKey = await importPKCS8(this.privateKey, 'RS256')
        const jwt = await new SignJWT(claims)
            .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
            .sign(privateKey)

        // 3. Exchange JWT for access token
        const params = new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
        })

        const response = await fetch(this.tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params,
        })

        // 4. Check response status
        if (!response.ok) {
            const errorBody = await response.text()
            throw new AuthError(`JWT exchange failed: ${errorBody}`)
        }

        // 5. Parse token response
        const tokenResponse = await response.json()

        // 6. Create AccessToken
        const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000)
        const accessToken: AccessToken = {
            token: tokenResponse.access_token,
            tokenType: tokenResponse.token_type ?? 'Bearer',
            expiresAt,
            scopes: this.scopes,
        }

        // 7. Cache the token
        const cacheUntil = new Date(expiresAt.getTime() - 5 * 60 * 1000)
        this.cachedToken = {
            token: accessToken,
            cacheUntil,
        }

        return accessToken
    }

    // Check if current token is expired
    isExpired(): boolean {
        if (!this.cachedToken) {
            return true
        }
        return new Date() >= this.cachedToken.cacheUntil
    }
}
```

---

## 3. Transport Layer

### 3.1 HttpTransport Trait/Interface

#### Rust Implementation

```rust
// Build HTTP request with auth headers
async function build_authenticated_request(
    transport: &dyn HttpTransport,
    auth_provider: &dyn AuthProvider,
    method: HttpMethod,
    url: Url,
    body: Option<RequestBody>,
    additional_headers: Option<HeaderMap>,
) -> Result<HttpRequest, GoogleDriveError> {
    // 1. Get access token
    let access_token = auth_provider.get_access_token().await
        .map_err(GoogleDriveError::Authentication)?

    // 2. Build headers
    let mut headers = HeaderMap::new()

    // Add authorization header
    let auth_value = format!("{} {}", access_token.token_type, access_token.token.expose_secret())
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&auth_value).unwrap()
    )

    // Add additional headers if provided
    if let Some(extra_headers) = additional_headers {
        headers.extend(extra_headers)
    }

    // 3. Create request
    return Ok(HttpRequest {
        method,
        url,
        headers,
        body,
        timeout: None,  // Use default from client
    })
}

// Send request and parse JSON response
async function send_json_request<T: DeserializeOwned>(
    transport: &dyn HttpTransport,
    request: HttpRequest,
) -> Result<T, GoogleDriveError> {
    // 1. Send request
    let response = transport.send(request).await
        .map_err(|e| map_transport_error(e))?

    // 2. Check status code
    if !response.status.is_success() {
        return Err(map_http_error(response))
    }

    // 3. Deserialize JSON response
    let parsed: T = serde_json::from_slice(&response.body)
        .map_err(|e| GoogleDriveError::Response(ResponseError::DeserializationError {
            message: e.to_string(),
            body: String::from_utf8_lossy(&response.body).to_string(),
        }))?

    return Ok(parsed)
}

// Send request expecting empty response
async function send_empty_request(
    transport: &dyn HttpTransport,
    request: HttpRequest,
) -> Result<(), GoogleDriveError> {
    // 1. Send request
    let response = transport.send(request).await
        .map_err(|e| map_transport_error(e))?

    // 2. Check status code
    if !response.status.is_success() {
        return Err(map_http_error(response))
    }

    return Ok(())
}

// Send request and get raw bytes
async function send_raw_request(
    transport: &dyn HttpTransport,
    request: HttpRequest,
) -> Result<Bytes, GoogleDriveError> {
    // 1. Send request
    let response = transport.send(request).await
        .map_err(|e| map_transport_error(e))?

    // 2. Check status code
    if !response.status.is_success() {
        return Err(map_http_error(response))
    }

    return Ok(response.body)
}

// Send request and get streaming response
async function send_streaming_request(
    transport: &dyn HttpTransport,
    request: HttpRequest,
) -> Result<impl Stream<Item = Result<Bytes, GoogleDriveError>>, GoogleDriveError> {
    // 1. Send request
    let stream = transport.send_streaming(request).await
        .map_err(|e| map_transport_error(e))?

    // 2. Map transport errors to GoogleDriveError
    let mapped_stream = stream.map(|result| {
        result.map_err(|e| map_transport_error(e))
    })

    return Ok(mapped_stream)
}
```

#### TypeScript Implementation

```typescript
// Build HTTP request with auth headers
async function buildAuthenticatedRequest(
    authProvider: AuthProvider,
    method: string,
    url: string,
    body?: any,
    additionalHeaders?: Record<string, string>,
): Promise<RequestInit> {
    // 1. Get access token
    const accessToken = await authProvider.getAccessToken()

    // 2. Build headers
    const headers: Record<string, string> = {
        'Authorization': `${accessToken.tokenType} ${accessToken.token}`,
        ...additionalHeaders,
    }

    // Add content-type for JSON bodies
    if (body && typeof body === 'object' && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json'
    }

    // 3. Create request init
    const requestInit: RequestInit = {
        method,
        headers,
    }

    if (body) {
        if (typeof body === 'string' || body instanceof Blob || body instanceof ArrayBuffer) {
            requestInit.body = body
        } else {
            requestInit.body = JSON.stringify(body)
        }
    }

    return requestInit
}

// Send request and parse JSON response
async function sendJsonRequest<T>(
    transport: HttpTransport,
    authProvider: AuthProvider,
    method: string,
    url: string,
    body?: any,
    additionalHeaders?: Record<string, string>,
): Promise<T> {
    // 1. Build authenticated request
    const requestInit = await buildAuthenticatedRequest(
        authProvider,
        method,
        url,
        body,
        additionalHeaders
    )

    // 2. Send request
    const response = await transport.send(url, requestInit)

    // 3. Check status code
    if (!response.ok) {
        throw await mapHttpError(response)
    }

    // 4. Parse JSON response
    try {
        const parsed: T = await response.json()
        return parsed
    } catch (e) {
        const body = await response.text()
        throw new ResponseError(`Failed to parse JSON: ${e}`, body)
    }
}

// Send request expecting empty response
async function sendEmptyRequest(
    transport: HttpTransport,
    authProvider: AuthProvider,
    method: string,
    url: string,
    body?: any,
): Promise<void> {
    // 1. Build authenticated request
    const requestInit = await buildAuthenticatedRequest(
        authProvider,
        method,
        url,
        body
    )

    // 2. Send request
    const response = await transport.send(url, requestInit)

    // 3. Check status code
    if (!response.ok) {
        throw await mapHttpError(response)
    }
}

// Send request and get raw bytes
async function sendRawRequest(
    transport: HttpTransport,
    authProvider: AuthProvider,
    method: string,
    url: string,
    additionalHeaders?: Record<string, string>,
): Promise<ArrayBuffer> {
    // 1. Build authenticated request
    const requestInit = await buildAuthenticatedRequest(
        authProvider,
        method,
        url,
        undefined,
        additionalHeaders
    )

    // 2. Send request
    const response = await transport.send(url, requestInit)

    // 3. Check status code
    if (!response.ok) {
        throw await mapHttpError(response)
    }

    // 4. Return raw bytes
    return response.arrayBuffer()
}

// Send request and get streaming response
async function sendStreamingRequest(
    transport: HttpTransport,
    authProvider: AuthProvider,
    method: string,
    url: string,
): Promise<ReadableStream<Uint8Array>> {
    // 1. Build authenticated request
    const requestInit = await buildAuthenticatedRequest(
        authProvider,
        method,
        url
    )

    // 2. Send request
    const response = await transport.send(url, requestInit)

    // 3. Check status code
    if (!response.ok) {
        throw await mapHttpError(response)
    }

    // 4. Return stream
    if (!response.body) {
        throw new GoogleDriveError('Response body is null')
    }

    return response.body
}
```

---

## 4. Files Service

### 4.1 Create File (Metadata Only)

#### Rust Implementation

```rust
// Create a new file with metadata only
async function create_file(
    service: &FilesServiceImpl,
    request: CreateFileRequest,
) -> Result<File, GoogleDriveError> {
    // 1. Build URL
    let url = service.base_url.join("/files")?

    // 2. Serialize metadata to JSON
    let body = serde_json::to_vec(&request)
        .map_err(|e| GoogleDriveError::Request(RequestError::ValidationError {
            message: format!("Failed to serialize request: {}", e),
        }))?

    // 3. Build request
    let mut headers = HeaderMap::new()
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"))

    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::POST,
        url,
        Some(RequestBody::Bytes(Bytes::from(body))),
        Some(headers),
    ).await?

    // 4. Send request and parse response
    let file: File = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(file)
}
```

### 4.2 Create File with Content (Simple Upload)

#### Rust Implementation

```rust
// Create a file with content using simple upload (<=5MB)
async function create_with_content(
    service: &FilesServiceImpl,
    request: CreateFileWithContentRequest,
) -> Result<File, GoogleDriveError> {
    // 1. Validate content size
    if request.content.len() > 5 * 1024 * 1024 {
        return Err(GoogleDriveError::Upload(UploadError::UploadSizeExceeded {
            size: request.content.len() as u64,
            max_size: 5 * 1024 * 1024,
            message: "Simple upload limited to 5MB. Use resumable upload for larger files.".to_string(),
        }))
    }

    // 2. Build URL with uploadType=media
    let mut url = service.upload_url.join("/files")?
    url.query_pairs_mut().append_pair("uploadType", "media")

    // 3. Build headers
    let mut headers = HeaderMap::new()
    headers.insert(CONTENT_TYPE, HeaderValue::from_str(&request.mime_type)?)
    headers.insert(CONTENT_LENGTH, HeaderValue::from(request.content.len()))

    // 4. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::POST,
        url,
        Some(RequestBody::Bytes(request.content)),
        Some(headers),
    ).await?

    // 5. Send request and parse response
    let file: File = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(file)
}
```

### 4.3 Create File with Multipart Upload

#### Rust Implementation

```rust
// Create a file using multipart upload (metadata + content, <=5MB)
async function create_multipart(
    service: &FilesServiceImpl,
    request: CreateMultipartRequest,
) -> Result<File, GoogleDriveError> {
    // 1. Validate content size
    if request.content.len() > 5 * 1024 * 1024 {
        return Err(GoogleDriveError::Upload(UploadError::UploadSizeExceeded {
            size: request.content.len() as u64,
            max_size: 5 * 1024 * 1024,
            message: "Multipart upload limited to 5MB. Use resumable upload for larger files.".to_string(),
        }))
    }

    // 2. Build URL with uploadType=multipart
    let mut url = service.upload_url.join("/files")?
    url.query_pairs_mut().append_pair("uploadType", "multipart")

    // 3. Create multipart body
    let boundary = generate_boundary()  // Random boundary string

    // Part 1: Metadata as JSON
    let metadata_json = serde_json::to_string(&request.metadata)?
    let part1 = format!(
        "--{}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{}\r\n",
        boundary, metadata_json
    )

    // Part 2: File content
    let part2_header = format!(
        "--{}\r\nContent-Type: {}\r\n\r\n",
        boundary, request.mime_type
    )

    // Part 3: Closing boundary
    let part3 = format!("\r\n--{}--\r\n", boundary)

    // Combine all parts
    let mut body = Vec::new()
    body.extend_from_slice(part1.as_bytes())
    body.extend_from_slice(part2_header.as_bytes())
    body.extend_from_slice(&request.content)
    body.extend_from_slice(part3.as_bytes())

    // 4. Build headers
    let mut headers = HeaderMap::new()
    let content_type = format!("multipart/related; boundary={}", boundary)
    headers.insert(CONTENT_TYPE, HeaderValue::from_str(&content_type)?)
    headers.insert(CONTENT_LENGTH, HeaderValue::from(body.len()))

    // 5. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::POST,
        url,
        Some(RequestBody::Bytes(Bytes::from(body))),
        Some(headers),
    ).await?

    // 6. Send request and parse response
    let file: File = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(file)
}

// Generate random boundary for multipart
function generate_boundary() -> String {
    use rand::Rng;
    let random_bytes: Vec<u8> = (0..16).map(|_| rand::thread_rng().gen()).collect()
    return format!("boundary_{}", hex::encode(random_bytes))
}
```

### 4.4 Create File with Resumable Upload

#### Rust Implementation

```rust
// Create a file using resumable upload (for large files)
async function create_resumable(
    service: &FilesServiceImpl,
    request: CreateResumableRequest,
) -> Result<ResumableUploadSession, GoogleDriveError> {
    // 1. Build URL with uploadType=resumable
    let mut url = service.upload_url.join("/files")?
    url.query_pairs_mut().append_pair("uploadType", "resumable")

    // 2. Build headers
    let mut headers = HeaderMap::new()
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"))

    // Add upload metadata headers
    if let Some(mime_type) = &request.mime_type {
        headers.insert(
            HeaderName::from_static("x-upload-content-type"),
            HeaderValue::from_str(mime_type)?
        )
    }

    if let Some(content_length) = request.content_length {
        headers.insert(
            HeaderName::from_static("x-upload-content-length"),
            HeaderValue::from(content_length)
        )
    }

    // 3. Serialize metadata to JSON
    let body = serde_json::to_vec(&request.metadata)?

    // 4. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::POST,
        url,
        Some(RequestBody::Bytes(Bytes::from(body))),
        Some(headers),
    ).await?

    // 5. Send request
    let response = service.transport.send(http_request).await
        .map_err(|e| map_transport_error(e))?

    // 6. Check status (should be 200 OK)
    if response.status != StatusCode::OK {
        return Err(map_http_error(response))
    }

    // 7. Extract resumable upload URI from Location header
    let upload_uri = response.headers
        .get(LOCATION)
        .ok_or_else(|| GoogleDriveError::Upload(UploadError::InvalidUploadRequest {
            message: "Missing Location header in resumable upload response".to_string(),
        }))?
        .to_str()
        .map_err(|e| GoogleDriveError::Upload(UploadError::InvalidUploadRequest {
            message: format!("Invalid Location header: {}", e),
        }))?
        .to_string()

    // 8. Create and return resumable upload session
    return Ok(ResumableUploadSessionImpl::new(
        upload_uri,
        Arc::clone(&service.transport),
        Arc::clone(&service.auth_provider),
        service.upload_chunk_size,
    ))
}
```

### 4.5 Get File Metadata

#### Rust Implementation

```rust
// Get file metadata
async function get_file(
    service: &FilesServiceImpl,
    file_id: &str,
    params: Option<GetFileParams>,
) -> Result<File, GoogleDriveError> {
    // 1. Build URL
    let url = service.base_url.join(&format!("/files/{}", file_id))?

    // 2. Add query parameters
    let mut url_with_params = url.clone()
    if let Some(params) = params {
        let mut query = url_with_params.query_pairs_mut()

        if let Some(fields) = params.fields {
            query.append_pair("fields", &fields)
        }

        if let Some(ack_abuse) = params.acknowledge_abuse {
            query.append_pair("acknowledgeAbuse", &ack_abuse.to_string())
        }

        if let Some(supports_all_drives) = params.supports_all_drives {
            query.append_pair("supportsAllDrives", &supports_all_drives.to_string())
        }
    }

    // 3. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::GET,
        url_with_params,
        None,
        None,
    ).await?

    // 4. Send request and parse response
    let file: File = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(file)
}
```

### 4.6 Download File Content

#### Rust Implementation

```rust
// Download file content as bytes
async function download(
    service: &FilesServiceImpl,
    file_id: &str,
    params: Option<DownloadParams>,
) -> Result<Bytes, GoogleDriveError> {
    // 1. Build URL with alt=media
    let mut url = service.base_url.join(&format!("/files/{}", file_id))?
    url.query_pairs_mut().append_pair("alt", "media")

    // 2. Add optional parameters
    if let Some(params) = params {
        let mut query = url.query_pairs_mut()

        if let Some(ack_abuse) = params.acknowledge_abuse {
            query.append_pair("acknowledgeAbuse", &ack_abuse.to_string())
        }
    }

    // 3. Build headers (support range requests if specified)
    let mut headers = HeaderMap::new()
    if let Some(params) = &params {
        if let Some(range) = &params.range {
            headers.insert(RANGE, HeaderValue::from_str(&format!("bytes={}", range))?)
        }
    }

    // 4. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::GET,
        url,
        None,
        Some(headers),
    ).await?

    // 5. Send request and get raw bytes
    let bytes = send_raw_request(service.transport.as_ref(), http_request).await?

    return Ok(bytes)
}

// Download file content as stream
async function download_stream(
    service: &FilesServiceImpl,
    file_id: &str,
    params: Option<DownloadParams>,
) -> Result<impl Stream<Item = Result<Bytes, GoogleDriveError>>, GoogleDriveError> {
    // 1. Build URL with alt=media
    let mut url = service.base_url.join(&format!("/files/{}", file_id))?
    url.query_pairs_mut().append_pair("alt", "media")

    // 2. Add optional parameters
    if let Some(params) = params {
        let mut query = url.query_pairs_mut()

        if let Some(ack_abuse) = params.acknowledge_abuse {
            query.append_pair("acknowledgeAbuse", &ack_abuse.to_string())
        }
    }

    // 3. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::GET,
        url,
        None,
        None,
    ).await?

    // 4. Send request and get stream
    let stream = send_streaming_request(service.transport.as_ref(), http_request).await?

    return Ok(stream)
}
```

### 4.7 List Files

#### Rust Implementation

```rust
// List files with optional query and pagination
async function list_files(
    service: &FilesServiceImpl,
    params: Option<ListFilesParams>,
) -> Result<FileList, GoogleDriveError> {
    // 1. Build URL
    let mut url = service.base_url.join("/files")?

    // 2. Add query parameters
    if let Some(params) = params {
        let mut query = url.query_pairs_mut()

        if let Some(corpora) = params.corpora {
            query.append_pair("corpora", &corpora)
        }

        if let Some(drive_id) = params.drive_id {
            query.append_pair("driveId", &drive_id)
        }

        if let Some(q) = params.q {
            query.append_pair("q", &q)
        }

        if let Some(page_size) = params.page_size {
            query.append_pair("pageSize", &page_size.to_string())
        }

        if let Some(page_token) = params.page_token {
            query.append_pair("pageToken", &page_token)
        }

        if let Some(order_by) = params.order_by {
            query.append_pair("orderBy", &order_by)
        }

        if let Some(fields) = params.fields {
            query.append_pair("fields", &fields)
        }

        if let Some(supports_all_drives) = params.supports_all_drives {
            query.append_pair("supportsAllDrives", &supports_all_drives.to_string())
        }

        if let Some(include_items_from_all_drives) = params.include_items_from_all_drives {
            query.append_pair("includeItemsFromAllDrives", &include_items_from_all_drives.to_string())
        }
    }

    // 3. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::GET,
        url,
        None,
        None,
    ).await?

    // 4. Send request and parse response
    let file_list: FileList = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(file_list)
}

// List all files with auto-pagination
function list_all_files(
    service: &FilesServiceImpl,
    params: Option<ListFilesParams>,
) -> impl Stream<Item = Result<File, GoogleDriveError>> + '_ {
    async_stream::try_stream! {
        let mut current_params = params.clone()
        let mut next_page_token: Option<String> = None

        loop {
            // Update page token for next iteration
            if let Some(ref mut params) = current_params {
                params.page_token = next_page_token.clone()
            } else {
                current_params = Some(ListFilesParams {
                    page_token: next_page_token.clone(),
                    ..Default::default()
                })
            }

            // Fetch page
            let file_list = service.list(current_params.clone()).await?

            // Yield all files from this page
            for file in file_list.files {
                yield file
            }

            // Check if there are more pages
            if let Some(token) = file_list.next_page_token {
                next_page_token = Some(token)
            } else {
                // No more pages
                break
            }
        }
    }
}
```

### 4.8 Update File

#### Rust Implementation

```rust
// Update file metadata
async function update_file(
    service: &FilesServiceImpl,
    file_id: &str,
    request: UpdateFileRequest,
) -> Result<File, GoogleDriveError> {
    // 1. Build URL
    let mut url = service.base_url.join(&format!("/files/{}", file_id))?

    // 2. Add query parameters for parent management
    if !request.add_parents.is_empty() {
        url.query_pairs_mut().append_pair("addParents", &request.add_parents.join(","))
    }

    if !request.remove_parents.is_empty() {
        url.query_pairs_mut().append_pair("removeParents", &request.remove_parents.join(","))
    }

    // 3. Serialize metadata to JSON
    let body = serde_json::to_vec(&request.metadata)?

    // 4. Build headers
    let mut headers = HeaderMap::new()
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"))

    // 5. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::PATCH,
        url,
        Some(RequestBody::Bytes(Bytes::from(body))),
        Some(headers),
    ).await?

    // 6. Send request and parse response
    let file: File = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(file)
}

// Update file content
async function update_content(
    service: &FilesServiceImpl,
    file_id: &str,
    request: UpdateFileContentRequest,
) -> Result<File, GoogleDriveError> {
    // 1. Determine upload type based on content size
    if request.content.len() <= 5 * 1024 * 1024 {
        // Use simple upload
        return update_content_simple(service, file_id, request).await
    } else {
        // Use resumable upload
        return update_content_resumable(service, file_id, request).await
    }
}

// Update content using simple upload
async function update_content_simple(
    service: &FilesServiceImpl,
    file_id: &str,
    request: UpdateFileContentRequest,
) -> Result<File, GoogleDriveError> {
    // 1. Build URL with uploadType=media
    let mut url = service.upload_url.join(&format!("/files/{}", file_id))?
    url.query_pairs_mut().append_pair("uploadType", "media")

    // 2. Build headers
    let mut headers = HeaderMap::new()
    headers.insert(CONTENT_TYPE, HeaderValue::from_str(&request.mime_type)?)
    headers.insert(CONTENT_LENGTH, HeaderValue::from(request.content.len()))

    // 3. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::PATCH,
        url,
        Some(RequestBody::Bytes(request.content)),
        Some(headers),
    ).await?

    // 4. Send request and parse response
    let file: File = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(file)
}
```

### 4.9 Delete File

#### Rust Implementation

```rust
// Delete a file permanently
async function delete_file(
    service: &FilesServiceImpl,
    file_id: &str,
    params: Option<DeleteFileParams>,
) -> Result<(), GoogleDriveError> {
    // 1. Build URL
    let mut url = service.base_url.join(&format!("/files/{}", file_id))?

    // 2. Add query parameters
    if let Some(params) = params {
        let mut query = url.query_pairs_mut()

        if let Some(supports_all_drives) = params.supports_all_drives {
            query.append_pair("supportsAllDrives", &supports_all_drives.to_string())
        }
    }

    // 3. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::DELETE,
        url,
        None,
        None,
    ).await?

    // 4. Send request (expecting 204 No Content)
    send_empty_request(service.transport.as_ref(), http_request).await?

    return Ok(())
}
```

### 4.10 Copy File

#### Rust Implementation

```rust
// Copy a file
async function copy_file(
    service: &FilesServiceImpl,
    file_id: &str,
    request: CopyFileRequest,
) -> Result<File, GoogleDriveError> {
    // 1. Build URL
    let url = service.base_url.join(&format!("/files/{}/copy", file_id))?

    // 2. Serialize metadata overrides to JSON
    let body = serde_json::to_vec(&request.metadata)?

    // 3. Build headers
    let mut headers = HeaderMap::new()
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"))

    // 4. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::POST,
        url,
        Some(RequestBody::Bytes(Bytes::from(body))),
        Some(headers),
    ).await?

    // 5. Send request and parse response
    let file: File = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(file)
}
```

### 4.11 Export Google Workspace File

#### Rust Implementation

```rust
// Export a Google Workspace file to a specific format
async function export_file(
    service: &FilesServiceImpl,
    file_id: &str,
    mime_type: &str,
) -> Result<Bytes, GoogleDriveError> {
    // 1. Build URL
    let mut url = service.base_url.join(&format!("/files/{}/export", file_id))?
    url.query_pairs_mut().append_pair("mimeType", mime_type)

    // 2. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::GET,
        url,
        None,
        None,
    ).await?

    // 3. Send request and get raw bytes
    let bytes = send_raw_request(service.transport.as_ref(), http_request).await?

    return Ok(bytes)
}

// Export a Google Workspace file as stream
async function export_stream(
    service: &FilesServiceImpl,
    file_id: &str,
    mime_type: &str,
) -> Result<impl Stream<Item = Result<Bytes, GoogleDriveError>>, GoogleDriveError> {
    // 1. Build URL
    let mut url = service.base_url.join(&format!("/files/{}/export", file_id))?
    url.query_pairs_mut().append_pair("mimeType", mime_type)

    // 2. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::GET,
        url,
        None,
        None,
    ).await?

    // 3. Send request and get stream
    let stream = send_streaming_request(service.transport.as_ref(), http_request).await?

    return Ok(stream)
}
```

### 4.12 Create Folder

#### Rust Implementation

```rust
// Create a folder
async function create_folder(
    service: &FilesServiceImpl,
    request: CreateFolderRequest,
) -> Result<File, GoogleDriveError> {
    // 1. Create file metadata with folder MIME type
    let file_metadata = CreateFileRequest {
        name: request.name,
        mime_type: Some("application/vnd.google-apps.folder".to_string()),
        parents: request.parents,
        description: request.description,
        properties: request.properties,
        folder_color_rgb: request.folder_color_rgb,
        ..Default::default()
    }

    // 2. Use create_file to create the folder
    return service.create(file_metadata).await
}
```

### 4.13 Move File

#### Rust Implementation

```rust
// Move a file to a different folder
async function move_file(
    service: &FilesServiceImpl,
    file_id: &str,
    add_parents: Vec<String>,
    remove_parents: Vec<String>,
) -> Result<File, GoogleDriveError> {
    // 1. Build URL
    let mut url = service.base_url.join(&format!("/files/{}", file_id))?

    // 2. Add parent management query parameters
    if !add_parents.is_empty() {
        url.query_pairs_mut().append_pair("addParents", &add_parents.join(","))
    }

    if !remove_parents.is_empty() {
        url.query_pairs_mut().append_pair("removeParents", &remove_parents.join(","))
    }

    // 3. Build empty JSON body (PATCH with no metadata changes)
    let body = serde_json::to_vec(&json!({}))?

    // 4. Build headers
    let mut headers = HeaderMap::new()
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"))

    // 5. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::PATCH,
        url,
        Some(RequestBody::Bytes(Bytes::from(body))),
        Some(headers),
    ).await?

    // 6. Send request and parse response
    let file: File = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(file)
}
```

---

## 5. Resumable Upload Session

### 5.1 Upload Chunk

#### Rust Implementation

```rust
// ResumableUploadSessionImpl: Implementation of resumable upload
struct ResumableUploadSessionImpl {
    upload_uri: String,
    transport: Arc<dyn HttpTransport>,
    auth_provider: Arc<dyn AuthProvider>,
    chunk_size: usize,
}

// Upload a chunk of data
async function upload_chunk(
    session: &ResumableUploadSessionImpl,
    chunk: Bytes,
    offset: u64,
    total_size: u64,
) -> Result<UploadChunkResult, GoogleDriveError> {
    // 1. Validate chunk size (must be multiple of 256KB except last chunk)
    let is_last_chunk = offset + chunk.len() as u64 == total_size
    if !is_last_chunk && chunk.len() % (256 * 1024) != 0 {
        return Err(GoogleDriveError::Upload(UploadError::ChunkSizeMismatch {
            expected: session.chunk_size,
            actual: chunk.len(),
            message: "Chunk size must be a multiple of 256KB".to_string(),
        }))
    }

    // 2. Build headers
    let mut headers = HeaderMap::new()
    headers.insert(CONTENT_LENGTH, HeaderValue::from(chunk.len()))

    // Content-Range: bytes <start>-<end>/<total>
    let range_end = offset + chunk.len() as u64 - 1
    let content_range = format!("bytes {}-{}/{}", offset, range_end, total_size)
    headers.insert(
        HeaderName::from_static("content-range"),
        HeaderValue::from_str(&content_range)?
    )

    // 3. Build request
    let url = Url::parse(&session.upload_uri)?
    let http_request = build_authenticated_request(
        session.transport.as_ref(),
        session.auth_provider.as_ref(),
        HttpMethod::PUT,
        url,
        Some(RequestBody::Bytes(chunk)),
        Some(headers),
    ).await?

    // 4. Send request
    let response = session.transport.send(http_request).await
        .map_err(|e| map_transport_error(e))?

    // 5. Check response status
    match response.status {
        // 200 OK or 201 Created - Upload complete
        StatusCode::OK | StatusCode::CREATED => {
            let file: File = serde_json::from_slice(&response.body)
                .map_err(|e| GoogleDriveError::Response(ResponseError::DeserializationError {
                    message: e.to_string(),
                    body: String::from_utf8_lossy(&response.body).to_string(),
                }))?
            return Ok(UploadChunkResult::Complete(file))
        }

        // 308 Resume Incomplete - More chunks needed
        StatusCode::from_u16(308).unwrap() => {
            // Parse Range header to get bytes received
            let range_header = response.headers
                .get(RANGE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")

            // Range: bytes=0-<last_byte_received>
            let bytes_received = parse_range_header(range_header)
                .unwrap_or(offset + chunk.len() as u64)

            return Ok(UploadChunkResult::InProgress { bytes_received })
        }

        // Error status
        _ => {
            return Err(map_http_error(response))
        }
    }
}

// Parse Range header: "bytes=0-1234" -> 1235
function parse_range_header(range: &str) -> Option<u64> {
    // Parse "bytes=0-1234"
    let parts: Vec<&str> = range.split('=').collect()
    if parts.len() != 2 || parts[0] != "bytes" {
        return None
    }

    let byte_range = parts[1]
    let range_parts: Vec<&str> = byte_range.split('-').collect()
    if range_parts.len() != 2 {
        return None
    }

    // Parse end byte and add 1 to get bytes received
    let end_byte: u64 = range_parts[1].parse().ok()?
    return Some(end_byte + 1)
}
```

### 5.2 Upload Stream

#### Rust Implementation

```rust
// Upload entire content from a stream
async function upload_stream(
    session: &ResumableUploadSessionImpl,
    mut stream: impl Stream<Item = Result<Bytes, GoogleDriveError>> + Unpin,
    total_size: u64,
    chunk_size: usize,
) -> Result<File, GoogleDriveError> {
    // 1. Validate chunk size
    if chunk_size < 256 * 1024 {
        return Err(GoogleDriveError::Upload(UploadError::ChunkSizeMismatch {
            expected: 256 * 1024,
            actual: chunk_size,
            message: "Chunk size must be at least 256KB".to_string(),
        }))
    }

    if chunk_size % (256 * 1024) != 0 {
        return Err(GoogleDriveError::Upload(UploadError::ChunkSizeMismatch {
            expected: chunk_size,
            actual: chunk_size,
            message: "Chunk size must be a multiple of 256KB".to_string(),
        }))
    }

    // 2. Upload chunks
    let mut offset = 0u64
    let mut buffer = BytesMut::with_capacity(chunk_size)

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result?
        buffer.extend_from_slice(&chunk)

        // Upload when buffer is full or stream is done
        while buffer.len() >= chunk_size || (buffer.len() > 0 && offset + buffer.len() as u64 >= total_size) {
            // Determine chunk to upload
            let upload_size = if offset + buffer.len() as u64 >= total_size {
                // Last chunk - upload all remaining
                buffer.len()
            } else {
                // Not last chunk - upload chunk_size
                chunk_size
            }

            let upload_chunk = buffer.split_to(upload_size).freeze()

            // Upload chunk
            let result = session.upload_chunk(upload_chunk, offset, total_size).await?

            match result {
                UploadChunkResult::Complete(file) => {
                    return Ok(file)
                }
                UploadChunkResult::InProgress { bytes_received } => {
                    offset = bytes_received
                }
            }

            // Break inner loop if buffer is now empty
            if buffer.is_empty() {
                break
            }
        }
    }

    // 3. Upload any remaining buffer
    if !buffer.is_empty() {
        let upload_chunk = buffer.freeze()
        let result = session.upload_chunk(upload_chunk, offset, total_size).await?

        match result {
            UploadChunkResult::Complete(file) => {
                return Ok(file)
            }
            UploadChunkResult::InProgress { .. } => {
                return Err(GoogleDriveError::Upload(UploadError::UploadFailed {
                    message: "Upload incomplete but no more chunks".to_string(),
                }))
            }
        }
    }

    return Err(GoogleDriveError::Upload(UploadError::UploadFailed {
        message: "Stream ended before upload completed".to_string(),
    }))
}
```

### 5.3 Query Upload Status

#### Rust Implementation

```rust
// Query the current upload status
async function query_status(
    session: &ResumableUploadSessionImpl,
) -> Result<UploadStatus, GoogleDriveError> {
    // 1. Build headers for status query
    let mut headers = HeaderMap::new()
    headers.insert(CONTENT_LENGTH, HeaderValue::from(0))
    // Content-Range: bytes */<total> indicates status query
    headers.insert(
        HeaderName::from_static("content-range"),
        HeaderValue::from_static("bytes */0")  // Total unknown
    )

    // 2. Build request
    let url = Url::parse(&session.upload_uri)?
    let http_request = build_authenticated_request(
        session.transport.as_ref(),
        session.auth_provider.as_ref(),
        HttpMethod::PUT,
        url,
        None,  // No body
        Some(headers),
    ).await?

    // 3. Send request
    let response = session.transport.send(http_request).await
        .map_err(|e| map_transport_error(e))?

    // 4. Check response status
    match response.status {
        // 200 OK or 201 Created - Upload complete
        StatusCode::OK | StatusCode::CREATED => {
            let file: File = serde_json::from_slice(&response.body)?
            return Ok(UploadStatus {
                bytes_received: file.size.as_ref()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0),
                total_size: file.size.as_ref()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0),
                is_complete: true,
            })
        }

        // 308 Resume Incomplete - Upload in progress
        StatusCode::from_u16(308).unwrap() => {
            // Parse Range header
            let range_header = response.headers
                .get(RANGE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")

            let bytes_received = parse_range_header(range_header).unwrap_or(0)

            return Ok(UploadStatus {
                bytes_received,
                total_size: 0,  // Total unknown from status query
                is_complete: false,
            })
        }

        // Error status
        _ => {
            return Err(map_http_error(response))
        }
    }
}
```

### 5.4 Resume Upload

#### Rust Implementation

```rust
// Resume an interrupted upload
async function resume(
    session: &ResumableUploadSessionImpl,
) -> Result<UploadStatus, GoogleDriveError> {
    // Just query status to get current offset
    return session.query_status().await
}
```

### 5.5 Cancel Upload

#### Rust Implementation

```rust
// Cancel the upload
async function cancel(
    session: &ResumableUploadSessionImpl,
) -> Result<(), GoogleDriveError> {
    // 1. Build request with invalid range to cancel
    let url = Url::parse(&session.upload_uri)?
    let http_request = build_authenticated_request(
        session.transport.as_ref(),
        session.auth_provider.as_ref(),
        HttpMethod::DELETE,
        url,
        None,
        None,
    ).await?

    // 2. Send request (may return 404 if already complete/canceled)
    let _ = session.transport.send(http_request).await

    return Ok(())
}
```

---

## 6. Permissions Service

### 6.1 Create Permission

#### Rust Implementation

```rust
// Create a new permission on a file
async function create_permission(
    service: &PermissionsServiceImpl,
    file_id: &str,
    request: CreatePermissionRequest,
) -> Result<Permission, GoogleDriveError> {
    // 1. Build URL
    let mut url = service.base_url.join(&format!("/files/{}/permissions", file_id))?

    // 2. Add query parameters
    if let Some(email_message) = &request.email_message {
        url.query_pairs_mut().append_pair("emailMessage", email_message)
    }

    if let Some(send_notification) = request.send_notification_email {
        url.query_pairs_mut().append_pair("sendNotificationEmail", &send_notification.to_string())
    }

    if let Some(transfer_ownership) = request.transfer_ownership {
        url.query_pairs_mut().append_pair("transferOwnership", &transfer_ownership.to_string())
    }

    if let Some(supports_all_drives) = request.supports_all_drives {
        url.query_pairs_mut().append_pair("supportsAllDrives", &supports_all_drives.to_string())
    }

    // 3. Serialize permission to JSON
    let body = serde_json::to_vec(&request.permission)?

    // 4. Build headers
    let mut headers = HeaderMap::new()
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"))

    // 5. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::POST,
        url,
        Some(RequestBody::Bytes(Bytes::from(body))),
        Some(headers),
    ).await?

    // 6. Send request and parse response
    let permission: Permission = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(permission)
}
```

### 6.2 List Permissions

#### Rust Implementation

```rust
// List permissions for a file
async function list_permissions(
    service: &PermissionsServiceImpl,
    file_id: &str,
    params: Option<ListPermissionsParams>,
) -> Result<PermissionList, GoogleDriveError> {
    // 1. Build URL
    let mut url = service.base_url.join(&format!("/files/{}/permissions", file_id))?

    // 2. Add query parameters
    if let Some(params) = params {
        let mut query = url.query_pairs_mut()

        if let Some(page_size) = params.page_size {
            query.append_pair("pageSize", &page_size.to_string())
        }

        if let Some(page_token) = params.page_token {
            query.append_pair("pageToken", &page_token)
        }

        if let Some(supports_all_drives) = params.supports_all_drives {
            query.append_pair("supportsAllDrives", &supports_all_drives.to_string())
        }
    }

    // 3. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::GET,
        url,
        None,
        None,
    ).await?

    // 4. Send request and parse response
    let permission_list: PermissionList = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(permission_list)
}
```

### 6.3 Get Permission

#### Rust Implementation

```rust
// Get a specific permission
async function get_permission(
    service: &PermissionsServiceImpl,
    file_id: &str,
    permission_id: &str,
    params: Option<GetPermissionParams>,
) -> Result<Permission, GoogleDriveError> {
    // 1. Build URL
    let mut url = service.base_url.join(&format!("/files/{}/permissions/{}", file_id, permission_id))?

    // 2. Add query parameters
    if let Some(params) = params {
        let mut query = url.query_pairs_mut()

        if let Some(supports_all_drives) = params.supports_all_drives {
            query.append_pair("supportsAllDrives", &supports_all_drives.to_string())
        }
    }

    // 3. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::GET,
        url,
        None,
        None,
    ).await?

    // 4. Send request and parse response
    let permission: Permission = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(permission)
}
```

### 6.4 Update Permission

#### Rust Implementation

```rust
// Update a permission
async function update_permission(
    service: &PermissionsServiceImpl,
    file_id: &str,
    permission_id: &str,
    request: UpdatePermissionRequest,
) -> Result<Permission, GoogleDriveError> {
    // 1. Build URL
    let mut url = service.base_url.join(&format!("/files/{}/permissions/{}", file_id, permission_id))?

    // 2. Add query parameters
    if let Some(supports_all_drives) = request.supports_all_drives {
        url.query_pairs_mut().append_pair("supportsAllDrives", &supports_all_drives.to_string())
    }

    // 3. Serialize updates to JSON
    let body = serde_json::to_vec(&request.updates)?

    // 4. Build headers
    let mut headers = HeaderMap::new()
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"))

    // 5. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::PATCH,
        url,
        Some(RequestBody::Bytes(Bytes::from(body))),
        Some(headers),
    ).await?

    // 6. Send request and parse response
    let permission: Permission = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(permission)
}
```

### 6.5 Delete Permission

#### Rust Implementation

```rust
// Delete a permission
async function delete_permission(
    service: &PermissionsServiceImpl,
    file_id: &str,
    permission_id: &str,
    params: Option<DeletePermissionParams>,
) -> Result<(), GoogleDriveError> {
    // 1. Build URL
    let mut url = service.base_url.join(&format!("/files/{}/permissions/{}", file_id, permission_id))?

    // 2. Add query parameters
    if let Some(params) = params {
        let mut query = url.query_pairs_mut()

        if let Some(supports_all_drives) = params.supports_all_drives {
            query.append_pair("supportsAllDrives", &supports_all_drives.to_string())
        }
    }

    // 3. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::DELETE,
        url,
        None,
        None,
    ).await?

    // 4. Send request (expecting 204 No Content)
    send_empty_request(service.transport.as_ref(), http_request).await?

    return Ok(())
}
```

---

## 7. Comments and Replies Services

### 7.1 Comments Service

#### Rust Implementation

```rust
// Create a comment
async function create_comment(
    service: &CommentsServiceImpl,
    file_id: &str,
    request: CreateCommentRequest,
) -> Result<Comment, GoogleDriveError> {
    // 1. Build URL
    let url = service.base_url.join(&format!("/files/{}/comments", file_id))?

    // 2. Serialize comment to JSON
    let body = serde_json::to_vec(&request)?

    // 3. Build headers
    let mut headers = HeaderMap::new()
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"))

    // 4. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::POST,
        url,
        Some(RequestBody::Bytes(Bytes::from(body))),
        Some(headers),
    ).await?

    // 5. Send request and parse response
    let comment: Comment = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(comment)
}

// List comments
async function list_comments(
    service: &CommentsServiceImpl,
    file_id: &str,
    params: Option<ListCommentsParams>,
) -> Result<CommentList, GoogleDriveError> {
    // 1. Build URL
    let mut url = service.base_url.join(&format!("/files/{}/comments", file_id))?

    // 2. Add query parameters
    if let Some(params) = params {
        let mut query = url.query_pairs_mut()

        if let Some(include_deleted) = params.include_deleted {
            query.append_pair("includeDeleted", &include_deleted.to_string())
        }

        if let Some(page_size) = params.page_size {
            query.append_pair("pageSize", &page_size.to_string())
        }

        if let Some(page_token) = params.page_token {
            query.append_pair("pageToken", &page_token)
        }
    }

    // 3. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::GET,
        url,
        None,
        None,
    ).await?

    // 4. Send request and parse response
    let comment_list: CommentList = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(comment_list)
}

// Get, Update, Delete follow similar patterns
```

### 7.2 Replies Service

#### Rust Implementation

```rust
// Create a reply to a comment
async function create_reply(
    service: &RepliesServiceImpl,
    file_id: &str,
    comment_id: &str,
    request: CreateReplyRequest,
) -> Result<Reply, GoogleDriveError> {
    // 1. Build URL
    let url = service.base_url.join(&format!("/files/{}/comments/{}/replies", file_id, comment_id))?

    // 2. Serialize reply to JSON
    let body = serde_json::to_vec(&request)?

    // 3. Build headers
    let mut headers = HeaderMap::new()
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"))

    // 4. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::POST,
        url,
        Some(RequestBody::Bytes(Bytes::from(body))),
        Some(headers),
    ).await?

    // 5. Send request and parse response
    let reply: Reply = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(reply)
}

// List, Get, Update, Delete follow similar patterns
```

---

## 8. Revisions Service

### 8.1 List Revisions

#### Rust Implementation

```rust
// List revisions for a file
async function list_revisions(
    service: &RevisionsServiceImpl,
    file_id: &str,
    params: Option<ListRevisionsParams>,
) -> Result<RevisionList, GoogleDriveError> {
    // 1. Build URL
    let mut url = service.base_url.join(&format!("/files/{}/revisions", file_id))?

    // 2. Add query parameters
    if let Some(params) = params {
        let mut query = url.query_pairs_mut()

        if let Some(page_size) = params.page_size {
            query.append_pair("pageSize", &page_size.to_string())
        }

        if let Some(page_token) = params.page_token {
            query.append_pair("pageToken", &page_token)
        }
    }

    // 3. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::GET,
        url,
        None,
        None,
    ).await?

    // 4. Send request and parse response
    let revision_list: RevisionList = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(revision_list)
}
```

### 8.2 Get Revision

#### Rust Implementation

```rust
// Get a specific revision
async function get_revision(
    service: &RevisionsServiceImpl,
    file_id: &str,
    revision_id: &str,
    params: Option<GetRevisionParams>,
) -> Result<Revision, GoogleDriveError> {
    // 1. Build URL
    let mut url = service.base_url.join(&format!("/files/{}/revisions/{}", file_id, revision_id))?

    // 2. Add query parameters
    if let Some(params) = params {
        let mut query = url.query_pairs_mut()

        if let Some(fields) = params.fields {
            query.append_pair("fields", &fields)
        }
    }

    // 3. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::GET,
        url,
        None,
        None,
    ).await?

    // 4. Send request and parse response
    let revision: Revision = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(revision)
}
```

### 8.3 Download Revision

#### Rust Implementation

```rust
// Download a specific revision's content
async function download_revision(
    service: &RevisionsServiceImpl,
    file_id: &str,
    revision_id: &str,
) -> Result<Bytes, GoogleDriveError> {
    // 1. Build URL with alt=media
    let mut url = service.base_url.join(&format!("/files/{}/revisions/{}", file_id, revision_id))?
    url.query_pairs_mut().append_pair("alt", "media")

    // 2. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::GET,
        url,
        None,
        None,
    ).await?

    // 3. Send request and get raw bytes
    let bytes = send_raw_request(service.transport.as_ref(), http_request).await?

    return Ok(bytes)
}
```

---

## 9. Changes Service

### 9.1 Get Start Page Token

#### Rust Implementation

```rust
// Get the start page token for change tracking
async function get_start_page_token(
    service: &ChangesServiceImpl,
    params: Option<GetStartPageTokenParams>,
) -> Result<StartPageToken, GoogleDriveError> {
    // 1. Build URL
    let mut url = service.base_url.join("/changes/startPageToken")?

    // 2. Add query parameters
    if let Some(params) = params {
        let mut query = url.query_pairs_mut()

        if let Some(drive_id) = params.drive_id {
            query.append_pair("driveId", &drive_id)
        }

        if let Some(supports_all_drives) = params.supports_all_drives {
            query.append_pair("supportsAllDrives", &supports_all_drives.to_string())
        }
    }

    // 3. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::GET,
        url,
        None,
        None,
    ).await?

    // 4. Send request and parse response
    let token: StartPageToken = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(token)
}
```

### 9.2 List Changes

#### Rust Implementation

```rust
// List changes since a page token
async function list_changes(
    service: &ChangesServiceImpl,
    page_token: &str,
    params: Option<ListChangesParams>,
) -> Result<ChangeList, GoogleDriveError> {
    // 1. Build URL
    let mut url = service.base_url.join("/changes")?

    // 2. Add required page token
    url.query_pairs_mut().append_pair("pageToken", page_token)

    // 3. Add optional query parameters
    if let Some(params) = params {
        let mut query = url.query_pairs_mut()

        if let Some(drive_id) = params.drive_id {
            query.append_pair("driveId", &drive_id)
        }

        if let Some(include_removed) = params.include_removed {
            query.append_pair("includeRemoved", &include_removed.to_string())
        }

        if let Some(page_size) = params.page_size {
            query.append_pair("pageSize", &page_size.to_string())
        }

        if let Some(supports_all_drives) = params.supports_all_drives {
            query.append_pair("supportsAllDrives", &supports_all_drives.to_string())
        }
    }

    // 4. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::GET,
        url,
        None,
        None,
    ).await?

    // 5. Send request and parse response
    let change_list: ChangeList = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(change_list)
}
```

### 9.3 List All Changes

#### Rust Implementation

```rust
// List all changes with auto-pagination
function list_all_changes(
    service: &ChangesServiceImpl,
    start_page_token: &str,
    params: Option<ListChangesParams>,
) -> impl Stream<Item = Result<Change, GoogleDriveError>> + '_ {
    async_stream::try_stream! {
        let mut current_page_token = start_page_token.to_string()

        loop {
            // Fetch page
            let change_list = service.list(&current_page_token, params.clone()).await?

            // Yield all changes from this page
            for change in change_list.changes {
                yield change
            }

            // Check if there are more pages
            if let Some(token) = change_list.next_page_token {
                current_page_token = token
            } else {
                // No more pages, but may have newStartPageToken
                // (indicates we've caught up to current state)
                break
            }
        }
    }
}
```

### 9.4 Watch Changes

#### Rust Implementation

```rust
// Watch for changes via push notifications
async function watch_changes(
    service: &ChangesServiceImpl,
    page_token: &str,
    request: WatchChangesRequest,
) -> Result<Channel, GoogleDriveError> {
    // 1. Build URL
    let mut url = service.base_url.join("/changes/watch")?
    url.query_pairs_mut().append_pair("pageToken", page_token)

    // 2. Serialize channel to JSON
    let body = serde_json::to_vec(&request)?

    // 3. Build headers
    let mut headers = HeaderMap::new()
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"))

    // 4. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::POST,
        url,
        Some(RequestBody::Bytes(Bytes::from(body))),
        Some(headers),
    ).await?

    // 5. Send request and parse response
    let channel: Channel = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(channel)
}
```

---

## 10. Drives Service

### 10.1 List Shared Drives

#### Rust Implementation

```rust
// List shared drives
async function list_drives(
    service: &DrivesServiceImpl,
    params: Option<ListDrivesParams>,
) -> Result<DriveList, GoogleDriveError> {
    // 1. Build URL
    let mut url = service.base_url.join("/drives")?

    // 2. Add query parameters
    if let Some(params) = params {
        let mut query = url.query_pairs_mut()

        if let Some(page_size) = params.page_size {
            query.append_pair("pageSize", &page_size.to_string())
        }

        if let Some(page_token) = params.page_token {
            query.append_pair("pageToken", &page_token)
        }

        if let Some(q) = params.q {
            query.append_pair("q", &q)
        }
    }

    // 3. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::GET,
        url,
        None,
        None,
    ).await?

    // 4. Send request and parse response
    let drive_list: DriveList = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(drive_list)
}
```

### 10.2 Get Drive

#### Rust Implementation

```rust
// Get a specific shared drive
async function get_drive(
    service: &DrivesServiceImpl,
    drive_id: &str,
) -> Result<Drive, GoogleDriveError> {
    // 1. Build URL
    let url = service.base_url.join(&format!("/drives/{}", drive_id))?

    // 2. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::GET,
        url,
        None,
        None,
    ).await?

    // 3. Send request and parse response
    let drive: Drive = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(drive)
}
```

### 10.3 Create, Update, Delete Drives

Follow similar patterns as Files Service operations.

---

## 11. About Service

### 11.1 Get About

#### Rust Implementation

```rust
// Get information about the user's Drive
async function get_about(
    service: &AboutServiceImpl,
    params: GetAboutParams,
) -> Result<About, GoogleDriveError> {
    // 1. Build URL
    let mut url = service.base_url.join("/about")?

    // 2. Add required fields parameter
    url.query_pairs_mut().append_pair("fields", &params.fields)

    // 3. Build request
    let http_request = build_authenticated_request(
        service.transport.as_ref(),
        service.auth_provider.as_ref(),
        HttpMethod::GET,
        url,
        None,
        None,
    ).await?

    // 4. Send request and parse response
    let about: About = send_json_request(service.transport.as_ref(), http_request).await?

    return Ok(about)
}
```

---

## 12. Pagination Handler

### 12.1 Generic Pagination Iterator

#### Rust Implementation

```rust
// Generic pagination stream for any paginated API
function paginate<T, F, Fut>(
    initial_params: T,
    fetch_page: F,
) -> impl Stream<Item = Result<Vec<Item>, GoogleDriveError>>
where
    F: Fn(T) -> Fut,
    Fut: Future<Output = Result<Page<Item>, GoogleDriveError>>,
{
    async_stream::try_stream! {
        let mut params = initial_params
        let mut next_page_token: Option<String> = None

        loop {
            // Update page token
            params.set_page_token(next_page_token.clone())

            // Fetch page
            let page = fetch_page(params.clone()).await?

            // Yield items from this page
            yield page.items

            // Check for next page
            if let Some(token) = page.next_page_token {
                next_page_token = Some(token)
            } else {
                // No more pages
                break
            }
        }
    }
}

// Flatten paginated stream into individual items
function flatten_pages<T>(
    page_stream: impl Stream<Item = Result<Vec<T>, GoogleDriveError>>,
) -> impl Stream<Item = Result<T, GoogleDriveError>> {
    page_stream.flat_map(|result| {
        match result {
            Ok(items) => {
                stream::iter(items.into_iter().map(Ok))
            }
            Err(e) => {
                stream::once(async { Err(e) })
            }
        }
    })
}
```

#### TypeScript Implementation

```typescript
// Async generator for pagination
async function* paginate<TItem, TParams>(
    initialParams: TParams,
    fetchPage: (params: TParams) => Promise<Page<TItem>>,
    setPageToken: (params: TParams, token: string | undefined) => TParams,
): AsyncIterableIterator<TItem> {
    let params = initialParams
    let nextPageToken: string | undefined = undefined

    while (true) {
        // Update page token
        params = setPageToken(params, nextPageToken)

        // Fetch page
        const page = await fetchPage(params)

        // Yield all items from this page
        for (const item of page.items) {
            yield item
        }

        // Check for next page
        if (page.nextPageToken) {
            nextPageToken = page.nextPageToken
        } else {
            // No more pages
            break
        }
    }
}

// Collect all items from paginated iterator
async function collectAll<T>(
    iterator: AsyncIterableIterator<T>,
): Promise<T[]> {
    const items: T[] = []

    for await (const item of iterator) {
        items.push(item)
    }

    return items
}
```

---

## 13. Resilience Integration

### 13.1 Retry with Exponential Backoff

#### Rust Implementation

```rust
// Wrap API call with retry logic
async function with_retry<F, Fut, T>(
    retry_config: &RetryConfig,
    operation: F,
) -> Result<T, GoogleDriveError>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, GoogleDriveError>>,
{
    let mut attempt = 0
    let max_attempts = retry_config.max_attempts
    let base_delay = retry_config.base_delay

    loop {
        attempt += 1

        // Try operation
        match operation().await {
            Ok(result) => {
                return Ok(result)
            }
            Err(error) => {
                // Check if retryable
                if !error.is_retryable() || attempt >= max_attempts {
                    return Err(error)
                }

                // Calculate delay
                let delay = if let Some(retry_after) = error.retry_after() {
                    // Use server-specified delay
                    retry_after
                } else {
                    // Use exponential backoff
                    let backoff_factor = 2u32.pow(attempt - 1)
                    base_delay * backoff_factor
                }

                // Add jitter (±25%)
                let jitter_factor = 1.0 + (rand::random::<f64>() - 0.5) * 0.5
                let delay_with_jitter = delay.mul_f64(jitter_factor)

                // Log retry
                tracing::warn!(
                    attempt = attempt,
                    max_attempts = max_attempts,
                    delay_ms = delay_with_jitter.as_millis(),
                    error = ?error,
                    "Retrying after transient error"
                )

                // Wait before retry
                tokio::time::sleep(delay_with_jitter).await
            }
        }
    }
}
```

### 13.2 Circuit Breaker

#### Rust Implementation

```rust
// Circuit breaker state machine
enum CircuitState {
    Closed,
    Open { opened_at: Instant },
    HalfOpen,
}

struct CircuitBreaker {
    state: Arc<RwLock<CircuitState>>,
    failure_count: Arc<AtomicU32>,
    success_count: Arc<AtomicU32>,
    config: CircuitBreakerConfig,
}

// Execute operation through circuit breaker
async function execute_with_circuit_breaker<F, Fut, T>(
    circuit_breaker: &CircuitBreaker,
    operation: F,
) -> Result<T, GoogleDriveError>
where
    F: Fn() -> Fut,
    Fut: Future<Output = Result<T, GoogleDriveError>>,
{
    // 1. Check circuit state
    {
        let state = circuit_breaker.state.read().await
        match *state {
            CircuitState::Open { opened_at } => {
                // Check if reset timeout has elapsed
                if opened_at.elapsed() < circuit_breaker.config.reset_timeout {
                    // Circuit still open
                    return Err(GoogleDriveError::CircuitOpen {
                        message: "Circuit breaker is open".to_string(),
                    })
                }
                // Reset timeout elapsed, transition to half-open
                drop(state)
                let mut state = circuit_breaker.state.write().await
                *state = CircuitState::HalfOpen
                circuit_breaker.success_count.store(0, Ordering::Relaxed)
            }
            CircuitState::HalfOpen => {
                // Allow request through
            }
            CircuitState::Closed => {
                // Normal operation
            }
        }
    }

    // 2. Execute operation
    let result = operation().await

    // 3. Update circuit state based on result
    match &result {
        Ok(_) => {
            // Success
            let state = circuit_breaker.state.read().await
            match *state {
                CircuitState::HalfOpen => {
                    // Increment success count
                    let successes = circuit_breaker.success_count.fetch_add(1, Ordering::Relaxed) + 1

                    // Check if enough successes to close
                    if successes >= circuit_breaker.config.success_threshold {
                        drop(state)
                        let mut state = circuit_breaker.state.write().await
                        *state = CircuitState::Closed
                        circuit_breaker.failure_count.store(0, Ordering::Relaxed)

                        tracing::info!("Circuit breaker closed after successful requests")
                    }
                }
                CircuitState::Closed => {
                    // Reset failure count on success
                    circuit_breaker.failure_count.store(0, Ordering::Relaxed)
                }
                _ => {}
            }
        }
        Err(error) => {
            // Failure
            if error.is_retryable() {
                // Only count retryable errors
                let state = circuit_breaker.state.read().await
                match *state {
                    CircuitState::HalfOpen => {
                        // Any failure in half-open -> open
                        drop(state)
                        let mut state = circuit_breaker.state.write().await
                        *state = CircuitState::Open { opened_at: Instant::now() }

                        tracing::warn!("Circuit breaker opened due to failure in half-open state")
                    }
                    CircuitState::Closed => {
                        // Increment failure count
                        let failures = circuit_breaker.failure_count.fetch_add(1, Ordering::Relaxed) + 1

                        // Check if threshold exceeded
                        if failures >= circuit_breaker.config.failure_threshold {
                            drop(state)
                            let mut state = circuit_breaker.state.write().await
                            *state = CircuitState::Open { opened_at: Instant::now() }

                            tracing::warn!(
                                failures = failures,
                                threshold = circuit_breaker.config.failure_threshold,
                                "Circuit breaker opened due to failure threshold"
                            )
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    return result
}
```

### 13.3 Rate Limiting

#### Rust Implementation

```rust
// Rate limiter using token bucket algorithm
struct RateLimiter {
    tokens: Arc<Mutex<f64>>,
    max_tokens: f64,
    refill_rate: f64,  // tokens per second
    last_refill: Arc<Mutex<Instant>>,
}

// Acquire tokens (wait if necessary)
async function acquire(limiter: &RateLimiter, tokens: f64) -> Result<(), GoogleDriveError> {
    loop {
        // Refill tokens based on elapsed time
        {
            let mut token_count = limiter.tokens.lock().await
            let mut last_refill = limiter.last_refill.lock().await

            let now = Instant::now()
            let elapsed = now.duration_since(*last_refill).as_secs_f64()

            // Add refilled tokens
            let refilled = elapsed * limiter.refill_rate
            *token_count = (*token_count + refilled).min(limiter.max_tokens)
            *last_refill = now

            // Try to acquire
            if *token_count >= tokens {
                *token_count -= tokens
                return Ok(())
            }
        }

        // Not enough tokens, wait and try again
        let wait_time = Duration::from_millis(100)
        tokio::time::sleep(wait_time).await
    }
}

// Track rate limits from API responses
function update_rate_limit_from_response(
    limiter: &RateLimiter,
    response: &HttpResponse,
) {
    // Check for rate limit headers
    if let Some(remaining) = response.headers.get("x-ratelimit-remaining") {
        if let Ok(remaining_str) = remaining.to_str() {
            if let Ok(remaining_count) = remaining_str.parse::<f64>() {
                // Update token count based on server state
                let mut tokens = limiter.tokens.blocking_lock()
                *tokens = remaining_count
            }
        }
    }
}
```

---

## 14. Error Mapping

### 14.1 Map HTTP Status Codes

#### Rust Implementation

```rust
// Map HTTP response to GoogleDriveError
function map_http_error(response: HttpResponse) -> GoogleDriveError {
    // Try to parse error response body
    let error_response: Option<GoogleApiError> = serde_json::from_slice(&response.body).ok()

    let error_message = error_response
        .as_ref()
        .and_then(|e| e.error.message.clone())
        .unwrap_or_else(|| String::from_utf8_lossy(&response.body).to_string())

    let error_reason = error_response
        .as_ref()
        .and_then(|e| e.error.errors.first())
        .and_then(|e| e.reason.clone())

    // Map based on status code and reason
    match (response.status, error_reason.as_deref()) {
        // 400 Bad Request
        (StatusCode::BAD_REQUEST, Some("invalidParameter")) => {
            GoogleDriveError::Request(RequestError::InvalidParameter {
                message: error_message,
            })
        }
        (StatusCode::BAD_REQUEST, Some("invalidQuery")) => {
            GoogleDriveError::Request(RequestError::InvalidQuery {
                message: error_message,
            })
        }
        (StatusCode::BAD_REQUEST, _) => {
            GoogleDriveError::Request(RequestError::ValidationError {
                message: error_message,
            })
        }

        // 401 Unauthorized
        (StatusCode::UNAUTHORIZED, Some("expired")) => {
            GoogleDriveError::Authentication(AuthenticationError::ExpiredToken {
                message: error_message,
            })
        }
        (StatusCode::UNAUTHORIZED, _) => {
            GoogleDriveError::Authentication(AuthenticationError::InvalidToken {
                message: error_message,
            })
        }

        // 403 Forbidden
        (StatusCode::FORBIDDEN, Some("insufficientPermissions")) => {
            GoogleDriveError::Authorization(AuthorizationError::InsufficientPermissions {
                message: error_message,
            })
        }
        (StatusCode::FORBIDDEN, Some("domainPolicy")) => {
            GoogleDriveError::Authorization(AuthorizationError::DomainPolicy {
                message: error_message,
            })
        }
        (StatusCode::FORBIDDEN, Some("userRateLimitExceeded")) => {
            let retry_after = parse_retry_after(&response.headers)
            GoogleDriveError::Quota(QuotaError::UserRateLimitExceeded {
                message: error_message,
                retry_after,
            })
        }
        (StatusCode::FORBIDDEN, Some("rateLimitExceeded")) => {
            let retry_after = parse_retry_after(&response.headers)
            GoogleDriveError::Quota(QuotaError::ProjectRateLimitExceeded {
                message: error_message,
                retry_after,
            })
        }
        (StatusCode::FORBIDDEN, Some("storageQuotaExceeded")) => {
            GoogleDriveError::Quota(QuotaError::StorageQuotaExceeded {
                message: error_message,
                limit: 0,  // Parse from error details if available
                used: 0,
            })
        }
        (StatusCode::FORBIDDEN, _) => {
            GoogleDriveError::Authorization(AuthorizationError::Forbidden {
                message: error_message,
            })
        }

        // 404 Not Found
        (StatusCode::NOT_FOUND, _) => {
            GoogleDriveError::Resource(ResourceError::FileNotFound {
                message: error_message,
            })
        }

        // 429 Too Many Requests
        (StatusCode::TOO_MANY_REQUESTS, _) => {
            let retry_after = parse_retry_after(&response.headers)
            GoogleDriveError::Quota(QuotaError::UserRateLimitExceeded {
                message: error_message,
                retry_after,
            })
        }

        // 500 Internal Server Error
        (StatusCode::INTERNAL_SERVER_ERROR, _) => {
            GoogleDriveError::Server(ServerError::InternalError {
                message: error_message,
            })
        }

        // 502 Bad Gateway
        (StatusCode::BAD_GATEWAY, _) => {
            GoogleDriveError::Server(ServerError::BadGateway {
                message: error_message,
            })
        }

        // 503 Service Unavailable
        (StatusCode::SERVICE_UNAVAILABLE, Some("backendError")) => {
            let retry_after = parse_retry_after(&response.headers)
            GoogleDriveError::Server(ServerError::BackendError {
                message: error_message,
                retry_after,
            })
        }
        (StatusCode::SERVICE_UNAVAILABLE, _) => {
            let retry_after = parse_retry_after(&response.headers)
            GoogleDriveError::Server(ServerError::ServiceUnavailable {
                message: error_message,
                retry_after,
            })
        }

        // Unknown error
        _ => {
            GoogleDriveError::Server(ServerError::InternalError {
                message: format!("Unexpected error: {} - {}", response.status, error_message),
            })
        }
    }
}

// Parse Retry-After header
function parse_retry_after(headers: &HeaderMap) -> Option<Duration> {
    headers
        .get(RETRY_AFTER)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| {
            // Try parsing as seconds
            s.parse::<u64>().ok().map(Duration::from_secs)
        })
}
```

### 14.2 Map Transport Errors

#### Rust Implementation

```rust
// Map transport errors to GoogleDriveError
function map_transport_error(error: TransportError) -> GoogleDriveError {
    match error {
        TransportError::Timeout { .. } => {
            GoogleDriveError::Network(NetworkError::Timeout {
                message: "Request timed out".to_string(),
            })
        }
        TransportError::ConnectionFailed { message } => {
            GoogleDriveError::Network(NetworkError::ConnectionFailed {
                message,
            })
        }
        TransportError::TlsError { message } => {
            GoogleDriveError::Network(NetworkError::TlsError {
                message,
            })
        }
        TransportError::DnsResolutionFailed { message } => {
            GoogleDriveError::Network(NetworkError::DnsResolutionFailed {
                message,
            })
        }
        _ => {
            GoogleDriveError::Network(NetworkError::ConnectionFailed {
                message: error.to_string(),
            })
        }
    }
}
```

### 14.3 Google API Error Response Format

```rust
// Google API error response structure
#[derive(Deserialize)]
struct GoogleApiError {
    error: GoogleApiErrorDetail,
}

#[derive(Deserialize)]
struct GoogleApiErrorDetail {
    code: u16,
    message: Option<String>,
    errors: Vec<GoogleApiErrorItem>,
}

#[derive(Deserialize)]
struct GoogleApiErrorItem {
    domain: Option<String>,
    reason: Option<String>,
    message: Option<String>,
    location: Option<String>,
    location_type: Option<String>,
}
```

---

## Summary

This pseudocode document provides comprehensive algorithmic descriptions for implementing the Google Drive integration module. Key components include:

1. **Client Initialization**: Setting up the GoogleDriveClient with all services and proper configuration validation
2. **Authentication**: OAuth2 and Service Account providers with token caching and automatic refresh
3. **Transport Layer**: HTTP request building, authentication header injection, and response handling
4. **Files Service**: Complete CRUD operations including create, get, download, list, update, delete, copy, export, and folder management
5. **Resumable Upload**: Chunk-based upload with resume capability for large files
6. **Permissions Service**: Full permission management (create, list, get, update, delete)
7. **Comments/Replies**: Comment and reply management
8. **Revisions**: Revision listing and content download
9. **Changes**: Change tracking with pagination
10. **Drives**: Shared drives management
11. **About**: Quota and user information
12. **Pagination**: Generic pagination handler for all paginated APIs
13. **Resilience**: Retry with exponential backoff, circuit breaker, and rate limiting
14. **Error Mapping**: Comprehensive HTTP status code and error reason mapping

All implementations follow the specification requirements and are designed for both Rust and TypeScript with proper error handling, type safety, and observability integration points.
