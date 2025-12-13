# Pseudocode: Azure Active Directory OAuth2 Integration Module

## SPARC Phase 2: Pseudocode

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/azure-active-directory`

---

## Table of Contents

1. [Module Structure](#1-module-structure)
2. [Configuration](#2-configuration)
3. [Client Core](#3-client-core)
4. [Client Credentials Flow](#4-client-credentials-flow)
5. [Authorization Code Flow](#5-authorization-code-flow)
6. [Device Code Flow](#6-device-code-flow)
7. [Managed Identity](#7-managed-identity)
8. [Token Management](#8-token-management)
9. [Token Validation](#9-token-validation)
10. [Simulation Layer](#10-simulation-layer)
11. [Error Handling](#11-error-handling)

---

## 1. Module Structure

```
azure-active-directory/
├── src/
│   ├── lib.rs                 # Public exports
│   ├── client.rs              # AzureAdClient
│   ├── config.rs              # Configuration builder
│   ├── flows/
│   │   ├── mod.rs
│   │   ├── client_credentials.rs
│   │   ├── authorization_code.rs
│   │   ├── device_code.rs
│   │   ├── managed_identity.rs
│   │   └── on_behalf_of.rs
│   ├── token/
│   │   ├── mod.rs
│   │   ├── cache.rs           # Token caching
│   │   ├── refresh.rs         # Token refresh
│   │   └── validation.rs      # JWT validation
│   ├── crypto/
│   │   ├── mod.rs
│   │   ├── jwt.rs             # JWT signing/parsing
│   │   └── pkce.rs            # PKCE generation
│   ├── simulation/
│   │   ├── mod.rs
│   │   ├── layer.rs
│   │   ├── recorder.rs
│   │   └── storage.rs
│   ├── types/
│   │   ├── mod.rs
│   │   ├── token.rs
│   │   ├── claims.rs
│   │   └── request.rs
│   └── error.rs
└── tests/
    ├── client_credentials_test.rs
    ├── auth_code_test.rs
    ├── managed_identity_test.rs
    └── simulation_test.rs
```

---

## 2. Configuration

### 2.1 Config Structure

```rust
STRUCT AzureAdConfig {
    tenant_id: String,
    client_id: String,
    credential: CredentialType,
    authority: String,              // Default: login.microsoftonline.com
    redirect_uri: Option<String>,
    cache_config: CacheConfig,
    retry_config: RetryConfig,
    simulation_mode: SimulationMode,
}

ENUM CredentialType {
    ClientSecret(SecretString),     // Zeroized on drop
    Certificate {
        cert_data: Vec<u8>,
        password: Option<SecretString>,
    },
    ManagedIdentity {
        client_id: Option<String>,  // For user-assigned
    },
    None,                           // Public client
}

STRUCT CacheConfig {
    enabled: bool,
    max_entries: usize,             // Default 1000
    refresh_buffer: Duration,       // Default 5 minutes
}
```

### 2.2 Config Builder

```rust
IMPL AzureAdConfigBuilder {
    FUNCTION new(tenant_id: &str, client_id: &str) -> Self {
        Self {
            tenant_id: tenant_id.to_string(),
            client_id: client_id.to_string(),
            credential: CredentialType::None,
            authority: "https://login.microsoftonline.com".to_string(),
            redirect_uri: None,
            cache_config: CacheConfig::default(),
            retry_config: RetryConfig::default(),
            simulation_mode: SimulationMode::Disabled,
        }
    }

    FUNCTION with_client_secret(mut self, secret: &str) -> Self {
        self.credential = CredentialType::ClientSecret(SecretString::new(secret))
        RETURN self
    }

    FUNCTION with_certificate(mut self, cert_data: Vec<u8>, password: Option<&str>) -> Self {
        self.credential = CredentialType::Certificate {
            cert_data,
            password: password.map(SecretString::new),
        }
        RETURN self
    }

    FUNCTION with_managed_identity(mut self, client_id: Option<&str>) -> Self {
        self.credential = CredentialType::ManagedIdentity {
            client_id: client_id.map(String::from),
        }
        RETURN self
    }

    FUNCTION with_simulation(mut self, mode: SimulationMode) -> Self {
        self.simulation_mode = mode
        RETURN self
    }

    FUNCTION from_env() -> Result<Self, ConfigError> {
        tenant_id = ENV("AZURE_TENANT_ID")?
        client_id = ENV("AZURE_CLIENT_ID")?

        builder = Self::new(&tenant_id, &client_id)

        // Check for various credential types
        IF let Ok(secret) = ENV("AZURE_CLIENT_SECRET") {
            RETURN Ok(builder.with_client_secret(&secret))
        }

        IF let Ok(cert_path) = ENV("AZURE_CLIENT_CERTIFICATE_PATH") {
            cert_data = read_file(cert_path)?
            password = ENV("AZURE_CLIENT_CERTIFICATE_PASSWORD").ok()
            RETURN Ok(builder.with_certificate(cert_data, password.as_deref()))
        }

        IF ENV("AZURE_USE_MANAGED_IDENTITY").is_ok() {
            client_id = ENV("AZURE_MANAGED_IDENTITY_CLIENT_ID").ok()
            RETURN Ok(builder.with_managed_identity(client_id.as_deref()))
        }

        RETURN Ok(builder)
    }

    FUNCTION build(self) -> Result<AzureAdConfig, ConfigError> {
        VALIDATE self.tenant_id NOT empty
        VALIDATE self.client_id NOT empty
        RETURN Ok(AzureAdConfig { ...self })
    }
}
```

---

## 3. Client Core

```rust
STRUCT AzureAdClient {
    config: Arc<AzureAdConfig>,
    http_client: Arc<HttpClient>,
    token_cache: Arc<TokenCache>,
    jwks_cache: Arc<JwksCache>,
    simulation: Arc<SimulationLayer>,
}

