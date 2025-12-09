# Pseudocode: Cohere Integration Module - Part 3

**Services: Classify, Summarize, Tokenize, Models, Datasets, Connectors, Fine-tuning**
**Patterns: Error Handling, Observability, Testing**

**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/cohere`
**SPARC Phase:** Pseudocode (3 of 3)

---

## Table of Contents

15. [Classify Service](#15-classify-service)
16. [Summarize Service](#16-summarize-service)
17. [Tokenize Service](#17-tokenize-service)
18. [Models Service](#18-models-service)
19. [Datasets Service](#19-datasets-service)
20. [Connectors Service](#20-connectors-service)
21. [Fine-tuning Service](#21-fine-tuning-service)
22. [Error Handling Patterns](#22-error-handling-patterns)
23. [Observability Patterns](#23-observability-patterns)
24. [Testing Patterns](#24-testing-patterns)

---

## 15. Classify Service

### 15.1 Classify Service Interface

```pseudocode
INTERFACE ClassifyServiceInterface:
    /**
     * Classifies texts into categories
     */
    ASYNC FUNCTION classify(request: ClassifyRequest) -> Result<ClassifyResponse, CohereError>

    /**
     * Simple classification with examples
     */
    ASYNC FUNCTION classify_with_examples(
        inputs: List<String>,
        examples: List<ClassifyExample>,
        model: Option<String>
    ) -> Result<List<Classification>, CohereError>

    /**
     * Classification using fine-tuned model
     */
    ASYNC FUNCTION classify_with_model(
        inputs: List<String>,
        model: String
    ) -> Result<List<Classification>, CohereError>
```

### 15.2 Classify Request/Response Types

```pseudocode
STRUCT ClassifyRequest:
    // Required
    inputs: List<String>                // Texts to classify (max 96)

    // Classification source (one required)
    examples: Option<List<ClassifyExample>>  // Few-shot examples
    model: Option<String>               // Fine-tuned classifier model

    // Configuration
    preset: Option<String>              // Preset configuration
    truncate: Option<ClassifyTruncate>

STRUCT ClassifyExample:
    text: String                        // Example text
    label: String                       // Example label

ENUM ClassifyTruncate:
    None
    Start
    End

STRUCT ClassifyResponse:
    id: String
    classifications: List<Classification>
    meta: ClassifyResponseMeta

STRUCT Classification:
    id: String
    input: String                       // Original input text
    prediction: String                  // Predicted label
    predictions: List<String>           // All predictions (for multi-label)
    confidence: f64                     // Confidence score
    confidences: List<LabelConfidence>  // Per-label confidences
    labels: Map<String, LabelConfidence>  // Label to confidence map

STRUCT LabelConfidence:
    label: String
    confidence: f64

STRUCT ClassifyResponseMeta:
    api_version: ApiVersion
    billed_units: BilledUnits
    warnings: Option<List<String>>
