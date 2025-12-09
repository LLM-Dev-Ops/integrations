# AWS SES Integration Module - Pseudocode (Part 3)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/aws-ses`
**File:** 3 of 4 - Configuration & Management Services

---

## Table of Contents (Part 3)

13. [Configuration Sets Service](#13-configuration-sets-service)
14. [Event Destinations](#14-event-destinations)
15. [Suppression Service](#15-suppression-service)
16. [Contact Lists Service](#16-contact-lists-service)
17. [Contacts Service](#17-contacts-service)

---

## 13. Configuration Sets Service

### 13.1 Create Configuration Set

```
FUNCTION configuration_sets_service.create(request: CreateConfigurationSetRequest) -> Result<(), SesError>
  span <- self.tracer.start_span("ses.create_configuration_set")
  span.set_attribute("ses.configuration_set_name", request.configuration_set_name)

  TRY
    // Validate configuration set name
    validate_configuration_set_name(request.configuration_set_name)?

    // Build request body
    body <- {
      "ConfigurationSetName": request.configuration_set_name
    }

    // Tracking options
    IF request.tracking_options IS Some THEN
      body["TrackingOptions"] <- {}
      IF request.tracking_options.custom_redirect_domain IS Some THEN
        body["TrackingOptions"]["CustomRedirectDomain"] <- request.tracking_options.custom_redirect_domain
      END IF
    END IF

    // Delivery options
    IF request.delivery_options IS Some THEN
      body["DeliveryOptions"] <- {}
      IF request.delivery_options.tls_policy IS Some THEN
        body["DeliveryOptions"]["TlsPolicy"] <- MATCH request.delivery_options.tls_policy
          CASE TlsPolicy::Require: "REQUIRE"
          CASE TlsPolicy::Optional: "OPTIONAL"
        END MATCH
      END IF
      IF request.delivery_options.sending_pool_name IS Some THEN
        body["DeliveryOptions"]["SendingPoolName"] <- request.delivery_options.sending_pool_name
      END IF
    END IF

    // Reputation options
    IF request.reputation_options IS Some THEN
      body["ReputationOptions"] <- {}
      IF request.reputation_options.reputation_metrics_enabled IS Some THEN
        body["ReputationOptions"]["ReputationMetricsEnabled"] <- request.reputation_options.reputation_metrics_enabled
      END IF
    END IF

    // Sending options
    IF request.sending_options IS Some THEN
      body["SendingOptions"] <- {}
      IF request.sending_options.sending_enabled IS Some THEN
        body["SendingOptions"]["SendingEnabled"] <- request.sending_options.sending_enabled
      END IF
    END IF

    // Suppression options
    IF request.suppression_options IS Some THEN
      body["SuppressionOptions"] <- {}
      IF request.suppression_options.suppressed_reasons IS Some THEN
        body["SuppressionOptions"]["SuppressedReasons"] <- []
        FOR EACH reason IN request.suppression_options.suppressed_reasons DO
          body["SuppressionOptions"]["SuppressedReasons"].push(
            MATCH reason
              CASE SuppressionListReason::Bounce: "BOUNCE"
              CASE SuppressionListReason::Complaint: "COMPLAINT"
            END MATCH
          )
        END FOR
      END IF
    END IF

    // Tags
    IF request.tags IS Some AND request.tags.len() > 0 THEN
      body["Tags"] <- []
      FOR EACH tag IN request.tags DO
        body["Tags"].push({
          "Key": tag.key,
          "Value": tag.value
        })
      END FOR
    END IF

    // Execute request
    execute_with_resilience<()>(
      operation: "CreateConfigurationSet",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: POST,
          endpoint: self.endpoint,
          path: "/v2/email/configuration-sets",
          query_params: None,
          body: Some(body),
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

    self.logger.info("Configuration set created", {
      name: request.configuration_set_name
    })

    span.end()
    RETURN Ok(())

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION

FUNCTION validate_configuration_set_name(name: String) -> Result<(), SesError>
  IF name.is_empty() THEN
    RETURN Error(RequestError::MissingRequiredParameter { parameter: "configuration_set_name" })
  END IF

  IF name.len() > 64 THEN
    RETURN Error(RequestError::ValidationError {
      message: "Configuration set name cannot exceed 64 characters"
    })
  END IF

  // Must contain only alphanumeric characters, hyphens, and underscores
  pattern <- "^[a-zA-Z0-9_-]+$"
  IF NOT regex_match(name, pattern) THEN
    RETURN Error(RequestError::ValidationError {
      message: "Configuration set name must contain only alphanumeric characters, hyphens, and underscores"
    })
  END IF

  RETURN Ok(())
END FUNCTION
```

### 13.2 Get Configuration Set

```
FUNCTION configuration_sets_service.get(configuration_set_name: String) -> Result<GetConfigurationSetOutput, SesError>
  span <- self.tracer.start_span("ses.get_configuration_set")
  span.set_attribute("ses.configuration_set_name", configuration_set_name)

  TRY
    validate_configuration_set_name(configuration_set_name)?

    result <- execute_with_resilience<GetConfigurationSetOutput>(
      operation: "GetConfigurationSet",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: GET,
          endpoint: self.endpoint,
          path: format("/v2/email/configuration-sets/{}", url_encode(configuration_set_name, true)),
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

    span.end()
    RETURN Ok(result)

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 13.3 Delete Configuration Set

```
FUNCTION configuration_sets_service.delete(configuration_set_name: String) -> Result<(), SesError>
  span <- self.tracer.start_span("ses.delete_configuration_set")
  span.set_attribute("ses.configuration_set_name", configuration_set_name)

  TRY
    validate_configuration_set_name(configuration_set_name)?

    execute_with_resilience<()>(
      operation: "DeleteConfigurationSet",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: DELETE,
          endpoint: self.endpoint,
          path: format("/v2/email/configuration-sets/{}", url_encode(configuration_set_name, true)),
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

    self.logger.info("Configuration set deleted", {
      name: configuration_set_name
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

### 13.4 List Configuration Sets

```
FUNCTION configuration_sets_service.list(request: ListConfigurationSetsRequest) -> Result<ListConfigurationSetsOutput, SesError>
  span <- self.tracer.start_span("ses.list_configuration_sets")

  TRY
    query_params <- {}

    IF request.next_token IS Some THEN
      query_params["NextToken"] <- request.next_token
    END IF

    IF request.page_size IS Some THEN
      query_params["PageSize"] <- request.page_size.to_string()
    END IF

    result <- execute_with_resilience<ListConfigurationSetsOutput>(
      operation: "ListConfigurationSets",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: GET,
          endpoint: self.endpoint,
          path: "/v2/email/configuration-sets",
          query_params: IF query_params.is_empty() THEN None ELSE Some(query_params) END IF,
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

    span.set_attribute("ses.configuration_set_count", result.configuration_sets.len())
    span.end()

    RETURN Ok(result)

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 13.5 Put Delivery Options

```
FUNCTION configuration_sets_service.put_delivery_options(request: PutConfigurationSetDeliveryOptionsRequest) -> Result<(), SesError>
  span <- self.tracer.start_span("ses.put_configuration_set_delivery_options")
  span.set_attribute("ses.configuration_set_name", request.configuration_set_name)

  TRY
    validate_configuration_set_name(request.configuration_set_name)?

    body <- {}

    IF request.tls_policy IS Some THEN
      body["TlsPolicy"] <- MATCH request.tls_policy
        CASE TlsPolicy::Require: "REQUIRE"
        CASE TlsPolicy::Optional: "OPTIONAL"
      END MATCH
    END IF

    IF request.sending_pool_name IS Some THEN
      body["SendingPoolName"] <- request.sending_pool_name
    END IF

    execute_with_resilience<()>(
      operation: "PutConfigurationSetDeliveryOptions",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: PUT,
          endpoint: self.endpoint,
          path: format("/v2/email/configuration-sets/{}/delivery-options",
            url_encode(request.configuration_set_name, true)),
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

    span.end()
    RETURN Ok(())

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 13.6 Put Sending Options

```
FUNCTION configuration_sets_service.put_sending_options(request: PutConfigurationSetSendingOptionsRequest) -> Result<(), SesError>
  span <- self.tracer.start_span("ses.put_configuration_set_sending_options")
  span.set_attribute("ses.configuration_set_name", request.configuration_set_name)

  TRY
    validate_configuration_set_name(request.configuration_set_name)?

    body <- {}

    IF request.sending_enabled IS Some THEN
      body["SendingEnabled"] <- request.sending_enabled
    END IF

    execute_with_resilience<()>(
      operation: "PutConfigurationSetSendingOptions",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: PUT,
          endpoint: self.endpoint,
          path: format("/v2/email/configuration-sets/{}/sending",
            url_encode(request.configuration_set_name, true)),
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

    span.end()
    RETURN Ok(())

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 13.7 Put Suppression Options

```
FUNCTION configuration_sets_service.put_suppression_options(request: PutConfigurationSetSuppressionOptionsRequest) -> Result<(), SesError>
  span <- self.tracer.start_span("ses.put_configuration_set_suppression_options")
  span.set_attribute("ses.configuration_set_name", request.configuration_set_name)

  TRY
    validate_configuration_set_name(request.configuration_set_name)?

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
      operation: "PutConfigurationSetSuppressionOptions",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: PUT,
          endpoint: self.endpoint,
          path: format("/v2/email/configuration-sets/{}/suppression-options",
            url_encode(request.configuration_set_name, true)),
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

## 14. Event Destinations

### 14.1 Create Event Destination

```
FUNCTION configuration_sets_service.create_event_destination(request: CreateConfigurationSetEventDestinationRequest) -> Result<(), SesError>
  span <- self.tracer.start_span("ses.create_configuration_set_event_destination")
  span.set_attribute("ses.configuration_set_name", request.configuration_set_name)
  span.set_attribute("ses.event_destination_name", request.event_destination_name)

  TRY
    validate_configuration_set_name(request.configuration_set_name)?
    validate_event_destination_name(request.event_destination_name)?

    // Build event destination body
    event_dest <- {}

    IF request.event_destination.enabled IS Some THEN
      event_dest["Enabled"] <- request.event_destination.enabled
    END IF

    // Matching event types (required)
    event_dest["MatchingEventTypes"] <- []
    FOR EACH event_type IN request.event_destination.matching_event_types DO
      event_dest["MatchingEventTypes"].push(
        MATCH event_type
          CASE EventType::Send: "SEND"
          CASE EventType::Reject: "REJECT"
          CASE EventType::Bounce: "BOUNCE"
          CASE EventType::Complaint: "COMPLAINT"
          CASE EventType::Delivery: "DELIVERY"
          CASE EventType::Open: "OPEN"
          CASE EventType::Click: "CLICK"
          CASE EventType::RenderingFailure: "RENDERING_FAILURE"
          CASE EventType::DeliveryDelay: "DELIVERY_DELAY"
          CASE EventType::Subscription: "SUBSCRIPTION"
        END MATCH
      )
    END FOR

    // Kinesis Firehose destination
    IF request.event_destination.kinesis_firehose_destination IS Some THEN
      dest <- request.event_destination.kinesis_firehose_destination
      event_dest["KinesisFirehoseDestination"] <- {
        "IamRoleArn": dest.iam_role_arn,
        "DeliveryStreamArn": dest.delivery_stream_arn
      }
    END IF

    // CloudWatch destination
    IF request.event_destination.cloud_watch_destination IS Some THEN
      dest <- request.event_destination.cloud_watch_destination
      event_dest["CloudWatchDestination"] <- {
        "DimensionConfigurations": []
      }
      FOR EACH dim IN dest.dimension_configurations DO
        event_dest["CloudWatchDestination"]["DimensionConfigurations"].push({
          "DimensionName": dim.dimension_name,
          "DimensionValueSource": dim.dimension_value_source,
          "DefaultDimensionValue": dim.default_dimension_value
        })
      END FOR
    END IF

    // SNS destination
    IF request.event_destination.sns_destination IS Some THEN
      dest <- request.event_destination.sns_destination
      event_dest["SnsDestination"] <- {
        "TopicArn": dest.topic_arn
      }
    END IF

    // Pinpoint destination
    IF request.event_destination.pinpoint_destination IS Some THEN
      dest <- request.event_destination.pinpoint_destination
      event_dest["PinpointDestination"] <- {}
      IF dest.application_arn IS Some THEN
        event_dest["PinpointDestination"]["ApplicationArn"] <- dest.application_arn
      END IF
    END IF

    body <- {
      "EventDestinationName": request.event_destination_name,
      "EventDestination": event_dest
    }

    execute_with_resilience<()>(
      operation: "CreateConfigurationSetEventDestination",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: POST,
          endpoint: self.endpoint,
          path: format("/v2/email/configuration-sets/{}/event-destinations",
            url_encode(request.configuration_set_name, true)),
          query_params: None,
          body: Some(body),
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

    self.logger.info("Event destination created", {
      configuration_set: request.configuration_set_name,
      event_destination: request.event_destination_name
    })

    span.end()
    RETURN Ok(())

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION

FUNCTION validate_event_destination_name(name: String) -> Result<(), SesError>
  IF name.is_empty() THEN
    RETURN Error(RequestError::MissingRequiredParameter { parameter: "event_destination_name" })
  END IF

  IF name.len() > 64 THEN
    RETURN Error(RequestError::ValidationError {
      message: "Event destination name cannot exceed 64 characters"
    })
  END IF

  pattern <- "^[a-zA-Z0-9_-]+$"
  IF NOT regex_match(name, pattern) THEN
    RETURN Error(RequestError::ValidationError {
      message: "Event destination name must contain only alphanumeric characters, hyphens, and underscores"
    })
  END IF

  RETURN Ok(())
END FUNCTION
```

### 14.2 Get Event Destinations

```
FUNCTION configuration_sets_service.get_event_destinations(configuration_set_name: String) -> Result<GetConfigurationSetEventDestinationsOutput, SesError>
  span <- self.tracer.start_span("ses.get_configuration_set_event_destinations")
  span.set_attribute("ses.configuration_set_name", configuration_set_name)

  TRY
    validate_configuration_set_name(configuration_set_name)?

    result <- execute_with_resilience<GetConfigurationSetEventDestinationsOutput>(
      operation: "GetConfigurationSetEventDestinations",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: GET,
          endpoint: self.endpoint,
          path: format("/v2/email/configuration-sets/{}/event-destinations",
            url_encode(configuration_set_name, true)),
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

    span.set_attribute("ses.event_destination_count", result.event_destinations.len())
    span.end()

    RETURN Ok(result)

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 14.3 Delete Event Destination

```
FUNCTION configuration_sets_service.delete_event_destination(
  configuration_set_name: String,
  event_destination_name: String
) -> Result<(), SesError>
  span <- self.tracer.start_span("ses.delete_configuration_set_event_destination")
  span.set_attribute("ses.configuration_set_name", configuration_set_name)
  span.set_attribute("ses.event_destination_name", event_destination_name)

  TRY
    validate_configuration_set_name(configuration_set_name)?
    validate_event_destination_name(event_destination_name)?

    execute_with_resilience<()>(
      operation: "DeleteConfigurationSetEventDestination",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: DELETE,
          endpoint: self.endpoint,
          path: format("/v2/email/configuration-sets/{}/event-destinations/{}",
            url_encode(configuration_set_name, true),
            url_encode(event_destination_name, true)),
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

    self.logger.info("Event destination deleted", {
      configuration_set: configuration_set_name,
      event_destination: event_destination_name
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

---

## 15. Suppression Service

### 15.1 Put Suppressed Destination

```
FUNCTION suppression_service.put(request: PutSuppressedDestinationRequest) -> Result<(), SesError>
  span <- self.tracer.start_span("ses.put_suppressed_destination")
  span.set_attribute("ses.email_address", redact_email(request.email_address))

  TRY
    // Validate email address
    IF NOT is_valid_email_address(request.email_address) THEN
      RETURN Error(RequestError::InvalidEmailAddress { address: request.email_address })
    END IF

    body <- {
      "EmailAddress": request.email_address,
      "Reason": MATCH request.reason
        CASE SuppressionListReason::Bounce: "BOUNCE"
        CASE SuppressionListReason::Complaint: "COMPLAINT"
      END MATCH
    }

    execute_with_resilience<()>(
      operation: "PutSuppressedDestination",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: PUT,
          endpoint: self.endpoint,
          path: "/v2/email/suppression/addresses",
          query_params: None,
          body: Some(body),
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

    self.logger.info("Address added to suppression list", {
      reason: request.reason.to_string()
    })

    span.end()
    RETURN Ok(())

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION

FUNCTION redact_email(email: String) -> String
  // Redact email for logging: "user@example.com" -> "u***r@example.com"
  parts <- email.split("@")
  IF parts.len() != 2 THEN
    RETURN "***@***"
  END IF

  local_part <- parts[0]
  domain <- parts[1]

  IF local_part.len() <= 2 THEN
    redacted_local <- "***"
  ELSE
    redacted_local <- local_part[0] + "***" + local_part[local_part.len() - 1]
  END IF

  RETURN format("{}@{}", redacted_local, domain)
END FUNCTION
```

### 15.2 Get Suppressed Destination

```
FUNCTION suppression_service.get(email_address: String) -> Result<GetSuppressedDestinationOutput, SesError>
  span <- self.tracer.start_span("ses.get_suppressed_destination")
  span.set_attribute("ses.email_address", redact_email(email_address))

  TRY
    IF NOT is_valid_email_address(email_address) THEN
      RETURN Error(RequestError::InvalidEmailAddress { address: email_address })
    END IF

    result <- execute_with_resilience<GetSuppressedDestinationOutput>(
      operation: "GetSuppressedDestination",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: GET,
          endpoint: self.endpoint,
          path: format("/v2/email/suppression/addresses/{}",
            url_encode(email_address, true)),
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

    span.set_attribute("ses.suppression_reason", result.suppressed_destination.reason.to_string())
    span.end()

    RETURN Ok(result)

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 15.3 Delete Suppressed Destination

```
FUNCTION suppression_service.delete(email_address: String) -> Result<(), SesError>
  span <- self.tracer.start_span("ses.delete_suppressed_destination")
  span.set_attribute("ses.email_address", redact_email(email_address))

  TRY
    IF NOT is_valid_email_address(email_address) THEN
      RETURN Error(RequestError::InvalidEmailAddress { address: email_address })
    END IF

    execute_with_resilience<()>(
      operation: "DeleteSuppressedDestination",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: DELETE,
          endpoint: self.endpoint,
          path: format("/v2/email/suppression/addresses/{}",
            url_encode(email_address, true)),
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

    self.logger.info("Address removed from suppression list")

    span.end()
    RETURN Ok(())

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 15.4 List Suppressed Destinations

```
FUNCTION suppression_service.list(request: ListSuppressedDestinationsRequest) -> Result<ListSuppressedDestinationsOutput, SesError>
  span <- self.tracer.start_span("ses.list_suppressed_destinations")

  TRY
    query_params <- {}

    IF request.next_token IS Some THEN
      query_params["NextToken"] <- request.next_token
    END IF

    IF request.page_size IS Some THEN
      query_params["PageSize"] <- request.page_size.to_string()
    END IF

    IF request.reasons IS Some AND request.reasons.len() > 0 THEN
      reasons_str <- request.reasons.map(|r|
        MATCH r
          CASE SuppressionListReason::Bounce: "BOUNCE"
          CASE SuppressionListReason::Complaint: "COMPLAINT"
        END MATCH
      ).join(",")
      query_params["Reasons"] <- reasons_str
    END IF

    IF request.start_date IS Some THEN
      query_params["StartDate"] <- request.start_date.format_iso8601()
    END IF

    IF request.end_date IS Some THEN
      query_params["EndDate"] <- request.end_date.format_iso8601()
    END IF

    result <- execute_with_resilience<ListSuppressedDestinationsOutput>(
      operation: "ListSuppressedDestinations",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: GET,
          endpoint: self.endpoint,
          path: "/v2/email/suppression/addresses",
          query_params: IF query_params.is_empty() THEN None ELSE Some(query_params) END IF,
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

    span.set_attribute("ses.suppression_count", result.suppressed_destination_summaries.len())
    span.end()

    RETURN Ok(result)

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

---

## 16. Contact Lists Service

### 16.1 Create Contact List

```
FUNCTION contact_lists_service.create(request: CreateContactListRequest) -> Result<(), SesError>
  span <- self.tracer.start_span("ses.create_contact_list")
  span.set_attribute("ses.contact_list_name", request.contact_list_name)

  TRY
    validate_contact_list_name(request.contact_list_name)?

    body <- {
      "ContactListName": request.contact_list_name
    }

    IF request.description IS Some THEN
      body["Description"] <- request.description
    END IF

    IF request.topics IS Some AND request.topics.len() > 0 THEN
      body["Topics"] <- []
      FOR EACH topic IN request.topics DO
        topic_json <- {
          "TopicName": topic.topic_name,
          "DisplayName": topic.display_name,
          "DefaultSubscriptionStatus": MATCH topic.default_subscription_status
            CASE SubscriptionStatus::OptIn: "OPT_IN"
            CASE SubscriptionStatus::OptOut: "OPT_OUT"
          END MATCH
        }
        IF topic.description IS Some THEN
          topic_json["Description"] <- topic.description
        END IF
        body["Topics"].push(topic_json)
      END FOR
    END IF

    IF request.tags IS Some AND request.tags.len() > 0 THEN
      body["Tags"] <- []
      FOR EACH tag IN request.tags DO
        body["Tags"].push({
          "Key": tag.key,
          "Value": tag.value
        })
      END FOR
    END IF

    execute_with_resilience<()>(
      operation: "CreateContactList",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: POST,
          endpoint: self.endpoint,
          path: "/v2/email/contact-lists",
          query_params: None,
          body: Some(body),
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

    self.logger.info("Contact list created", {
      name: request.contact_list_name
    })

    span.end()
    RETURN Ok(())

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION

FUNCTION validate_contact_list_name(name: String) -> Result<(), SesError>
  IF name.is_empty() THEN
    RETURN Error(RequestError::MissingRequiredParameter { parameter: "contact_list_name" })
  END IF

  IF name.len() > 64 THEN
    RETURN Error(RequestError::ValidationError {
      message: "Contact list name cannot exceed 64 characters"
    })
  END IF

  pattern <- "^[a-zA-Z0-9_-]+$"
  IF NOT regex_match(name, pattern) THEN
    RETURN Error(RequestError::ValidationError {
      message: "Contact list name must contain only alphanumeric characters, hyphens, and underscores"
    })
  END IF

  RETURN Ok(())
END FUNCTION
```

### 16.2 Get Contact List

```
FUNCTION contact_lists_service.get(contact_list_name: String) -> Result<GetContactListOutput, SesError>
  span <- self.tracer.start_span("ses.get_contact_list")
  span.set_attribute("ses.contact_list_name", contact_list_name)

  TRY
    validate_contact_list_name(contact_list_name)?

    result <- execute_with_resilience<GetContactListOutput>(
      operation: "GetContactList",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: GET,
          endpoint: self.endpoint,
          path: format("/v2/email/contact-lists/{}", url_encode(contact_list_name, true)),
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

    span.end()
    RETURN Ok(result)

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 16.3 Delete Contact List

```
FUNCTION contact_lists_service.delete(contact_list_name: String) -> Result<(), SesError>
  span <- self.tracer.start_span("ses.delete_contact_list")
  span.set_attribute("ses.contact_list_name", contact_list_name)

  TRY
    validate_contact_list_name(contact_list_name)?

    execute_with_resilience<()>(
      operation: "DeleteContactList",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: DELETE,
          endpoint: self.endpoint,
          path: format("/v2/email/contact-lists/{}", url_encode(contact_list_name, true)),
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

    self.logger.info("Contact list deleted", {
      name: contact_list_name
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

### 16.4 List Contact Lists

```
FUNCTION contact_lists_service.list(request: ListContactListsRequest) -> Result<ListContactListsOutput, SesError>
  span <- self.tracer.start_span("ses.list_contact_lists")

  TRY
    query_params <- {}

    IF request.next_token IS Some THEN
      query_params["NextToken"] <- request.next_token
    END IF

    IF request.page_size IS Some THEN
      query_params["PageSize"] <- request.page_size.to_string()
    END IF

    result <- execute_with_resilience<ListContactListsOutput>(
      operation: "ListContactLists",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: GET,
          endpoint: self.endpoint,
          path: "/v2/email/contact-lists",
          query_params: IF query_params.is_empty() THEN None ELSE Some(query_params) END IF,
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

    span.set_attribute("ses.contact_list_count", result.contact_lists.len())
    span.end()

    RETURN Ok(result)

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

---

## 17. Contacts Service

### 17.1 Create Contact

```
FUNCTION contacts_service.create(request: CreateContactRequest) -> Result<(), SesError>
  span <- self.tracer.start_span("ses.create_contact")
  span.set_attribute("ses.contact_list_name", request.contact_list_name)
  span.set_attribute("ses.email_address", redact_email(request.email_address))

  TRY
    validate_contact_list_name(request.contact_list_name)?

    IF NOT is_valid_email_address(request.email_address) THEN
      RETURN Error(RequestError::InvalidEmailAddress { address: request.email_address })
    END IF

    body <- {
      "EmailAddress": request.email_address
    }

    IF request.topic_preferences IS Some AND request.topic_preferences.len() > 0 THEN
      body["TopicPreferences"] <- []
      FOR EACH pref IN request.topic_preferences DO
        body["TopicPreferences"].push({
          "TopicName": pref.topic_name,
          "SubscriptionStatus": MATCH pref.subscription_status
            CASE SubscriptionStatus::OptIn: "OPT_IN"
            CASE SubscriptionStatus::OptOut: "OPT_OUT"
          END MATCH
        })
      END FOR
    END IF

    IF request.unsubscribe_all IS Some THEN
      body["UnsubscribeAll"] <- request.unsubscribe_all
    END IF

    IF request.attributes_data IS Some THEN
      body["AttributesData"] <- request.attributes_data
    END IF

    execute_with_resilience<()>(
      operation: "CreateContact",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: POST,
          endpoint: self.endpoint,
          path: format("/v2/email/contact-lists/{}/contacts",
            url_encode(request.contact_list_name, true)),
          query_params: None,
          body: Some(body),
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

    self.logger.info("Contact created", {
      contact_list: request.contact_list_name
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

### 17.2 Get Contact

```
FUNCTION contacts_service.get(contact_list_name: String, email_address: String) -> Result<GetContactOutput, SesError>
  span <- self.tracer.start_span("ses.get_contact")
  span.set_attribute("ses.contact_list_name", contact_list_name)
  span.set_attribute("ses.email_address", redact_email(email_address))

  TRY
    validate_contact_list_name(contact_list_name)?

    IF NOT is_valid_email_address(email_address) THEN
      RETURN Error(RequestError::InvalidEmailAddress { address: email_address })
    END IF

    result <- execute_with_resilience<GetContactOutput>(
      operation: "GetContact",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: GET,
          endpoint: self.endpoint,
          path: format("/v2/email/contact-lists/{}/contacts/{}",
            url_encode(contact_list_name, true),
            url_encode(email_address, true)),
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

    span.end()
    RETURN Ok(result)

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 17.3 Update Contact

```
FUNCTION contacts_service.update(request: UpdateContactRequest) -> Result<(), SesError>
  span <- self.tracer.start_span("ses.update_contact")
  span.set_attribute("ses.contact_list_name", request.contact_list_name)
  span.set_attribute("ses.email_address", redact_email(request.email_address))

  TRY
    validate_contact_list_name(request.contact_list_name)?

    IF NOT is_valid_email_address(request.email_address) THEN
      RETURN Error(RequestError::InvalidEmailAddress { address: request.email_address })
    END IF

    body <- {}

    IF request.topic_preferences IS Some AND request.topic_preferences.len() > 0 THEN
      body["TopicPreferences"] <- []
      FOR EACH pref IN request.topic_preferences DO
        body["TopicPreferences"].push({
          "TopicName": pref.topic_name,
          "SubscriptionStatus": MATCH pref.subscription_status
            CASE SubscriptionStatus::OptIn: "OPT_IN"
            CASE SubscriptionStatus::OptOut: "OPT_OUT"
          END MATCH
        })
      END FOR
    END IF

    IF request.unsubscribe_all IS Some THEN
      body["UnsubscribeAll"] <- request.unsubscribe_all
    END IF

    IF request.attributes_data IS Some THEN
      body["AttributesData"] <- request.attributes_data
    END IF

    execute_with_resilience<()>(
      operation: "UpdateContact",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: PUT,
          endpoint: self.endpoint,
          path: format("/v2/email/contact-lists/{}/contacts/{}",
            url_encode(request.contact_list_name, true),
            url_encode(request.email_address, true)),
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

    self.logger.info("Contact updated", {
      contact_list: request.contact_list_name
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

### 17.4 Delete Contact

```
FUNCTION contacts_service.delete(contact_list_name: String, email_address: String) -> Result<(), SesError>
  span <- self.tracer.start_span("ses.delete_contact")
  span.set_attribute("ses.contact_list_name", contact_list_name)
  span.set_attribute("ses.email_address", redact_email(email_address))

  TRY
    validate_contact_list_name(contact_list_name)?

    IF NOT is_valid_email_address(email_address) THEN
      RETURN Error(RequestError::InvalidEmailAddress { address: email_address })
    END IF

    execute_with_resilience<()>(
      operation: "DeleteContact",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: DELETE,
          endpoint: self.endpoint,
          path: format("/v2/email/contact-lists/{}/contacts/{}",
            url_encode(contact_list_name, true),
            url_encode(email_address, true)),
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

    self.logger.info("Contact deleted", {
      contact_list: contact_list_name
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

### 17.5 List Contacts

```
FUNCTION contacts_service.list(request: ListContactsRequest) -> Result<ListContactsOutput, SesError>
  span <- self.tracer.start_span("ses.list_contacts")
  span.set_attribute("ses.contact_list_name", request.contact_list_name)

  TRY
    validate_contact_list_name(request.contact_list_name)?

    query_params <- {}

    IF request.next_token IS Some THEN
      query_params["NextToken"] <- request.next_token
    END IF

    IF request.page_size IS Some THEN
      query_params["PageSize"] <- request.page_size.to_string()
    END IF

    // Build filter body if provided
    body <- None
    IF request.filter IS Some THEN
      filter_json <- {}
      IF request.filter.filtered_status IS Some THEN
        filter_json["FilteredStatus"] <- MATCH request.filter.filtered_status
          CASE SubscriptionStatus::OptIn: "OPT_IN"
          CASE SubscriptionStatus::OptOut: "OPT_OUT"
        END MATCH
      END IF
      IF request.filter.topic_filter IS Some THEN
        filter_json["TopicFilter"] <- {
          "TopicName": request.filter.topic_filter.topic_name
        }
        IF request.filter.topic_filter.use_default_if_preference_unavailable IS Some THEN
          filter_json["TopicFilter"]["UseDefaultIfPreferenceUnavailable"] <- request.filter.topic_filter.use_default_if_preference_unavailable
        END IF
      END IF
      body <- Some({ "Filter": filter_json })
    END IF

    result <- execute_with_resilience<ListContactsOutput>(
      operation: "ListContacts",
      request_fn: ASYNC FUNCTION () -> Result<HttpRequest, SesError>
        RETURN build_ses_request(
          method: IF body IS Some THEN POST ELSE GET END IF,
          endpoint: self.endpoint,
          path: format("/v2/email/contact-lists/{}/contacts",
            url_encode(request.contact_list_name, true)),
          query_params: IF query_params.is_empty() THEN None ELSE Some(query_params) END IF,
          body: body,
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

    span.set_attribute("ses.contact_count", result.contacts.len())
    span.end()

    RETURN Ok(result)

  CATCH error: SesError
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

---

## End of Part 3

*Part 4 covers: Account Service, Testing Utilities, Mock Implementations*