IMPL AzureAdClient {
    ASYNC FUNCTION new(config: AzureAdConfig) -> Result<Self, AzureAdError> {
        http_client = HttpClient::builder()
            .timeout(Duration::from_secs(30))
            .build()?

        token_cache = TokenCache::new(config.cache_config.clone())
        jwks_cache = JwksCache::new()
        simulation = SimulationLayer::new(config.simulation_mode.clone())

        RETURN Ok(Self {
            config: Arc::new(config),
            http_client: Arc::new(http_client),
            token_cache: Arc::new(token_cache),
            jwks_cache: Arc::new(jwks_cache),
            simulation: Arc::new(simulation),
        })
    }

    FUNCTION token_endpoint(&self) -> String {
        format!("{}/{}/oauth2/v2.0/token", self.config.authority, self.config.tenant_id)
    }

    FUNCTION authorize_endpoint(&self) -> String {
        format!("{}/{}/oauth2/v2.0/authorize", self.config.authority, self.config.tenant_id)
    }

    FUNCTION jwks_endpoint(&self) -> String {
        format!("{}/{}/discovery/v2.0/keys", self.config.authority, self.config.tenant_id)
    }

    ASYNC FUNCTION execute_token_request(&self, params: TokenRequestParams) -> Result<TokenResponse, AzureAdError> {
        // Check simulation mode
        IF self.simulation.is_replay() {
            RETURN self.simulation.replay_token_request(&params).await
        }

        // Build request
        request = Request::post(self.token_endpoint())
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(params.to_form_encoded())
            .build()

        // Execute with retry
        response = self.execute_with_retry(request).await?

        // Record if in recording mode
        IF self.simulation.is_recording() {
            self.simulation.record_token_request(&params, &response).await?
        }

        RETURN parse_token_response(response)
    }

    ASYNC FUNCTION execute_with_retry(&self, request: Request) -> Result<Response, AzureAdError> {
        retry_count = 0
        backoff = self.config.retry_config.initial_backoff

        LOOP {
            response = self.http_client.execute(request.clone()).await

            MATCH response {
                Ok(resp) IF resp.status.is_success() => RETURN Ok(resp),
                Ok(resp) IF is_retryable_status(resp.status) => {
                    IF retry_count >= self.config.retry_config.max_retries {
                        RETURN Err(AzureAdError::from_response(resp))
                    }
                },
                Ok(resp) => RETURN Err(AzureAdError::from_response(resp)),
                Err(e) IF e.is_transient() => {
                    IF retry_count >= self.config.retry_config.max_retries {
                        RETURN Err(AzureAdError::Network(e))
                    }
                },
                Err(e) => RETURN Err(AzureAdError::Network(e)),
            }

            retry_count += 1
            sleep(backoff).await
            backoff = min(backoff * 2, self.config.retry_config.max_backoff)
        }
    }
}
```

---

## 4. Client Credentials Flow

```rust
IMPL AzureAdClient {
    ASYNC FUNCTION acquire_token_client_credentials(&self, scopes: &[&str]) -> Result<AccessToken, AzureAdError> {
        // Check cache first
        cache_key = self.build_cache_key("client_credentials", scopes)
        IF let Some(token) = self.token_cache.get(&cache_key) {
            IF !token.is_expired_with_buffer(self.config.cache_config.refresh_buffer) {
                RETURN Ok(token)
            }
        }

        // Build token request based on credential type
        params = MATCH &self.config.credential {
            CredentialType::ClientSecret(secret) => {
                TokenRequestParams {
                    grant_type: "client_credentials",
                    client_id: &self.config.client_id,
                    client_secret: Some(secret.expose()),
                    scope: scopes.join(" "),
                    ..Default::default()
                }
            },
            CredentialType::Certificate { cert_data, password } => {
                assertion = self.build_client_assertion(cert_data, password)?
                TokenRequestParams {
                    grant_type: "client_credentials",
                    client_id: &self.config.client_id,
                    client_assertion_type: Some("urn:ietf:params:oauth:client-assertion-type:jwt-bearer"),
                    client_assertion: Some(&assertion),
                    scope: scopes.join(" "),
                    ..Default::default()
                }
            },
            _ => RETURN Err(AzureAdError::InvalidCredentials {
                message: "Client credentials require secret or certificate".to_string(),
            }),
        }

        // Execute request
        response = self.execute_token_request(params).await?

        // Cache token
        token = response.access_token
        self.token_cache.set(cache_key, token.clone())

        RETURN Ok(token)
    }

    FUNCTION build_client_assertion(&self, cert_data: &[u8], password: &Option<SecretString>) -> Result<String, AzureAdError> {
        // Load certificate and private key
        (cert, key) = load_certificate(cert_data, password)?

        // Build JWT header
        header = JwtHeader {
            alg: "RS256",
            typ: "JWT",
            x5t: base64_url_encode(cert.thumbprint()),
        }

        // Build JWT claims
        now = current_timestamp()
        claims = JwtClaims {
            aud: self.token_endpoint(),
            iss: self.config.client_id.clone(),
            sub: self.config.client_id.clone(),
            jti: generate_uuid(),
            nbf: now,
            exp: now + 300,  // 5 minutes
        }

        // Sign JWT
        jwt = sign_jwt(header, claims, key)?

        RETURN Ok(jwt)
    }
}
```

---

## 5. Authorization Code Flow

```rust
IMPL AzureAdClient {
    FUNCTION get_authorization_url(&self, params: AuthCodeParams) -> Result<AuthorizationUrl, AzureAdError> {
        // Generate PKCE if not provided
        (code_challenge, code_verifier) = IF params.code_challenge.is_none() {
            generate_pkce()
        } ELSE {
            (params.code_challenge.unwrap(), params.code_verifier.unwrap())
        }

        // Generate state if not provided
        state = params.state.unwrap_or_else(generate_state)

        // Build URL
        url = Url::parse(&self.authorize_endpoint())?
        url.query_pairs_mut()
            .append_pair("client_id", &self.config.client_id)
            .append_pair("response_type", "code")
            .append_pair("redirect_uri", &params.redirect_uri)
            .append_pair("scope", &params.scopes.join(" "))
            .append_pair("state", &state)
            .append_pair("code_challenge", &code_challenge)
            .append_pair("code_challenge_method", "S256")

        IF let Some(prompt) = params.prompt {
            url.query_pairs_mut().append_pair("prompt", &prompt)
        }

        IF let Some(login_hint) = params.login_hint {
            url.query_pairs_mut().append_pair("login_hint", &login_hint)
        }

        RETURN Ok(AuthorizationUrl {
            url: url.to_string(),
            state,
            code_verifier,
        })
    }

    ASYNC FUNCTION acquire_token_by_auth_code(&self, code: &str, redirect_uri: &str, code_verifier: &str) -> Result<TokenResponse, AzureAdError> {
        params = TokenRequestParams {
            grant_type: "authorization_code",
            client_id: &self.config.client_id,
            code: Some(code),
            redirect_uri: Some(redirect_uri),
            code_verifier: Some(code_verifier),
            ..Default::default()
        }

        // Add client secret if configured
        IF let CredentialType::ClientSecret(secret) = &self.config.credential {
            params.client_secret = Some(secret.expose())
        }

        response = self.execute_token_request(params).await?

        // Cache tokens
        cache_key = self.build_cache_key("auth_code", &response.access_token.scopes)
        self.token_cache.set(cache_key, response.access_token.clone())

        IF let Some(ref refresh_token) = response.refresh_token {
            self.token_cache.set_refresh_token(cache_key, refresh_token.clone())
        }

        RETURN Ok(response)
    }
}

