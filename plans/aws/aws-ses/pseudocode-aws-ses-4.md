# AWS SES Integration Module - Pseudocode (Part 4)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/aws-ses`
**File:** 4 of 4 - Account Service & Testing

---

## Table of Contents (Part 4)

18. [Account Service](#18-account-service)
19. [Testing Utilities](#19-testing-utilities)
20. [Mock Implementations](#20-mock-implementations)
21. [Integration Test Patterns](#21-integration-test-patterns)

---

## 18. Account Service

### 18.1 Get Account

```
FUNCTION account_service.get() -> Result<GetAccountOutput, SesError>
  span <- self.tracer.start_span("ses.get_account")

  TRY
    result <- execute_with_resilience<GetAccountOutput>(
      operation: "GetAccount",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: GET,
          endpoint: self.endpoint,
          path: "/v2/email/account",
          query_params: None,
          body: None,
          signer: self.signer,
          tracer: self.tracer
        )
      END FUNCTION,
      transport: self.transport,
      retry_executor: self.retry_executor,
      rate_limiter: self.rate_limiter,
      circuit_breaker: self.circuit_breaker,
      tracer: self.tracer,
      logger: self.logger
    ).await?

    // Log important account details
    self.logger.info("Account details retrieved", {
      production_access: result.production_access_enabled,
      sending_enabled: result.sending_enabled,
      enforcement_status: result.enforcement_status
    })

    // Set span attributes
    span.set_attribute("ses.production_access", result.production_access_enabled)
    span.set_attribute("ses.sending_enabled", result.sending_enabled)
    IF result.send_quota IS Some THEN
      span.set_attribute("ses.max_24_hour_send", result.send_quota.max_24_hour_send)
      span.set_attribute("ses.max_send_rate", result.send_quota.max_send_rate)
      span.set_attribute("ses.sent_last_24_hours", result.send_quota.sent_last_24_hours)
    END IF

    span.end()
    RETURN Ok(result)

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 18.2 Put Account Sending Attributes

```
FUNCTION account_service.put_sending_attributes(request: PutAccountSendingAttributesRequest) -> Result<(), SesError>
  span <- self.tracer.start_span("ses.put_account_sending_attributes")

  TRY
    body <- {}

    IF request.sending_enabled IS Some THEN
      body["SendingEnabled"] <- request.sending_enabled
    END IF

    execute_with_resilience<()>(
      operation: "PutAccountSendingAttributes",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: PUT,
          endpoint: self.endpoint,
          path: "/v2/email/account/sending",
          query_params: None,
          body: IF body.is_empty() THEN None ELSE Some(body) END IF,
          signer: self.signer,
          tracer: self.tracer
        )
      END FUNCTION,
      transport: self.transport,
      retry_executor: self.retry_executor,
      rate_limiter: self.rate_limiter,
      circuit_breaker: self.circuit_breaker,
      tracer: self.tracer,
      logger: self.logger
    ).await?

    self.logger.info("Account sending attributes updated", {
      sending_enabled: request.sending_enabled
    })

    span.end()
    RETURN Ok(())

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 18.3 Put Account Suppression Attributes

```
FUNCTION account_service.put_suppression_attributes(request: PutAccountSuppressionAttributesRequest) -> Result<(), SesError>
  span <- self.tracer.start_span("ses.put_account_suppression_attributes")

  TRY
    body <- {}

    IF request.suppressed_reasons IS Some THEN
      body["SuppressedReasons"] <- []
      FOR EACH reason IN request.suppressed_reasons DO
        body["SuppressedReasons"].push(
          MATCH reason
            CASE SuppressionListReason::Bounce: "BOUNCE"
            CASE SuppressionListReason::Complaint: "COMPLAINT"
          END MATCH
        )
      END FOR
    END IF

    execute_with_resilience<()>(
      operation: "PutAccountSuppressionAttributes",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: PUT,
          endpoint: self.endpoint,
          path: "/v2/email/account/suppression",
          query_params: None,
          body: IF body.is_empty() THEN None ELSE Some(body) END IF,
          signer: self.signer,
          tracer: self.tracer
        )
      END FUNCTION,
      transport: self.transport,
      retry_executor: self.retry_executor,
      rate_limiter: self.rate_limiter,
      circuit_breaker: self.circuit_breaker,
      tracer: self.tracer,
      logger: self.logger
    ).await?

    self.logger.info("Account suppression attributes updated", {
      suppressed_reasons: request.suppressed_reasons
    })

    span.end()
    RETURN Ok(())

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 18.4 Put Account Dedicated IP Warmup Attributes

```
FUNCTION account_service.put_dedicated_ip_warmup_attributes(request: PutAccountDedicatedIpWarmupAttributesRequest) -> Result<(), SesError>
  span <- self.tracer.start_span("ses.put_account_dedicated_ip_warmup_attributes")

  TRY
    body <- {}

    IF request.auto_warmup_enabled IS Some THEN
      body["AutoWarmupEnabled"] <- request.auto_warmup_enabled
    END IF

    execute_with_resilience<()>(
      operation: "PutAccountDedicatedIpWarmupAttributes",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: PUT,
          endpoint: self.endpoint,
          path: "/v2/email/account/dedicated-ips/warmup",
          query_params: None,
          body: IF body.is_empty() THEN None ELSE Some(body) END IF,
          signer: self.signer,
          tracer: self.tracer
        )
      END FUNCTION,
      transport: self.transport,
      retry_executor: self.retry_executor,
      rate_limiter: self.rate_limiter,
      circuit_breaker: self.circuit_breaker,
      tracer: self.tracer,
      logger: self.logger
    ).await?

    self.logger.info("Account dedicated IP warmup attributes updated", {
      auto_warmup_enabled: request.auto_warmup_enabled
    })

    span.end()
    RETURN Ok(())

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 18.5 Put Account Details

```
FUNCTION account_service.put_details(request: PutAccountDetailsRequest) -> Result<(), SesError>
  span <- self.tracer.start_span("ses.put_account_details")

  TRY
    body <- {}

    IF request.mail_type IS Some THEN
      body["MailType"] <- MATCH request.mail_type
        CASE MailType::Marketing: "MARKETING"
        CASE MailType::Transactional: "TRANSACTIONAL"
      END MATCH
    END IF

    IF request.website_url IS Some THEN
      body["WebsiteURL"] <- request.website_url
    END IF

    IF request.contact_language IS Some THEN
      body["ContactLanguage"] <- MATCH request.contact_language
        CASE ContactLanguage::En: "EN"
        CASE ContactLanguage::Ja: "JA"
      END MATCH
    END IF

    IF request.use_case_description IS Some THEN
      body["UseCaseDescription"] <- request.use_case_description
    END IF

    IF request.additional_contact_email_addresses IS Some THEN
      body["AdditionalContactEmailAddresses"] <- request.additional_contact_email_addresses
    END IF

    IF request.production_access_enabled IS Some THEN
      body["ProductionAccessEnabled"] <- request.production_access_enabled
    END IF

    execute_with_resilience<()>(
      operation: "PutAccountDetails",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: PUT,
          endpoint: self.endpoint,
          path: "/v2/email/account/details",
          query_params: None,
          body: IF body.is_empty() THEN None ELSE Some(body) END IF,
          signer: self.signer,
          tracer: self.tracer
        )
      END FUNCTION,
      transport: self.transport,
      retry_executor: self.retry_executor,
      rate_limiter: self.rate_limiter,
      circuit_breaker: self.circuit_breaker,
      tracer: self.tracer,
      logger: self.logger
    ).await?

    self.logger.info("Account details updated")

    span.end()
    RETURN Ok(())

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

---

## 19. Testing Utilities

### 19.1 Test Configuration Builder

```
FUNCTION create_test_config() -> SesConfig
  RETURN SesConfig {
    region: "us-east-1",
    credentials_provider: Arc::new(StaticCredentialsProvider {
      access_key_id: "test-access-key",
      secret_access_key: SecretString::new("test-secret-key"),
      session_token: None
    }),
    endpoint: Some(Url::parse("http://localhost:4566")),  // LocalStack
    timeout: Duration::from_secs(5),
    max_retries: 1,
    default_from_address: Some("test@example.com"),
    default_configuration_set: None,
    retry_config: RetryConfig {
      max_retries: 1,
      initial_backoff: Duration::from_millis(10),
      max_backoff: Duration::from_millis(100),
      backoff_multiplier: 1.0,
      jitter: 0.0
    },
    circuit_breaker_config: CircuitBreakerConfig {
      failure_threshold: 3,
      success_threshold: 1,
      failure_window: Duration::from_secs(10),
      recovery_timeout: Duration::from_secs(1)
    },
    rate_limit_config: None
  }
END FUNCTION
```

### 19.2 Request Assertion Helpers

```
FUNCTION assert_request_signed(request: HttpRequest)
  // Assert Authorization header exists
  auth_header <- request.headers.get("Authorization")
  ASSERT auth_header IS Some, "Missing Authorization header"
  ASSERT auth_header.starts_with("AWS4-HMAC-SHA256"), "Invalid signature algorithm"

  // Assert X-Amz-Date header exists
  date_header <- request.headers.get("X-Amz-Date")
  ASSERT date_header IS Some, "Missing X-Amz-Date header"
  ASSERT date_header.len() == 16, "Invalid X-Amz-Date format"  // YYYYMMDDTHHMMSSZ

  // Assert Host header exists
  host_header <- request.headers.get("Host")
  ASSERT host_header IS Some, "Missing Host header"

  // Assert Content-SHA256 header exists
  sha_header <- request.headers.get("X-Amz-Content-Sha256")
  ASSERT sha_header IS Some, "Missing X-Amz-Content-Sha256 header"
END FUNCTION

FUNCTION assert_request_body_contains(request: HttpRequest, expected_fields: Map<String, JsonValue>)
  ASSERT request.body IS Some, "Request body is empty"

  body_json <- json_parse(request.body)?
  FOR EACH (key, expected_value) IN expected_fields DO
    actual_value <- body_json.get(key)
    ASSERT actual_value IS Some, format("Missing field: {}", key)
    ASSERT actual_value == expected_value, format("Field {} mismatch: expected {:?}, got {:?}", key, expected_value, actual_value)
  END FOR
END FUNCTION

FUNCTION assert_request_path(request: HttpRequest, expected_path: String)
  actual_path <- request.url.path()
  ASSERT actual_path == expected_path, format("Path mismatch: expected {}, got {}", expected_path, actual_path)
END FUNCTION

FUNCTION assert_request_method(request: HttpRequest, expected_method: HttpMethod)
  ASSERT request.method == expected_method, format("Method mismatch: expected {:?}, got {:?}", expected_method, request.method)
END FUNCTION
```

### 19.3 Response Builders

```
FUNCTION build_success_response(body: Option<JsonValue>) -> HttpResponse
  body_bytes <- IF body IS Some THEN
    json_serialize(body)
  ELSE
    Bytes::new()
  END IF

  headers <- HeaderMap::new()
  headers.insert("Content-Type", "application/json")
  headers.insert("x-amzn-requestid", generate_uuid())

  RETURN HttpResponse {
    status: StatusCode::OK,
    headers: headers,
    body: body_bytes
  }
END FUNCTION

FUNCTION build_error_response(status: StatusCode, code: String, message: String) -> HttpResponse
  body <- {
    "__type": code,
    "message": message
  }

  headers <- HeaderMap::new()
  headers.insert("Content-Type", "application/json")
  headers.insert("x-amzn-requestid", generate_uuid())

  RETURN HttpResponse {
    status: status,
    headers: headers,
    body: json_serialize(body)
  }
END FUNCTION

FUNCTION build_send_email_response(message_id: String) -> HttpResponse
  RETURN build_success_response(Some({
    "MessageId": message_id
  }))
END FUNCTION

FUNCTION build_get_account_response(options: GetAccountResponseOptions) -> HttpResponse
  body <- {
    "DedicatedIpAutoWarmupEnabled": options.dedicated_ip_auto_warmup_enabled OR false,
    "EnforcementStatus": options.enforcement_status OR "HEALTHY",
    "ProductionAccessEnabled": options.production_access_enabled OR false,
    "SendingEnabled": options.sending_enabled OR true
  }

  IF options.send_quota IS Some THEN
    body["SendQuota"] <- {
      "Max24HourSend": options.send_quota.max_24_hour_send,
      "MaxSendRate": options.send_quota.max_send_rate,
      "SentLast24Hours": options.send_quota.sent_last_24_hours
    }
  END IF

  RETURN build_success_response(Some(body))
END FUNCTION
```

---

## 20. Mock Implementations

### 20.1 Mock HTTP Transport

```
STRUCT MockHttpTransport {
  // Queued responses
  responses: Mutex<VecDeque<HttpResponse>>,
  // Recorded requests
  recorded_requests: Mutex<Vec<HttpRequest>>,
  // Optional response handler
  response_handler: Option<Fn(HttpRequest) -> HttpResponse>,
  // Simulate latency
  latency: Option<Duration>,
  // Simulate failures
  failure_mode: Option<TransportError>
}

FUNCTION MockHttpTransport::new() -> MockHttpTransport
  RETURN MockHttpTransport {
    responses: Mutex::new(VecDeque::new()),
    recorded_requests: Mutex::new(Vec::new()),
    response_handler: None,
    latency: None,
    failure_mode: None
  }
END FUNCTION

FUNCTION MockHttpTransport::with_response(self, response: HttpResponse) -> Self
  self.responses.lock().push_back(response)
  RETURN self
END FUNCTION

FUNCTION MockHttpTransport::with_responses(self, responses: Vec<HttpResponse>) -> Self
  FOR EACH response IN responses DO
    self.responses.lock().push_back(response)
  END FOR
  RETURN self
END FUNCTION

FUNCTION MockHttpTransport::with_handler(self, handler: Fn(HttpRequest) -> HttpResponse) -> Self
  self.response_handler <- Some(handler)
  RETURN self
END FUNCTION

FUNCTION MockHttpTransport::with_latency(self, latency: Duration) -> Self
  self.latency <- Some(latency)
  RETURN self
END FUNCTION

FUNCTION MockHttpTransport::with_failure(self, error: TransportError) -> Self
  self.failure_mode <- Some(error)
  RETURN self
END FUNCTION

FUNCTION MockHttpTransport::recorded_requests(self) -> Vec<HttpRequest>
  RETURN self.recorded_requests.lock().clone()
END FUNCTION

FUNCTION MockHttpTransport::last_request(self) -> Option<HttpRequest>
  requests <- self.recorded_requests.lock()
  RETURN requests.last().cloned()
END FUNCTION

FUNCTION MockHttpTransport::request_count(self) -> usize
  RETURN self.recorded_requests.lock().len()
END FUNCTION

FUNCTION MockHttpTransport::clear(self)
  self.responses.lock().clear()
  self.recorded_requests.lock().clear()
  self.failure_mode <- None
END FUNCTION

#[async_trait]
IMPL HttpTransport FOR MockHttpTransport
  ASYNC FUNCTION send(self, request: HttpRequest) -> Result<HttpResponse, TransportError>
    // Record the request
    self.recorded_requests.lock().push(request.clone())

    // Simulate latency
    IF self.latency IS Some THEN
      sleep(self.latency).await
    END IF

    // Check for failure mode
    IF self.failure_mode IS Some THEN
      RETURN Error(self.failure_mode.clone())
    END IF

    // Use handler if available
    IF self.response_handler IS Some THEN
      response <- self.response_handler(request)
      RETURN Ok(response)
    END IF

    // Return queued response
    responses <- self.responses.lock()
    IF responses.is_empty() THEN
      // Default response
      RETURN Ok(build_success_response(None))
    ELSE
      response <- responses.pop_front()
      RETURN Ok(response)
    END IF
  END FUNCTION
END IMPL
```

### 20.2 Mock Credentials Provider

```
STRUCT MockCredentialsProvider {
  credentials: AwsCredentials,
  should_fail: bool,
  call_count: AtomicUsize
}

FUNCTION MockCredentialsProvider::new(access_key: String, secret_key: String) -> MockCredentialsProvider
  RETURN MockCredentialsProvider {
    credentials: AwsCredentials {
      access_key_id: access_key,
      secret_access_key: SecretString::new(secret_key),
      session_token: None
    },
    should_fail: false,
    call_count: AtomicUsize::new(0)
  }
END FUNCTION

FUNCTION MockCredentialsProvider::with_session_token(self, token: String) -> Self
  self.credentials.session_token <- Some(SecretString::new(token))
  RETURN self
END FUNCTION

FUNCTION MockCredentialsProvider::failing(self) -> Self
  self.should_fail <- true
  RETURN self
END FUNCTION

FUNCTION MockCredentialsProvider::call_count(self) -> usize
  RETURN self.call_count.load(Ordering::SeqCst)
END FUNCTION

#[async_trait]
IMPL CredentialsProvider FOR MockCredentialsProvider
  ASYNC FUNCTION get_credentials(self) -> Result<AwsCredentials, CredentialsError>
    self.call_count.fetch_add(1, Ordering::SeqCst)

    IF self.should_fail THEN
      RETURN Error(CredentialsError::CredentialsNotFound { source: "mock" })
    END IF

    RETURN Ok(self.credentials.clone())
  END FUNCTION
END IMPL
```

### 20.3 Mock AWS Signer

```
STRUCT MockAwsSigner {
  should_fail: bool,
  signed_requests: Mutex<Vec<String>>
}

FUNCTION MockAwsSigner::new() -> MockAwsSigner
  RETURN MockAwsSigner {
    should_fail: false,
    signed_requests: Mutex::new(Vec::new())
  }
END FUNCTION

FUNCTION MockAwsSigner::failing(self) -> Self
  self.should_fail <- true
  RETURN self
END FUNCTION

FUNCTION MockAwsSigner::signed_request_count(self) -> usize
  RETURN self.signed_requests.lock().len()
END FUNCTION

IMPL AwsSigner FOR MockAwsSigner
  FUNCTION sign_request(self, request: &mut HttpRequest, payload_hash: String, timestamp: DateTime<Utc>) -> Result<(), SigningError>
    IF self.should_fail THEN
      RETURN Error(SigningError::SignatureCalculationFailed { message: "Mock failure" })
    END IF

    // Add mock authorization header
    request.headers.insert("Authorization", "AWS4-HMAC-SHA256 Credential=MOCK/mock/ses/aws4_request, SignedHeaders=host;x-amz-date, Signature=mocksignature")
    request.headers.insert("X-Amz-Date", timestamp.format("%Y%m%dT%H%M%SZ"))

    // Record signing
    self.signed_requests.lock().push(request.url.to_string())

    RETURN Ok(())
  END FUNCTION
END IMPL
```

### 20.4 Test SES Client Factory

```
FUNCTION create_test_client(transport: MockHttpTransport) -> SesClient
  config <- create_test_config()
  credentials <- MockCredentialsProvider::new("test-key", "test-secret")
  signer <- MockAwsSigner::new()

  RETURN SesClientImpl {
    config: config,
    transport: Arc::new(transport),
    signer: Arc::new(signer),
    endpoint: Url::parse("http://localhost:4566"),
    retry_executor: create_retry_executor(config.retry_config),
    rate_limiter: create_rate_limiter(RateLimitConfig::disabled()),
    circuit_breaker: create_circuit_breaker(config.circuit_breaker_config),
    logger: MockLogger::new(),
    tracer: MockTracer::new(),
    emails_service: None,
    templates_service: None,
    identities_service: None,
    configuration_sets_service: None,
    suppression_service: None,
    contact_lists_service: None,
    contacts_service: None,
    account_service: None
  }
END FUNCTION
```

---

## 21. Integration Test Patterns

### 21.1 Send Email Test

```
#[test]
ASYNC FUNCTION test_send_email_simple()
  // Arrange
  transport <- MockHttpTransport::new()
    .with_response(build_send_email_response("test-message-id-123"))

  client <- create_test_client(transport.clone())

  request <- SendEmailRequest {
    from_email_address: Some("sender@example.com"),
    destination: Destination {
      to_addresses: Some(vec!["recipient@example.com"]),
      cc_addresses: None,
      bcc_addresses: None
    },
    content: EmailContent::Simple(SimpleEmailContent {
      subject: Content { data: "Test Subject", charset: None },
      body: Body {
        text: Some(Content { data: "Test body", charset: None }),
        html: None
      },
      headers: None
    }),
    reply_to_addresses: None,
    feedback_forwarding_email_address: None,
    feedback_forwarding_email_address_identity_arn: None,
    from_email_address_identity_arn: None,
    email_tags: None,
    configuration_set_name: None,
    list_management_options: None
  }

  // Act
  result <- client.emails().send(request).await

  // Assert
  ASSERT result.is_ok()
  output <- result.unwrap()
  ASSERT output.message_id == "test-message-id-123"

  // Verify request
  ASSERT transport.request_count() == 1
  last_request <- transport.last_request().unwrap()
  assert_request_method(last_request, POST)
  assert_request_path(last_request, "/v2/email/outbound-emails")
  assert_request_signed(last_request)
  assert_request_body_contains(last_request, {
    "FromEmailAddress": "sender@example.com",
    "Destination": {
      "ToAddresses": ["recipient@example.com"]
    }
  })
END FUNCTION
```

### 21.2 Error Handling Test

```
#[test]
ASYNC FUNCTION test_send_email_rate_limited()
  // Arrange
  transport <- MockHttpTransport::new()
    .with_response(build_error_response(
      StatusCode::TOO_MANY_REQUESTS,
      "TooManyRequestsException",
      "Rate exceeded"
    ))

  client <- create_test_client(transport.clone())

  request <- SendEmailRequest {
    from_email_address: Some("sender@example.com"),
    destination: Destination {
      to_addresses: Some(vec!["recipient@example.com"]),
      cc_addresses: None,
      bcc_addresses: None
    },
    content: EmailContent::Simple(SimpleEmailContent {
      subject: Content { data: "Test", charset: None },
      body: Body {
        text: Some(Content { data: "Test", charset: None }),
        html: None
      },
      headers: None
    }),
    reply_to_addresses: None,
    feedback_forwarding_email_address: None,
    feedback_forwarding_email_address_identity_arn: None,
    from_email_address_identity_arn: None,
    email_tags: None,
    configuration_set_name: None,
    list_management_options: None
  }

  // Act
  result <- client.emails().send(request).await

  // Assert
  ASSERT result.is_err()
  error <- result.unwrap_err()
  ASSERT MATCHES error, SesError::Quota(QuotaError::TooManyRequests { .. })
  ASSERT error.is_retryable()
END FUNCTION
```

### 21.3 Template Operations Test

```
#[test]
ASYNC FUNCTION test_template_lifecycle()
  // Arrange
  transport <- MockHttpTransport::new()
    .with_response(build_success_response(None))  // Create
    .with_response(build_success_response(Some({  // Get
      "TemplateName": "test-template",
      "TemplateContent": {
        "Subject": "Welcome {{name}}",
        "Html": "<h1>Hello {{name}}</h1>"
      }
    })))
    .with_response(build_success_response(None))  // Update
    .with_response(build_success_response(None))  // Delete

  client <- create_test_client(transport.clone())

  // Create template
  create_request <- CreateEmailTemplateRequest {
    template_name: "test-template",
    template_content: TemplateContent {
      subject: "Welcome {{name}}",
      text: None,
      html: Some("<h1>Hello {{name}}</h1>")
    }
  }
  create_result <- client.templates().create(create_request).await
  ASSERT create_result.is_ok()

  // Get template
  get_result <- client.templates().get("test-template").await
  ASSERT get_result.is_ok()
  template <- get_result.unwrap()
  ASSERT template.template_name == "test-template"

  // Update template
  update_request <- UpdateEmailTemplateRequest {
    template_name: "test-template",
    template_content: TemplateContent {
      subject: "Updated Welcome {{name}}",
      text: None,
      html: Some("<h1>Updated Hello {{name}}</h1>")
    }
  }
  update_result <- client.templates().update(update_request).await
  ASSERT update_result.is_ok()

  // Delete template
  delete_result <- client.templates().delete("test-template").await
  ASSERT delete_result.is_ok()

  // Verify all requests were made
  ASSERT transport.request_count() == 4
END FUNCTION
```

### 21.4 Pagination Test

```
#[test]
ASYNC FUNCTION test_list_templates_pagination()
  // Arrange
  transport <- MockHttpTransport::new()
    .with_response(build_success_response(Some({
      "TemplatesMetadata": [
        { "TemplateName": "template-1", "CreatedTimestamp": "2025-01-01T00:00:00Z" },
        { "TemplateName": "template-2", "CreatedTimestamp": "2025-01-02T00:00:00Z" }
      ],
      "NextToken": "page2token"
    })))
    .with_response(build_success_response(Some({
      "TemplatesMetadata": [
        { "TemplateName": "template-3", "CreatedTimestamp": "2025-01-03T00:00:00Z" }
      ]
    })))  // No NextToken = last page

  client <- create_test_client(transport.clone())

  // Act - collect all templates
  all_templates <- []
  stream <- client.templates().list_all(ListEmailTemplatesRequest {
    next_token: None,
    page_size: Some(2)
  })

  FOR EACH template_result IN stream DO
    template <- template_result?
    all_templates.push(template)
  END FOR

  // Assert
  ASSERT all_templates.len() == 3
  ASSERT all_templates[0].template_name == "template-1"
  ASSERT all_templates[1].template_name == "template-2"
  ASSERT all_templates[2].template_name == "template-3"

  // Verify pagination requests
  ASSERT transport.request_count() == 2
END FUNCTION
```

### 21.5 Circuit Breaker Test

```
#[test]
ASYNC FUNCTION test_circuit_breaker_opens_on_failures()
  // Arrange - transport that always returns 500
  transport <- MockHttpTransport::new()
    .with_handler(|_request| {
      build_error_response(
        StatusCode::INTERNAL_SERVER_ERROR,
        "InternalServiceError",
        "Service error"
      )
    })

  // Configure circuit breaker to open after 3 failures
  config <- create_test_config()
  config.circuit_breaker_config.failure_threshold <- 3
  config.max_retries <- 0  // Disable retries for this test

  client <- create_ses_client(config)?

  // Replace transport with mock
  client.transport <- Arc::new(transport.clone())

  request <- SendEmailRequest { /* ... minimal request ... */ }

  // Act - make requests until circuit opens
  FOR i IN 1..=5 DO
    result <- client.emails().send(request.clone()).await

    IF i <= 3 THEN
      // First 3 requests should hit the server
      ASSERT result.is_err()
      ASSERT MATCHES result.unwrap_err(), SesError::Server(_)
    ELSE
      // Requests 4+ should fail fast with circuit open
      ASSERT result.is_err()
      error <- result.unwrap_err()
      ASSERT MATCHES error, SesError::Server(ServerError::ServiceUnavailable { .. })
    END IF
  END FOR

  // Verify only 3 requests actually went through
  ASSERT transport.request_count() == 3
END FUNCTION
```

### 21.6 AWS Signature V4 Test

```
#[test]
FUNCTION test_signature_v4_generation()
  // Arrange
  credentials <- AwsCredentials {
    access_key_id: "AKIAIOSFODNN7EXAMPLE",
    secret_access_key: SecretString::new("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"),
    session_token: None
  }

  signer <- create_aws_signer(
    service: "ses",
    region: "us-east-1",
    credentials_provider: Arc::new(StaticCredentialsProvider { credentials })
  )

  request <- HttpRequest {
    method: POST,
    url: Url::parse("https://email.us-east-1.amazonaws.com/v2/email/outbound-emails"),
    headers: HeaderMap::new(),
    body: Some(Bytes::from(r#"{"test":"data"}"#)),
    timeout: None
  }

  timestamp <- Utc.with_ymd_and_hms(2025, 1, 1, 12, 0, 0).unwrap()
  payload_hash <- sha256_hex(request.body.unwrap())

  // Act
  signer.sign_request(&mut request, payload_hash, timestamp)?

  // Assert
  auth_header <- request.headers.get("Authorization").unwrap()
  ASSERT auth_header.contains("AWS4-HMAC-SHA256")
  ASSERT auth_header.contains("Credential=AKIAIOSFODNN7EXAMPLE/20250101/us-east-1/ses/aws4_request")
  ASSERT auth_header.contains("SignedHeaders=")
  ASSERT auth_header.contains("Signature=")

  date_header <- request.headers.get("X-Amz-Date").unwrap()
  ASSERT date_header == "20250101T120000Z"

  host_header <- request.headers.get("Host").unwrap()
  ASSERT host_header == "email.us-east-1.amazonaws.com"
END FUNCTION
```

---

## End of Pseudocode Phase

*This completes the Pseudocode phase (Part 1-4) of the SPARC development cycle for the AWS SES Integration Module.*

*The next phase (Architecture) will provide system diagrams, component structure, data flow, and deployment considerations.*
