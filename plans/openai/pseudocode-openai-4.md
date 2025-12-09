# OpenAI Integration Module - Pseudocode (Part 4)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-08
**Module:** `integrations/openai`
**File:** 4 of 4 - Assistants, Fine-tuning, Moderations APIs

---

## Table of Contents (Part 4)

17. [Moderations Service](#17-moderations-service)
18. [Fine-tuning Service](#18-fine-tuning-service)
19. [Assistants Service](#19-assistants-service)
20. [Threads Service](#20-threads-service)
21. [Messages Service](#21-messages-service)
22. [Runs Service](#22-runs-service)
23. [Vector Stores Service](#23-vector-stores-service)
24. [Testing Patterns](#24-testing-patterns)

---

## 17. Moderations Service

### 17.1 Create Moderation

```
FUNCTION moderations_service.create(
  request: ModerationRequest
) -> Result<ModerationResponse, OpenAIError>

  // Step 1: Validate request
  validate_moderation_request(request)?

  // Step 2: Execute with resilience
  response <- execute_with_resilience(
    operation: "moderations.create",
    request_fn: ASYNC FUNCTION() -> Result<ModerationResponse, OpenAIError>
      http_request <- build_request(
        method: POST,
        endpoint: "/moderations",
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: Some(serialize_json(request)?),
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<ModerationResponse>(http_response, self.logger)
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  // Log if content was flagged
  FOR EACH result IN response.results DO
    IF result.flagged THEN
      self.logger.info("Content flagged by moderation", {
        model: response.model,
        categories: get_flagged_categories(result.categories)
      })
    END IF
  END FOR

  RETURN Ok(response)
END FUNCTION

FUNCTION validate_moderation_request(request: ModerationRequest) -> Result<(), RequestError>
  errors <- []

  // Validate input
  MATCH request.input
    CASE ModerationInput::Single(text):
      IF text.is_empty() THEN
        errors.push(ValidationDetail {
          field: "input",
          message: "Input text cannot be empty"
        })
      END IF

    CASE ModerationInput::Multiple(texts):
      IF texts.is_empty() THEN
        errors.push(ValidationDetail {
          field: "input",
          message: "Input array cannot be empty"
        })
      END IF
      FOR EACH (index, text) IN texts.enumerate() DO
        IF text.is_empty() THEN
          errors.push(ValidationDetail {
            field: format("input[{}]", index),
            message: "Input text cannot be empty"
          })
        END IF
      END FOR

    CASE ModerationInput::Multimodal(items):
      IF items.is_empty() THEN
        errors.push(ValidationDetail {
          field: "input",
          message: "Input array cannot be empty"
        })
      END IF
  END MATCH

  // Validate model if specified
  IF request.model IS Some THEN
    valid_models <- [
      "text-moderation-latest",
      "text-moderation-stable",
      "omni-moderation-latest"
    ]
    IF request.model NOT IN valid_models THEN
      errors.push(ValidationDetail {
        field: "model",
        message: format("Model must be one of: {:?}", valid_models)
      })
    END IF
  END IF

  IF errors.is_empty() THEN
    RETURN Ok(())
  ELSE
    RETURN Error(RequestError::ValidationError {
      message: "Moderation request validation failed",
      details: errors
    })
  END IF
END FUNCTION

FUNCTION get_flagged_categories(categories: ModerationCategories) -> Vec<String>
  flagged <- []

  IF categories.hate THEN flagged.push("hate") END IF
  IF categories.hate_threatening THEN flagged.push("hate/threatening") END IF
  IF categories.harassment THEN flagged.push("harassment") END IF
  IF categories.harassment_threatening THEN flagged.push("harassment/threatening") END IF
  IF categories.self_harm THEN flagged.push("self-harm") END IF
  IF categories.self_harm_intent THEN flagged.push("self-harm/intent") END IF
  IF categories.self_harm_instructions THEN flagged.push("self-harm/instructions") END IF
  IF categories.sexual THEN flagged.push("sexual") END IF
  IF categories.sexual_minors THEN flagged.push("sexual/minors") END IF
  IF categories.violence THEN flagged.push("violence") END IF
  IF categories.violence_graphic THEN flagged.push("violence/graphic") END IF

  RETURN flagged
END FUNCTION
```

---

## 18. Fine-tuning Service

### 18.1 Create Fine-tuning Job

```
FUNCTION fine_tuning_service.create(
  request: FineTuningJobRequest
) -> Result<FineTuningJob, OpenAIError>

  // Step 1: Validate request
  validate_fine_tuning_request(request)?

  // Step 2: Execute with resilience
  response <- execute_with_resilience(
    operation: "fine_tuning.create",
    request_fn: ASYNC FUNCTION() -> Result<FineTuningJob, OpenAIError>
      http_request <- build_request(
        method: POST,
        endpoint: "/fine_tuning/jobs",
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: Some(serialize_json(request)?),
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<FineTuningJob>(http_response, self.logger)
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  self.logger.info("Fine-tuning job created", {
    job_id: response.id,
    model: response.model,
    training_file: response.training_file
  })

  RETURN Ok(response)
END FUNCTION

FUNCTION validate_fine_tuning_request(request: FineTuningJobRequest) -> Result<(), RequestError>
  errors <- []

  // Validate model
  IF request.model.is_empty() THEN
    errors.push(ValidationDetail {
      field: "model",
      message: "Model is required"
    })
  END IF

  // Validate training file
  IF request.training_file.is_empty() THEN
    errors.push(ValidationDetail {
      field: "training_file",
      message: "Training file ID is required"
    })
  END IF

  // Validate hyperparameters if present
  IF request.hyperparameters IS Some THEN
    hp <- request.hyperparameters.unwrap()

    IF hp.n_epochs IS Some THEN
      IF hp.n_epochs < 1 OR hp.n_epochs > 50 THEN
        errors.push(ValidationDetail {
          field: "hyperparameters.n_epochs",
          message: "n_epochs must be between 1 and 50"
        })
      END IF
    END IF

    IF hp.batch_size IS Some THEN
      IF hp.batch_size < 1 OR hp.batch_size > 256 THEN
        errors.push(ValidationDetail {
          field: "hyperparameters.batch_size",
          message: "batch_size must be between 1 and 256"
        })
      END IF
    END IF

    IF hp.learning_rate_multiplier IS Some THEN
      IF hp.learning_rate_multiplier <= 0.0 THEN
        errors.push(ValidationDetail {
          field: "hyperparameters.learning_rate_multiplier",
          message: "learning_rate_multiplier must be positive"
        })
      END IF
    END IF
  END IF

  IF errors.is_empty() THEN
    RETURN Ok(())
  ELSE
    RETURN Error(RequestError::ValidationError {
      message: "Fine-tuning request validation failed",
      details: errors
    })
  END IF
END FUNCTION
```

### 18.2 List Fine-tuning Jobs

```
FUNCTION fine_tuning_service.list(
  params: FineTuningListParams
) -> Result<FineTuningJobList, OpenAIError>

  // Build query parameters
  query_params <- build_fine_tuning_list_query(params)

  // Execute with resilience
  response <- execute_with_resilience(
    operation: "fine_tuning.list",
    request_fn: ASYNC FUNCTION() -> Result<FineTuningJobList, OpenAIError>
      endpoint <- IF query_params.is_empty() THEN
        "/fine_tuning/jobs"
      ELSE
        format("/fine_tuning/jobs?{}", query_params)
      END IF

      http_request <- build_request(
        method: GET,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<FineTuningJobList>(http_response, self.logger)
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  RETURN Ok(response)
END FUNCTION
```

### 18.3 Retrieve, Cancel, Events, Checkpoints

```
FUNCTION fine_tuning_service.retrieve(job_id: String) -> Result<FineTuningJob, OpenAIError>
  IF job_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Job ID is required",
      details: []
    })
  END IF

  response <- execute_with_resilience(
    operation: "fine_tuning.retrieve",
    request_fn: ASYNC FUNCTION() -> Result<FineTuningJob, OpenAIError>
      http_request <- build_request(
        method: GET,
        endpoint: format("/fine_tuning/jobs/{}", url_encode(job_id)),
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<FineTuningJob>(http_response, self.logger)
      ELSE
        RETURN Error(parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        ))
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await

  RETURN response
END FUNCTION

FUNCTION fine_tuning_service.cancel(job_id: String) -> Result<FineTuningJob, OpenAIError>
  IF job_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Job ID is required",
      details: []
    })
  END IF

  response <- execute_with_resilience(
    operation: "fine_tuning.cancel",
    request_fn: ASYNC FUNCTION() -> Result<FineTuningJob, OpenAIError>
      http_request <- build_request(
        method: POST,
        endpoint: format("/fine_tuning/jobs/{}/cancel", url_encode(job_id)),
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<FineTuningJob>(http_response, self.logger)
      ELSE
        RETURN Error(parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        ))
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await

  self.logger.info("Fine-tuning job cancelled", { job_id })

  RETURN response
END FUNCTION

FUNCTION fine_tuning_service.events(
  job_id: String,
  params: EventListParams
) -> Result<FineTuningEventList, OpenAIError>

  IF job_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Job ID is required",
      details: []
    })
  END IF

  query_params <- build_event_list_query(params)

  response <- execute_with_resilience(
    operation: "fine_tuning.events",
    request_fn: ASYNC FUNCTION() -> Result<FineTuningEventList, OpenAIError>
      endpoint <- format("/fine_tuning/jobs/{}/events", url_encode(job_id))
      IF NOT query_params.is_empty() THEN
        endpoint <- format("{}?{}", endpoint, query_params)
      END IF

      http_request <- build_request(
        method: GET,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<FineTuningEventList>(http_response, self.logger)
      ELSE
        RETURN Error(parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        ))
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await

  RETURN response
END FUNCTION

FUNCTION fine_tuning_service.checkpoints(
  job_id: String,
  params: CheckpointListParams
) -> Result<CheckpointList, OpenAIError>

  IF job_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Job ID is required",
      details: []
    })
  END IF

  query_params <- build_checkpoint_list_query(params)

  response <- execute_with_resilience(
    operation: "fine_tuning.checkpoints",
    request_fn: ASYNC FUNCTION() -> Result<CheckpointList, OpenAIError>
      endpoint <- format("/fine_tuning/jobs/{}/checkpoints", url_encode(job_id))
      IF NOT query_params.is_empty() THEN
        endpoint <- format("{}?{}", endpoint, query_params)
      END IF

      http_request <- build_request(
        method: GET,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<CheckpointList>(http_response, self.logger)
      ELSE
        RETURN Error(parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        ))
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await

  RETURN response
END FUNCTION
```

---

## 19. Assistants Service

### 19.1 Beta Header Handling

```
FUNCTION get_assistants_headers() -> HeaderMap
  headers <- HeaderMap::new()
  headers.insert("OpenAI-Beta", "assistants=v2")
  RETURN headers
END FUNCTION
```

### 19.2 Create Assistant

```
FUNCTION assistants_service.create(
  request: AssistantCreateRequest
) -> Result<Assistant, OpenAIError>

  // Validate request
  validate_assistant_create_request(request)?

  response <- execute_with_resilience(
    operation: "assistants.create",
    request_fn: ASYNC FUNCTION() -> Result<Assistant, OpenAIError>
      http_request <- build_request(
        method: POST,
        endpoint: "/assistants",
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: Some(serialize_json(request)?),
        extra_headers: get_assistants_headers()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<Assistant>(http_response, self.logger)
      ELSE
        RETURN Error(parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        ))
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  self.logger.info("Assistant created", {
    assistant_id: response.id,
    model: response.model
  })

  RETURN Ok(response)
END FUNCTION

FUNCTION validate_assistant_create_request(request: AssistantCreateRequest) -> Result<(), RequestError>
  errors <- []

  // Validate model
  IF request.model.is_empty() THEN
    errors.push(ValidationDetail {
      field: "model",
      message: "Model is required"
    })
  END IF

  // Validate name length
  IF request.name IS Some AND request.name.unwrap().len() > 256 THEN
    errors.push(ValidationDetail {
      field: "name",
      message: "Name cannot exceed 256 characters"
    })
  END IF

  // Validate description length
  IF request.description IS Some AND request.description.unwrap().len() > 512 THEN
    errors.push(ValidationDetail {
      field: "description",
      message: "Description cannot exceed 512 characters"
    })
  END IF

  // Validate instructions length
  IF request.instructions IS Some AND request.instructions.unwrap().len() > 256000 THEN
    errors.push(ValidationDetail {
      field: "instructions",
      message: "Instructions cannot exceed 256000 characters"
    })
  END IF

  // Validate tools (max 128)
  IF request.tools IS Some AND request.tools.unwrap().len() > 128 THEN
    errors.push(ValidationDetail {
      field: "tools",
      message: "Cannot have more than 128 tools"
    })
  END IF

  // Validate metadata
  IF request.metadata IS Some THEN
    IF request.metadata.unwrap().len() > 16 THEN
      errors.push(ValidationDetail {
        field: "metadata",
        message: "Cannot have more than 16 metadata key-value pairs"
      })
    END IF
  END IF

  IF errors.is_empty() THEN
    RETURN Ok(())
  ELSE
    RETURN Error(RequestError::ValidationError {
      message: "Assistant creation validation failed",
      details: errors
    })
  END IF
END FUNCTION
```

### 19.3 List, Retrieve, Modify, Delete Assistants

```
FUNCTION assistants_service.list(
  params: AssistantListParams
) -> Result<AssistantList, OpenAIError>

  query_params <- build_pagination_query(params)

  response <- execute_with_resilience(
    operation: "assistants.list",
    request_fn: ASYNC FUNCTION() -> Result<AssistantList, OpenAIError>
      endpoint <- IF query_params.is_empty() THEN
        "/assistants"
      ELSE
        format("/assistants?{}", query_params)
      END IF

      http_request <- build_request(
        method: GET,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: get_assistants_headers()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<AssistantList>(http_response, self.logger)
      ELSE
        RETURN Error(parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        ))
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await

  RETURN response
END FUNCTION

FUNCTION assistants_service.retrieve(assistant_id: String) -> Result<Assistant, OpenAIError>
  IF assistant_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Assistant ID is required",
      details: []
    })
  END IF

  response <- execute_with_resilience(
    operation: "assistants.retrieve",
    request_fn: ASYNC FUNCTION() -> Result<Assistant, OpenAIError>
      http_request <- build_request(
        method: GET,
        endpoint: format("/assistants/{}", url_encode(assistant_id)),
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: get_assistants_headers()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<Assistant>(http_response, self.logger)
      ELSE
        RETURN Error(parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        ))
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await

  RETURN response
END FUNCTION

FUNCTION assistants_service.modify(
  assistant_id: String,
  request: AssistantModifyRequest
) -> Result<Assistant, OpenAIError>

  IF assistant_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Assistant ID is required",
      details: []
    })
  END IF

  response <- execute_with_resilience(
    operation: "assistants.modify",
    request_fn: ASYNC FUNCTION() -> Result<Assistant, OpenAIError>
      http_request <- build_request(
        method: POST,
        endpoint: format("/assistants/{}", url_encode(assistant_id)),
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: Some(serialize_json(request)?),
        extra_headers: get_assistants_headers()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<Assistant>(http_response, self.logger)
      ELSE
        RETURN Error(parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        ))
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await

  RETURN response
END FUNCTION

FUNCTION assistants_service.delete(assistant_id: String) -> Result<DeleteResponse, OpenAIError>
  IF assistant_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Assistant ID is required",
      details: []
    })
  END IF

  response <- execute_with_resilience(
    operation: "assistants.delete",
    request_fn: ASYNC FUNCTION() -> Result<DeleteResponse, OpenAIError>
      http_request <- build_request(
        method: DELETE,
        endpoint: format("/assistants/{}", url_encode(assistant_id)),
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: get_assistants_headers()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<DeleteResponse>(http_response, self.logger)
      ELSE
        RETURN Error(parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        ))
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await

  self.logger.info("Assistant deleted", { assistant_id })

  RETURN response
END FUNCTION
```

---

## 20. Threads Service

### 20.1 Thread Operations

```
FUNCTION threads_service.create(
  request: ThreadCreateRequest
) -> Result<Thread, OpenAIError>

  response <- execute_with_resilience(
    operation: "threads.create",
    request_fn: ASYNC FUNCTION() -> Result<Thread, OpenAIError>
      http_request <- build_request(
        method: POST,
        endpoint: "/threads",
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: Some(serialize_json(request)?),
        extra_headers: get_assistants_headers()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<Thread>(http_response, self.logger)
      ELSE
        RETURN Error(parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        ))
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  self.logger.info("Thread created", { thread_id: response.id })

  RETURN Ok(response)
END FUNCTION

FUNCTION threads_service.retrieve(thread_id: String) -> Result<Thread, OpenAIError>
  IF thread_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Thread ID is required",
      details: []
    })
  END IF

  response <- execute_with_resilience(
    operation: "threads.retrieve",
    request_fn: ASYNC FUNCTION() -> Result<Thread, OpenAIError>
      http_request <- build_request(
        method: GET,
        endpoint: format("/threads/{}", url_encode(thread_id)),
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: get_assistants_headers()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<Thread>(http_response, self.logger)
      ELSE
        RETURN Error(parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        ))
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await

  RETURN response
END FUNCTION

FUNCTION threads_service.delete(thread_id: String) -> Result<DeleteResponse, OpenAIError>
  IF thread_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Thread ID is required",
      details: []
    })
  END IF

  response <- execute_with_resilience(
    operation: "threads.delete",
    request_fn: ASYNC FUNCTION() -> Result<DeleteResponse, OpenAIError>
      http_request <- build_request(
        method: DELETE,
        endpoint: format("/threads/{}", url_encode(thread_id)),
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: get_assistants_headers()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<DeleteResponse>(http_response, self.logger)
      ELSE
        RETURN Error(parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        ))
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await

  RETURN response
END FUNCTION
```

---

## 21. Messages Service

### 21.1 Message Operations

```
FUNCTION messages_service.create(
  thread_id: String,
  request: MessageCreateRequest
) -> Result<Message, OpenAIError>

  IF thread_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Thread ID is required",
      details: []
    })
  END IF

  validate_message_create_request(request)?

  response <- execute_with_resilience(
    operation: "messages.create",
    request_fn: ASYNC FUNCTION() -> Result<Message, OpenAIError>
      http_request <- build_request(
        method: POST,
        endpoint: format("/threads/{}/messages", url_encode(thread_id)),
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: Some(serialize_json(request)?),
        extra_headers: get_assistants_headers()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<Message>(http_response, self.logger)
      ELSE
        RETURN Error(parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        ))
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  RETURN Ok(response)
END FUNCTION

FUNCTION messages_service.list(
  thread_id: String,
  params: MessageListParams
) -> Result<MessageList, OpenAIError>

  IF thread_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Thread ID is required",
      details: []
    })
  END IF

  query_params <- build_message_list_query(params)

  response <- execute_with_resilience(
    operation: "messages.list",
    request_fn: ASYNC FUNCTION() -> Result<MessageList, OpenAIError>
      endpoint <- format("/threads/{}/messages", url_encode(thread_id))
      IF NOT query_params.is_empty() THEN
        endpoint <- format("{}?{}", endpoint, query_params)
      END IF

      http_request <- build_request(
        method: GET,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: get_assistants_headers()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<MessageList>(http_response, self.logger)
      ELSE
        RETURN Error(parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        ))
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await

  RETURN response
END FUNCTION
```

---

## 22. Runs Service

### 22.1 Create Run

```
FUNCTION runs_service.create(
  thread_id: String,
  request: RunCreateRequest
) -> Result<Run, OpenAIError>

  IF thread_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Thread ID is required",
      details: []
    })
  END IF

  validate_run_create_request(request)?

  response <- execute_with_resilience(
    operation: "runs.create",
    request_fn: ASYNC FUNCTION() -> Result<Run, OpenAIError>
      http_request <- build_request(
        method: POST,
        endpoint: format("/threads/{}/runs", url_encode(thread_id)),
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: Some(serialize_json(request)?),
        extra_headers: get_assistants_headers()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<Run>(http_response, self.logger)
      ELSE
        RETURN Error(parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        ))
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  self.logger.info("Run created", {
    run_id: response.id,
    thread_id: thread_id,
    assistant_id: response.assistant_id
  })

  RETURN Ok(response)
END FUNCTION
```

### 22.2 Submit Tool Outputs

```
FUNCTION runs_service.submit_tool_outputs(
  thread_id: String,
  run_id: String,
  request: ToolOutputsRequest
) -> Result<Run, OpenAIError>

  IF thread_id.is_empty() OR run_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Thread ID and Run ID are required",
      details: []
    })
  END IF

  response <- execute_with_resilience(
    operation: "runs.submit_tool_outputs",
    request_fn: ASYNC FUNCTION() -> Result<Run, OpenAIError>
      http_request <- build_request(
        method: POST,
        endpoint: format(
          "/threads/{}/runs/{}/submit_tool_outputs",
          url_encode(thread_id),
          url_encode(run_id)
        ),
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: Some(serialize_json(request)?),
        extra_headers: get_assistants_headers()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<Run>(http_response, self.logger)
      ELSE
        RETURN Error(parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        ))
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await

  RETURN response
END FUNCTION
```

### 22.3 Run Polling Helper

```
FUNCTION runs_service.wait_for_completion(
  thread_id: String,
  run_id: String,
  options: RunWaitOptions
) -> Result<Run, OpenAIError>

  poll_interval <- options.poll_interval OR Duration::from_secs(1)
  max_wait <- options.max_wait OR Duration::from_secs(600)  // 10 minutes

  start_time <- now()
  terminal_states <- [
    RunStatus::Completed,
    RunStatus::Failed,
    RunStatus::Cancelled,
    RunStatus::Expired,
    RunStatus::Incomplete
  ]
  action_required_states <- [
    RunStatus::RequiresAction
  ]

  LOOP
    elapsed <- now() - start_time
    IF elapsed > max_wait THEN
      RETURN Error(RequestError::ValidationError {
        message: format("Run did not complete within {} seconds", max_wait.as_secs()),
        details: []
      })
    END IF

    run <- self.retrieve(thread_id.clone(), run_id.clone()).await?

    IF run.status IN terminal_states THEN
      RETURN Ok(run)
    END IF

    IF run.status IN action_required_states THEN
      IF options.on_requires_action IS Some THEN
        // Let caller handle tool calls
        RETURN Ok(run)
      ELSE
        self.logger.warn("Run requires action but no handler provided", {
          run_id: run_id,
          required_action: run.required_action
        })
        RETURN Ok(run)
      END IF
    END IF

    IF options.on_progress IS Some THEN
      options.on_progress(run.clone())
    END IF

    sleep(poll_interval).await
  END LOOP
END FUNCTION
```

---

## 23. Vector Stores Service

### 23.1 Vector Store Operations

```
FUNCTION vector_stores_service.create(
  request: VectorStoreCreateRequest
) -> Result<VectorStore, OpenAIError>

  validate_vector_store_create_request(request)?

  response <- execute_with_resilience(
    operation: "vector_stores.create",
    request_fn: ASYNC FUNCTION() -> Result<VectorStore, OpenAIError>
      http_request <- build_request(
        method: POST,
        endpoint: "/vector_stores",
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: Some(serialize_json(request)?),
        extra_headers: get_assistants_headers()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<VectorStore>(http_response, self.logger)
      ELSE
        RETURN Error(parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        ))
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  self.logger.info("Vector store created", { vector_store_id: response.id })

  RETURN Ok(response)
END FUNCTION

FUNCTION vector_stores_service.list(
  params: VectorStoreListParams
) -> Result<VectorStoreList, OpenAIError>

  query_params <- build_pagination_query(params)

  response <- execute_with_resilience(
    operation: "vector_stores.list",
    request_fn: ASYNC FUNCTION() -> Result<VectorStoreList, OpenAIError>
      endpoint <- IF query_params.is_empty() THEN
        "/vector_stores"
      ELSE
        format("/vector_stores?{}", query_params)
      END IF

      http_request <- build_request(
        method: GET,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: get_assistants_headers()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<VectorStoreList>(http_response, self.logger)
      ELSE
        RETURN Error(parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        ))
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await

  RETURN response
END FUNCTION

// Additional vector store operations follow same pattern:
// - retrieve(vector_store_id)
// - modify(vector_store_id, request)
// - delete(vector_store_id)
```

### 23.2 Vector Store Files

```
FUNCTION vector_stores_service.create_file(
  vector_store_id: String,
  request: VectorStoreFileCreateRequest
) -> Result<VectorStoreFile, OpenAIError>

  IF vector_store_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Vector store ID is required",
      details: []
    })
  END IF

  response <- execute_with_resilience(
    operation: "vector_stores.files.create",
    request_fn: ASYNC FUNCTION() -> Result<VectorStoreFile, OpenAIError>
      http_request <- build_request(
        method: POST,
        endpoint: format("/vector_stores/{}/files", url_encode(vector_store_id)),
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: Some(serialize_json(request)?),
        extra_headers: get_assistants_headers()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<VectorStoreFile>(http_response, self.logger)
      ELSE
        RETURN Error(parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        ))
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await

  RETURN response
END FUNCTION
```

---

## 24. Testing Patterns

### 24.1 Mock Transport

```
STRUCT MockHttpTransport {
  responses: VecDeque<MockResponse>,
  requests: Arc<Mutex<Vec<CapturedRequest>>>,
  delay: Option<Duration>
}

FUNCTION MockHttpTransport::new() -> MockHttpTransport
  RETURN MockHttpTransport {
    responses: VecDeque::new(),
    requests: Arc::new(Mutex::new(Vec::new())),
    delay: None
  }
END FUNCTION

FUNCTION MockHttpTransport::with_response(mut self, response: MockResponse) -> Self
  self.responses.push_back(response)
  RETURN self
END FUNCTION

FUNCTION MockHttpTransport::with_delay(mut self, delay: Duration) -> Self
  self.delay <- Some(delay)
  RETURN self
END FUNCTION

FUNCTION MockHttpTransport::captured_requests(&self) -> Vec<CapturedRequest>
  RETURN self.requests.lock().unwrap().clone()
END FUNCTION

IMPL HttpTransport FOR MockHttpTransport {
  ASYNC FUNCTION send(&self, request: HttpRequest) -> Result<HttpResponse, NetworkError>
    // Capture request
    LOCK self.requests
      self.requests.push(CapturedRequest {
        method: request.method().clone(),
        url: request.url().clone(),
        headers: request.headers().clone(),
        body: request.body().map(|b| b.to_vec())
      })
    END LOCK

    // Simulate delay
    IF self.delay IS Some THEN
      sleep(self.delay.unwrap()).await
    END IF

    // Get next response
    LOCK self.responses
      IF self.responses.is_empty() THEN
        RETURN Error(NetworkError::ConnectionFailed {
          message: "No mock responses configured"
        })
      END IF

      mock_response <- self.responses.pop_front().unwrap()

      RETURN Ok(HttpResponse {
        status: mock_response.status,
        headers: mock_response.headers,
        body: mock_response.body,
        latency: self.delay OR Duration::ZERO
      })
    END LOCK
  END FUNCTION
}
```

### 24.2 Test Fixtures

```
FUNCTION create_mock_chat_response() -> MockResponse
  body <- serialize_json(ChatCompletionResponse {
    id: "chatcmpl-123",
    object: "chat.completion",
    created: 1677652288,
    model: "gpt-4",
    choices: [
      ChatChoice {
        index: 0,
        message: AssistantMessage {
          content: Some("Hello! How can I help you?"),
          tool_calls: None
        },
        finish_reason: Some("stop"),
        logprobs: None
      }
    ],
    usage: Some(Usage {
      prompt_tokens: 10,
      completion_tokens: 12,
      total_tokens: 22
    }),
    system_fingerprint: Some("fp_123")
  })

  RETURN MockResponse {
    status: StatusCode::OK,
    headers: HeaderMap::new(),
    body: body.into_bytes()
  }
END FUNCTION

FUNCTION create_mock_error_response(status: u16, error_type: String, message: String) -> MockResponse
  body <- serialize_json(OpenAIErrorResponse {
    error: OpenAIErrorDetail {
      message: message,
      type: error_type,
      param: None,
      code: None
    }
  })

  RETURN MockResponse {
    status: StatusCode::from_u16(status).unwrap(),
    headers: HeaderMap::new(),
    body: body.into_bytes()
  }
END FUNCTION
```

### 24.3 Test Example - Chat Completion

```
TEST "chat completion returns valid response" {
  // Arrange
  mock_transport <- MockHttpTransport::new()
    .with_response(create_mock_chat_response())

  client <- create_test_client(mock_transport)

  request <- ChatCompletionRequest {
    model: "gpt-4",
    messages: [
      ChatMessage::User {
        content: UserContent::Text("Hello"),
        name: None
      }
    ],
    ..Default::default()
  }

  // Act
  result <- client.chat().create(request).await

  // Assert
  ASSERT result.is_ok()
  response <- result.unwrap()
  ASSERT_EQ response.choices.len(), 1
  ASSERT_EQ response.choices[0].message.content, Some("Hello! How can I help you?")
  ASSERT_EQ response.usage.unwrap().total_tokens, 22

  // Verify request was made correctly
  captured <- mock_transport.captured_requests()
  ASSERT_EQ captured.len(), 1
  ASSERT_EQ captured[0].method, "POST"
  ASSERT captured[0].url.path().ends_with("/chat/completions")
}

TEST "chat completion handles rate limit error with retry" {
  // Arrange
  rate_limit_response <- create_mock_error_response(
    429,
    "rate_limit_exceeded",
    "Rate limit exceeded"
  )
  rate_limit_response.headers.insert("Retry-After", "1")

  success_response <- create_mock_chat_response()

  mock_transport <- MockHttpTransport::new()
    .with_response(rate_limit_response)
    .with_response(success_response)

  client <- create_test_client(mock_transport)

  request <- ChatCompletionRequest {
    model: "gpt-4",
    messages: [
      ChatMessage::User {
        content: UserContent::Text("Hello"),
        name: None
      }
    ],
    ..Default::default()
  }

  // Act
  result <- client.chat().create(request).await

  // Assert - should succeed after retry
  ASSERT result.is_ok()

  // Verify two requests were made (original + retry)
  captured <- mock_transport.captured_requests()
  ASSERT_EQ captured.len(), 2
}
```

### 24.4 Integration Test with Mock Server

```
TEST "end to end chat flow with mock server" {
  // Start mock server
  server <- MockServer::start().await

  // Configure mock endpoint
  server.mock(|when, then| {
    when.method(POST)
         .path("/v1/chat/completions")
         .header("Authorization", "Bearer test-key")

    then.status(200)
         .header("Content-Type", "application/json")
         .body(create_mock_chat_response().body)
  })

  // Create client pointing to mock server
  config <- OpenAIConfig {
    api_key: SecretString::new("test-key"),
    base_url: Some(server.url("/v1")),
    ..Default::default()
  }
  client <- create_openai_client(config)?

  // Execute request
  request <- ChatCompletionRequest {
    model: "gpt-4",
    messages: [
      ChatMessage::User {
        content: UserContent::Text("Hello"),
        name: None
      }
    ],
    ..Default::default()
  }

  result <- client.chat().create(request).await

  // Assert
  ASSERT result.is_ok()
  ASSERT_EQ server.received_requests().len(), 1
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-08 | SPARC Generator | Initial pseudocode (Part 4) |

---

**End of Pseudocode Phase**

*The next phase (Architecture) will detail the system structure, component relationships, and deployment considerations.*