// PKCE helpers
FUNCTION generate_pkce() -> (String, String) {
    // Generate 32 random bytes for verifier
    verifier_bytes = random_bytes(32)
    verifier = base64_url_encode(verifier_bytes)

    // SHA256 hash for challenge
    challenge_bytes = sha256(verifier.as_bytes())
    challenge = base64_url_encode(challenge_bytes)

    RETURN (challenge, verifier)
}

FUNCTION generate_state() -> String {
    base64_url_encode(random_bytes(16))
}
```

---

## 6. Device Code Flow

```rust
IMPL AzureAdClient {
    ASYNC FUNCTION initiate_device_code(&self, scopes: &[&str]) -> Result<DeviceCodeResponse, AzureAdError> {
        // Check simulation mode
        IF self.simulation.is_replay() {
            RETURN self.simulation.replay_device_code(scopes).await
        }

        url = format!("{}/{}/oauth2/v2.0/devicecode", self.config.authority, self.config.tenant_id)

        params = [
            ("client_id", self.config.client_id.as_str()),
            ("scope", &scopes.join(" ")),
        ]

        request = Request::post(url)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(encode_form_params(&params))
            .build()

        response = self.http_client.execute(request).await?
        body = response.json::<DeviceCodeResponseRaw>().await?

        // Record if needed
        IF self.simulation.is_recording() {
            self.simulation.record_device_code(scopes, &body).await?
        }

        RETURN Ok(DeviceCodeResponse {
            device_code: body.device_code,
            user_code: body.user_code,
            verification_uri: body.verification_uri,
            expires_in: body.expires_in,
            interval: body.interval,
            message: body.message,
        })
    }

    ASYNC FUNCTION acquire_token_by_device_code(&self, device_code: &str, interval: u64) -> Result<AccessToken, AzureAdError> {
        // Check simulation mode
        IF self.simulation.is_replay() {
            RETURN self.simulation.replay_device_code_token(device_code).await
        }

        params = TokenRequestParams {
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            client_id: &self.config.client_id,
            device_code: Some(device_code),
            ..Default::default()
        }

        // Poll until success, error, or timeout
        poll_interval = Duration::from_secs(interval)

        LOOP {
            response = self.execute_token_request(params.clone()).await

            MATCH response {
                Ok(token_response) => {
                    // Cache and return
                    cache_key = self.build_cache_key("device_code", &token_response.access_token.scopes)
                    self.token_cache.set(cache_key, token_response.access_token.clone())
                    RETURN Ok(token_response.access_token)
                },
                Err(AzureAdError::AuthorizationPending) => {
                    // User hasn't completed login yet, keep polling
                    sleep(poll_interval).await
                },
                Err(AzureAdError::SlowDown) => {
                    // Increase poll interval
                    poll_interval += Duration::from_secs(5)
                    sleep(poll_interval).await
                },
                Err(e) => RETURN Err(e),
            }
        }
    }
}
```

---

## 7. Managed Identity

```rust
CONST IMDS_ENDPOINT: &str = "http://169.254.169.254/metadata/identity/oauth2/token"
CONST IMDS_API_VERSION: &str = "2019-08-01"

