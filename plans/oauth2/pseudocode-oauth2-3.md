# OAuth2 Authentication Integration Module - Pseudocode (Part 3)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/oauth2`
**File:** 3 of 4 - Token Management

---

## Table of Contents (Part 3)

12. [Token Storage](#12-token-storage)
13. [Token Manager](#13-token-manager)
14. [Token Refresh](#14-token-refresh)
15. [Token Introspection](#15-token-introspection)
16. [Token Revocation](#16-token-revocation)

---

## 12. Token Storage

### 12.1 Token Storage Interface

```
// London-School TDD: Interface for mocking storage in tests
TRAIT TokenStorage {
  // Store tokens for a key (usually client_id or user identifier)
  ASYNC FUNCTION store(key: String, tokens: StoredTokens) -> Result<(), OAuth2Error>

  // Retrieve tokens for a key
  ASYNC FUNCTION get(key: String) -> Result<Option<StoredTokens>, OAuth2Error>

  // Delete tokens for a key
  ASYNC FUNCTION delete(key: String) -> Result<(), OAuth2Error>

  // Check if tokens exist for a key
  ASYNC FUNCTION exists(key: String) -> Result<bool, OAuth2Error>

  // List all stored keys
  ASYNC FUNCTION list_keys() -> Result<Vec<String>, OAuth2Error>

  // Clear all tokens
  ASYNC FUNCTION clear() -> Result<(), OAuth2Error>
}

STRUCT StoredTokens {
  access_token: SecretString,
  token_type: String,
  expires_at: Option<Instant>,
  refresh_token: Option<SecretString>,
  refresh_token_expires_at: Option<Instant>,
  scopes: Vec<String>,
  id_token: Option<String>,
  metadata: TokenMetadata
}

STRUCT TokenMetadata {
  acquired_at: Instant,
  last_used_at: Option<Instant>,
  refresh_count: u32,
  provider: Option<String>,
  extra: HashMap<String, String>
}

IMPL StoredTokens {
  FUNCTION from_response(response: TokenResponse) -> StoredTokens
    now <- Instant::now()

    expires_at <- response.expires_in.map(|secs| now + Duration::from_secs(secs))

    RETURN StoredTokens {
      access_token: SecretString::new(response.access_token),
      token_type: response.token_type,
      expires_at: expires_at,
      refresh_token: response.refresh_token.map(SecretString::new),
      refresh_token_expires_at: None,  // Not always provided
      scopes: response.scope
        .map(|s| s.split_whitespace().map(String::from).collect())
        .unwrap_or_default(),
      id_token: response.id_token,
      metadata: TokenMetadata {
        acquired_at: now,
        last_used_at: None,
        refresh_count: 0,
        provider: None,
        extra: HashMap::new()
      }
    }
  END FUNCTION

  FUNCTION is_expired(&self) -> bool
    IF self.expires_at IS None THEN
      RETURN false
    END IF
    RETURN Instant::now() >= self.expires_at.unwrap()
  END FUNCTION

  FUNCTION is_expiring_soon(&self, threshold: Duration) -> bool
    IF self.expires_at IS None THEN
      RETURN false
    END IF
    RETURN Instant::now() + threshold >= self.expires_at.unwrap()
  END FUNCTION

  FUNCTION time_until_expiry(&self) -> Option<Duration>
    self.expires_at.map(|exp| {
      now <- Instant::now()
      IF exp > now THEN exp - now ELSE Duration::ZERO END IF
    })
  END FUNCTION

  FUNCTION has_refresh_token(&self) -> bool
    RETURN self.refresh_token.is_some()
  END FUNCTION
}
```

### 12.2 In-Memory Token Storage

```
STRUCT InMemoryTokenStorage {
  tokens: RwLock<HashMap<String, StoredTokens>>,
  logger: Logger
}

IMPL InMemoryTokenStorage {
  FUNCTION new() -> InMemoryTokenStorage
    RETURN InMemoryTokenStorage {
      tokens: RwLock::new(HashMap::new()),
      logger: get_logger("oauth2.storage.memory")
    }
  END FUNCTION
}

IMPL TokenStorage FOR InMemoryTokenStorage {
  ASYNC FUNCTION store(key: String, tokens: StoredTokens) -> Result<(), OAuth2Error>
    self.logger.debug("Storing tokens in memory", {
      key: key,
      has_refresh_token: tokens.has_refresh_token(),
      expires_at: tokens.expires_at.map(|e| e.to_string())
    })

    self.tokens.write().insert(key, tokens)

    RETURN Ok(())
  END FUNCTION

  ASYNC FUNCTION get(key: String) -> Result<Option<StoredTokens>, OAuth2Error>
    tokens <- self.tokens.read().get(key).cloned()

    IF tokens IS Some THEN
      self.logger.debug("Retrieved tokens from memory", {
        key: key,
        is_expired: tokens.as_ref().unwrap().is_expired()
      })
    END IF

    RETURN Ok(tokens)
  END FUNCTION

  ASYNC FUNCTION delete(key: String) -> Result<(), OAuth2Error>
    removed <- self.tokens.write().remove(key)

    self.logger.debug("Deleted tokens from memory", {
      key: key,
      existed: removed.is_some()
    })

    RETURN Ok(())
  END FUNCTION

  ASYNC FUNCTION exists(key: String) -> Result<bool, OAuth2Error>
    RETURN Ok(self.tokens.read().contains_key(key))
  END FUNCTION

  ASYNC FUNCTION list_keys() -> Result<Vec<String>, OAuth2Error>
    RETURN Ok(self.tokens.read().keys().cloned().collect())
  END FUNCTION

  ASYNC FUNCTION clear() -> Result<(), OAuth2Error>
    count <- self.tokens.read().len()
    self.tokens.write().clear()

    self.logger.info("Cleared all tokens from memory", {
      count: count
    })

    RETURN Ok(())
  END FUNCTION
}
```

### 12.3 File-Based Token Storage

```
STRUCT FileTokenStorage {
  file_path: PathBuf,
  encryption_key: Option<SecretString>,  // Optional encryption
  logger: Logger
}

IMPL FileTokenStorage {
  FUNCTION new(path: PathBuf) -> Result<FileTokenStorage, OAuth2Error>
    // Ensure directory exists
    IF let Some(parent) = path.parent() THEN
      TRY
        create_dir_all(parent)?
      CATCH IoError AS e
        RETURN Error(StorageError::InitializationFailed {
          message: format("Failed to create directory: {}", e)
        })
      END TRY
    END IF

    RETURN Ok(FileTokenStorage {
      file_path: path,
      encryption_key: None,
      logger: get_logger("oauth2.storage.file")
    })
  END FUNCTION

  FUNCTION with_encryption(key: SecretString) -> Self
    self.encryption_key <- Some(key)
    RETURN self
  END FUNCTION
}

// Persisted format
STRUCT PersistedTokenStore {
  version: u32,
  tokens: HashMap<String, PersistedToken>
}

STRUCT PersistedToken {
  access_token: String,           // Encrypted if encryption enabled
  token_type: String,
  expires_at_unix: Option<u64>,   // Unix timestamp
  refresh_token: Option<String>,  // Encrypted if encryption enabled
  scopes: Vec<String>,
  id_token: Option<String>,
  metadata: PersistedMetadata
}

STRUCT PersistedMetadata {
  acquired_at_unix: u64,
  last_used_at_unix: Option<u64>,
  refresh_count: u32,
  provider: Option<String>,
  extra: HashMap<String, String>
}

IMPL TokenStorage FOR FileTokenStorage {
  ASYNC FUNCTION store(key: String, tokens: StoredTokens) -> Result<(), OAuth2Error>
    self.logger.debug("Storing tokens to file", {
      key: key,
      file: self.file_path.to_string_lossy()
    })

    // Read existing store or create new
    store <- self.read_store().await.unwrap_or_else(|_| {
      PersistedTokenStore {
        version: 1,
        tokens: HashMap::new()
      }
    })

    // Convert to persisted format
    persisted <- self.to_persisted(tokens)?

    // Update store
    store.tokens.insert(key, persisted)

    // Write back
    self.write_store(store).await
  END FUNCTION

  ASYNC FUNCTION get(key: String) -> Result<Option<StoredTokens>, OAuth2Error>
    store <- self.read_store().await?

    IF let Some(persisted) = store.tokens.get(key) THEN
      tokens <- self.from_persisted(persisted.clone())?
      RETURN Ok(Some(tokens))
    END IF

    RETURN Ok(None)
  END FUNCTION

  ASYNC FUNCTION delete(key: String) -> Result<(), OAuth2Error>
    store <- self.read_store().await?
    store.tokens.remove(key)
    self.write_store(store).await
  END FUNCTION

  ASYNC FUNCTION exists(key: String) -> Result<bool, OAuth2Error>
    store <- self.read_store().await?
    RETURN Ok(store.tokens.contains_key(key))
  END FUNCTION

  ASYNC FUNCTION list_keys() -> Result<Vec<String>, OAuth2Error>
    store <- self.read_store().await?
    RETURN Ok(store.tokens.keys().cloned().collect())
  END FUNCTION

  ASYNC FUNCTION clear() -> Result<(), OAuth2Error>
    store <- PersistedTokenStore {
      version: 1,
      tokens: HashMap::new()
    }
    self.write_store(store).await
  END FUNCTION
}

IMPL FileTokenStorage {
  ASYNC FUNCTION read_store(&self) -> Result<PersistedTokenStore, OAuth2Error>
    IF NOT self.file_path.exists() THEN
      RETURN Ok(PersistedTokenStore {
        version: 1,
        tokens: HashMap::new()
      })
    END IF

    TRY
      contents <- read_file(self.file_path).await?

      // Decrypt if encryption enabled
      data <- IF self.encryption_key IS Some THEN
        self.decrypt(contents)?
      ELSE
        contents
      END IF

      store <- parse_json::<PersistedTokenStore>(data)?

      RETURN Ok(store)
    CATCH IoError AS e
      RETURN Error(StorageError::ReadFailed {
        message: format("Failed to read token file: {}", e)
      })
    CATCH ParseError AS e
      RETURN Error(StorageError::CorruptedData {
        message: format("Invalid token file format: {}", e)
      })
    END TRY
  END FUNCTION

  ASYNC FUNCTION write_store(&self, store: PersistedTokenStore) -> Result<(), OAuth2Error>
    TRY
      data <- serialize_json(store)?

      // Encrypt if encryption enabled
      contents <- IF self.encryption_key IS Some THEN
        self.encrypt(data)?
      ELSE
        data
      END IF

      // Write atomically (write to temp, then rename)
      temp_path <- self.file_path.with_extension("tmp")
      write_file(temp_path.clone(), contents).await?
      rename(temp_path, self.file_path).await?

      RETURN Ok(())
    CATCH IoError AS e
      RETURN Error(StorageError::WriteFailed {
        message: format("Failed to write token file: {}", e)
      })
    END TRY
  END FUNCTION

  FUNCTION to_persisted(&self, tokens: StoredTokens) -> Result<PersistedToken, OAuth2Error>
    access_token <- IF self.encryption_key IS Some THEN
      self.encrypt_string(tokens.access_token.expose_secret())?
    ELSE
      tokens.access_token.expose_secret().to_string()
    END IF

    refresh_token <- tokens.refresh_token.map(|rt| {
      IF self.encryption_key IS Some THEN
        self.encrypt_string(rt.expose_secret())
      ELSE
        Ok(rt.expose_secret().to_string())
      END IF
    }).transpose()?

    RETURN Ok(PersistedToken {
      access_token: access_token,
      token_type: tokens.token_type,
      expires_at_unix: tokens.expires_at.map(instant_to_unix),
      refresh_token: refresh_token,
      scopes: tokens.scopes,
      id_token: tokens.id_token,
      metadata: PersistedMetadata {
        acquired_at_unix: instant_to_unix(tokens.metadata.acquired_at),
        last_used_at_unix: tokens.metadata.last_used_at.map(instant_to_unix),
        refresh_count: tokens.metadata.refresh_count,
        provider: tokens.metadata.provider,
        extra: tokens.metadata.extra
      }
    })
  END FUNCTION

  FUNCTION from_persisted(&self, persisted: PersistedToken) -> Result<StoredTokens, OAuth2Error>
    access_token <- IF self.encryption_key IS Some THEN
      SecretString::new(self.decrypt_string(persisted.access_token)?)
    ELSE
      SecretString::new(persisted.access_token)
    END IF

    refresh_token <- persisted.refresh_token.map(|rt| {
      IF self.encryption_key IS Some THEN
        Ok(SecretString::new(self.decrypt_string(rt)?))
      ELSE
        Ok(SecretString::new(rt))
      END IF
    }).transpose()?

    RETURN Ok(StoredTokens {
      access_token: access_token,
      token_type: persisted.token_type,
      expires_at: persisted.expires_at_unix.map(unix_to_instant),
      refresh_token: refresh_token,
      refresh_token_expires_at: None,
      scopes: persisted.scopes,
      id_token: persisted.id_token,
      metadata: TokenMetadata {
        acquired_at: unix_to_instant(persisted.metadata.acquired_at_unix),
        last_used_at: persisted.metadata.last_used_at_unix.map(unix_to_instant),
        refresh_count: persisted.metadata.refresh_count,
        provider: persisted.metadata.provider,
        extra: persisted.metadata.extra
      }
    })
  END FUNCTION

  // Encryption helpers (use AES-256-GCM)
  FUNCTION encrypt(&self, data: Vec<u8>) -> Result<Vec<u8>, OAuth2Error>
    key <- self.encryption_key.as_ref().unwrap()
    nonce <- generate_random_nonce()
    cipher <- Aes256Gcm::new(key.expose_secret().as_bytes())
    ciphertext <- cipher.encrypt(nonce, data)?

    // Prepend nonce to ciphertext
    result <- Vec::new()
    result.extend_from_slice(nonce)
    result.extend_from_slice(ciphertext)

    RETURN Ok(result)
  END FUNCTION

  FUNCTION decrypt(&self, data: Vec<u8>) -> Result<Vec<u8>, OAuth2Error>
    IF data.len() < 12 THEN  // Nonce is 12 bytes
      RETURN Error(StorageError::CorruptedData {
        message: "Encrypted data too short"
      })
    END IF

    key <- self.encryption_key.as_ref().unwrap()
    nonce <- data[0..12]
    ciphertext <- data[12..]

    cipher <- Aes256Gcm::new(key.expose_secret().as_bytes())
    plaintext <- cipher.decrypt(nonce, ciphertext)?

    RETURN Ok(plaintext)
  END FUNCTION
}

FUNCTION instant_to_unix(instant: Instant) -> u64
  // Convert Instant to Unix timestamp
  RETURN SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap()
    .as_secs()
END FUNCTION

FUNCTION unix_to_instant(unix: u64) -> Instant
  // Convert Unix timestamp to Instant (approximate)
  now <- Instant::now()
  now_unix <- instant_to_unix(now)

  IF unix >= now_unix THEN
    RETURN now + Duration::from_secs(unix - now_unix)
  ELSE
    RETURN now - Duration::from_secs(now_unix - unix)
  END IF
END FUNCTION
```

### 12.4 Mock Token Storage

```
STRUCT MockTokenStorage {
  tokens: Mutex<HashMap<String, StoredTokens>>,
  store_error: Option<OAuth2Error>,
  get_error: Option<OAuth2Error>,

  // Call tracking
  store_calls: Mutex<Vec<(String, StoredTokens)>>,
  get_calls: Mutex<Vec<String>>,
  delete_calls: Mutex<Vec<String>>
}

IMPL MockTokenStorage {
  FUNCTION new() -> MockTokenStorage
    RETURN MockTokenStorage {
      tokens: Mutex::new(HashMap::new()),
      store_error: None,
      get_error: None,
      store_calls: Mutex::new(vec![]),
      get_calls: Mutex::new(vec![]),
      delete_calls: Mutex::new(vec![])
    }
  END FUNCTION

  FUNCTION with_token(key: String, tokens: StoredTokens) -> Self
    self.tokens.lock().insert(key, tokens)
    RETURN self
  END FUNCTION

  FUNCTION with_store_error(error: OAuth2Error) -> Self
    self.store_error <- Some(error)
    RETURN self
  END FUNCTION

  FUNCTION with_get_error(error: OAuth2Error) -> Self
    self.get_error <- Some(error)
    RETURN self
  END FUNCTION

  FUNCTION assert_stored(key: String)
    assert(self.tokens.lock().contains_key(key), format("Expected token '{}' to be stored", key))
  END FUNCTION

  FUNCTION assert_deleted(key: String)
    calls <- self.delete_calls.lock()
    assert(calls.contains(key), format("Expected delete to be called with '{}'", key))
  END FUNCTION
}

IMPL TokenStorage FOR MockTokenStorage {
  ASYNC FUNCTION store(key: String, tokens: StoredTokens) -> Result<(), OAuth2Error>
    self.store_calls.lock().push((key.clone(), tokens.clone()))

    IF self.store_error IS Some THEN
      RETURN Error(self.store_error.clone().unwrap())
    END IF

    self.tokens.lock().insert(key, tokens)
    RETURN Ok(())
  END FUNCTION

  ASYNC FUNCTION get(key: String) -> Result<Option<StoredTokens>, OAuth2Error>
    self.get_calls.lock().push(key.clone())

    IF self.get_error IS Some THEN
      RETURN Error(self.get_error.clone().unwrap())
    END IF

    RETURN Ok(self.tokens.lock().get(key).cloned())
  END FUNCTION

  ASYNC FUNCTION delete(key: String) -> Result<(), OAuth2Error>
    self.delete_calls.lock().push(key.clone())
    self.tokens.lock().remove(key)
    RETURN Ok(())
  END FUNCTION

  ASYNC FUNCTION exists(key: String) -> Result<bool, OAuth2Error>
    RETURN Ok(self.tokens.lock().contains_key(key))
  END FUNCTION

  ASYNC FUNCTION list_keys() -> Result<Vec<String>, OAuth2Error>
    RETURN Ok(self.tokens.lock().keys().cloned().collect())
  END FUNCTION

  ASYNC FUNCTION clear() -> Result<(), OAuth2Error>
    self.tokens.lock().clear()
    RETURN Ok(())
  END FUNCTION
}
```

---

## 13. Token Manager

### 13.1 Token Manager Interface

```
// High-level token management with automatic refresh
TRAIT TokenManager {
  // Get a valid access token (refreshes if needed)
  ASYNC FUNCTION get_access_token(key: String) -> Result<AccessToken, OAuth2Error>

  // Store tokens from a token response
  ASYNC FUNCTION store_tokens(key: String, response: TokenResponse) -> Result<(), OAuth2Error>

  // Get raw stored tokens
  ASYNC FUNCTION get_stored_tokens(key: String) -> Result<Option<StoredTokens>, OAuth2Error>

  // Clear tokens
  ASYNC FUNCTION clear_tokens(key: String) -> Result<(), OAuth2Error>

  // Force refresh tokens
  ASYNC FUNCTION force_refresh(key: String) -> Result<TokenResponse, OAuth2Error>
}

STRUCT AccessToken {
  token: SecretString,
  token_type: String,
  expires_at: Option<Instant>,
  scopes: Vec<String>
}

IMPL AccessToken {
  FUNCTION as_bearer_header(&self) -> String
    RETURN format("Bearer {}", self.token.expose_secret())
  END FUNCTION

  FUNCTION is_expired(&self) -> bool
    IF self.expires_at IS None THEN
      RETURN false
    END IF
    RETURN Instant::now() >= self.expires_at.unwrap()
  END FUNCTION
}
```

### 13.2 Token Manager Implementation

```
STRUCT TokenManagerImpl {
  config: OAuth2Config,
  storage: Arc<TokenStorage>,
  transport: Arc<HttpTransport>,
  retry_executor: Arc<RetryExecutor>,
  rate_limiter: Arc<RateLimiter>,
  circuit_breaker: Arc<CircuitBreaker>,
  logger: Logger,
  tracer: Tracer,

  // Refresh lock to prevent concurrent refreshes
  refresh_locks: Mutex<HashMap<String, Arc<Mutex<()>>>>
}

FUNCTION TokenManagerImpl::new(
  config: OAuth2Config,
  storage: Arc<TokenStorage>,
  transport: Arc<HttpTransport>,
  retry_executor: Arc<RetryExecutor>,
  rate_limiter: Arc<RateLimiter>,
  circuit_breaker: Arc<CircuitBreaker>,
  logger: Logger,
  tracer: Tracer
) -> TokenManagerImpl
  RETURN TokenManagerImpl {
    config: config,
    storage: storage,
    transport: transport,
    retry_executor: retry_executor,
    rate_limiter: rate_limiter,
    circuit_breaker: circuit_breaker,
    logger: logger,
    tracer: tracer,
    refresh_locks: Mutex::new(HashMap::new())
  }
END FUNCTION

ASYNC FUNCTION token_manager.get_access_token(key: String) -> Result<AccessToken, OAuth2Error>
  span <- self.tracer.start_span("oauth2.token_manager.get_access_token")
  span.set_attribute("key", key)

  // Step 1: Get stored tokens
  stored <- self.storage.get(key.clone()).await?

  IF stored IS None THEN
    span.set_status(Error)
    span.end()
    RETURN Error(TokenError::NotFound {
      key: key
    })
  END IF

  tokens <- stored.unwrap()

  // Step 2: Check if token is valid
  refresh_threshold <- Duration::from_secs(self.config.refresh_threshold_secs)

  IF NOT tokens.is_expired() AND NOT tokens.is_expiring_soon(refresh_threshold) THEN
    // Token is valid, return it
    self.logger.debug("Using valid access token", {
      key: key,
      expires_in: tokens.time_until_expiry().map(|d| d.as_secs())
    })

    // Update last_used_at
    updated_tokens <- tokens.clone()
    updated_tokens.metadata.last_used_at <- Some(Instant::now())
    self.storage.store(key, updated_tokens).await?

    span.end()

    RETURN Ok(AccessToken {
      token: tokens.access_token,
      token_type: tokens.token_type,
      expires_at: tokens.expires_at,
      scopes: tokens.scopes
    })
  END IF

  // Step 3: Token needs refresh
  IF NOT tokens.has_refresh_token() THEN
    self.logger.warn("Token expired and no refresh token available", {
      key: key
    })
    span.set_status(Error)
    span.end()
    RETURN Error(TokenError::Expired {
      key: key
    })
  END IF

  IF NOT self.config.auto_refresh THEN
    self.logger.debug("Auto-refresh disabled, returning expired token status", {
      key: key
    })
    span.set_status(Error)
    span.end()
    RETURN Error(TokenError::Expired {
      key: key
    })
  END IF

  // Step 4: Refresh token
  self.logger.info("Refreshing expired/expiring token", {
    key: key,
    is_expired: tokens.is_expired(),
    expires_in: tokens.time_until_expiry().map(|d| d.as_secs())
  })

  new_tokens <- self.refresh_tokens_internal(key.clone(), tokens).await?

  span.end()

  RETURN Ok(AccessToken {
    token: new_tokens.access_token,
    token_type: new_tokens.token_type,
    expires_at: new_tokens.expires_at,
    scopes: new_tokens.scopes
  })
END FUNCTION

ASYNC FUNCTION token_manager.store_tokens(key: String, response: TokenResponse) -> Result<(), OAuth2Error>
  span <- self.tracer.start_span("oauth2.token_manager.store_tokens")
  span.set_attribute("key", key)

  tokens <- StoredTokens::from_response(response)

  self.logger.info("Storing new tokens", {
    key: key,
    has_refresh_token: tokens.has_refresh_token(),
    expires_in: tokens.time_until_expiry().map(|d| d.as_secs()),
    scopes: tokens.scopes.join(" ")
  })

  self.storage.store(key, tokens).await?

  span.end()

  RETURN Ok(())
END FUNCTION

ASYNC FUNCTION token_manager.get_stored_tokens(key: String) -> Result<Option<StoredTokens>, OAuth2Error>
  RETURN self.storage.get(key).await
END FUNCTION

ASYNC FUNCTION token_manager.clear_tokens(key: String) -> Result<(), OAuth2Error>
  self.logger.info("Clearing tokens", {
    key: key
  })

  self.storage.delete(key).await
END FUNCTION

ASYNC FUNCTION token_manager.force_refresh(key: String) -> Result<TokenResponse, OAuth2Error>
  span <- self.tracer.start_span("oauth2.token_manager.force_refresh")
  span.set_attribute("key", key)

  stored <- self.storage.get(key.clone()).await?

  IF stored IS None THEN
    span.set_status(Error)
    span.end()
    RETURN Error(TokenError::NotFound {
      key: key
    })
  END IF

  tokens <- stored.unwrap()

  IF NOT tokens.has_refresh_token() THEN
    span.set_status(Error)
    span.end()
    RETURN Error(TokenError::NoRefreshToken {
      key: key
    })
  END IF

  self.logger.info("Forcing token refresh", {
    key: key
  })

  new_tokens <- self.refresh_tokens_internal(key.clone(), tokens).await?

  // Convert to TokenResponse for return
  response <- TokenResponse {
    access_token: new_tokens.access_token.expose_secret().to_string(),
    token_type: new_tokens.token_type,
    expires_in: new_tokens.time_until_expiry().map(|d| d.as_secs()),
    refresh_token: new_tokens.refresh_token.map(|rt| rt.expose_secret().to_string()),
    scope: Some(new_tokens.scopes.join(" ")),
    id_token: new_tokens.id_token,
    extra: HashMap::new()
  }

  span.end()

  RETURN Ok(response)
END FUNCTION
```

### 13.3 Token Refresh Internal

```
ASYNC FUNCTION token_manager.refresh_tokens_internal(
  key: String,
  current_tokens: StoredTokens
) -> Result<StoredTokens, OAuth2Error>

  // Get or create refresh lock for this key
  refresh_lock <- {
    locks <- self.refresh_locks.lock()
    IF NOT locks.contains_key(key) THEN
      locks.insert(key.clone(), Arc::new(Mutex::new(())))
    END IF
    locks.get(key).unwrap().clone()
  }

  // Acquire lock to prevent concurrent refreshes
  _guard <- refresh_lock.lock()

  // Check if token was already refreshed by another task
  current <- self.storage.get(key.clone()).await?
  IF current IS Some THEN
    current <- current.unwrap()
    IF current.metadata.refresh_count > current_tokens.metadata.refresh_count THEN
      self.logger.debug("Token already refreshed by another task", {
        key: key
      })
      RETURN Ok(current)
    END IF
  END IF

  // Build refresh request
  refresh_token <- current_tokens.refresh_token.as_ref().unwrap()

  grant_params <- HashMap::from([
    ("grant_type", "refresh_token"),
    ("refresh_token", refresh_token.expose_secret())
  ])

  token_request <- build_token_request(
    self.config.provider.token_endpoint.clone(),
    self.config.credentials.clone(),
    grant_params
  )?

  // Execute refresh request
  response <- self.execute_refresh_request(token_request).await?

  // Parse response
  token_response <- parse_token_response(response)?

  // Build new stored tokens
  now <- Instant::now()
  expires_at <- token_response.expires_in.map(|secs| now + Duration::from_secs(secs))

  // Use new refresh token if provided, otherwise keep old one
  new_refresh_token <- IF token_response.refresh_token IS Some THEN
    Some(SecretString::new(token_response.refresh_token.unwrap()))
  ELSE
    current_tokens.refresh_token.clone()
  END IF

  new_tokens <- StoredTokens {
    access_token: SecretString::new(token_response.access_token),
    token_type: token_response.token_type,
    expires_at: expires_at,
    refresh_token: new_refresh_token,
    refresh_token_expires_at: None,
    scopes: token_response.scope
      .map(|s| s.split_whitespace().map(String::from).collect())
      .unwrap_or_else(|| current_tokens.scopes.clone()),
    id_token: token_response.id_token.or(current_tokens.id_token),
    metadata: TokenMetadata {
      acquired_at: now,
      last_used_at: None,
      refresh_count: current_tokens.metadata.refresh_count + 1,
      provider: current_tokens.metadata.provider,
      extra: current_tokens.metadata.extra.clone()
    }
  }

  // Store new tokens
  self.storage.store(key.clone(), new_tokens.clone()).await?

  self.logger.info("Token refresh successful", {
    key: key,
    expires_in: new_tokens.time_until_expiry().map(|d| d.as_secs()),
    refresh_count: new_tokens.metadata.refresh_count,
    got_new_refresh_token: token_response.refresh_token.is_some()
  })

  RETURN Ok(new_tokens)
END FUNCTION

ASYNC FUNCTION token_manager.execute_refresh_request(request: HttpRequest) -> Result<HttpResponse, OAuth2Error>
  // Check circuit breaker
  IF NOT self.circuit_breaker.allow_request() THEN
    RETURN Error(NetworkError::CircuitOpen {
      service: "token_endpoint"
    })
  END IF

  // Apply rate limiting
  TRY
    self.rate_limiter.acquire("token_endpoint").await
  CATCH RateLimitExceeded
    RETURN Error(NetworkError::RateLimited {
      retry_after: None
    })
  END TRY

  // Execute with retry
  result <- self.retry_executor.execute(|| async {
    response <- self.transport.send(request.clone()).await?

    // Handle specific refresh errors (don't retry)
    IF response.status == 400 THEN
      TRY
        error_response <- parse_json::<OAuth2ErrorResponse>(response.body.clone())?
        IF error_response.error == "invalid_grant" THEN
          // Refresh token is invalid/expired - don't retry
          RETURN Error(NonRetryableError::InvalidGrant {
            description: error_response.error_description.unwrap_or_default()
          })
        END IF
      CATCH
        // Continue to treat as retryable
      END TRY
    END IF

    IF response.status == 503 OR response.status == 429 THEN
      retry_after <- parse_retry_after_header(response.headers)
      RETURN Error(RetryableError::ServerUnavailable { retry_after })
    END IF

    IF response.status >= 500 THEN
      RETURN Error(RetryableError::ServerError { status: response.status })
    END IF

    RETURN Ok(response)
  }).await

  // Update circuit breaker
  MATCH result
    CASE Ok(_):
      self.circuit_breaker.record_success()
    CASE Error(NonRetryableError::InvalidGrant { .. }):
      // Don't count invalid grant as circuit breaker failure
      pass
    CASE Error(_):
      self.circuit_breaker.record_failure()
  END MATCH

  RETURN result.map_err(|e| {
    MATCH e
      CASE NonRetryableError::InvalidGrant { description }:
        TokenError::RefreshFailed {
          reason: format("Invalid refresh token: {}", description)
        }
      CASE _:
        e.into()
    END MATCH
  })
END FUNCTION
```

### 13.4 Token Manager Mock

```
STRUCT MockTokenManager {
  access_token_response: Option<Result<AccessToken, OAuth2Error>>,
  stored_tokens: Mutex<HashMap<String, StoredTokens>>,
  force_refresh_response: Option<Result<TokenResponse, OAuth2Error>>,

  get_token_calls: Mutex<Vec<String>>,
  store_calls: Mutex<Vec<(String, TokenResponse)>>,
  refresh_calls: Mutex<Vec<String>>
}

IMPL MockTokenManager {
  FUNCTION new() -> MockTokenManager
    RETURN MockTokenManager {
      access_token_response: None,
      stored_tokens: Mutex::new(HashMap::new()),
      force_refresh_response: None,
      get_token_calls: Mutex::new(vec![]),
      store_calls: Mutex::new(vec![]),
      refresh_calls: Mutex::new(vec![])
    }
  END FUNCTION

  FUNCTION with_access_token(response: Result<AccessToken, OAuth2Error>) -> Self
    self.access_token_response <- Some(response)
    RETURN self
  END FUNCTION

  FUNCTION with_stored_token(key: String, tokens: StoredTokens) -> Self
    self.stored_tokens.lock().insert(key, tokens)
    RETURN self
  END FUNCTION

  FUNCTION with_force_refresh_response(response: Result<TokenResponse, OAuth2Error>) -> Self
    self.force_refresh_response <- Some(response)
    RETURN self
  END FUNCTION

  FUNCTION assert_token_requested(key: String)
    calls <- self.get_token_calls.lock()
    assert(calls.contains(key), format("Expected get_access_token('{}') to be called", key))
  END FUNCTION

  FUNCTION assert_refresh_called(key: String)
    calls <- self.refresh_calls.lock()
    assert(calls.contains(key), format("Expected force_refresh('{}') to be called", key))
  END FUNCTION
}

IMPL TokenManager FOR MockTokenManager {
  ASYNC FUNCTION get_access_token(key: String) -> Result<AccessToken, OAuth2Error>
    self.get_token_calls.lock().push(key.clone())

    IF self.access_token_response IS Some THEN
      RETURN self.access_token_response.clone().unwrap()
    END IF

    // Default mock response
    RETURN Ok(AccessToken {
      token: SecretString::new("mock_access_token"),
      token_type: "Bearer",
      expires_at: Some(Instant::now() + Duration::from_secs(3600)),
      scopes: vec!["openid", "profile"]
    })
  END FUNCTION

  ASYNC FUNCTION store_tokens(key: String, response: TokenResponse) -> Result<(), OAuth2Error>
    self.store_calls.lock().push((key.clone(), response.clone()))
    tokens <- StoredTokens::from_response(response)
    self.stored_tokens.lock().insert(key, tokens)
    RETURN Ok(())
  END FUNCTION

  ASYNC FUNCTION get_stored_tokens(key: String) -> Result<Option<StoredTokens>, OAuth2Error>
    RETURN Ok(self.stored_tokens.lock().get(key).cloned())
  END FUNCTION

  ASYNC FUNCTION clear_tokens(key: String) -> Result<(), OAuth2Error>
    self.stored_tokens.lock().remove(key)
    RETURN Ok(())
  END FUNCTION

  ASYNC FUNCTION force_refresh(key: String) -> Result<TokenResponse, OAuth2Error>
    self.refresh_calls.lock().push(key.clone())

    IF self.force_refresh_response IS Some THEN
      RETURN self.force_refresh_response.clone().unwrap()
    END IF

    RETURN Ok(TokenResponse {
      access_token: "mock_refreshed_access_token",
      token_type: "Bearer",
      expires_in: Some(3600),
      refresh_token: Some("mock_new_refresh_token"),
      scope: Some("openid profile"),
      id_token: None,
      extra: HashMap::new()
    })
  END FUNCTION
}
```

---

## 14. Token Refresh

### 14.1 Refresh Token Flow

```
// Standalone refresh token functionality (used by TokenManager internally)
TRAIT RefreshTokenFlow {
  // Refresh access token using refresh token
  ASYNC FUNCTION refresh(params: RefreshParams) -> Result<TokenResponse, OAuth2Error>
}

STRUCT RefreshParams {
  refresh_token: SecretString,
  scopes: Option<Vec<String>>  // Request subset of original scopes
}
```

### 14.2 Refresh Implementation

```
STRUCT RefreshTokenFlowImpl {
  config: OAuth2Config,
  transport: Arc<HttpTransport>,
  retry_executor: Arc<RetryExecutor>,
  rate_limiter: Arc<RateLimiter>,
  circuit_breaker: Arc<CircuitBreaker>,
  logger: Logger,
  tracer: Tracer
}

ASYNC FUNCTION refresh_flow.refresh(params: RefreshParams) -> Result<TokenResponse, OAuth2Error>
  span <- self.tracer.start_span("oauth2.refresh_token.refresh")

  // Build grant parameters
  grant_params <- HashMap::from([
    ("grant_type", "refresh_token"),
    ("refresh_token", params.refresh_token.expose_secret())
  ])

  // Add scopes if specified (for scope reduction)
  IF params.scopes IS Some THEN
    scopes <- params.scopes.unwrap()
    IF NOT scopes.is_empty() THEN
      grant_params.insert("scope", scopes.join(" "))
    END IF
  END IF

  token_request <- build_token_request(
    self.config.provider.token_endpoint.clone(),
    self.config.credentials.clone(),
    grant_params
  )?

  self.logger.info("Refreshing token", {
    token_endpoint: self.config.provider.token_endpoint.host_str(),
    scopes: params.scopes.map(|s| s.join(" "))
  })

  // Execute with retry (but not for invalid_grant)
  response <- self.execute_with_retry(token_request, span.clone()).await?

  // Parse response
  token_response <- parse_token_response(response)?

  self.logger.info("Token refresh successful", {
    token_type: token_response.token_type,
    expires_in: token_response.expires_in,
    got_new_refresh_token: token_response.refresh_token.is_some(),
    scopes: token_response.scope.clone()
  })

  span.end()

  RETURN Ok(token_response)
END FUNCTION

ASYNC FUNCTION refresh_flow.execute_with_retry(request: HttpRequest, span: Span) -> Result<HttpResponse, OAuth2Error>
  // Check circuit breaker
  IF NOT self.circuit_breaker.allow_request() THEN
    span.set_status(Error)
    RETURN Error(NetworkError::CircuitOpen {
      service: "token_endpoint"
    })
  END IF

  // Apply rate limiting
  TRY
    self.rate_limiter.acquire("token_endpoint").await
  CATCH RateLimitExceeded
    span.set_status(Error)
    RETURN Error(NetworkError::RateLimited {
      retry_after: None
    })
  END TRY

  // Execute with retry
  result <- self.retry_executor.execute(|| async {
    response <- self.transport.send(request.clone()).await?

    // Don't retry invalid_grant - refresh token is invalid
    IF response.status == 400 THEN
      TRY
        error_response <- parse_json::<OAuth2ErrorResponse>(response.body.clone())?
        IF error_response.error == "invalid_grant" THEN
          RETURN Error(NonRetryableError::InvalidGrant {
            description: error_response.error_description.unwrap_or_default()
          })
        END IF
      CATCH
        // Continue
      END TRY
    END IF

    IF response.status == 503 OR response.status == 429 THEN
      retry_after <- parse_retry_after_header(response.headers)
      RETURN Error(RetryableError::ServerUnavailable { retry_after })
    END IF

    IF response.status >= 500 THEN
      RETURN Error(RetryableError::ServerError { status: response.status })
    END IF

    RETURN Ok(response)
  }).await

  // Update circuit breaker
  MATCH result
    CASE Ok(_):
      self.circuit_breaker.record_success()
    CASE Error(NonRetryableError::InvalidGrant { .. }):
      // Don't trip circuit breaker on invalid grant
      pass
    CASE Error(_):
      self.circuit_breaker.record_failure()
  END MATCH

  RETURN result.map_err(|e| e.into())
END FUNCTION
```

---

## 15. Token Introspection

### 15.1 Introspection Interface

```
// RFC 7662: OAuth 2.0 Token Introspection
TRAIT TokenIntrospection {
  // Introspect a token to determine its state
  ASYNC FUNCTION introspect(params: IntrospectionParams) -> Result<IntrospectionResponse, OAuth2Error>
}

STRUCT IntrospectionParams {
  token: SecretString,
  token_type_hint: Option<TokenTypeHint>
}

ENUM TokenTypeHint {
  AccessToken,
  RefreshToken
}

STRUCT IntrospectionResponse {
  active: bool,
  scope: Option<String>,
  client_id: Option<String>,
  username: Option<String>,
  token_type: Option<String>,
  exp: Option<u64>,          // Expiration time (Unix timestamp)
  iat: Option<u64>,          // Issued at (Unix timestamp)
  nbf: Option<u64>,          // Not before (Unix timestamp)
  sub: Option<String>,       // Subject
  aud: Option<String>,       // Audience
  iss: Option<String>,       // Issuer
  jti: Option<String>,       // JWT ID
  // Extension fields
  extra: HashMap<String, serde_json::Value>
}

IMPL IntrospectionResponse {
  FUNCTION is_active(&self) -> bool
    RETURN self.active
  END FUNCTION

  FUNCTION is_expired(&self) -> bool
    IF NOT self.active THEN
      RETURN true
    END IF

    IF self.exp IS Some THEN
      now <- SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()
      RETURN now >= self.exp.unwrap()
    END IF

    RETURN false
  END FUNCTION

  FUNCTION scopes(&self) -> Vec<String>
    self.scope
      .map(|s| s.split_whitespace().map(String::from).collect())
      .unwrap_or_default()
  END FUNCTION

  FUNCTION has_scope(&self, scope: &str) -> bool
    self.scopes().contains(&scope.to_string())
  END FUNCTION
}
```

### 15.2 Introspection Implementation

```
STRUCT TokenIntrospectionImpl {
  config: OAuth2Config,
  transport: Arc<HttpTransport>,
  retry_executor: Arc<RetryExecutor>,
  rate_limiter: Arc<RateLimiter>,
  circuit_breaker: Arc<CircuitBreaker>,
  logger: Logger,
  tracer: Tracer
}

ASYNC FUNCTION introspection.introspect(params: IntrospectionParams) -> Result<IntrospectionResponse, OAuth2Error>
  span <- self.tracer.start_span("oauth2.introspection.introspect")

  // Step 1: Check if introspection is supported
  introspection_endpoint <- self.config.provider.introspection_endpoint
    .ok_or_else(|| ConfigurationError::UnsupportedFeature {
      feature: "token_introspection"
    })?

  // Step 2: Build request body
  body <- HashMap::from([
    ("token", params.token.expose_secret())
  ])

  IF params.token_type_hint IS Some THEN
    hint <- MATCH params.token_type_hint.unwrap()
      CASE TokenTypeHint::AccessToken => "access_token"
      CASE TokenTypeHint::RefreshToken => "refresh_token"
    END MATCH
    body.insert("token_type_hint", hint)
  END IF

  // Step 3: Build request with client authentication
  request <- build_introspection_request(
    introspection_endpoint.clone(),
    self.config.credentials.clone(),
    body
  )?

  self.logger.debug("Introspecting token", {
    introspection_endpoint: introspection_endpoint.host_str(),
    token_type_hint: params.token_type_hint.map(|h| format("{:?}", h))
  })

  // Step 4: Execute request
  response <- self.execute_introspection_request(request, span.clone()).await?

  // Step 5: Parse response
  IF NOT response.status.is_success() THEN
    TRY
      error_response <- parse_json::<OAuth2ErrorResponse>(response.body)?
      span.set_status(Error)
      span.end()
      RETURN Error(map_oauth2_error(error_response))
    CATCH
      span.set_status(Error)
      span.end()
      RETURN Error(ProtocolError::UnexpectedResponse {
        status: response.status.as_u16(),
        body: String::from_utf8_lossy(response.body).to_string()
      })
    END TRY
  END IF

  TRY
    introspection_response <- parse_json::<IntrospectionResponse>(response.body)?
  CATCH ParseError AS e
    span.set_status(Error)
    span.end()
    RETURN Error(ProtocolError::InvalidResponse {
      message: format("Failed to parse introspection response: {}", e)
    })
  END TRY

  self.logger.debug("Introspection complete", {
    active: introspection_response.active,
    client_id: introspection_response.client_id,
    scopes: introspection_response.scope
  })

  span.end()

  RETURN Ok(introspection_response)
END FUNCTION

FUNCTION build_introspection_request(
  endpoint: Url,
  credentials: ClientCredentials,
  params: HashMap<String, String>
) -> Result<HttpRequest, OAuth2Error>
  // Introspection uses same auth methods as token endpoint
  body <- HashMap::new()

  // Add introspection parameters
  FOR EACH (key, value) IN params DO
    body.insert(key, value)
  END FOR

  headers <- HeaderMap::new()

  // Add client authentication (same as token endpoint)
  MATCH credentials.auth_method
    CASE ClientAuthMethod::ClientSecretBasic:
      credentials_string <- format("{}:{}",
        credentials.client_id,
        credentials.client_secret.unwrap().expose_secret()
      )
      encoded <- base64_encode(credentials_string)
      headers.insert("Authorization", format("Basic {}", encoded))

    CASE ClientAuthMethod::ClientSecretPost:
      body.insert("client_id", credentials.client_id.clone())
      body.insert("client_secret", credentials.client_secret.unwrap().expose_secret().to_string())

    CASE ClientAuthMethod::None:
      body.insert("client_id", credentials.client_id.clone())

    CASE _:
      // Other methods handled similarly
      body.insert("client_id", credentials.client_id.clone())
  END MATCH

  headers.insert("Content-Type", "application/x-www-form-urlencoded")
  headers.insert("Accept", "application/json")

  RETURN Ok(HttpRequest {
    method: POST,
    url: endpoint,
    headers: headers,
    body: Some(Bytes::from(form_urlencoded(body))),
    timeout: None
  })
END FUNCTION

ASYNC FUNCTION introspection.execute_introspection_request(request: HttpRequest, span: Span) -> Result<HttpResponse, OAuth2Error>
  // Check circuit breaker
  IF NOT self.circuit_breaker.allow_request() THEN
    span.set_status(Error)
    RETURN Error(NetworkError::CircuitOpen {
      service: "introspection_endpoint"
    })
  END IF

  // Apply rate limiting
  TRY
    self.rate_limiter.acquire("introspection_endpoint").await
  CATCH RateLimitExceeded
    span.set_status(Error)
    RETURN Error(NetworkError::RateLimited {
      retry_after: None
    })
  END TRY

  // Execute with retry
  result <- self.retry_executor.execute(|| async {
    response <- self.transport.send(request.clone()).await?

    IF response.status == 503 OR response.status == 429 THEN
      retry_after <- parse_retry_after_header(response.headers)
      RETURN Error(RetryableError::ServerUnavailable { retry_after })
    END IF

    IF response.status >= 500 THEN
      RETURN Error(RetryableError::ServerError { status: response.status })
    END IF

    RETURN Ok(response)
  }).await

  // Update circuit breaker
  MATCH result
    CASE Ok(_):
      self.circuit_breaker.record_success()
    CASE Error(_):
      self.circuit_breaker.record_failure()
  END MATCH

  RETURN result.map_err(|e| e.into())
END FUNCTION
```

### 15.3 Introspection Mock

```
STRUCT MockTokenIntrospection {
  introspection_response: Option<Result<IntrospectionResponse, OAuth2Error>>,
  introspect_calls: Mutex<Vec<IntrospectionParams>>
}

IMPL MockTokenIntrospection {
  FUNCTION new() -> MockTokenIntrospection
    RETURN MockTokenIntrospection {
      introspection_response: None,
      introspect_calls: Mutex::new(vec![])
    }
  END FUNCTION

  FUNCTION with_active_token(scopes: Vec<String>, expires_in: u64) -> Self
    now <- SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()

    self.introspection_response <- Some(Ok(IntrospectionResponse {
      active: true,
      scope: Some(scopes.join(" ")),
      client_id: Some("mock_client"),
      username: Some("mock_user"),
      token_type: Some("Bearer"),
      exp: Some(now + expires_in),
      iat: Some(now),
      nbf: None,
      sub: Some("mock_subject"),
      aud: None,
      iss: Some("https://mock.issuer.com"),
      jti: Some("mock_jti_12345"),
      extra: HashMap::new()
    }))

    RETURN self
  END FUNCTION

  FUNCTION with_inactive_token() -> Self
    self.introspection_response <- Some(Ok(IntrospectionResponse {
      active: false,
      scope: None,
      client_id: None,
      username: None,
      token_type: None,
      exp: None,
      iat: None,
      nbf: None,
      sub: None,
      aud: None,
      iss: None,
      jti: None,
      extra: HashMap::new()
    }))

    RETURN self
  END FUNCTION

  FUNCTION with_error(error: OAuth2Error) -> Self
    self.introspection_response <- Some(Error(error))
    RETURN self
  END FUNCTION

  FUNCTION assert_introspected()
    assert(self.introspect_calls.lock().len() > 0, "Expected introspect to be called")
  END FUNCTION
}

IMPL TokenIntrospection FOR MockTokenIntrospection {
  ASYNC FUNCTION introspect(params: IntrospectionParams) -> Result<IntrospectionResponse, OAuth2Error>
    self.introspect_calls.lock().push(params.clone())

    IF self.introspection_response IS Some THEN
      RETURN self.introspection_response.clone().unwrap()
    END IF

    // Default: active token
    now <- SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()

    RETURN Ok(IntrospectionResponse {
      active: true,
      scope: Some("openid profile"),
      client_id: Some("mock_client"),
      username: Some("mock_user"),
      token_type: Some("Bearer"),
      exp: Some(now + 3600),
      iat: Some(now),
      nbf: None,
      sub: Some("mock_subject"),
      aud: None,
      iss: Some("https://mock.issuer.com"),
      jti: Some("mock_jti"),
      extra: HashMap::new()
    })
  END FUNCTION
}
```

---

## 16. Token Revocation

### 16.1 Revocation Interface

```
// RFC 7009: OAuth 2.0 Token Revocation
TRAIT TokenRevocation {
  // Revoke a token
  ASYNC FUNCTION revoke(params: RevocationParams) -> Result<(), OAuth2Error>

  // Revoke all tokens for a user (if supported)
  ASYNC FUNCTION revoke_all(key: String) -> Result<(), OAuth2Error>
}

STRUCT RevocationParams {
  token: SecretString,
  token_type_hint: Option<TokenTypeHint>
}
```

### 16.2 Revocation Implementation

```
STRUCT TokenRevocationImpl {
  config: OAuth2Config,
  storage: Arc<TokenStorage>,
  transport: Arc<HttpTransport>,
  retry_executor: Arc<RetryExecutor>,
  rate_limiter: Arc<RateLimiter>,
  circuit_breaker: Arc<CircuitBreaker>,
  logger: Logger,
  tracer: Tracer
}

ASYNC FUNCTION revocation.revoke(params: RevocationParams) -> Result<(), OAuth2Error>
  span <- self.tracer.start_span("oauth2.revocation.revoke")

  // Step 1: Check if revocation is supported
  revocation_endpoint <- self.config.provider.revocation_endpoint
    .ok_or_else(|| ConfigurationError::UnsupportedFeature {
      feature: "token_revocation"
    })?

  // Step 2: Build request body
  body <- HashMap::from([
    ("token", params.token.expose_secret())
  ])

  IF params.token_type_hint IS Some THEN
    hint <- MATCH params.token_type_hint.unwrap()
      CASE TokenTypeHint::AccessToken => "access_token"
      CASE TokenTypeHint::RefreshToken => "refresh_token"
    END MATCH
    body.insert("token_type_hint", hint)
  END IF

  // Step 3: Build request
  request <- build_revocation_request(
    revocation_endpoint.clone(),
    self.config.credentials.clone(),
    body
  )?

  self.logger.info("Revoking token", {
    revocation_endpoint: revocation_endpoint.host_str(),
    token_type_hint: params.token_type_hint.map(|h| format("{:?}", h))
  })

  // Step 4: Execute request
  response <- self.execute_revocation_request(request, span.clone()).await?

  // Step 5: Handle response
  // RFC 7009 Section 2.2: Success is 200, even if token was invalid
  IF response.status.is_success() THEN
    self.logger.info("Token revoked successfully")
    span.end()
    RETURN Ok(())
  END IF

  // Handle error
  TRY
    error_response <- parse_json::<OAuth2ErrorResponse>(response.body)?
    span.set_status(Error)
    span.end()
    RETURN Error(map_oauth2_error(error_response))
  CATCH
    span.set_status(Error)
    span.end()
    RETURN Error(ProtocolError::UnexpectedResponse {
      status: response.status.as_u16(),
      body: String::from_utf8_lossy(response.body).to_string()
    })
  END TRY
END FUNCTION

ASYNC FUNCTION revocation.revoke_all(key: String) -> Result<(), OAuth2Error>
  span <- self.tracer.start_span("oauth2.revocation.revoke_all")
  span.set_attribute("key", key)

  // Step 1: Get stored tokens
  stored <- self.storage.get(key.clone()).await?

  IF stored IS None THEN
    self.logger.debug("No tokens found to revoke", {
      key: key
    })
    span.end()
    RETURN Ok(())
  END IF

  tokens <- stored.unwrap()

  // Step 2: Revoke refresh token first (if present)
  // This typically also invalidates associated access tokens
  IF tokens.refresh_token IS Some THEN
    TRY
      self.revoke(RevocationParams {
        token: tokens.refresh_token.unwrap(),
        token_type_hint: Some(TokenTypeHint::RefreshToken)
      }).await?
    CATCH OAuth2Error AS e
      self.logger.warn("Failed to revoke refresh token", {
        key: key,
        error: e.to_string()
      })
      // Continue to revoke access token
    END TRY
  END IF

  // Step 3: Revoke access token
  TRY
    self.revoke(RevocationParams {
      token: tokens.access_token,
      token_type_hint: Some(TokenTypeHint::AccessToken)
    }).await?
  CATCH OAuth2Error AS e
    self.logger.warn("Failed to revoke access token", {
      key: key,
      error: e.to_string()
    })
  END TRY

  // Step 4: Clear local storage
  self.storage.delete(key.clone()).await?

  self.logger.info("All tokens revoked and cleared", {
    key: key
  })

  span.end()

  RETURN Ok(())
END FUNCTION

FUNCTION build_revocation_request(
  endpoint: Url,
  credentials: ClientCredentials,
  params: HashMap<String, String>
) -> Result<HttpRequest, OAuth2Error>
  // Similar to introspection request
  body <- HashMap::new()

  FOR EACH (key, value) IN params DO
    body.insert(key, value)
  END FOR

  headers <- HeaderMap::new()

  MATCH credentials.auth_method
    CASE ClientAuthMethod::ClientSecretBasic:
      credentials_string <- format("{}:{}",
        credentials.client_id,
        credentials.client_secret.unwrap().expose_secret()
      )
      encoded <- base64_encode(credentials_string)
      headers.insert("Authorization", format("Basic {}", encoded))

    CASE ClientAuthMethod::ClientSecretPost:
      body.insert("client_id", credentials.client_id.clone())
      body.insert("client_secret", credentials.client_secret.unwrap().expose_secret().to_string())

    CASE ClientAuthMethod::None:
      body.insert("client_id", credentials.client_id.clone())

    CASE _:
      body.insert("client_id", credentials.client_id.clone())
  END MATCH

  headers.insert("Content-Type", "application/x-www-form-urlencoded")
  headers.insert("Accept", "application/json")

  RETURN Ok(HttpRequest {
    method: POST,
    url: endpoint,
    headers: headers,
    body: Some(Bytes::from(form_urlencoded(body))),
    timeout: None
  })
END FUNCTION

ASYNC FUNCTION revocation.execute_revocation_request(request: HttpRequest, span: Span) -> Result<HttpResponse, OAuth2Error>
  // Check circuit breaker
  IF NOT self.circuit_breaker.allow_request() THEN
    span.set_status(Error)
    RETURN Error(NetworkError::CircuitOpen {
      service: "revocation_endpoint"
    })
  END IF

  // Apply rate limiting
  TRY
    self.rate_limiter.acquire("revocation_endpoint").await
  CATCH RateLimitExceeded
    span.set_status(Error)
    RETURN Error(NetworkError::RateLimited {
      retry_after: None
    })
  END TRY

  // Execute with retry
  result <- self.retry_executor.execute(|| async {
    response <- self.transport.send(request.clone()).await?

    IF response.status == 503 OR response.status == 429 THEN
      retry_after <- parse_retry_after_header(response.headers)
      RETURN Error(RetryableError::ServerUnavailable { retry_after })
    END IF

    IF response.status >= 500 THEN
      RETURN Error(RetryableError::ServerError { status: response.status })
    END IF

    RETURN Ok(response)
  }).await

  // Update circuit breaker
  MATCH result
    CASE Ok(_):
      self.circuit_breaker.record_success()
    CASE Error(_):
      self.circuit_breaker.record_failure()
  END MATCH

  RETURN result.map_err(|e| e.into())
END FUNCTION
```

### 16.3 Revocation Mock

```
STRUCT MockTokenRevocation {
  revoke_error: Option<OAuth2Error>,
  revoke_all_error: Option<OAuth2Error>,

  revoke_calls: Mutex<Vec<RevocationParams>>,
  revoke_all_calls: Mutex<Vec<String>>
}

IMPL MockTokenRevocation {
  FUNCTION new() -> MockTokenRevocation
    RETURN MockTokenRevocation {
      revoke_error: None,
      revoke_all_error: None,
      revoke_calls: Mutex::new(vec![]),
      revoke_all_calls: Mutex::new(vec![])
    }
  END FUNCTION

  FUNCTION with_revoke_error(error: OAuth2Error) -> Self
    self.revoke_error <- Some(error)
    RETURN self
  END FUNCTION

  FUNCTION with_revoke_all_error(error: OAuth2Error) -> Self
    self.revoke_all_error <- Some(error)
    RETURN self
  END FUNCTION

  FUNCTION assert_revoked()
    assert(self.revoke_calls.lock().len() > 0, "Expected revoke to be called")
  END FUNCTION

  FUNCTION assert_revoke_all_called(key: String)
    calls <- self.revoke_all_calls.lock()
    assert(calls.contains(key), format("Expected revoke_all('{}') to be called", key))
  END FUNCTION

  FUNCTION revoke_count() -> usize
    RETURN self.revoke_calls.lock().len()
  END FUNCTION
}

IMPL TokenRevocation FOR MockTokenRevocation {
  ASYNC FUNCTION revoke(params: RevocationParams) -> Result<(), OAuth2Error>
    self.revoke_calls.lock().push(params.clone())

    IF self.revoke_error IS Some THEN
      RETURN Error(self.revoke_error.clone().unwrap())
    END IF

    RETURN Ok(())
  END FUNCTION

  ASYNC FUNCTION revoke_all(key: String) -> Result<(), OAuth2Error>
    self.revoke_all_calls.lock().push(key.clone())

    IF self.revoke_all_error IS Some THEN
      RETURN Error(self.revoke_all_error.clone().unwrap())
    END IF

    RETURN Ok(())
  END FUNCTION
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode (Part 3) |

---

**Continued in Part 4: Error Handling & Resilience**
