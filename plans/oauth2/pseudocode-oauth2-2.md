# OAuth2 Authentication Integration Module - Pseudocode (Part 2)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/oauth2`
**File:** 2 of 4 - Authorization Flows

---

## Table of Contents (Part 2)

8. [Authorization Code Flow](#8-authorization-code-flow)
9. [Authorization Code with PKCE Flow](#9-authorization-code-with-pkce-flow)
10. [Client Credentials Flow](#10-client-credentials-flow)
11. [Device Authorization Flow](#11-device-authorization-flow)

---

## 8. Authorization Code Flow

### 8.1 Authorization Code Flow Interface

```
// London-School TDD: Interface for mocking in tests
TRAIT AuthorizationCodeFlow {
  // Generate authorization URL for user redirect
  FUNCTION build_authorization_url(params: AuthorizationParams) -> Result<AuthorizationUrl, OAuth2Error>

  // Exchange authorization code for tokens
  ASYNC FUNCTION exchange_code(request: CodeExchangeRequest) -> Result<TokenResponse, OAuth2Error>

  // Complete authorization callback handling
  ASYNC FUNCTION handle_callback(callback: CallbackParams) -> Result<TokenResponse, OAuth2Error>
}

STRUCT AuthorizationParams {
  redirect_uri: Url,
  scopes: Vec<String>,
  state: Option<String>,           // Auto-generated if None
  response_type: ResponseType,     // Default: Code
  response_mode: Option<ResponseMode>,
  prompt: Option<Prompt>,
  login_hint: Option<String>,
  extra_params: HashMap<String, String>
}

ENUM ResponseType {
  Code,
  Token,           // Implicit (deprecated)
  CodeIdToken      // Hybrid flow
}

ENUM ResponseMode {
  Query,           // Default for code
  Fragment,        // Default for token
  FormPost         // form_post
}

ENUM Prompt {
  None,            // No interaction
  Login,           // Force login
  Consent,         // Force consent
  SelectAccount    // Account picker
}

STRUCT AuthorizationUrl {
  url: Url,
  state: String
}

STRUCT CodeExchangeRequest {
  code: String,
  redirect_uri: Url,
  state: Option<String>
}

STRUCT CallbackParams {
  code: Option<String>,
  state: Option<String>,
  error: Option<String>,
  error_description: Option<String>,
  error_uri: Option<String>
}
```

### 8.2 Authorization URL Builder

```
STRUCT AuthorizationCodeFlowImpl {
  config: OAuth2Config,
  transport: Arc<HttpTransport>,
  state_manager: Arc<StateManager>,
  retry_executor: Arc<RetryExecutor>,
  rate_limiter: Arc<RateLimiter>,
  circuit_breaker: Arc<CircuitBreaker>,
  logger: Logger,
  tracer: Tracer
}

FUNCTION auth_code_flow.build_authorization_url(params: AuthorizationParams) -> Result<AuthorizationUrl, OAuth2Error>
  span <- self.tracer.start_span("oauth2.authorization_code.build_url")

  // Step 1: Validate redirect_uri
  validate_redirect_uri(params.redirect_uri, self.config)?

  // Step 2: Generate or validate state
  state <- IF params.state IS Some THEN
    self.state_manager.validate(params.state.unwrap())?
    params.state.unwrap()
  ELSE
    self.state_manager.generate().value
  END IF

  // Step 3: Merge scopes
  scopes <- merge_scopes(self.config.default_scopes, params.scopes)
  IF scopes.is_empty() THEN
    RETURN Error(ConfigurationError::InvalidScope {
      message: "At least one scope is required"
    })
  END IF

  // Step 4: Build URL
  url <- self.config.provider.authorization_endpoint.clone()

  // Required parameters (RFC 6749 Section 4.1.1)
  url.query_pairs_mut()
    .append_pair("response_type", params.response_type.as_str())
    .append_pair("client_id", self.config.credentials.client_id)
    .append_pair("redirect_uri", params.redirect_uri.as_str())
    .append_pair("state", state)
    .append_pair("scope", scopes.join(" "))

  // Optional parameters
  IF params.response_mode IS Some THEN
    url.query_pairs_mut().append_pair("response_mode", params.response_mode.unwrap().as_str())
  END IF

  IF params.prompt IS Some THEN
    url.query_pairs_mut().append_pair("prompt", params.prompt.unwrap().as_str())
  END IF

  IF params.login_hint IS Some THEN
    url.query_pairs_mut().append_pair("login_hint", params.login_hint.unwrap())
  END IF

  // Extra provider-specific parameters
  FOR EACH (key, value) IN params.extra_params DO
    url.query_pairs_mut().append_pair(key, value)
  END FOR

  // Step 5: Store state with metadata
  state_metadata <- StateMetadata {
    redirect_uri: params.redirect_uri,
    scopes: scopes,
    pkce_verifier: None,
    extra: params.extra_params.clone()
  }
  self.state_manager.store(StateToken { value: state.clone(), created_at: now(), expires_at: now() + 10.minutes() }, state_metadata)?

  self.logger.info("Built authorization URL", {
    authorization_endpoint: self.config.provider.authorization_endpoint.host_str(),
    scopes: scopes.join(" "),
    state: truncate(state, 8) + "..."
  })

  span.end()

  RETURN Ok(AuthorizationUrl {
    url: url,
    state: state
  })
END FUNCTION

FUNCTION validate_redirect_uri(redirect_uri: Url, config: OAuth2Config) -> Result<(), OAuth2Error>
  // Validate scheme
  scheme <- redirect_uri.scheme()

  // Allow http only for localhost (development)
  IF scheme == "http" THEN
    host <- redirect_uri.host_str().unwrap_or("")
    IF host NOT IN ["localhost", "127.0.0.1", "[::1]"] THEN
      RETURN Error(ConfigurationError::InvalidRedirectUri {
        message: "HTTP scheme only allowed for localhost"
      })
    END IF
  ELSE IF scheme != "https" AND NOT scheme.starts_with("com.") AND NOT scheme.starts_with("io.") THEN
    // Allow custom schemes for native apps (com.example.app://)
    RETURN Error(ConfigurationError::InvalidRedirectUri {
      message: format("Invalid redirect URI scheme: {}", scheme)
    })
  END IF

  // Validate no fragment
  IF redirect_uri.fragment() IS Some THEN
    RETURN Error(ConfigurationError::InvalidRedirectUri {
      message: "Redirect URI must not contain a fragment"
    })
  END IF

  RETURN Ok(())
END FUNCTION

FUNCTION merge_scopes(default_scopes: Vec<String>, request_scopes: Vec<String>) -> Vec<String>
  // If request provides scopes, use those; otherwise use defaults
  IF NOT request_scopes.is_empty() THEN
    // Deduplicate while preserving order
    seen <- HashSet::new()
    result <- []
    FOR scope IN request_scopes DO
      IF NOT seen.contains(scope) THEN
        seen.insert(scope.clone())
        result.push(scope)
      END IF
    END FOR
    RETURN result
  ELSE
    RETURN default_scopes
  END IF
END FUNCTION
```

### 8.3 Code Exchange

```
ASYNC FUNCTION auth_code_flow.exchange_code(request: CodeExchangeRequest) -> Result<TokenResponse, OAuth2Error>
  span <- self.tracer.start_span("oauth2.authorization_code.exchange")
  span.set_attribute("redirect_uri", request.redirect_uri.host_str())

  // Step 1: Validate state if provided
  state_metadata <- IF request.state IS Some THEN
    Some(self.state_manager.consume(request.state.unwrap())?)
  ELSE
    None
  END IF

  // Verify redirect_uri matches stored state
  IF state_metadata IS Some THEN
    IF state_metadata.unwrap().redirect_uri != request.redirect_uri THEN
      RETURN Error(AuthorizationError::StateMismatch {
        expected: state_metadata.unwrap().redirect_uri.to_string(),
        received: request.redirect_uri.to_string()
      })
    END IF
  END IF

  // Step 2: Build token request
  grant_params <- HashMap::from([
    ("grant_type", "authorization_code"),
    ("code", request.code.as_str()),
    ("redirect_uri", request.redirect_uri.as_str())
  ])

  token_request <- build_token_request(
    self.config.provider.token_endpoint.clone(),
    self.config.credentials.clone(),
    grant_params
  )?

  self.logger.info("Exchanging authorization code for tokens", {
    token_endpoint: self.config.provider.token_endpoint.host_str()
  })

  // Step 3: Execute with retry, rate limiting, and circuit breaker
  response <- self.execute_token_request(token_request, span.clone()).await?

  // Step 4: Parse response
  token_response <- parse_token_response(response)?

  self.logger.info("Token exchange successful", {
    token_type: token_response.token_type,
    expires_in: token_response.expires_in,
    has_refresh_token: token_response.refresh_token.is_some(),
    scopes: token_response.scope.clone().unwrap_or_default()
  })

  span.end()

  RETURN Ok(token_response)
END FUNCTION

ASYNC FUNCTION auth_code_flow.execute_token_request(request: HttpRequest, span: Span) -> Result<HttpResponse, OAuth2Error>
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

    // Check for retryable errors
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

FUNCTION parse_token_response(response: HttpResponse) -> Result<TokenResponse, OAuth2Error>
  // Check HTTP status
  IF NOT response.status.is_success() THEN
    // Try to parse error response
    TRY
      error_response <- parse_json::<OAuth2ErrorResponse>(response.body)?
      RETURN Error(map_oauth2_error(error_response))
    CATCH
      RETURN Error(ProtocolError::UnexpectedResponse {
        status: response.status.as_u16(),
        body: String::from_utf8_lossy(response.body).to_string()
      })
    END TRY
  END IF

  // Parse success response
  TRY
    token <- parse_json::<TokenResponse>(response.body)?

    // Validate required fields
    IF token.access_token.is_empty() THEN
      RETURN Error(ProtocolError::MissingField {
        field: "access_token"
      })
    END IF

    RETURN Ok(token)
  CATCH ParseError AS e
    RETURN Error(ProtocolError::InvalidResponse {
      message: format("Failed to parse token response: {}", e)
    })
  END TRY
END FUNCTION

STRUCT TokenResponse {
  access_token: String,
  token_type: String,              // Usually "Bearer"
  expires_in: Option<u64>,         // Seconds until expiration
  refresh_token: Option<String>,
  scope: Option<String>,
  id_token: Option<String>,        // For OIDC flows
  // Extensible for provider-specific fields
  extra: HashMap<String, serde_json::Value>
}

STRUCT OAuth2ErrorResponse {
  error: String,
  error_description: Option<String>,
  error_uri: Option<String>
}
```

### 8.4 Callback Handler

```
ASYNC FUNCTION auth_code_flow.handle_callback(callback: CallbackParams) -> Result<TokenResponse, OAuth2Error>
  span <- self.tracer.start_span("oauth2.authorization_code.callback")

  // Step 1: Check for error response
  IF callback.error IS Some THEN
    error_code <- callback.error.unwrap()
    error_description <- callback.error_description.unwrap_or_default()

    self.logger.warn("Authorization callback error", {
      error: error_code,
      description: error_description
    })

    span.set_status(Error)
    span.end()

    RETURN Error(map_authorization_error(
      error_code,
      error_description,
      callback.error_uri
    ))
  END IF

  // Step 2: Validate code presence
  code <- callback.code.ok_or_else(|| {
    AuthorizationError::MissingCode {
      message: "Authorization code not present in callback"
    }
  })?

  // Step 3: Validate state
  state <- callback.state.ok_or_else(|| {
    AuthorizationError::StateMismatch {
      expected: "[state]",
      received: "[none]"
    }
  })?

  // Step 4: Consume state and get metadata
  state_metadata <- self.state_manager.consume(state)?

  // Step 5: Exchange code for tokens
  exchange_request <- CodeExchangeRequest {
    code: code,
    redirect_uri: state_metadata.redirect_uri,
    state: None  // Already consumed
  }

  result <- self.exchange_code(exchange_request).await?

  span.end()

  RETURN Ok(result)
END FUNCTION

FUNCTION map_authorization_error(
  error: String,
  description: String,
  error_uri: Option<String>
) -> OAuth2Error
  // RFC 6749 Section 4.1.2.1 Error Codes
  MATCH error.as_str()
    CASE "invalid_request":
      RETURN AuthorizationError::InvalidRequest {
        description: description,
        uri: error_uri
      }

    CASE "unauthorized_client":
      RETURN AuthorizationError::UnauthorizedClient {
        description: description
      }

    CASE "access_denied":
      RETURN AuthorizationError::AccessDenied {
        description: description
      }

    CASE "unsupported_response_type":
      RETURN AuthorizationError::UnsupportedResponseType {
        description: description
      }

    CASE "invalid_scope":
      RETURN ConfigurationError::InvalidScope {
        message: description
      }

    CASE "server_error":
      RETURN ProviderError::ServerError {
        description: description
      }

    CASE "temporarily_unavailable":
      RETURN ProviderError::TemporarilyUnavailable {
        description: description,
        retry_after: None
      }

    CASE "interaction_required":
      RETURN AuthorizationError::InteractionRequired {
        description: description
      }

    CASE "login_required":
      RETURN AuthorizationError::LoginRequired {
        description: description
      }

    CASE "consent_required":
      RETURN AuthorizationError::ConsentRequired {
        description: description
      }

    CASE _:
      RETURN AuthorizationError::Unknown {
        error: error,
        description: description,
        uri: error_uri
      }
  END MATCH
END FUNCTION
```

### 8.5 Mock Implementation for Testing

```
// London-School TDD: Mock for isolated unit testing
STRUCT MockAuthorizationCodeFlow {
  // Predefined responses
  authorization_url_response: Option<Result<AuthorizationUrl, OAuth2Error>>,
  exchange_code_response: Option<Result<TokenResponse, OAuth2Error>>,
  callback_response: Option<Result<TokenResponse, OAuth2Error>>,

  // Call tracking
  build_url_calls: Mutex<Vec<AuthorizationParams>>,
  exchange_calls: Mutex<Vec<CodeExchangeRequest>>,
  callback_calls: Mutex<Vec<CallbackParams>>
}

IMPL MockAuthorizationCodeFlow {
  FUNCTION new() -> MockAuthorizationCodeFlow
    RETURN MockAuthorizationCodeFlow {
      authorization_url_response: None,
      exchange_code_response: None,
      callback_response: None,
      build_url_calls: Mutex::new(vec![]),
      exchange_calls: Mutex::new(vec![]),
      callback_calls: Mutex::new(vec![])
    }
  END FUNCTION

  FUNCTION with_authorization_url(response: Result<AuthorizationUrl, OAuth2Error>) -> Self
    self.authorization_url_response <- Some(response)
    RETURN self
  END FUNCTION

  FUNCTION with_exchange_response(response: Result<TokenResponse, OAuth2Error>) -> Self
    self.exchange_code_response <- Some(response)
    RETURN self
  END FUNCTION

  FUNCTION assert_exchange_called_with(predicate: Fn(CodeExchangeRequest) -> bool)
    calls <- self.exchange_calls.lock()
    assert(calls.iter().any(predicate), "Expected exchange to be called with matching request")
  END FUNCTION
}

IMPL AuthorizationCodeFlow FOR MockAuthorizationCodeFlow {
  FUNCTION build_authorization_url(params: AuthorizationParams) -> Result<AuthorizationUrl, OAuth2Error>
    self.build_url_calls.lock().push(params.clone())

    IF self.authorization_url_response IS Some THEN
      RETURN self.authorization_url_response.clone().unwrap()
    END IF

    // Default mock response
    RETURN Ok(AuthorizationUrl {
      url: Url::parse("https://example.com/authorize?mock=true").unwrap(),
      state: "mock_state_12345"
    })
  END FUNCTION

  ASYNC FUNCTION exchange_code(request: CodeExchangeRequest) -> Result<TokenResponse, OAuth2Error>
    self.exchange_calls.lock().push(request.clone())

    IF self.exchange_code_response IS Some THEN
      RETURN self.exchange_code_response.clone().unwrap()
    END IF

    // Default mock response
    RETURN Ok(TokenResponse {
      access_token: "mock_access_token",
      token_type: "Bearer",
      expires_in: Some(3600),
      refresh_token: Some("mock_refresh_token"),
      scope: Some("openid profile"),
      id_token: None,
      extra: HashMap::new()
    })
  END FUNCTION

  ASYNC FUNCTION handle_callback(callback: CallbackParams) -> Result<TokenResponse, OAuth2Error>
    self.callback_calls.lock().push(callback.clone())

    IF self.callback_response IS Some THEN
      RETURN self.callback_response.clone().unwrap()
    END IF

    // Default mock response
    RETURN Ok(TokenResponse {
      access_token: "mock_access_token_from_callback",
      token_type: "Bearer",
      expires_in: Some(3600),
      refresh_token: Some("mock_refresh_token"),
      scope: None,
      id_token: None,
      extra: HashMap::new()
    })
  END FUNCTION
}
```

---

## 9. Authorization Code with PKCE Flow

### 9.1 PKCE Flow Interface

```
// Extends Authorization Code flow with PKCE (RFC 7636)
TRAIT AuthorizationCodePkceFlow {
  // Generate authorization URL with PKCE challenge
  FUNCTION build_authorization_url(params: PkceAuthorizationParams) -> Result<PkceAuthorizationUrl, OAuth2Error>

  // Exchange code with PKCE verifier
  ASYNC FUNCTION exchange_code(request: PkceCodeExchangeRequest) -> Result<TokenResponse, OAuth2Error>

  // Complete callback with automatic verifier lookup
  ASYNC FUNCTION handle_callback(callback: CallbackParams) -> Result<TokenResponse, OAuth2Error>
}

STRUCT PkceAuthorizationParams {
  redirect_uri: Url,
  scopes: Vec<String>,
  state: Option<String>,
  pkce_verifier: Option<PkceVerifier>,  // Auto-generated if None
  challenge_method: PkceMethod,          // Default: S256
  prompt: Option<Prompt>,
  login_hint: Option<String>,
  extra_params: HashMap<String, String>
}

STRUCT PkceAuthorizationUrl {
  url: Url,
  state: String,
  pkce_verifier: PkceVerifier  // Must be stored for code exchange
}

STRUCT PkceCodeExchangeRequest {
  code: String,
  redirect_uri: Url,
  pkce_verifier: PkceVerifier,
  state: Option<String>
}
```

### 9.2 PKCE Authorization URL Builder

```
STRUCT AuthorizationCodePkceFlowImpl {
  config: OAuth2Config,
  transport: Arc<HttpTransport>,
  state_manager: Arc<StateManager>,
  pkce_generator: Arc<PkceGenerator>,
  retry_executor: Arc<RetryExecutor>,
  rate_limiter: Arc<RateLimiter>,
  circuit_breaker: Arc<CircuitBreaker>,
  logger: Logger,
  tracer: Tracer
}

FUNCTION pkce_flow.build_authorization_url(params: PkceAuthorizationParams) -> Result<PkceAuthorizationUrl, OAuth2Error>
  span <- self.tracer.start_span("oauth2.authorization_code_pkce.build_url")

  // Step 1: Validate redirect_uri
  validate_redirect_uri(params.redirect_uri, self.config)?

  // Step 2: Generate or use provided state
  state <- IF params.state IS Some THEN
    self.state_manager.validate(params.state.unwrap())?
    params.state.unwrap()
  ELSE
    self.state_manager.generate().value
  END IF

  // Step 3: Generate or use provided PKCE verifier
  pkce_verifier <- IF params.pkce_verifier IS Some THEN
    params.pkce_verifier.unwrap()
  ELSE
    self.pkce_generator.generate_verifier()
  END IF

  // Step 4: Generate PKCE challenge
  challenge <- self.pkce_generator.challenge(pkce_verifier.clone(), params.challenge_method)

  // Step 5: Merge scopes
  scopes <- merge_scopes(self.config.default_scopes, params.scopes)
  IF scopes.is_empty() THEN
    RETURN Error(ConfigurationError::InvalidScope {
      message: "At least one scope is required"
    })
  END IF

  // Step 6: Build URL
  url <- self.config.provider.authorization_endpoint.clone()

  // Required parameters (RFC 6749 Section 4.1.1 + RFC 7636)
  url.query_pairs_mut()
    .append_pair("response_type", "code")
    .append_pair("client_id", self.config.credentials.client_id)
    .append_pair("redirect_uri", params.redirect_uri.as_str())
    .append_pair("state", state)
    .append_pair("scope", scopes.join(" "))
    .append_pair("code_challenge", challenge)
    .append_pair("code_challenge_method", params.challenge_method.as_str())

  // Optional parameters
  IF params.prompt IS Some THEN
    url.query_pairs_mut().append_pair("prompt", params.prompt.unwrap().as_str())
  END IF

  IF params.login_hint IS Some THEN
    url.query_pairs_mut().append_pair("login_hint", params.login_hint.unwrap())
  END IF

  // Extra provider-specific parameters
  FOR EACH (key, value) IN params.extra_params DO
    url.query_pairs_mut().append_pair(key, value)
  END FOR

  // Step 7: Store state with PKCE verifier
  state_metadata <- StateMetadata {
    redirect_uri: params.redirect_uri,
    scopes: scopes,
    pkce_verifier: Some(pkce_verifier.clone()),
    extra: params.extra_params.clone()
  }

  state_token <- StateToken {
    value: state.clone(),
    created_at: now(),
    expires_at: now() + 10.minutes()
  }

  self.state_manager.store(state_token, state_metadata)?

  self.logger.info("Built PKCE authorization URL", {
    authorization_endpoint: self.config.provider.authorization_endpoint.host_str(),
    scopes: scopes.join(" "),
    challenge_method: params.challenge_method.as_str(),
    state: truncate(state, 8) + "..."
  })

  span.end()

  RETURN Ok(PkceAuthorizationUrl {
    url: url,
    state: state,
    pkce_verifier: pkce_verifier
  })
END FUNCTION

IMPL PkceMethod {
  FUNCTION as_str(&self) -> &str
    MATCH self
      CASE PkceMethod::S256 => "S256"
      CASE PkceMethod::Plain => "plain"
    END MATCH
  END FUNCTION
}
```

### 9.3 PKCE Code Exchange

```
ASYNC FUNCTION pkce_flow.exchange_code(request: PkceCodeExchangeRequest) -> Result<TokenResponse, OAuth2Error>
  span <- self.tracer.start_span("oauth2.authorization_code_pkce.exchange")
  span.set_attribute("redirect_uri", request.redirect_uri.host_str())

  // Step 1: Validate PKCE verifier format
  validate_pkce_verifier(request.pkce_verifier.secret().to_string())?

  // Step 2: Build token request with code_verifier
  grant_params <- HashMap::from([
    ("grant_type", "authorization_code"),
    ("code", request.code.as_str()),
    ("redirect_uri", request.redirect_uri.as_str()),
    ("code_verifier", request.pkce_verifier.secret())
  ])

  token_request <- build_token_request(
    self.config.provider.token_endpoint.clone(),
    self.config.credentials.clone(),
    grant_params
  )?

  self.logger.info("Exchanging authorization code with PKCE", {
    token_endpoint: self.config.provider.token_endpoint.host_str()
  })

  // Step 3: Execute with retry, rate limiting, and circuit breaker
  response <- self.execute_token_request(token_request, span.clone()).await?

  // Step 4: Parse response
  token_response <- parse_token_response(response)?

  self.logger.info("PKCE token exchange successful", {
    token_type: token_response.token_type,
    expires_in: token_response.expires_in,
    has_refresh_token: token_response.refresh_token.is_some()
  })

  span.end()

  RETURN Ok(token_response)
END FUNCTION

// Shared execution logic (same as AuthorizationCodeFlow)
ASYNC FUNCTION pkce_flow.execute_token_request(request: HttpRequest, span: Span) -> Result<HttpResponse, OAuth2Error>
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

### 9.4 PKCE Callback Handler

```
ASYNC FUNCTION pkce_flow.handle_callback(callback: CallbackParams) -> Result<TokenResponse, OAuth2Error>
  span <- self.tracer.start_span("oauth2.authorization_code_pkce.callback")

  // Step 1: Check for error response
  IF callback.error IS Some THEN
    error_code <- callback.error.unwrap()
    error_description <- callback.error_description.unwrap_or_default()

    self.logger.warn("PKCE authorization callback error", {
      error: error_code,
      description: error_description
    })

    span.set_status(Error)
    span.end()

    RETURN Error(map_authorization_error(
      error_code,
      error_description,
      callback.error_uri
    ))
  END IF

  // Step 2: Validate code presence
  code <- callback.code.ok_or_else(|| {
    AuthorizationError::MissingCode {
      message: "Authorization code not present in callback"
    }
  })?

  // Step 3: Validate state
  state <- callback.state.ok_or_else(|| {
    AuthorizationError::StateMismatch {
      expected: "[state]",
      received: "[none]"
    }
  })?

  // Step 4: Consume state and get metadata with PKCE verifier
  state_metadata <- self.state_manager.consume(state)?

  // Step 5: Extract PKCE verifier from state metadata
  pkce_verifier <- state_metadata.pkce_verifier.ok_or_else(|| {
    AuthorizationError::MissingPkceVerifier {
      message: "PKCE verifier not found in state metadata"
    }
  })?

  // Step 6: Exchange code with PKCE verifier
  exchange_request <- PkceCodeExchangeRequest {
    code: code,
    redirect_uri: state_metadata.redirect_uri,
    pkce_verifier: pkce_verifier,
    state: None
  }

  result <- self.exchange_code(exchange_request).await?

  span.end()

  RETURN Ok(result)
END FUNCTION
```

### 9.5 PKCE Mock Implementation

```
STRUCT MockAuthorizationCodePkceFlow {
  authorization_url_response: Option<Result<PkceAuthorizationUrl, OAuth2Error>>,
  exchange_code_response: Option<Result<TokenResponse, OAuth2Error>>,
  callback_response: Option<Result<TokenResponse, OAuth2Error>>,

  build_url_calls: Mutex<Vec<PkceAuthorizationParams>>,
  exchange_calls: Mutex<Vec<PkceCodeExchangeRequest>>,
  callback_calls: Mutex<Vec<CallbackParams>>
}

IMPL MockAuthorizationCodePkceFlow {
  FUNCTION new() -> MockAuthorizationCodePkceFlow
    RETURN MockAuthorizationCodePkceFlow {
      authorization_url_response: None,
      exchange_code_response: None,
      callback_response: None,
      build_url_calls: Mutex::new(vec![]),
      exchange_calls: Mutex::new(vec![]),
      callback_calls: Mutex::new(vec![])
    }
  END FUNCTION

  FUNCTION with_exchange_response(response: Result<TokenResponse, OAuth2Error>) -> Self
    self.exchange_code_response <- Some(response)
    RETURN self
  END FUNCTION

  FUNCTION assert_pkce_verifier_used(expected_length: usize)
    calls <- self.exchange_calls.lock()
    assert(calls.len() > 0, "Expected exchange to be called")
    last_call <- calls.last().unwrap()
    assert_eq(last_call.pkce_verifier.secret().len(), expected_length)
  END FUNCTION
}

IMPL AuthorizationCodePkceFlow FOR MockAuthorizationCodePkceFlow {
  FUNCTION build_authorization_url(params: PkceAuthorizationParams) -> Result<PkceAuthorizationUrl, OAuth2Error>
    self.build_url_calls.lock().push(params.clone())

    IF self.authorization_url_response IS Some THEN
      RETURN self.authorization_url_response.clone().unwrap()
    END IF

    // Default mock response with generated PKCE
    mock_verifier <- PkceVerifier::new()
    RETURN Ok(PkceAuthorizationUrl {
      url: Url::parse("https://example.com/authorize?mock=true&code_challenge=abc123").unwrap(),
      state: "mock_pkce_state_12345",
      pkce_verifier: mock_verifier
    })
  END FUNCTION

  ASYNC FUNCTION exchange_code(request: PkceCodeExchangeRequest) -> Result<TokenResponse, OAuth2Error>
    self.exchange_calls.lock().push(request.clone())

    IF self.exchange_code_response IS Some THEN
      RETURN self.exchange_code_response.clone().unwrap()
    END IF

    RETURN Ok(TokenResponse {
      access_token: "mock_pkce_access_token",
      token_type: "Bearer",
      expires_in: Some(3600),
      refresh_token: Some("mock_pkce_refresh_token"),
      scope: Some("openid profile email"),
      id_token: None,
      extra: HashMap::new()
    })
  END FUNCTION

  ASYNC FUNCTION handle_callback(callback: CallbackParams) -> Result<TokenResponse, OAuth2Error>
    self.callback_calls.lock().push(callback.clone())

    IF self.callback_response IS Some THEN
      RETURN self.callback_response.clone().unwrap()
    END IF

    RETURN Ok(TokenResponse {
      access_token: "mock_pkce_access_token_from_callback",
      token_type: "Bearer",
      expires_in: Some(3600),
      refresh_token: Some("mock_pkce_refresh_token"),
      scope: None,
      id_token: None,
      extra: HashMap::new()
    })
  END FUNCTION
}
```

---

## 10. Client Credentials Flow

### 10.1 Client Credentials Interface

```
// RFC 6749 Section 4.4: Client Credentials Grant
TRAIT ClientCredentialsFlow {
  // Request access token using client credentials
  ASYNC FUNCTION request_token(params: ClientCredentialsParams) -> Result<TokenResponse, OAuth2Error>
}

STRUCT ClientCredentialsParams {
  scopes: Vec<String>,
  extra_params: HashMap<String, String>
}
```

### 10.2 Client Credentials Implementation

```
STRUCT ClientCredentialsFlowImpl {
  config: OAuth2Config,
  transport: Arc<HttpTransport>,
  retry_executor: Arc<RetryExecutor>,
  rate_limiter: Arc<RateLimiter>,
  circuit_breaker: Arc<CircuitBreaker>,
  logger: Logger,
  tracer: Tracer
}

ASYNC FUNCTION client_credentials_flow.request_token(params: ClientCredentialsParams) -> Result<TokenResponse, OAuth2Error>
  span <- self.tracer.start_span("oauth2.client_credentials.request")

  // Step 1: Validate client is confidential (has client_secret)
  IF self.config.credentials.auth_method == ClientAuthMethod::None THEN
    RETURN Error(ConfigurationError::InvalidConfiguration {
      message: "Client credentials flow requires a confidential client with client_secret"
    })
  END IF

  // Step 2: Merge scopes
  scopes <- merge_scopes(self.config.default_scopes, params.scopes)

  // Step 3: Build token request
  grant_params <- HashMap::from([
    ("grant_type", "client_credentials")
  ])

  IF NOT scopes.is_empty() THEN
    grant_params.insert("scope", scopes.join(" "))
  END IF

  // Add extra parameters
  FOR EACH (key, value) IN params.extra_params DO
    grant_params.insert(key, value)
  END FOR

  token_request <- build_token_request(
    self.config.provider.token_endpoint.clone(),
    self.config.credentials.clone(),
    grant_params
  )?

  self.logger.info("Requesting client credentials token", {
    token_endpoint: self.config.provider.token_endpoint.host_str(),
    scopes: scopes.join(" ")
  })

  // Step 4: Execute with retry, rate limiting, and circuit breaker
  response <- self.execute_token_request(token_request, span.clone()).await?

  // Step 5: Parse response
  token_response <- parse_token_response(response)?

  // Note: Client credentials flow typically doesn't return refresh tokens
  IF token_response.refresh_token IS Some THEN
    self.logger.debug("Unexpected refresh token in client credentials response")
  END IF

  self.logger.info("Client credentials token acquired", {
    token_type: token_response.token_type,
    expires_in: token_response.expires_in,
    scopes: token_response.scope.clone().unwrap_or_default()
  })

  span.end()

  RETURN Ok(token_response)
END FUNCTION

ASYNC FUNCTION client_credentials_flow.execute_token_request(request: HttpRequest, span: Span) -> Result<HttpResponse, OAuth2Error>
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

### 10.3 Client Credentials Mock

```
STRUCT MockClientCredentialsFlow {
  token_response: Option<Result<TokenResponse, OAuth2Error>>,
  request_calls: Mutex<Vec<ClientCredentialsParams>>
}

IMPL MockClientCredentialsFlow {
  FUNCTION new() -> MockClientCredentialsFlow
    RETURN MockClientCredentialsFlow {
      token_response: None,
      request_calls: Mutex::new(vec![])
    }
  END FUNCTION

  FUNCTION with_token_response(response: Result<TokenResponse, OAuth2Error>) -> Self
    self.token_response <- Some(response)
    RETURN self
  END FUNCTION

  FUNCTION with_error(error: OAuth2Error) -> Self
    self.token_response <- Some(Error(error))
    RETURN self
  END FUNCTION

  FUNCTION assert_called()
    assert(self.request_calls.lock().len() > 0, "Expected request_token to be called")
  END FUNCTION

  FUNCTION assert_scopes_requested(expected_scopes: Vec<String>)
    calls <- self.request_calls.lock()
    assert(calls.len() > 0, "Expected request_token to be called")
    actual_scopes <- calls.last().unwrap().scopes.clone()
    assert_eq(actual_scopes, expected_scopes)
  END FUNCTION
}

IMPL ClientCredentialsFlow FOR MockClientCredentialsFlow {
  ASYNC FUNCTION request_token(params: ClientCredentialsParams) -> Result<TokenResponse, OAuth2Error>
    self.request_calls.lock().push(params.clone())

    IF self.token_response IS Some THEN
      RETURN self.token_response.clone().unwrap()
    END IF

    // Default mock response
    RETURN Ok(TokenResponse {
      access_token: "mock_client_credentials_token",
      token_type: "Bearer",
      expires_in: Some(3600),
      refresh_token: None,  // No refresh token for client credentials
      scope: Some(params.scopes.join(" ")),
      id_token: None,
      extra: HashMap::new()
    })
  END FUNCTION
}
```

### 10.4 Client Credentials with Caching

```
// Enhanced client credentials flow with automatic token caching
STRUCT CachedClientCredentialsFlow {
  inner: Arc<ClientCredentialsFlow>,
  cache: RwLock<Option<CachedToken>>,
  refresh_threshold: Duration,
  logger: Logger
}

STRUCT CachedToken {
  response: TokenResponse,
  acquired_at: Instant,
  expires_at: Option<Instant>
}

FUNCTION CachedClientCredentialsFlow::new(
  inner: Arc<ClientCredentialsFlow>,
  refresh_threshold: Duration
) -> CachedClientCredentialsFlow
  RETURN CachedClientCredentialsFlow {
    inner: inner,
    cache: RwLock::new(None),
    refresh_threshold: refresh_threshold,
    logger: get_logger("oauth2.client_credentials.cache")
  }
END FUNCTION

ASYNC FUNCTION cached_flow.request_token(params: ClientCredentialsParams) -> Result<TokenResponse, OAuth2Error>
  // Check cache first
  cached <- self.cache.read().clone()

  IF cached IS Some THEN
    cached_token <- cached.unwrap()

    // Check if token is still valid
    IF cached_token.expires_at IS Some THEN
      now <- Instant::now()
      expiry <- cached_token.expires_at.unwrap()

      IF now < expiry - self.refresh_threshold THEN
        self.logger.debug("Using cached client credentials token", {
          expires_in_secs: (expiry - now).as_secs()
        })
        RETURN Ok(cached_token.response)
      END IF

      self.logger.debug("Cached token expiring soon, refreshing", {
        expires_in_secs: (expiry - now).as_secs()
      })
    ELSE
      // No expiration, assume still valid
      self.logger.debug("Using cached token (no expiration)")
      RETURN Ok(cached_token.response)
    END IF
  END IF

  // Request new token
  response <- self.inner.request_token(params).await?

  // Cache the response
  now <- Instant::now()
  expires_at <- response.expires_in.map(|secs| now + Duration::from_secs(secs))

  cached_token <- CachedToken {
    response: response.clone(),
    acquired_at: now,
    expires_at: expires_at
  }

  *self.cache.write() <- Some(cached_token)

  self.logger.info("Cached new client credentials token", {
    expires_in: response.expires_in
  })

  RETURN Ok(response)
END FUNCTION

FUNCTION cached_flow.invalidate_cache()
  *self.cache.write() <- None
  self.logger.debug("Invalidated client credentials cache")
END FUNCTION
```

---

## 11. Device Authorization Flow

### 11.1 Device Authorization Interface

```
// RFC 8628: OAuth 2.0 Device Authorization Grant
TRAIT DeviceAuthorizationFlow {
  // Request device and user codes
  ASYNC FUNCTION request_device_code(params: DeviceCodeParams) -> Result<DeviceAuthorizationResponse, OAuth2Error>

  // Poll for token (single attempt)
  ASYNC FUNCTION poll_token(device_code: String) -> Result<DeviceTokenResult, OAuth2Error>

  // Poll with automatic retry until authorization or timeout
  ASYNC FUNCTION await_authorization(response: DeviceAuthorizationResponse) -> Result<TokenResponse, OAuth2Error>
}

STRUCT DeviceCodeParams {
  scopes: Vec<String>,
  extra_params: HashMap<String, String>
}

STRUCT DeviceAuthorizationResponse {
  device_code: String,
  user_code: String,
  verification_uri: Url,
  verification_uri_complete: Option<Url>,
  expires_in: u64,
  interval: Option<u64>  // Minimum polling interval in seconds (default: 5)
}

ENUM DeviceTokenResult {
  Success(TokenResponse),
  Pending,
  SlowDown { new_interval: u64 },
  Expired,
  AccessDenied
}
```

### 11.2 Device Authorization Implementation

```
STRUCT DeviceAuthorizationFlowImpl {
  config: OAuth2Config,
  transport: Arc<HttpTransport>,
  retry_executor: Arc<RetryExecutor>,
  rate_limiter: Arc<RateLimiter>,
  circuit_breaker: Arc<CircuitBreaker>,
  logger: Logger,
  tracer: Tracer
}

ASYNC FUNCTION device_flow.request_device_code(params: DeviceCodeParams) -> Result<DeviceAuthorizationResponse, OAuth2Error>
  span <- self.tracer.start_span("oauth2.device.request_code")

  // Step 1: Check if provider supports device flow
  device_endpoint <- self.config.provider.device_authorization_endpoint
    .ok_or_else(|| ConfigurationError::UnsupportedFeature {
      feature: "device_authorization"
    })?

  // Step 2: Merge scopes
  scopes <- merge_scopes(self.config.default_scopes, params.scopes)

  // Step 3: Build device authorization request
  body <- HashMap::from([
    ("client_id", self.config.credentials.client_id.as_str())
  ])

  IF NOT scopes.is_empty() THEN
    body.insert("scope", scopes.join(" ").as_str())
  END IF

  // Add extra parameters
  FOR EACH (key, value) IN params.extra_params DO
    body.insert(key, value)
  END FOR

  headers <- HeaderMap::from([
    ("Content-Type", "application/x-www-form-urlencoded"),
    ("Accept", "application/json")
  ])

  request <- HttpRequest {
    method: POST,
    url: device_endpoint.clone(),
    headers: headers,
    body: Some(Bytes::from(form_urlencoded(body))),
    timeout: Some(30s)
  }

  self.logger.info("Requesting device authorization code", {
    device_endpoint: device_endpoint.host_str(),
    scopes: scopes.join(" ")
  })

  // Step 4: Execute request
  response <- self.execute_request(request, span.clone()).await?

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
    device_response <- parse_json::<DeviceAuthorizationResponse>(response.body)?
  CATCH ParseError AS e
    span.set_status(Error)
    span.end()
    RETURN Error(ProtocolError::InvalidResponse {
      message: format("Failed to parse device authorization response: {}", e)
    })
  END TRY

  self.logger.info("Device authorization code received", {
    user_code: device_response.user_code,
    verification_uri: device_response.verification_uri.to_string(),
    expires_in: device_response.expires_in,
    interval: device_response.interval
  })

  span.end()

  RETURN Ok(device_response)
END FUNCTION

ASYNC FUNCTION device_flow.execute_request(request: HttpRequest, span: Span) -> Result<HttpResponse, OAuth2Error>
  // Check circuit breaker
  IF NOT self.circuit_breaker.allow_request() THEN
    span.set_status(Error)
    RETURN Error(NetworkError::CircuitOpen {
      service: "device_authorization_endpoint"
    })
  END IF

  // Execute with retry
  result <- self.retry_executor.execute(|| async {
    response <- self.transport.send(request.clone()).await?

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

### 11.3 Device Token Polling

```
ASYNC FUNCTION device_flow.poll_token(device_code: String) -> Result<DeviceTokenResult, OAuth2Error>
  span <- self.tracer.start_span("oauth2.device.poll_token")

  // Build token request
  grant_params <- HashMap::from([
    ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
    ("device_code", device_code.as_str())
  ])

  token_request <- build_token_request(
    self.config.provider.token_endpoint.clone(),
    self.config.credentials.clone(),
    grant_params
  )?

  // Execute request (no retry for polling - handled at higher level)
  response <- self.transport.send(token_request).await?

  // Handle response
  IF response.status.is_success() THEN
    TRY
      token_response <- parse_json::<TokenResponse>(response.body)?
      span.end()
      RETURN Ok(DeviceTokenResult::Success(token_response))
    CATCH ParseError AS e
      span.set_status(Error)
      span.end()
      RETURN Error(ProtocolError::InvalidResponse {
        message: format("Failed to parse token response: {}", e)
      })
    END TRY
  END IF

  // Parse error response
  TRY
    error_response <- parse_json::<OAuth2ErrorResponse>(response.body)?
  CATCH
    span.set_status(Error)
    span.end()
    RETURN Error(ProtocolError::UnexpectedResponse {
      status: response.status.as_u16(),
      body: String::from_utf8_lossy(response.body).to_string()
    })
  END TRY

  // Map device-specific errors (RFC 8628 Section 3.5)
  MATCH error_response.error.as_str()
    CASE "authorization_pending":
      span.end()
      RETURN Ok(DeviceTokenResult::Pending)

    CASE "slow_down":
      // Increase interval by 5 seconds per spec
      span.end()
      RETURN Ok(DeviceTokenResult::SlowDown { new_interval: 5 })

    CASE "expired_token":
      span.end()
      RETURN Ok(DeviceTokenResult::Expired)

    CASE "access_denied":
      span.end()
      RETURN Ok(DeviceTokenResult::AccessDenied)

    CASE _:
      span.set_status(Error)
      span.end()
      RETURN Error(map_oauth2_error(error_response))
  END MATCH
END FUNCTION
```

### 11.4 Automatic Polling Loop

```
ASYNC FUNCTION device_flow.await_authorization(response: DeviceAuthorizationResponse) -> Result<TokenResponse, OAuth2Error>
  span <- self.tracer.start_span("oauth2.device.await_authorization")
  span.set_attribute("user_code", response.user_code)

  // Initialize polling parameters
  interval <- response.interval.unwrap_or(5)
  deadline <- Instant::now() + Duration::from_secs(response.expires_in)
  attempt <- 0

  self.logger.info("Waiting for device authorization", {
    user_code: response.user_code,
    verification_uri: response.verification_uri.to_string(),
    expires_in: response.expires_in,
    interval: interval
  })

  LOOP
    attempt <- attempt + 1

    // Check expiration
    IF Instant::now() >= deadline THEN
      self.logger.warn("Device authorization expired", {
        user_code: response.user_code,
        attempts: attempt
      })
      span.set_status(Error)
      span.end()
      RETURN Error(AuthorizationError::DeviceCodeExpired {
        user_code: response.user_code
      })
    END IF

    // Wait for interval before polling
    sleep(Duration::from_secs(interval)).await

    self.logger.debug("Polling for device authorization", {
      attempt: attempt,
      interval: interval
    })

    // Poll token endpoint
    result <- self.poll_token(response.device_code.clone()).await?

    MATCH result
      CASE DeviceTokenResult::Success(token_response):
        self.logger.info("Device authorization successful", {
          user_code: response.user_code,
          attempts: attempt,
          token_type: token_response.token_type
        })
        span.end()
        RETURN Ok(token_response)

      CASE DeviceTokenResult::Pending:
        // Continue polling
        self.logger.debug("Authorization pending", {
          attempt: attempt
        })
        CONTINUE

      CASE DeviceTokenResult::SlowDown { new_interval }:
        // Increase interval
        interval <- interval + new_interval
        self.logger.debug("Slowing down polling", {
          new_interval: interval
        })
        CONTINUE

      CASE DeviceTokenResult::Expired:
        self.logger.warn("Device code expired during polling", {
          user_code: response.user_code,
          attempts: attempt
        })
        span.set_status(Error)
        span.end()
        RETURN Error(AuthorizationError::DeviceCodeExpired {
          user_code: response.user_code
        })

      CASE DeviceTokenResult::AccessDenied:
        self.logger.warn("Device authorization denied by user", {
          user_code: response.user_code,
          attempts: attempt
        })
        span.set_status(Error)
        span.end()
        RETURN Error(AuthorizationError::AccessDenied {
          description: "User denied device authorization"
        })
    END MATCH
  END LOOP
END FUNCTION
```

### 11.5 Device Flow with User Notification Callback

```
// Enhanced device flow with user notification support
STRUCT InteractiveDeviceFlow {
  inner: Arc<DeviceAuthorizationFlow>,
  on_user_code: Option<Box<dyn Fn(DeviceUserCode) + Send + Sync>>,
  on_status_change: Option<Box<dyn Fn(DeviceFlowStatus) + Send + Sync>>,
  logger: Logger
}

STRUCT DeviceUserCode {
  user_code: String,
  verification_uri: Url,
  verification_uri_complete: Option<Url>,
  expires_at: Instant
}

ENUM DeviceFlowStatus {
  WaitingForUser,
  Polling { attempt: u32 },
  SlowingDown { new_interval: u64 },
  Success,
  Expired,
  Denied
}

IMPL InteractiveDeviceFlow {
  FUNCTION new(inner: Arc<DeviceAuthorizationFlow>) -> InteractiveDeviceFlow
    RETURN InteractiveDeviceFlow {
      inner: inner,
      on_user_code: None,
      on_status_change: None,
      logger: get_logger("oauth2.device.interactive")
    }
  END FUNCTION

  FUNCTION with_user_code_callback<F>(callback: F) -> Self
    WHERE F: Fn(DeviceUserCode) + Send + Sync + 'static
    self.on_user_code <- Some(Box::new(callback))
    RETURN self
  END FUNCTION

  FUNCTION with_status_callback<F>(callback: F) -> Self
    WHERE F: Fn(DeviceFlowStatus) + Send + Sync + 'static
    self.on_status_change <- Some(Box::new(callback))
    RETURN self
  END FUNCTION
}

ASYNC FUNCTION interactive_flow.authorize(params: DeviceCodeParams) -> Result<TokenResponse, OAuth2Error>
  // Request device code
  response <- self.inner.request_device_code(params).await?

  // Notify user code
  IF self.on_user_code IS Some THEN
    user_code <- DeviceUserCode {
      user_code: response.user_code.clone(),
      verification_uri: response.verification_uri.clone(),
      verification_uri_complete: response.verification_uri_complete.clone(),
      expires_at: Instant::now() + Duration::from_secs(response.expires_in)
    }
    (self.on_user_code.as_ref().unwrap())(user_code)
  END IF

  // Notify status
  IF self.on_status_change IS Some THEN
    (self.on_status_change.as_ref().unwrap())(DeviceFlowStatus::WaitingForUser)
  END IF

  // Poll for authorization
  interval <- response.interval.unwrap_or(5)
  deadline <- Instant::now() + Duration::from_secs(response.expires_in)
  attempt <- 0

  LOOP
    attempt <- attempt + 1

    IF Instant::now() >= deadline THEN
      IF self.on_status_change IS Some THEN
        (self.on_status_change.as_ref().unwrap())(DeviceFlowStatus::Expired)
      END IF
      RETURN Error(AuthorizationError::DeviceCodeExpired {
        user_code: response.user_code
      })
    END IF

    sleep(Duration::from_secs(interval)).await

    IF self.on_status_change IS Some THEN
      (self.on_status_change.as_ref().unwrap())(DeviceFlowStatus::Polling { attempt })
    END IF

    result <- self.inner.poll_token(response.device_code.clone()).await?

    MATCH result
      CASE DeviceTokenResult::Success(token_response):
        IF self.on_status_change IS Some THEN
          (self.on_status_change.as_ref().unwrap())(DeviceFlowStatus::Success)
        END IF
        RETURN Ok(token_response)

      CASE DeviceTokenResult::Pending:
        CONTINUE

      CASE DeviceTokenResult::SlowDown { new_interval }:
        interval <- interval + new_interval
        IF self.on_status_change IS Some THEN
          (self.on_status_change.as_ref().unwrap())(DeviceFlowStatus::SlowingDown { new_interval: interval })
        END IF
        CONTINUE

      CASE DeviceTokenResult::Expired:
        IF self.on_status_change IS Some THEN
          (self.on_status_change.as_ref().unwrap())(DeviceFlowStatus::Expired)
        END IF
        RETURN Error(AuthorizationError::DeviceCodeExpired {
          user_code: response.user_code
        })

      CASE DeviceTokenResult::AccessDenied:
        IF self.on_status_change IS Some THEN
          (self.on_status_change.as_ref().unwrap())(DeviceFlowStatus::Denied)
        END IF
        RETURN Error(AuthorizationError::AccessDenied {
          description: "User denied device authorization"
        })
    END MATCH
  END LOOP
END FUNCTION
```

### 11.6 Device Flow Mock

```
STRUCT MockDeviceAuthorizationFlow {
  device_code_response: Option<Result<DeviceAuthorizationResponse, OAuth2Error>>,
  poll_responses: Mutex<VecDeque<Result<DeviceTokenResult, OAuth2Error>>>,

  device_code_calls: Mutex<Vec<DeviceCodeParams>>,
  poll_calls: Mutex<Vec<String>>
}

IMPL MockDeviceAuthorizationFlow {
  FUNCTION new() -> MockDeviceAuthorizationFlow
    RETURN MockDeviceAuthorizationFlow {
      device_code_response: None,
      poll_responses: Mutex::new(VecDeque::new()),
      device_code_calls: Mutex::new(vec![]),
      poll_calls: Mutex::new(vec![])
    }
  END FUNCTION

  FUNCTION with_device_code_response(response: Result<DeviceAuthorizationResponse, OAuth2Error>) -> Self
    self.device_code_response <- Some(response)
    RETURN self
  END FUNCTION

  // Queue multiple poll responses in order
  FUNCTION queue_poll_response(response: Result<DeviceTokenResult, OAuth2Error>) -> Self
    self.poll_responses.lock().push_back(response)
    RETURN self
  END FUNCTION

  // Simulate: 2 pending, then success
  FUNCTION with_successful_flow(token: TokenResponse) -> Self
    self <- self.queue_poll_response(Ok(DeviceTokenResult::Pending))
    self <- self.queue_poll_response(Ok(DeviceTokenResult::Pending))
    self <- self.queue_poll_response(Ok(DeviceTokenResult::Success(token)))
    RETURN self
  END FUNCTION

  // Simulate: pending, slow_down, pending, success
  FUNCTION with_slow_down_flow(token: TokenResponse) -> Self
    self <- self.queue_poll_response(Ok(DeviceTokenResult::Pending))
    self <- self.queue_poll_response(Ok(DeviceTokenResult::SlowDown { new_interval: 5 }))
    self <- self.queue_poll_response(Ok(DeviceTokenResult::Pending))
    self <- self.queue_poll_response(Ok(DeviceTokenResult::Success(token)))
    RETURN self
  END FUNCTION

  FUNCTION assert_poll_count(expected: usize)
    assert_eq(self.poll_calls.lock().len(), expected)
  END FUNCTION
}

IMPL DeviceAuthorizationFlow FOR MockDeviceAuthorizationFlow {
  ASYNC FUNCTION request_device_code(params: DeviceCodeParams) -> Result<DeviceAuthorizationResponse, OAuth2Error>
    self.device_code_calls.lock().push(params.clone())

    IF self.device_code_response IS Some THEN
      RETURN self.device_code_response.clone().unwrap()
    END IF

    // Default mock response
    RETURN Ok(DeviceAuthorizationResponse {
      device_code: "mock_device_code_12345",
      user_code: "MOCK-CODE",
      verification_uri: Url::parse("https://example.com/device").unwrap(),
      verification_uri_complete: Some(Url::parse("https://example.com/device?user_code=MOCK-CODE").unwrap()),
      expires_in: 600,
      interval: Some(5)
    })
  END FUNCTION

  ASYNC FUNCTION poll_token(device_code: String) -> Result<DeviceTokenResult, OAuth2Error>
    self.poll_calls.lock().push(device_code.clone())

    // Return next queued response
    queued <- self.poll_responses.lock().pop_front()
    IF queued IS Some THEN
      RETURN queued.unwrap()
    END IF

    // Default: pending
    RETURN Ok(DeviceTokenResult::Pending)
  END FUNCTION

  ASYNC FUNCTION await_authorization(response: DeviceAuthorizationResponse) -> Result<TokenResponse, OAuth2Error>
    // For mock, just return first success from queue or default
    LOOP
      result <- self.poll_token(response.device_code.clone()).await?
      MATCH result
        CASE DeviceTokenResult::Success(token):
          RETURN Ok(token)
        CASE DeviceTokenResult::Pending:
          CONTINUE
        CASE DeviceTokenResult::SlowDown { new_interval }:
          CONTINUE
        CASE DeviceTokenResult::Expired:
          RETURN Error(AuthorizationError::DeviceCodeExpired {
            user_code: response.user_code
          })
        CASE DeviceTokenResult::AccessDenied:
          RETURN Error(AuthorizationError::AccessDenied {
            description: "User denied"
          })
      END MATCH
    END LOOP
  END FUNCTION
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode (Part 2) |

---

**Continued in Part 3: Token Management**