IMPL AzureAdClient {
    ASYNC FUNCTION acquire_token_managed_identity(&self, resource: &str) -> Result<AccessToken, AzureAdError> {
        // Check cache first
        cache_key = self.build_cache_key("managed_identity", &[resource])
        IF let Some(token) = self.token_cache.get(&cache_key) {
            IF !token.is_expired_with_buffer(self.config.cache_config.refresh_buffer) {
                RETURN Ok(token)
            }
        }

        // Check simulation mode
        IF self.simulation.is_replay() {
            RETURN self.simulation.replay_managed_identity(resource).await
        }

        // Build IMDS request
        url = Url::parse(IMDS_ENDPOINT)?
        url.query_pairs_mut()
            .append_pair("api-version", IMDS_API_VERSION)
            .append_pair("resource", resource)

        // Add client_id for user-assigned identity
        IF let CredentialType::ManagedIdentity { client_id: Some(id) } = &self.config.credential {
            url.query_pairs_mut().append_pair("client_id", id)
        }

        request = Request::get(url.to_string())
            .header("Metadata", "true")
            .build()

        // Execute request (no retry for IMDS - it's local)
        response = self.http_client.execute(request).await
            .map_err(|e| AzureAdError::ManagedIdentityUnavailable {
                message: format!("IMDS not available: {}", e),
            })?

        IF !response.status.is_success() {
            RETURN Err(AzureAdError::ManagedIdentityUnavailable {
                message: format!("IMDS returned status {}", response.status),
            })
        }

        body = response.json::<ImdsTokenResponse>().await?

        // Record if needed
        IF self.simulation.is_recording() {
            self.simulation.record_managed_identity(resource, &body).await?
        }

        token = AccessToken {
            token: body.access_token,
            token_type: body.token_type,
            expires_on: parse_timestamp(body.expires_on),
            scopes: vec![resource.to_string()],
            tenant_id: self.config.tenant_id.clone(),
        }

        // Cache token
        self.token_cache.set(cache_key, token.clone())

        RETURN Ok(token)
    }

    FUNCTION is_managed_identity_available() -> bool {
        // Quick check if IMDS is reachable
        TRY {
            socket = TcpStream::connect_timeout(
                "169.254.169.254:80",
                Duration::from_millis(500)
            )
            socket.is_ok()
        } CATCH {
            false
        }
    }
}
```

---

## 8. Token Management

### 8.1 Token Cache

```rust
STRUCT TokenCache {
    access_tokens: RwLock<HashMap<String, CachedToken>>,
    refresh_tokens: RwLock<HashMap<String, String>>,
    config: CacheConfig,
}