```

### 15.3 Classify Service Implementation

```pseudocode
CLASS ClassifyService IMPLEMENTS ClassifyServiceInterface:
    PRIVATE context: ServiceContext
    PRIVATE request_builder: CohereRequestBuilder
    PRIVATE response_handler: ResponseHandler

    CONSTRUCTOR(context: ServiceContext):
        this.context = context
        this.request_builder = CohereRequestBuilder.new(
            context.base_url(),
            context.config.api_version
        )
        this.response_handler = ResponseHandler.new()

    ASYNC FUNCTION classify(request: ClassifyRequest) -> Result<ClassifyResponse, CohereError>:
        span = this.context.span("cohere.classify")
        span.set_attribute("input_count", request.inputs.len())

        TRY:
            // Validate request
            this.validate_classify_request(request)?

            // Build HTTP request
            body = ClassifyRequestBody {
                inputs: request.inputs,
                examples: request.examples,
                model: request.model,
                preset: request.preset,
                truncate: request.truncate.map(|t| t.to_string()),
            }

            http_request = this.request_builder
                .classify()
                .json(body)
                .build()?

            // Execute with resilience
            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "classify",
                    endpoint: "/v1/classify",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            // Parse response
            classify_response = this.response_handler.handle<ClassifyResponse>(response)?

            // Record metrics
            this.record_classify_metrics(classify_response.meta, request.inputs.len())

            RETURN Ok(classify_response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION classify_with_examples(
        inputs: List<String>,
        examples: List<ClassifyExample>,
        model: Option<String>
    ) -> Result<List<Classification>, CohereError>:
        request = ClassifyRequest {
            inputs: inputs,
            examples: Some(examples),
            model: model,
            preset: None,
            truncate: None,
        }

        response = AWAIT this.classify(request)?
        RETURN Ok(response.classifications)

    ASYNC FUNCTION classify_with_model(
        inputs: List<String>,
        model: String
    ) -> Result<List<Classification>, CohereError>:
        request = ClassifyRequest {
            inputs: inputs,
            examples: None,
            model: Some(model),
            preset: None,
            truncate: None,
        }

        response = AWAIT this.classify(request)?
        RETURN Ok(response.classifications)

    PRIVATE FUNCTION validate_classify_request(request: ClassifyRequest) -> Result<(), CohereError>:
        IF request.inputs.is_empty():
            RETURN Err(CohereError::ValidationError {
                message: "inputs is required and cannot be empty"
            })

        IF request.inputs.len() > 96:
            RETURN Err(CohereError::ValidationError {
                message: "Maximum 96 inputs per request"
            })

        // Must have either examples or fine-tuned model
        IF request.examples.is_none() AND request.model.is_none():
            RETURN Err(CohereError::ValidationError {
                message: "Either examples or model must be provided"
            })

        // Validate examples if provided
        IF let Some(examples) = request.examples:
            IF examples.len() < 2:
                RETURN Err(CohereError::ValidationError {
                    message: "At least 2 examples required"
                })

            // Check for at least 2 unique labels
            labels = examples.iter().map(|e| e.label.clone()).collect::<HashSet<_>>()
            IF labels.len() < 2:
                RETURN Err(CohereError::ValidationError {
                    message: "At least 2 unique labels required in examples"
                })

        RETURN Ok(())

    PRIVATE FUNCTION record_classify_metrics(meta: ClassifyResponseMeta, input_count: usize):
        this.context.record_metric("cohere.classify.input_count", input_count as f64, Map.new())

        IF let Some(billed) = meta.billed_units:
            IF let Some(classifications) = billed.classifications:
                this.context.record_metric(
                    "cohere.classify.billed_classifications",
                    classifications as f64,
                    Map.new()
                )
```

---

## 16. Summarize Service

### 16.1 Summarize Service Interface

```pseudocode
INTERFACE SummarizeServiceInterface:
    /**
     * Summarizes text
     */
    ASYNC FUNCTION summarize(request: SummarizeRequest) -> Result<SummarizeResponse, CohereError>

    /**
     * Simple summarization
     */
    ASYNC FUNCTION summarize_text(
        text: String,
        length: Option<SummarizeLength>,
        format: Option<SummarizeFormat>,
        model: Option<String>
    ) -> Result<String, CohereError>
```

### 16.2 Summarize Request/Response Types

```pseudocode
STRUCT SummarizeRequest:
    // Required
    text: String                        // Text to summarize

    // Model selection
    model: Option<String>               // Default: "command"

    // Summarization configuration
    length: Option<SummarizeLength>     // short, medium, long, auto
    format: Option<SummarizeFormat>     // paragraph, bullets
    extractiveness: Option<Extractiveness>  // low, medium, high
    temperature: Option<f64>            // 0.0-5.0
    additional_command: Option<String>  // Additional instruction

ENUM SummarizeLength:
    Short
    Medium
    Long
    Auto

ENUM SummarizeFormat:
    Paragraph
    Bullets

ENUM Extractiveness:
    Low
    Medium
    High

STRUCT SummarizeResponse:
    id: String
    summary: String
    meta: SummarizeResponseMeta

STRUCT SummarizeResponseMeta:
    api_version: ApiVersion
    billed_units: BilledUnits
    warnings: Option<List<String>>
```

### 16.3 Summarize Service Implementation

```pseudocode
CLASS SummarizeService IMPLEMENTS SummarizeServiceInterface:
    PRIVATE context: ServiceContext
    PRIVATE request_builder: CohereRequestBuilder
    PRIVATE response_handler: ResponseHandler

    CONSTRUCTOR(context: ServiceContext):
        this.context = context
        this.request_builder = CohereRequestBuilder.new(
            context.base_url(),
            context.config.api_version
        )
        this.response_handler = ResponseHandler.new()

    ASYNC FUNCTION summarize(request: SummarizeRequest) -> Result<SummarizeResponse, CohereError>:
        span = this.context.span("cohere.summarize")
        span.set_attribute("text_length", request.text.len())

        TRY:
            // Validate request
            this.validate_summarize_request(request)?

            // Build HTTP request
            body = SummarizeRequestBody {
                text: request.text,
                model: request.model,
                length: request.length.map(|l| l.to_string()),
                format: request.format.map(|f| f.to_string()),
                extractiveness: request.extractiveness.map(|e| e.to_string()),
                temperature: request.temperature,
                additional_command: request.additional_command,
            }

            http_request = this.request_builder
                .summarize()
                .json(body)
                .build()?

            // Execute with resilience
            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "summarize",
                    endpoint: "/v1/summarize",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            // Parse response
            summarize_response = this.response_handler.handle<SummarizeResponse>(response)?

            RETURN Ok(summarize_response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION summarize_text(
        text: String,
        length: Option<SummarizeLength>,
        format: Option<SummarizeFormat>,
        model: Option<String>
    ) -> Result<String, CohereError>:
        request = SummarizeRequest {
            text: text,
            model: model,
            length: length,
            format: format,
            extractiveness: None,
            temperature: None,
            additional_command: None,
        }

        response = AWAIT this.summarize(request)?
        RETURN Ok(response.summary)

    PRIVATE FUNCTION validate_summarize_request(request: SummarizeRequest) -> Result<(), CohereError>:
        IF request.text.is_empty():
            RETURN Err(CohereError::ValidationError {
                message: "text is required and cannot be empty"
            })

        // Minimum text length for summarization
        IF request.text.len() < 250:
            RETURN Err(CohereError::ValidationError {
                message: "text must be at least 250 characters for summarization"
            })

        IF let Some(temp) = request.temperature:
            IF temp < 0.0 OR temp > 5.0:
                RETURN Err(CohereError::ValidationError {
                    message: "temperature must be between 0.0 and 5.0"
                })

        RETURN Ok(())
```

---

## 17. Tokenize Service

### 17.1 Tokenize Service Interface

```pseudocode
INTERFACE TokenizeServiceInterface:
    /**
     * Tokenizes text into tokens
     */
    ASYNC FUNCTION tokenize(request: TokenizeRequest) -> Result<TokenizeResponse, CohereError>

    /**
     * Detokenizes tokens back to text
     */
    ASYNC FUNCTION detokenize(request: DetokenizeRequest) -> Result<DetokenizeResponse, CohereError>

    /**
     * Simple tokenization
     */
    ASYNC FUNCTION tokenize_text(text: String, model: String) -> Result<List<u32>, CohereError>

    /**
     * Count tokens in text
     */
    ASYNC FUNCTION count_tokens(text: String, model: String) -> Result<u32, CohereError>
```

### 17.2 Tokenize Request/Response Types

```pseudocode
STRUCT TokenizeRequest:
    text: String                        // Text to tokenize
    model: String                       // Model for tokenization

STRUCT TokenizeResponse:
    tokens: List<u32>                   // Token IDs
    token_strings: List<String>         // Token strings
    meta: TokenizeResponseMeta

STRUCT TokenizeResponseMeta:
    api_version: ApiVersion

STRUCT DetokenizeRequest:
    tokens: List<u32>                   // Token IDs to detokenize
    model: String                       // Model for detokenization

STRUCT DetokenizeResponse:
    text: String                        // Reconstructed text
    meta: TokenizeResponseMeta
```

### 17.3 Tokenize Service Implementation

```pseudocode
CLASS TokenizeService IMPLEMENTS TokenizeServiceInterface:
    PRIVATE context: ServiceContext
    PRIVATE request_builder: CohereRequestBuilder
    PRIVATE response_handler: ResponseHandler

    CONSTRUCTOR(context: ServiceContext):
        this.context = context
        this.request_builder = CohereRequestBuilder.new(
            context.base_url(),
            context.config.api_version
        )
        this.response_handler = ResponseHandler.new()

    ASYNC FUNCTION tokenize(request: TokenizeRequest) -> Result<TokenizeResponse, CohereError>:
        span = this.context.span("cohere.tokenize")
        span.set_attribute("model", request.model)

        TRY:
            // Validate
            IF request.text.is_empty():
                RETURN Err(CohereError::ValidationError {
                    message: "text is required"
                })

            IF request.model.is_empty():
                RETURN Err(CohereError::ValidationError {
                    message: "model is required"
                })

            // Build request
            body = TokenizeRequestBody {
                text: request.text,
                model: request.model,
            }

            http_request = this.request_builder
                .tokenize()
                .json(body)
                .build()?

            // Execute
            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "tokenize",
                    endpoint: "/v1/tokenize",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            RETURN this.response_handler.handle<TokenizeResponse>(response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION detokenize(request: DetokenizeRequest) -> Result<DetokenizeResponse, CohereError>:
        span = this.context.span("cohere.detokenize")

        TRY:
            // Validate
            IF request.tokens.is_empty():
                RETURN Err(CohereError::ValidationError {
                    message: "tokens is required"
                })

            IF request.model.is_empty():
                RETURN Err(CohereError::ValidationError {
                    message: "model is required"
                })

            // Build request
            body = DetokenizeRequestBody {
                tokens: request.tokens,
                model: request.model,
            }

            http_request = this.request_builder
                .detokenize()
                .json(body)
                .build()?

            // Execute
            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "detokenize",
                    endpoint: "/v1/detokenize",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            RETURN this.response_handler.handle<DetokenizeResponse>(response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION tokenize_text(text: String, model: String) -> Result<List<u32>, CohereError>:
        response = AWAIT this.tokenize(TokenizeRequest { text, model })?
        RETURN Ok(response.tokens)

    ASYNC FUNCTION count_tokens(text: String, model: String) -> Result<u32, CohereError>:
        response = AWAIT this.tokenize(TokenizeRequest { text, model })?
        RETURN Ok(response.tokens.len() as u32)
```

---

## 18. Models Service

### 18.1 Models Service Interface

```pseudocode
INTERFACE ModelsServiceInterface:
    /**
     * Lists available models
     */
    ASYNC FUNCTION list(request: ListModelsRequest) -> Result<ListModelsResponse, CohereError>

    /**
     * Gets model details
     */
    ASYNC FUNCTION get(model_id: String) -> Result<Model, CohereError>

    /**
     * Lists all models (convenience)
     */
    ASYNC FUNCTION list_all() -> Result<List<Model>, CohereError>
```

### 18.2 Models Request/Response Types

```pseudocode
STRUCT ListModelsRequest:
    page_size: Option<u32>              // Results per page
    page_token: Option<String>          // Pagination token
    endpoint: Option<ModelEndpoint>     // Filter by endpoint

ENUM ModelEndpoint:
    Chat
    Generate
    Embed
    Rerank
    Classify
    Summarize

STRUCT ListModelsResponse:
    models: List<Model>
    next_page_token: Option<String>

STRUCT Model:
    name: String                        // Model identifier
    endpoints: List<ModelEndpoint>      // Supported endpoints
    finetuned: Boolean                  // Is fine-tuned
    context_length: Option<u32>         // Max context length
    tokenizer_url: Option<String>       // Tokenizer endpoint
    default_endpoints: Option<List<ModelEndpoint>>
```

### 18.3 Models Service Implementation

```pseudocode
CLASS ModelsService IMPLEMENTS ModelsServiceInterface:
    PRIVATE context: ServiceContext
    PRIVATE request_builder: CohereRequestBuilder
    PRIVATE response_handler: ResponseHandler

    CONSTRUCTOR(context: ServiceContext):
        this.context = context
        this.request_builder = CohereRequestBuilder.new(
            context.base_url(),
            context.config.api_version
        )
        this.response_handler = ResponseHandler.new()

    ASYNC FUNCTION list(request: ListModelsRequest) -> Result<ListModelsResponse, CohereError>:
        span = this.context.span("cohere.models.list")

        TRY:
            builder = this.request_builder.list_models()

            IF let Some(page_size) = request.page_size:
                builder = builder.query("page_size", page_size.to_string())

            IF let Some(page_token) = request.page_token:
                builder = builder.query("page_token", page_token)

            IF let Some(endpoint) = request.endpoint:
                builder = builder.query("endpoint", endpoint.to_string())

            http_request = builder.build()?

            // Execute
            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "list_models",
                    endpoint: "/v1/models",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            RETURN this.response_handler.handle<ListModelsResponse>(response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION get(model_id: String) -> Result<Model, CohereError>:
        span = this.context.span("cohere.models.get")
        span.set_attribute("model_id", model_id)

        TRY:
            http_request = this.request_builder
                .get_model(model_id)
                .build()?

            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "get_model",
                    endpoint: "/v1/models/{id}",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            RETURN this.response_handler.handle<Model>(response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION list_all() -> Result<List<Model>, CohereError>:
        all_models = []
        page_token = None

        LOOP:
            response = AWAIT this.list(ListModelsRequest {
                page_size: Some(100),
                page_token: page_token,
                endpoint: None,
            })?

            all_models.extend(response.models)

            IF response.next_page_token.is_none():
                BREAK

            page_token = response.next_page_token

        RETURN Ok(all_models)
```

---

## 19. Datasets Service

### 19.1 Datasets Service Interface

```pseudocode
INTERFACE DatasetsServiceInterface:
    /**
     * Creates a new dataset
     */
    ASYNC FUNCTION create(request: CreateDatasetRequest) -> Result<Dataset, CohereError>

    /**
     * Lists datasets
     */
    ASYNC FUNCTION list(request: ListDatasetsRequest) -> Result<ListDatasetsResponse, CohereError>

    /**
     * Gets dataset by ID
     */
    ASYNC FUNCTION get(dataset_id: String) -> Result<Dataset, CohereError>

    /**
     * Deletes dataset
     */
    ASYNC FUNCTION delete(dataset_id: String) -> Result<(), CohereError>

    /**
     * Gets dataset usage
     */
    ASYNC FUNCTION get_usage(dataset_id: String) -> Result<DatasetUsage, CohereError>
```

### 19.2 Datasets Request/Response Types

```pseudocode
STRUCT CreateDatasetRequest:
    name: String                        // Dataset name
    type: DatasetType                   // Dataset type
    data: DatasetData                   // Dataset content

ENUM DatasetType:
    EmbedInput                          // For embed training
    EmbedResult                         // Embed results
    ClusterResult                       // Clustering results
    RerankResult                        // Rerank results
    SingleLabelClassificationFinetuning // Single-label classification
    ChatFinetuning                      // Chat fine-tuning
    GenerateFinetuning                  // Generate fine-tuning

STRUCT DatasetData:
    file: Option<Bytes>                 // File upload
    file_path: Option<String>           // Local file path
    url: Option<String>                 // Remote URL

STRUCT Dataset:
    id: String
    name: String
    dataset_type: DatasetType
    validation_status: ValidationStatus
    created_at: DateTime
    updated_at: DateTime
    size_bytes: u64
    num_examples: u32

ENUM ValidationStatus:
    Unknown
    Queued
    Processing
    Complete
    Failed
    Skipped

STRUCT ListDatasetsRequest:
    page_size: Option<u32>
    page_token: Option<String>
    dataset_type: Option<DatasetType>

STRUCT ListDatasetsResponse:
    datasets: List<Dataset>
    next_page_token: Option<String>

STRUCT DatasetUsage:
    dataset_id: String
    organization_usage: OrganizationUsage

STRUCT OrganizationUsage:
    num_finetunes: u32
    num_active_finetunes: u32
```

### 19.3 Datasets Service Implementation

```pseudocode
CLASS DatasetsService IMPLEMENTS DatasetsServiceInterface:
    PRIVATE context: ServiceContext
    PRIVATE request_builder: CohereRequestBuilder
    PRIVATE response_handler: ResponseHandler

    CONSTRUCTOR(context: ServiceContext):
        this.context = context
        this.request_builder = CohereRequestBuilder.new(
            context.base_url(),
            context.config.api_version
        )
        this.response_handler = ResponseHandler.new()

    ASYNC FUNCTION create(request: CreateDatasetRequest) -> Result<Dataset, CohereError>:
        span = this.context.span("cohere.datasets.create")
        span.set_attribute("dataset_type", request.type.to_string())

        TRY:
            // Validate
            IF request.name.is_empty():
                RETURN Err(CohereError::ValidationError {
                    message: "name is required"
                })

            // Build multipart form
            form = MultipartForm.new()
            form.add_text("name", request.name)
            form.add_text("type", request.type.to_string())

            IF let Some(file) = request.data.file:
                form.add_file("file", file, "data.jsonl")
            ELSE IF let Some(path) = request.data.file_path:
                file_bytes = read_file(path)?
                form.add_file("file", file_bytes, path)
            ELSE IF let Some(url) = request.data.url:
                form.add_text("url", url)
            ELSE:
                RETURN Err(CohereError::ValidationError {
                    message: "One of file, file_path, or url is required"
                })

            http_request = RequestBuilder.new(this.context.base_url())
                .method(Method.POST)
                .path("/v1/datasets")
                .multipart(form)
                .build()?

            // Execute
            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "create_dataset",
                    endpoint: "/v1/datasets",
                    idempotent: false,
                    priority: Priority.Normal,
                    timeout_override: Some(Duration.from_secs(300)),  // 5 min for upload
                }
            )?

            RETURN this.response_handler.handle<Dataset>(response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION list(request: ListDatasetsRequest) -> Result<ListDatasetsResponse, CohereError>:
        span = this.context.span("cohere.datasets.list")

        TRY:
            builder = RequestBuilder.new(this.context.base_url())
                .method(Method.GET)
                .path("/v1/datasets")

            IF let Some(page_size) = request.page_size:
                builder = builder.query("page_size", page_size.to_string())

            IF let Some(page_token) = request.page_token:
                builder = builder.query("page_token", page_token)

            IF let Some(dataset_type) = request.dataset_type:
                builder = builder.query("dataset_type", dataset_type.to_string())

            http_request = builder.build()?

            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "list_datasets",
                    endpoint: "/v1/datasets",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            RETURN this.response_handler.handle<ListDatasetsResponse>(response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION get(dataset_id: String) -> Result<Dataset, CohereError>:
        span = this.context.span("cohere.datasets.get")

        TRY:
            http_request = RequestBuilder.new(this.context.base_url())
                .method(Method.GET)
                .path(format!("/v1/datasets/{}", dataset_id))
                .build()?

            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "get_dataset",
                    endpoint: "/v1/datasets/{id}",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            RETURN this.response_handler.handle<Dataset>(response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION delete(dataset_id: String) -> Result<(), CohereError>:
        span = this.context.span("cohere.datasets.delete")

        TRY:
            http_request = RequestBuilder.new(this.context.base_url())
                .method(Method.DELETE)
                .path(format!("/v1/datasets/{}", dataset_id))
                .build()?

            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "delete_dataset",
                    endpoint: "/v1/datasets/{id}",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            IF response.status == 204:
                RETURN Ok(())
            ELSE:
                RETURN Err(this.response_handler.parse_error(response))

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION get_usage(dataset_id: String) -> Result<DatasetUsage, CohereError>:
        span = this.context.span("cohere.datasets.get_usage")

        TRY:
            http_request = RequestBuilder.new(this.context.base_url())
                .method(Method.GET)
                .path(format!("/v1/datasets/{}/usage", dataset_id))
                .build()?

            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "get_dataset_usage",
                    endpoint: "/v1/datasets/{id}/usage",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            RETURN this.response_handler.handle<DatasetUsage>(response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()
```

---

## 20. Connectors Service

### 20.1 Connectors Service Interface

```pseudocode
INTERFACE ConnectorsServiceInterface:
    /**
     * Creates a new connector
     */
    ASYNC FUNCTION create(request: CreateConnectorRequest) -> Result<Connector, CohereError>

    /**
     * Lists connectors
     */
    ASYNC FUNCTION list(request: ListConnectorsRequest) -> Result<ListConnectorsResponse, CohereError>

    /**
     * Gets connector by ID
     */
    ASYNC FUNCTION get(connector_id: String) -> Result<Connector, CohereError>

    /**
     * Updates connector
     */
    ASYNC FUNCTION update(connector_id: String, request: UpdateConnectorRequest) -> Result<Connector, CohereError>

    /**
     * Deletes connector
     */
    ASYNC FUNCTION delete(connector_id: String) -> Result<(), CohereError>

    /**
     * Authorizes connector with OAuth
     */
    ASYNC FUNCTION authorize(connector_id: String, redirect_url: Option<String>) -> Result<AuthorizeResponse, CohereError>
```

### 20.2 Connectors Request/Response Types

```pseudocode
STRUCT CreateConnectorRequest:
    name: String                        // Connector name
    url: String                         // Connector endpoint URL
    description: Option<String>
    excludes: Option<List<String>>      // Fields to exclude
    oauth: Option<OAuthConfig>          // OAuth configuration
    active: Option<Boolean>
    continue_on_failure: Option<Boolean>
    service_auth: Option<ServiceAuth>   // Service-level auth

STRUCT OAuthConfig:
    client_id: Option<String>
    client_secret: Option<SecretString>
    authorize_url: String
    token_url: String
    scope: Option<String>

STRUCT ServiceAuth:
    type: ServiceAuthType
    token: Option<SecretString>

ENUM ServiceAuthType:
    Bearer
    Basic
    NoAuth

STRUCT Connector:
    id: String
    name: String
    url: String
    description: Option<String>
    created_at: DateTime
    updated_at: DateTime
    excludes: Option<List<String>>
    auth_type: String
    oauth: Option<OAuthConfig>
    active: Boolean
    continue_on_failure: Boolean

STRUCT ListConnectorsRequest:
    page_size: Option<u32>
    page_token: Option<String>

STRUCT ListConnectorsResponse:
    connectors: List<Connector>
    next_page_token: Option<String>

STRUCT UpdateConnectorRequest:
    name: Option<String>
    url: Option<String>
    description: Option<String>
    excludes: Option<List<String>>
    oauth: Option<OAuthConfig>
    active: Option<Boolean>
    continue_on_failure: Option<Boolean>
    service_auth: Option<ServiceAuth>

STRUCT AuthorizeResponse:
    redirect_url: String
```

### 20.3 Connectors Service Implementation

```pseudocode
CLASS ConnectorsService IMPLEMENTS ConnectorsServiceInterface:
    PRIVATE context: ServiceContext
    PRIVATE response_handler: ResponseHandler

    CONSTRUCTOR(context: ServiceContext):
        this.context = context
        this.response_handler = ResponseHandler.new()

    ASYNC FUNCTION create(request: CreateConnectorRequest) -> Result<Connector, CohereError>:
        span = this.context.span("cohere.connectors.create")

        TRY:
            // Validate
            IF request.name.is_empty():
                RETURN Err(CohereError::ValidationError { message: "name is required" })

            IF request.url.is_empty():
                RETURN Err(CohereError::ValidationError { message: "url is required" })

            IF NOT is_valid_url(request.url):
                RETURN Err(CohereError::ValidationError { message: "url must be valid" })

            body = CreateConnectorBody {
                name: request.name,
                url: request.url,
                description: request.description,
                excludes: request.excludes,
                oauth: request.oauth,
                active: request.active,
                continue_on_failure: request.continue_on_failure,
                service_auth: request.service_auth,
            }

            http_request = RequestBuilder.new(this.context.base_url())
                .method(Method.POST)
                .path("/v1/connectors")
                .json(body)
                .build()?

            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "create_connector",
                    endpoint: "/v1/connectors",
                    idempotent: false,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            RETURN this.response_handler.handle<Connector>(response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION list(request: ListConnectorsRequest) -> Result<ListConnectorsResponse, CohereError>:
        span = this.context.span("cohere.connectors.list")

        TRY:
            builder = RequestBuilder.new(this.context.base_url())
                .method(Method.GET)
                .path("/v1/connectors")

            IF let Some(page_size) = request.page_size:
                builder = builder.query("page_size", page_size.to_string())

            IF let Some(page_token) = request.page_token:
                builder = builder.query("page_token", page_token)

            http_request = builder.build()?

            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "list_connectors",
                    endpoint: "/v1/connectors",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            RETURN this.response_handler.handle<ListConnectorsResponse>(response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION get(connector_id: String) -> Result<Connector, CohereError>:
        span = this.context.span("cohere.connectors.get")

        TRY:
            http_request = RequestBuilder.new(this.context.base_url())
                .method(Method.GET)
                .path(format!("/v1/connectors/{}", connector_id))
                .build()?

            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "get_connector",
                    endpoint: "/v1/connectors/{id}",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            RETURN this.response_handler.handle<Connector>(response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION update(connector_id: String, request: UpdateConnectorRequest) -> Result<Connector, CohereError>:
        span = this.context.span("cohere.connectors.update")

        TRY:
            http_request = RequestBuilder.new(this.context.base_url())
                .method(Method.PATCH)
                .path(format!("/v1/connectors/{}", connector_id))
                .json(request)
                .build()?

            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "update_connector",
                    endpoint: "/v1/connectors/{id}",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            RETURN this.response_handler.handle<Connector>(response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION delete(connector_id: String) -> Result<(), CohereError>:
        span = this.context.span("cohere.connectors.delete")

        TRY:
            http_request = RequestBuilder.new(this.context.base_url())
                .method(Method.DELETE)
                .path(format!("/v1/connectors/{}", connector_id))
                .build()?

            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "delete_connector",
                    endpoint: "/v1/connectors/{id}",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            IF response.status == 204:
                RETURN Ok(())
            ELSE:
                RETURN Err(this.response_handler.parse_error(response))

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION authorize(connector_id: String, redirect_url: Option<String>) -> Result<AuthorizeResponse, CohereError>:
        span = this.context.span("cohere.connectors.authorize")

        TRY:
            builder = RequestBuilder.new(this.context.base_url())
                .method(Method.POST)
                .path(format!("/v1/connectors/{}/oauth/authorize", connector_id))

            IF let Some(url) = redirect_url:
                builder = builder.json(AuthorizeBody { redirect_url: Some(url) })

            http_request = builder.build()?

            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "authorize_connector",
                    endpoint: "/v1/connectors/{id}/oauth/authorize",
                    idempotent: false,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            RETURN this.response_handler.handle<AuthorizeResponse>(response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()
```

---

## 21. Fine-tuning Service

### 21.1 Fine-tuning Service Interface

```pseudocode
INTERFACE FinetuneServiceInterface:
    /**
     * Creates a fine-tuning job
     */
    ASYNC FUNCTION create(request: CreateFinetuneRequest) -> Result<FineTunedModel, CohereError>

    /**
     * Lists fine-tuned models
     */
    ASYNC FUNCTION list(request: ListFinetunesRequest) -> Result<ListFinetunesResponse, CohereError>

    /**
     * Gets fine-tuned model by ID
     */
    ASYNC FUNCTION get(finetuned_model_id: String) -> Result<FineTunedModel, CohereError>

    /**
     * Updates fine-tuned model
     */
    ASYNC FUNCTION update(finetuned_model_id: String, request: UpdateFinetuneRequest) -> Result<FineTunedModel, CohereError>

    /**
     * Deletes fine-tuned model
     */
    ASYNC FUNCTION delete(finetuned_model_id: String) -> Result<(), CohereError>

    /**
     * Gets training events/logs
     */
    ASYNC FUNCTION get_events(finetuned_model_id: String, request: GetEventsRequest) -> Result<ListEventsResponse, CohereError>

    /**
     * Gets training metrics
     */
    ASYNC FUNCTION get_metrics(finetuned_model_id: String, request: GetMetricsRequest) -> Result<ListMetricsResponse, CohereError>
```

### 21.2 Fine-tuning Request/Response Types

```pseudocode
STRUCT CreateFinetuneRequest:
    name: String                        // Model name
    settings: FinetuneSettings          // Training settings
    base_model: BaseModel               // Base model to fine-tune

STRUCT FinetuneSettings:
    base_type: BaseModelType            // GENERATIVE, CLASSIFICATION, RERANK, CHAT
    dataset_id: String                  // Training dataset ID
    hyperparameters: Option<Hyperparameters>
    evaluation_dataset_id: Option<String>
    multi_label: Option<Boolean>        // For classification

ENUM BaseModelType:
    Generative
    Classification
    Rerank
    Chat

STRUCT BaseModel:
    base_type: BaseModelType
    name: Option<String>                // Specific base model name
    version: Option<String>             // Model version

STRUCT Hyperparameters:
    train_epochs: Option<u32>           // 1-10
    learning_rate: Option<f64>          // 0.00001-0.1
    train_batch_size: Option<u32>       // 2-16
    early_stopping_patience: Option<u32>
    early_stopping_threshold: Option<f64>

STRUCT FineTunedModel:
    id: String
    name: String
    status: FinetuneStatus
    settings: FinetuneSettings
    base_model: BaseModel
    created_at: DateTime
    updated_at: DateTime
    completed_at: Option<DateTime>

ENUM FinetuneStatus:
    NotStarted
    Queued
    FinetuningStarted
    Evaluating
    Deploying
    Ready
    Failed
    Cancelled
    Paused

STRUCT ListFinetunesRequest:
    page_size: Option<u32>
    page_token: Option<String>
    order_by: Option<String>

STRUCT ListFinetunesResponse:
    finetuned_models: List<FineTunedModel>
    next_page_token: Option<String>

STRUCT UpdateFinetuneRequest:
    name: Option<String>
    settings: Option<FinetuneSettings>
    status: Option<FinetuneStatus>

STRUCT GetEventsRequest:
    page_size: Option<u32>
    page_token: Option<String>
    order_by: Option<String>

STRUCT ListEventsResponse:
    events: List<FinetuneEvent>
    next_page_token: Option<String>

STRUCT FinetuneEvent:
    user_id: String
    status: FinetuneStatus
    created_at: DateTime

STRUCT GetMetricsRequest:
    page_size: Option<u32>
    page_token: Option<String>

STRUCT ListMetricsResponse:
    step_metrics: List<StepMetric>
    next_page_token: Option<String>

STRUCT StepMetric:
    step_number: u32
    created_at: DateTime
    metrics: TrainingMetrics

STRUCT TrainingMetrics:
    accuracy: Option<f64>
    cross_entropy: Option<f64>
    generation_accuracy: Option<f64>
    generation_cross_entropy: Option<f64>
    step: u32
```

### 21.3 Fine-tuning Service Implementation

```pseudocode
CLASS FinetuneService IMPLEMENTS FinetuneServiceInterface:
    PRIVATE context: ServiceContext
    PRIVATE response_handler: ResponseHandler

    CONSTRUCTOR(context: ServiceContext):
        this.context = context
        this.response_handler = ResponseHandler.new()

    ASYNC FUNCTION create(request: CreateFinetuneRequest) -> Result<FineTunedModel, CohereError>:
        span = this.context.span("cohere.finetune.create")

        TRY:
            // Validate
            IF request.name.is_empty():
                RETURN Err(CohereError::ValidationError { message: "name is required" })

            IF request.settings.dataset_id.is_empty():
                RETURN Err(CohereError::ValidationError { message: "dataset_id is required" })

            // Validate hyperparameters if provided
            IF let Some(hp) = request.settings.hyperparameters:
                IF let Some(epochs) = hp.train_epochs:
                    IF epochs < 1 OR epochs > 10:
                        RETURN Err(CohereError::ValidationError {
                            message: "train_epochs must be between 1 and 10"
                        })

                IF let Some(lr) = hp.learning_rate:
                    IF lr < 0.00001 OR lr > 0.1:
                        RETURN Err(CohereError::ValidationError {
                            message: "learning_rate must be between 0.00001 and 0.1"
                        })

            http_request = RequestBuilder.new(this.context.base_url())
                .method(Method.POST)
                .path("/v1/finetuning/finetuned-models")
                .json(request)
                .build()?

            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "create_finetune",
                    endpoint: "/v1/finetuning/finetuned-models",
                    idempotent: false,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            RETURN this.response_handler.handle<FineTunedModel>(response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION list(request: ListFinetunesRequest) -> Result<ListFinetunesResponse, CohereError>:
        span = this.context.span("cohere.finetune.list")

        TRY:
            builder = RequestBuilder.new(this.context.base_url())
                .method(Method.GET)
                .path("/v1/finetuning/finetuned-models")

            IF let Some(page_size) = request.page_size:
                builder = builder.query("page_size", page_size.to_string())

            IF let Some(page_token) = request.page_token:
                builder = builder.query("page_token", page_token)

            IF let Some(order_by) = request.order_by:
                builder = builder.query("order_by", order_by)

            http_request = builder.build()?

            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "list_finetunes",
                    endpoint: "/v1/finetuning/finetuned-models",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            RETURN this.response_handler.handle<ListFinetunesResponse>(response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION get(finetuned_model_id: String) -> Result<FineTunedModel, CohereError>:
        span = this.context.span("cohere.finetune.get")

        TRY:
            http_request = RequestBuilder.new(this.context.base_url())
                .method(Method.GET)
                .path(format!("/v1/finetuning/finetuned-models/{}", finetuned_model_id))
                .build()?

            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "get_finetune",
                    endpoint: "/v1/finetuning/finetuned-models/{id}",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            RETURN this.response_handler.handle<FineTunedModel>(response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION update(finetuned_model_id: String, request: UpdateFinetuneRequest) -> Result<FineTunedModel, CohereError>:
        span = this.context.span("cohere.finetune.update")

        TRY:
            http_request = RequestBuilder.new(this.context.base_url())
                .method(Method.PATCH)
                .path(format!("/v1/finetuning/finetuned-models/{}", finetuned_model_id))
                .json(request)
                .build()?

            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "update_finetune",
                    endpoint: "/v1/finetuning/finetuned-models/{id}",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            RETURN this.response_handler.handle<FineTunedModel>(response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION delete(finetuned_model_id: String) -> Result<(), CohereError>:
        span = this.context.span("cohere.finetune.delete")

        TRY:
            http_request = RequestBuilder.new(this.context.base_url())
                .method(Method.DELETE)
                .path(format!("/v1/finetuning/finetuned-models/{}", finetuned_model_id))
                .build()?

            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "delete_finetune",
                    endpoint: "/v1/finetuning/finetuned-models/{id}",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            IF response.status == 204:
                RETURN Ok(())
            ELSE:
                RETURN Err(this.response_handler.parse_error(response))

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION get_events(finetuned_model_id: String, request: GetEventsRequest) -> Result<ListEventsResponse, CohereError>:
        span = this.context.span("cohere.finetune.get_events")

        TRY:
            builder = RequestBuilder.new(this.context.base_url())
                .method(Method.GET)
                .path(format!("/v1/finetuning/finetuned-models/{}/events", finetuned_model_id))

            IF let Some(page_size) = request.page_size:
                builder = builder.query("page_size", page_size.to_string())

            IF let Some(page_token) = request.page_token:
                builder = builder.query("page_token", page_token)

            http_request = builder.build()?

            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "get_finetune_events",
                    endpoint: "/v1/finetuning/finetuned-models/{id}/events",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            RETURN this.response_handler.handle<ListEventsResponse>(response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION get_metrics(finetuned_model_id: String, request: GetMetricsRequest) -> Result<ListMetricsResponse, CohereError>:
        span = this.context.span("cohere.finetune.get_metrics")

        TRY:
            builder = RequestBuilder.new(this.context.base_url())
                .method(Method.GET)
                .path(format!("/v1/finetuning/finetuned-models/{}/training-step-metrics", finetuned_model_id))

            IF let Some(page_size) = request.page_size:
                builder = builder.query("page_size", page_size.to_string())

            IF let Some(page_token) = request.page_token:
                builder = builder.query("page_token", page_token)

            http_request = builder.build()?

            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "get_finetune_metrics",
                    endpoint: "/v1/finetuning/finetuned-models/{id}/training-step-metrics",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            RETURN this.response_handler.handle<ListMetricsResponse>(response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()
```

---

## 22. Error Handling Patterns

### 22.1 Error Type Hierarchy

```pseudocode
/**
 * Root error type for Cohere integration
 */
ENUM CohereError:
    // Client-side errors (4xx)
    BadRequest { message: String }
    Authentication { message: String }
    PermissionDenied { message: String }
    NotFound { message: String }
    ValidationError { message: String }
    RateLimited { message: String, retry_after: Option<Duration> }

    // Server-side errors (5xx)
    InternalError { message: String }
    ServiceUnavailable { message: String }

    // Transport errors
    Transient { message: String, source: Option<TransportError> }
    Timeout { duration: Duration }
    StreamError { message: String }

    // Configuration errors
    ConfigurationError { message: String }

    // Unknown errors
    Unknown { status: Option<StatusCode>, message: String }

IMPL CohereError:
    /**
     * Returns HTTP status code if applicable
     */
    FUNCTION status_code() -> Option<StatusCode>:
        MATCH this:
            BadRequest { .. } => Some(400)
            Authentication { .. } => Some(401)
            PermissionDenied { .. } => Some(403)
            NotFound { .. } => Some(404)
            ValidationError { .. } => Some(422)
            RateLimited { .. } => Some(429)
            InternalError { .. } => Some(500)
            ServiceUnavailable { .. } => Some(503)
            Unknown { status, .. } => status
            _ => None

    /**
     * Whether this error is retryable
     */
    FUNCTION is_retryable() -> Boolean:
        MATCH this:
            RateLimited { .. } => true
            InternalError { .. } => true
            ServiceUnavailable { .. } => true
            Transient { .. } => true
            Timeout { .. } => true
            _ => false

    /**
     * Get retry delay if applicable
     */
    FUNCTION retry_after() -> Option<Duration>:
        MATCH this:
            RateLimited { retry_after, .. } => retry_after
            _ => None

    /**
     * Converts to integrations-errors compatible error
     */
    FUNCTION to_integration_error() -> IntegrationError:
        IntegrationError {
            kind: this.error_kind(),
            message: this.message(),
            source: this.source(),
            retryable: this.is_retryable(),
        }

    PRIVATE FUNCTION error_kind() -> ErrorKind:
        MATCH this:
            Authentication { .. } => ErrorKind.Authentication
            RateLimited { .. } => ErrorKind.RateLimited
            Timeout { .. } => ErrorKind.Timeout
            InternalError { .. } => ErrorKind.ServerError
            _ => ErrorKind.Request
```

### 22.2 Error Conversion Traits

```pseudocode
/**
 * Convert from transport errors
 */
IMPL From<TransportError> FOR CohereError:
    FUNCTION from(error: TransportError) -> CohereError:
        MATCH error:
            TransportError::Timeout(duration) =>
                CohereError::Timeout { duration }
            TransportError::Connection(msg) =>
                CohereError::Transient { message: msg, source: Some(error) }
            TransportError::TlsError(msg) =>
                CohereError::ConfigurationError { message: msg }
            TransportError::HttpError(status, body) =>
                // Parse error body and convert
                parse_http_error(status, body)
            _ =>
                CohereError::Unknown { status: None, message: error.to_string() }

/**
 * Convert from auth errors
 */
IMPL From<AuthError> FOR CohereError:
    FUNCTION from(error: AuthError) -> CohereError:
        CohereError::Authentication { message: error.to_string() }

/**
 * Convert from config errors
 */
IMPL From<ConfigError> FOR CohereError:
    FUNCTION from(error: ConfigError) -> CohereError:
        CohereError::ConfigurationError { message: error.to_string() }
```

### 22.3 Error Context Extension

```pseudocode
/**
 * Trait for adding context to errors
 */
TRAIT ErrorContext:
    FUNCTION context(self, context: String) -> Self
    FUNCTION with_operation(self, operation: String) -> Self
    FUNCTION with_request_id(self, request_id: String) -> Self

IMPL ErrorContext FOR Result<T, CohereError>:
    FUNCTION context(self, context: String) -> Self:
        self.map_err(|e| e.with_context(context))

    FUNCTION with_operation(self, operation: String) -> Self:
        self.map_err(|e| e.with_operation(operation))

    FUNCTION with_request_id(self, request_id: String) -> Self:
        self.map_err(|e| e.with_request_id(request_id))
```

---

## 23. Observability Patterns

### 23.1 Tracing Integration

```pseudocode
/**
 * Span builder for Cohere operations
 */
CLASS CohereSpanBuilder:
    PRIVATE tracer: Tracer
    PRIVATE attributes: Map<String, AttributeValue>

    CONSTRUCTOR(tracer: Tracer, operation: String):
        this.tracer = tracer
        this.attributes = Map.new()
        this.attributes.insert("service.name", "cohere")
        this.attributes.insert("operation", operation)

    FUNCTION model(model: String) -> Self:
        this.attributes.insert("cohere.model", model)
        RETURN this

    FUNCTION endpoint(endpoint: String) -> Self:
        this.attributes.insert("cohere.endpoint", endpoint)
        RETURN this

    FUNCTION request_id(id: String) -> Self:
        this.attributes.insert("cohere.request_id", id)
        RETURN this

    FUNCTION build() -> Span:
        span = this.tracer.span_builder("cohere.request")
            .with_attributes(this.attributes)
            .start()
        RETURN span

/**
 * Automatic instrumentation for service calls
 */
DECORATOR traced(operation: String):
    FUNCTION wrapper<F, T>(func: F) -> impl Fn(...) -> Result<T, CohereError>:
        RETURN |args...|:
            span = CohereSpanBuilder.new(tracer, operation).build()
            TRY:
                result = func(args...)
                span.set_status(SpanStatus.Ok)
                RETURN result
            CATCH error:
                span.set_status(SpanStatus.Error)
                span.record_error(error)
                THROW error
            FINALLY:
                span.end()
```

### 23.2 Metrics Recording

```pseudocode
/**
 * Metrics interface for Cohere operations
 */
INTERFACE CohereMetrics:
    FUNCTION record_request(operation: String, status: String, duration: Duration)
    FUNCTION record_tokens(operation: String, input: u32, output: u32)
    FUNCTION record_error(operation: String, error_type: String)
    FUNCTION record_rate_limit(operation: String, retry_after: Duration)

CLASS CohereMetricsRecorder IMPLEMENTS CohereMetrics:
    PRIVATE recorder: MetricsRecorder

    CONSTRUCTOR(recorder: MetricsRecorder):
        this.recorder = recorder

    FUNCTION record_request(operation: String, status: String, duration: Duration):
        this.recorder.histogram(
            "cohere.request.duration",
            duration.as_millis() as f64,
            tags! {
                "operation" => operation,
                "status" => status,
            }
        )

        this.recorder.counter(
            "cohere.request.count",
            1,
            tags! {
                "operation" => operation,
                "status" => status,
            }
        )

    FUNCTION record_tokens(operation: String, input: u32, output: u32):
        this.recorder.counter(
            "cohere.tokens.input",
            input as i64,
            tags! { "operation" => operation }
        )

        this.recorder.counter(
            "cohere.tokens.output",
            output as i64,
            tags! { "operation" => operation }
        )

    FUNCTION record_error(operation: String, error_type: String):
        this.recorder.counter(
            "cohere.errors",
            1,
            tags! {
                "operation" => operation,
                "error_type" => error_type,
            }
        )

    FUNCTION record_rate_limit(operation: String, retry_after: Duration):
        this.recorder.counter(
            "cohere.rate_limits",
            1,
            tags! { "operation" => operation }
        )

        this.recorder.gauge(
            "cohere.rate_limit.retry_after",
            retry_after.as_secs() as f64,
            tags! { "operation" => operation }
        )
```

### 23.3 Structured Logging

```pseudocode
/**
 * Log levels and contexts for Cohere operations
 */
STRUCT CohereLogContext:
    operation: String
    model: Option<String>
    request_id: Option<String>
    duration_ms: Option<u64>
    status: Option<String>

FUNCTION log_request(ctx: CohereLogContext, level: LogLevel):
    logger.log(level, "Cohere API request", fields! {
        "operation" => ctx.operation,
        "model" => ctx.model.unwrap_or("unknown"),
        "request_id" => ctx.request_id.unwrap_or("none"),
    })

FUNCTION log_response(ctx: CohereLogContext, level: LogLevel):
    logger.log(level, "Cohere API response", fields! {
        "operation" => ctx.operation,
        "duration_ms" => ctx.duration_ms.unwrap_or(0),
        "status" => ctx.status.unwrap_or("unknown"),
    })

FUNCTION log_error(ctx: CohereLogContext, error: CohereError):
    logger.error("Cohere API error", fields! {
        "operation" => ctx.operation,
        "error_type" => error.error_kind().to_string(),
        "error_message" => error.message(),
        "retryable" => error.is_retryable(),
    })
```

---

## 24. Testing Patterns

### 24.1 Mock Transport

```pseudocode
/**
 * Mock HTTP transport for testing
 */
CLASS MockHttpTransport IMPLEMENTS HttpTransportInterface:
    PRIVATE responses: Queue<MockResponse>
    PRIVATE requests: List<HttpRequest>

    CONSTRUCTOR():
        this.responses = Queue.new()
        this.requests = []

    /**
     * Queue a response for the next request
     */
    FUNCTION queue_response(response: MockResponse):
        this.responses.push(response)

    /**
     * Queue multiple responses
     */
    FUNCTION queue_responses(responses: List<MockResponse>):
        FOR response IN responses:
            this.responses.push(response)

    /**
     * Get captured requests
     */
    FUNCTION captured_requests() -> List<HttpRequest>:
        RETURN this.requests.clone()

    /**
     * Clear state
     */
    FUNCTION reset():
        this.responses.clear()
        this.requests.clear()

    ASYNC FUNCTION send(request: HttpRequest) -> Result<HttpResponse, TransportError>:
        this.requests.push(request.clone())

        IF this.responses.is_empty():
            RETURN Err(TransportError::Unknown("No mock response queued"))

        mock = this.responses.pop()

        IF let Some(delay) = mock.delay:
            AWAIT sleep(delay)

        IF let Some(error) = mock.error:
            RETURN Err(error)

        RETURN Ok(mock.response.unwrap())

    ASYNC FUNCTION send_streaming(request: HttpRequest) -> Result<ByteStream, TransportError>:
        this.requests.push(request.clone())

        IF this.responses.is_empty():
            RETURN Err(TransportError::Unknown("No mock response queued"))

        mock = this.responses.pop()

        IF let Some(error) = mock.error:
            RETURN Err(error)

        // Create streaming response from mock data
        RETURN Ok(ByteStream.from(mock.stream_data.unwrap_or_default()))

STRUCT MockResponse:
    response: Option<HttpResponse>
    error: Option<TransportError>
    delay: Option<Duration>
    stream_data: Option<Bytes>
```

### 24.2 Test Fixtures

```pseudocode
/**
 * Factory for creating test fixtures
 */
CLASS CohereTestFixtures:
    /**
     * Creates a test client with mock transport
     */
    STATIC FUNCTION create_test_client() -> (CohereClient, MockHttpTransport):
        mock = MockHttpTransport.new()

        config = CohereConfigBuilder.new()
            .api_key(SecretString.from("test-api-key"))
            .base_url("https://api.cohere.ai")
            .build()
            .unwrap()

        client = CohereClient.with_transport(config, mock.clone())

        RETURN (client, mock)

    /**
     * Creates a successful chat response
     */
    STATIC FUNCTION chat_response(text: String) -> HttpResponse:
        body = json!({
            "text": text,
            "generation_id": "test-gen-id",
            "finish_reason": "COMPLETE",
            "meta": {
                "api_version": { "version": "1" },
                "billed_units": { "input_tokens": 10, "output_tokens": 20 }
            }
        })

        RETURN HttpResponse {
            status: 200,
            headers: Map.new(),
            body: body.to_string().into_bytes(),
        }

    /**
     * Creates an embed response
     */
    STATIC FUNCTION embed_response(embeddings: List<List<f64>>) -> HttpResponse:
        body = json!({
            "id": "test-embed-id",
            "embeddings": embeddings,
            "texts": ["test"],
            "meta": {
                "api_version": { "version": "1" },
                "billed_units": { "input_tokens": 5 }
            }
        })

        RETURN HttpResponse {
            status: 200,
            headers: Map.new(),
            body: body.to_string().into_bytes(),
        }

    /**
     * Creates a rate limit error response
     */
    STATIC FUNCTION rate_limit_response(retry_after: u64) -> HttpResponse:
        body = json!({
            "message": "Rate limit exceeded"
        })

        headers = Map.new()
        headers.insert("Retry-After", retry_after.to_string())

        RETURN HttpResponse {
            status: 429,
            headers: headers,
            body: body.to_string().into_bytes(),
        }

    /**
     * Creates streaming chat events
     */
    STATIC FUNCTION streaming_chat_events(chunks: List<String>) -> Bytes:
        events = StringBuilder.new()

        // Stream start
        events.append("event: stream-start\n")
        events.append("data: {\"generation_id\":\"test-gen-id\"}\n\n")

        // Text chunks
        FOR chunk IN chunks:
            events.append("event: text-generation\n")
            events.append(format!("data: {{\"text\":\"{}\"}}\n\n", chunk))

        // Stream end
        events.append("event: stream-end\n")
        events.append("data: {\"finish_reason\":\"COMPLETE\"}\n\n")

        RETURN events.to_string().into_bytes()
```

### 24.3 Contract Tests

```pseudocode
/**
 * Contract test base for Cohere API
 */
CLASS CohereContractTest:
    PRIVATE base_url: String
    PRIVATE api_key: SecretString

    CONSTRUCTOR():
        this.base_url = env_var("COHERE_TEST_BASE_URL")
            .unwrap_or("https://api.cohere.ai")
        this.api_key = SecretString.from(
            env_var("COHERE_TEST_API_KEY").unwrap()
        )

    /**
     * Test chat endpoint contract
     */
    @Test
    @ContractTest
    ASYNC FUNCTION test_chat_contract():
        client = CohereClient.builder()
            .api_key(this.api_key.clone())
            .base_url(this.base_url.clone())
            .build()?

        request = ChatRequest {
            message: "Hello, world!",
            model: Some("command-r-plus"),
            max_tokens: Some(10),
            ..ChatRequest.default()
        }

        response = AWAIT client.chat().chat(request)?

        // Verify response structure
        ASSERT NOT response.text.is_empty()
        ASSERT NOT response.generation_id.is_empty()
        ASSERT response.finish_reason IS FinishReason

    /**
     * Test embed endpoint contract
     */
    @Test
    @ContractTest
    ASYNC FUNCTION test_embed_contract():
        client = CohereClient.builder()
            .api_key(this.api_key.clone())
            .base_url(this.base_url.clone())
            .build()?

        request = EmbedRequest {
            texts: vec!["Hello, world!"],
            model: Some("embed-english-v3.0"),
            input_type: Some(InputType.SearchDocument),
            ..EmbedRequest.default()
        }

        response = AWAIT client.embed().embed(request)?

        // Verify response structure
        ASSERT response.embeddings.len() == 1
        ASSERT response.embeddings[0].len() > 0  // Should have embedding dimensions
```

---

## Summary

This document completes the pseudocode phase for the Cohere integration module:

**Part 3 Coverage:**
1. **Classify Service**: Text classification with examples or fine-tuned models
2. **Summarize Service**: Text summarization with configurable length/format
3. **Tokenize Service**: Tokenization and detokenization utilities
4. **Models Service**: Model listing and details
5. **Datasets Service**: Dataset management for fine-tuning
6. **Connectors Service**: RAG connector management with OAuth
7. **Fine-tuning Service**: Fine-tuning job management and monitoring
8. **Error Handling**: Comprehensive error taxonomy and conversion
9. **Observability**: Tracing, metrics, and logging patterns
10. **Testing**: Mock transport, fixtures, and contract tests

**Complete Pseudocode Phase Summary:**
- Part 1: Core infrastructure (client, config, transport, auth, resilience, streaming)
- Part 2: Primary services (Chat, Generate, Embed, Rerank)
- Part 3: Additional services and patterns (Classify, Summarize, Tokenize, Models, Datasets, Connectors, Fine-tuning, Error handling, Observability, Testing)

---

**Pseudocode Phase Status: COMPLETE ✅**

Awaiting "Next phase." to begin Architecture phase.

---

*Pseudocode Phase: Part 3 of 3 Complete*