STRUCT CachedToken {
    token: AccessToken,
    cached_at: Instant,
}

IMPL TokenCache {
    FUNCTION new(config: CacheConfig) -> Self {
        Self {
            access_tokens: RwLock::new(HashMap::new()),
            refresh_tokens: RwLock::new(HashMap::new()),
            config,
        }
    }

    FUNCTION get(&self, key: &str) -> Option<AccessToken> {
        IF !self.config.enabled {
            RETURN None
        }

        guard = self.access_tokens.read()
        IF let Some(cached) = guard.get(key) {
            RETURN Some(cached.token.clone())
        }
        None
    }

    FUNCTION set(&self, key: String, token: AccessToken) {
        IF !self.config.enabled {
            RETURN
        }

        // Evict if at capacity
        guard = self.access_tokens.write()
        IF guard.len() >= self.config.max_entries {
            self.evict_expired(&mut guard)
        }

        guard.insert(key, CachedToken {
            token,
            cached_at: Instant::now(),
        })
    }

    FUNCTION evict_expired(&self, cache: &mut HashMap<String, CachedToken>) {
        now = Instant::now()
        cache.retain(|_, v| !v.token.is_expired())
    }

    FUNCTION clear(&self) {
        self.access_tokens.write().clear()
        self.refresh_tokens.write().clear()
    }
}
```

### 8.2 Token Refresh

```rust
IMPL AzureAdClient {
    ASYNC FUNCTION refresh_token(&self, refresh_token: &str, scopes: &[&str]) -> Result<TokenResponse, AzureAdError> {
        params = TokenRequestParams {
            grant_type: "refresh_token",
            client_id: &self.config.client_id,
            refresh_token: Some(refresh_token),
            scope: scopes.join(" "),
            ..Default::default()
        }

        // Add client secret if configured
        IF let CredentialType::ClientSecret(secret) = &self.config.credential {
            params.client_secret = Some(secret.expose())
        }

        response = self.execute_token_request(params).await?

        // Update cache
        cache_key = self.build_cache_key("refresh", scopes)
        self.token_cache.set(cache_key, response.access_token.clone())

        IF let Some(ref new_refresh_token) = response.refresh_token {
            self.token_cache.set_refresh_token(cache_key, new_refresh_token.clone())
        }

        RETURN Ok(response)
    }

    ASYNC FUNCTION ensure_token(&self, scopes: &[&str]) -> Result<AccessToken, AzureAdError> {
        cache_key = self.build_cache_key("auto", scopes)

        // Check cache
        IF let Some(token) = self.token_cache.get(&cache_key) {
            IF !token.is_expired_with_buffer(self.config.cache_config.refresh_buffer) {
                RETURN Ok(token)
            }

            // Try refresh if we have refresh token
            IF let Some(refresh_token) = self.token_cache.get_refresh_token(&cache_key) {
                TRY {
                    response = self.refresh_token(&refresh_token, scopes).await?
                    RETURN Ok(response.access_token)
                } CATCH {
                    // Refresh failed, fall through to re-acquire
                }
            }
        }

        // Re-acquire based on credential type
        MATCH &self.config.credential {
            CredentialType::ClientSecret(_) | CredentialType::Certificate { .. } => {
                self.acquire_token_client_credentials(scopes).await
            },
            CredentialType::ManagedIdentity { .. } => {
                // Convert scopes to resource
                resource = scopes.first().unwrap_or(&"https://management.azure.com/")
                self.acquire_token_managed_identity(resource).await
            },
            CredentialType::None => {
                Err(AzureAdError::InvalidCredentials {
                    message: "No credentials configured for automatic token acquisition".to_string(),
                })
            },
        }
    }
}
```

---

## 9. Token Validation

```rust
STRUCT JwksCache {
    keys: RwLock<Option<JwksDocument>>,
    fetched_at: RwLock<Option<Instant>>,
    ttl: Duration,
}

IMPL AzureAdClient {
    ASYNC FUNCTION validate_token(&self, token: &str) -> Result<TokenClaims, AzureAdError> {
        // Parse without verification first to get header
        header = parse_jwt_header(token)?

        // Get signing key
        key = self.get_signing_key(&header.kid).await?

        // Verify signature
        claims = verify_jwt_signature(token, key)?

        // Validate claims
        self.validate_claims(&claims)?

        RETURN Ok(claims)
    }

    ASYNC FUNCTION get_signing_key(&self, kid: &str) -> Result<JsonWebKey, AzureAdError> {
        // Check cache
        jwks = self.jwks_cache.get_or_fetch(|| self.fetch_jwks()).await?

        // Find key by kid
        key = jwks.keys.iter()
            .find(|k| k.kid == kid)
            .ok_or(AzureAdError::InvalidToken {
                message: format!("Signing key {} not found", kid),
            })?

        RETURN Ok(key.clone())
    }

    ASYNC FUNCTION fetch_jwks(&self) -> Result<JwksDocument, AzureAdError> {
        request = Request::get(self.jwks_endpoint()).build()
        response = self.http_client.execute(request).await?
        jwks = response.json::<JwksDocument>().await?
        RETURN Ok(jwks)
    }

    FUNCTION validate_claims(&self, claims: &TokenClaims) -> Result<(), AzureAdError> {
        now = current_timestamp()

        // Check expiry
        IF claims.exp < now {
            RETURN Err(AzureAdError::ExpiredToken {
                expired_at: claims.exp,
            })
        }

        // Check not before
        IF let Some(nbf) = claims.nbf {
            IF nbf > now {
                RETURN Err(AzureAdError::InvalidToken {
                    message: "Token not yet valid".to_string(),
                })
            }
        }

        // Validate issuer
        expected_issuer = format!("https://login.microsoftonline.com/{}/v2.0", self.config.tenant_id)
        IF claims.iss != expected_issuer {
            // Also accept v1 issuer format
            expected_issuer_v1 = format!("https://sts.windows.net/{}/", self.config.tenant_id)
            IF claims.iss != expected_issuer_v1 {
                RETURN Err(AzureAdError::InvalidToken {
                    message: format!("Invalid issuer: {}", claims.iss),
                })
            }
        }

        // Validate audience (client_id or custom)
        IF claims.aud != self.config.client_id {
            RETURN Err(AzureAdError::InvalidToken {
                message: format!("Invalid audience: {}", claims.aud),
            })
        }

        Ok(())
    }
}
```

---

## 10. Simulation Layer

```rust
STRUCT SimulationLayer {
    mode: RwLock<SimulationMode>,
    recorder: RwLock<SimulationRecorder>,
    storage: SimulationStorage,
}

IMPL SimulationLayer {
    FUNCTION new(mode: SimulationMode) -> Self {
        recorder = SimulationRecorder::new()
        storage = SimulationStorage::new()

        IF let SimulationMode::Replay { path } = &mode {
            storage.load(path).expect("Failed to load recordings")
        }

        Self {
            mode: RwLock::new(mode),
            recorder: RwLock::new(recorder),
            storage,
        }
    }

    FUNCTION is_recording(&self) -> bool {
        matches!(*self.mode.read(), SimulationMode::Recording { .. })
    }

    FUNCTION is_replay(&self) -> bool {
        matches!(*self.mode.read(), SimulationMode::Replay { .. })
    }

    ASYNC FUNCTION replay_token_request(&self, params: &TokenRequestParams) -> Result<TokenResponse, AzureAdError> {
        key = generate_replay_key(params)
        recording = self.storage.find(&key)
            .ok_or(AzureAdError::SimulationNoMatch { key })?

        // Generate mock token with current timestamps
        mock_token = generate_mock_token(&recording.mock_token)

        RETURN Ok(TokenResponse {
            access_token: mock_token,
            refresh_token: recording.refresh_token.clone(),
            id_token: recording.id_token.clone(),
            expires_in: 3600,
        })
    }

    ASYNC FUNCTION record_token_request(&self, params: &TokenRequestParams, response: &TokenResponse) -> Result<(), AzureAdError> {
        interaction = RecordedAuthInteraction {
            timestamp: now(),
            flow_type: params.grant_type.to_string(),
            request: serialize_request(params),
            response: serialize_response(response),
            mock_token: create_mock_token(response),
        }

        self.recorder.write().add(interaction)
        Ok(())
    }

    ASYNC FUNCTION save(&self) -> Result<(), AzureAdError> {
        IF let SimulationMode::Recording { path } = &*self.mode.read() {
            recordings = self.recorder.read().get_all()
            self.storage.save(path, recordings)?
        }
        Ok(())
    }
}

FUNCTION generate_mock_token(template: &MockToken) -> AccessToken {
    // Generate token with fresh timestamps but same structure
    now = current_timestamp()
    AccessToken {
        token: format!("mock_token_{}", generate_uuid()),
        token_type: "Bearer".to_string(),
        expires_on: DateTime::from_timestamp(now + 3600),
        scopes: template.claims.scp.split(' ').map(String::from).collect(),
        tenant_id: template.claims.tid.clone().unwrap_or_default(),
    }
}
```

---

## 11. Error Handling

```rust
ENUM AzureAdError {
    // Credential errors
    InvalidCredentials { message: String },
    CertificateError { message: String, source: Box<dyn Error> },

    // Token errors
    InvalidGrant { message: String, error_code: String },
    InvalidScope { message: String, requested: Vec<String> },
    ExpiredToken { expired_at: u64 },
    InvalidToken { message: String },

    // Flow-specific errors
    AuthorizationPending,
    SlowDown,
    UserCancelled,
    DeviceCodeExpired,

    // Infrastructure errors
    TenantNotFound { tenant_id: String },
    ManagedIdentityUnavailable { message: String },
    NetworkError { source: Box<dyn Error> },
    ServerError { status: u16, message: String, correlation_id: Option<String> },

    // Simulation errors
    SimulationNoMatch { key: String },
    SimulationLoadError { path: PathBuf, source: Box<dyn Error> },

    // Configuration errors
    ConfigurationError { message: String },
}

IMPL AzureAdError {
    FUNCTION is_retryable(&self) -> bool {
        MATCH self {
            Self::AuthorizationPending => true,
            Self::SlowDown => true,
            Self::NetworkError { .. } => true,
            Self::ServerError { status, .. } => *status >= 500,
            _ => false,
        }
    }

    FUNCTION from_oauth_error(error: &str, description: &str) -> Self {
        MATCH error {
            "invalid_grant" => Self::InvalidGrant {
                message: description.to_string(),
                error_code: error.to_string(),
            },
            "invalid_scope" => Self::InvalidScope {
                message: description.to_string(),
                requested: vec![],
            },
            "authorization_pending" => Self::AuthorizationPending,
            "slow_down" => Self::SlowDown,
            "access_denied" => Self::UserCancelled,
            "expired_token" => Self::DeviceCodeExpired,
            _ => Self::ServerError {
                status: 400,
                message: description.to_string(),
                correlation_id: None,
            },
        }
    }
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-AZURE-AD-PSEUDO-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Pseudocode Document**

*SPARC Phase 2 Complete - Proceed to Architecture phase with "Next phase."*
