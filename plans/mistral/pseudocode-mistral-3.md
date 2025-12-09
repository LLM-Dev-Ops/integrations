# Pseudocode: Mistral Integration Module - Part 3

**Files, Fine-Tuning, Agents, and Batch Services**
**Version:** 1.0.0
**Date:** 2025-12-09
**Status:** COMPLETE

---

## Table of Contents

13. [Files Service](#13-files-service)
14. [Fine-Tuning Service](#14-fine-tuning-service)
15. [Agents Service](#15-agents-service)
16. [Batch Service](#16-batch-service)
17. [Error Handling Patterns](#17-error-handling-patterns)
18. [Observability Patterns](#18-observability-patterns)
19. [Testing Patterns](#19-testing-patterns)

---

## 13. Files Service

### 13.1 Files Service Interface

```
INTERFACE FilesService:
    // Upload a file for fine-tuning
    FUNCTION upload(request: FileUploadRequest) -> Result<FileObject>

    // List uploaded files
    FUNCTION list(request: ListFilesRequest) -> Result<ListFilesResponse>

    // Get file details
    FUNCTION retrieve(file_id: String) -> Result<FileObject>

    // Delete a file
    FUNCTION delete(file_id: String) -> Result<DeleteFileResponse>

    // Download file content
    FUNCTION download(file_id: String) -> Result<FileContent>

    // Get signed URL for download
    FUNCTION get_signed_url(file_id: String, expiry: Duration) -> Result<SignedUrl>
```

### 13.2 Files Data Types

```
STRUCT FileUploadRequest:
    file: FileData              // File content to upload
    purpose: FilePurpose        // Purpose of the file

ENUM FilePurpose:
    FineTune                    // "fine-tune" - for fine-tuning datasets
    Batch                       // "batch" - for batch processing

STRUCT FileData:
    name: String                // Original filename
    content: Bytes              // File content as bytes
    content_type: String        // MIME type (application/jsonl)

STRUCT FileObject:
    id: String                  // File ID (e.g., "file-abc123")
    object: String              // Always "file"
    bytes: u64                  // File size in bytes
    created_at: i64             // Unix timestamp
    filename: String            // Original filename
    purpose: FilePurpose        // File purpose
    status: FileStatus          // Processing status
    status_details: Option<String>  // Additional status info

ENUM FileStatus:
    Uploaded                    // File uploaded, not yet processed
    Processing                  // Being processed
    Processed                   // Ready for use
    Error                       // Processing failed

STRUCT ListFilesRequest:
    purpose: Option<FilePurpose>    // Filter by purpose
    page: Option<u32>               // Page number
    page_size: Option<u32>          // Items per page
    sample_type: Option<Vec<SampleType>>  // Filter by sample type
    source: Option<Vec<SourceType>>       // Filter by source
    search: Option<String>          // Search query

ENUM SampleType:
    Pretrain
    Instruct
    BatchRequest
    BatchResult
    BatchError

ENUM SourceType:
    Upload
    Repository
    Mistral

STRUCT ListFilesResponse:
    data: Vec<FileObject>       // List of files
    object: String              // Always "list"
    total: u64                  // Total number of files

STRUCT DeleteFileResponse:
    id: String                  // Deleted file ID
    object: String              // Always "file"
    deleted: bool               // Always true on success

STRUCT FileContent:
    data: Bytes                 // Raw file content
    filename: String            // Original filename
    content_type: String        // MIME type

STRUCT SignedUrl:
    url: String                 // Signed download URL
    expires_at: i64             // Expiration timestamp
```

### 13.3 Files Service Implementation

```
CLASS FilesServiceImpl IMPLEMENTS FilesService:
    transport: HttpTransport
    resilience: ResilienceOrchestrator
    tracer: TracingProvider
    logger: LoggingProvider
    config: ClientConfig

    CONSTRUCTOR(transport, resilience, tracer, logger, config):
        this.transport = transport
        this.resilience = resilience
        this.tracer = tracer
        this.logger = logger
        this.config = config

    FUNCTION upload(request: FileUploadRequest) -> Result<FileObject>:
        span = tracer.start_span("mistral.files.upload")
        span.set_attribute("mistral.file.purpose", request.purpose.to_string())
        span.set_attribute("mistral.file.size_bytes", request.file.content.len())

        TRY:
            // Validate file
            this.validate_file(request.file)?

            // Build multipart form
            form = MultipartForm.new()
            form.add_file_part("file", request.file.name, request.file.content, request.file.content_type)
            form.add_text_part("purpose", request.purpose.to_api_string())

            // Build request
            http_request = HttpRequest.builder()
                .method(POST)
                .url(config.base_url + "/v1/files")
                .multipart(form)
                .build()

            // Execute with resilience
            response = resilience.execute(
                operation = || transport.send_multipart(http_request),
                context = ResilienceContext.new("files.upload")
            )?

            // Parse response
            file_object = parse_json::<FileObject>(response.body)?

            span.set_attribute("mistral.file.id", file_object.id)
            logger.info("File uploaded successfully", {
                "file_id": file_object.id,
                "size_bytes": file_object.bytes
            })

            RETURN Ok(file_object)

        CATCH error:
            span.record_error(error)
            logger.error("File upload failed", {"error": error.to_string()})
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION validate_file(file: FileData) -> Result<()>:
        // Validate file size (max 512MB for fine-tuning)
        max_size = 512 * 1024 * 1024  // 512MB
        IF file.content.len() > max_size:
            RETURN Err(ValidationError.new(
                "file_too_large",
                format!("File size {} exceeds maximum {}", file.content.len(), max_size)
            ))

        // Validate content type
        allowed_types = ["application/jsonl", "text/plain", "application/json"]
        IF NOT allowed_types.contains(file.content_type):
            RETURN Err(ValidationError.new(
                "invalid_content_type",
                format!("Content type {} not allowed", file.content_type)
            ))

        // Validate filename extension
        IF NOT file.name.ends_with(".jsonl"):
            logger.warn("File does not have .jsonl extension", {
                "filename": file.name
            })

        RETURN Ok(())

    FUNCTION list(request: ListFilesRequest) -> Result<ListFilesResponse>:
        span = tracer.start_span("mistral.files.list")

        TRY:
            // Build query parameters
            params = QueryParams.new()
            IF request.purpose IS SOME:
                params.add("purpose", request.purpose.to_api_string())
            IF request.page IS SOME:
                params.add("page", request.page.to_string())
            IF request.page_size IS SOME:
                params.add("page_size", request.page_size.to_string())
            IF request.sample_type IS SOME:
                FOR sample_type IN request.sample_type:
                    params.add("sample_type[]", sample_type.to_api_string())
            IF request.source IS SOME:
                FOR source IN request.source:
                    params.add("source[]", source.to_api_string())
            IF request.search IS SOME:
                params.add("search", request.search)

            // Build request
            http_request = HttpRequest.builder()
                .method(GET)
                .url(config.base_url + "/v1/files")
                .query(params)
                .build()

            // Execute
            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("files.list")
            )?

            // Parse response
            list_response = parse_json::<ListFilesResponse>(response.body)?

            span.set_attribute("mistral.files.count", list_response.data.len())

            RETURN Ok(list_response)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION retrieve(file_id: String) -> Result<FileObject>:
        span = tracer.start_span("mistral.files.retrieve")
        span.set_attribute("mistral.file.id", file_id)

        TRY:
            http_request = HttpRequest.builder()
                .method(GET)
                .url(config.base_url + "/v1/files/" + file_id)
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("files.retrieve")
            )?

            RETURN Ok(parse_json::<FileObject>(response.body)?)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION delete(file_id: String) -> Result<DeleteFileResponse>:
        span = tracer.start_span("mistral.files.delete")
        span.set_attribute("mistral.file.id", file_id)

        TRY:
            http_request = HttpRequest.builder()
                .method(DELETE)
                .url(config.base_url + "/v1/files/" + file_id)
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("files.delete")
            )?

            result = parse_json::<DeleteFileResponse>(response.body)?

            logger.info("File deleted", {"file_id": file_id})

            RETURN Ok(result)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION download(file_id: String) -> Result<FileContent>:
        span = tracer.start_span("mistral.files.download")
        span.set_attribute("mistral.file.id", file_id)

        TRY:
            http_request = HttpRequest.builder()
                .method(GET)
                .url(config.base_url + "/v1/files/" + file_id + "/content")
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("files.download")
            )?

            // Extract filename from Content-Disposition header
            filename = this.extract_filename(response.headers)
                .unwrap_or(file_id + ".jsonl")

            content_type = response.headers.get("Content-Type")
                .unwrap_or("application/octet-stream")

            RETURN Ok(FileContent {
                data: response.body,
                filename: filename,
                content_type: content_type
            })

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION extract_filename(headers: Headers) -> Option<String>:
        content_disp = headers.get("Content-Disposition")?
        // Parse: attachment; filename="example.jsonl"
        IF content_disp.contains("filename="):
            start = content_disp.find("filename=")? + 9
            IF content_disp.char_at(start) == '"':
                end = content_disp.find('"', start + 1)?
                RETURN Some(content_disp.substring(start + 1, end))
            ELSE:
                end = content_disp.find(';', start).unwrap_or(content_disp.len())
                RETURN Some(content_disp.substring(start, end).trim())
        RETURN None

    FUNCTION get_signed_url(file_id: String, expiry: Duration) -> Result<SignedUrl>:
        span = tracer.start_span("mistral.files.get_signed_url")
        span.set_attribute("mistral.file.id", file_id)

        TRY:
            body = json!({
                "expiry": expiry.as_secs()
            })

            http_request = HttpRequest.builder()
                .method(POST)
                .url(config.base_url + "/v1/files/" + file_id + "/url")
                .json(body)
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("files.get_signed_url")
            )?

            RETURN Ok(parse_json::<SignedUrl>(response.body)?)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()
```

### 13.4 Mock Files Service

```
CLASS MockFilesService IMPLEMENTS FilesService:
    upload_responses: Vec<Result<FileObject>>
    list_responses: Vec<Result<ListFilesResponse>>
    retrieve_responses: Map<String, Result<FileObject>>
    delete_responses: Map<String, Result<DeleteFileResponse>>
    download_responses: Map<String, Result<FileContent>>

    recorded_uploads: Vec<FileUploadRequest>
    recorded_list_requests: Vec<ListFilesRequest>
    recorded_retrieves: Vec<String>
    recorded_deletes: Vec<String>
    recorded_downloads: Vec<String>

    FUNCTION upload(request: FileUploadRequest) -> Result<FileObject>:
        recorded_uploads.push(request.clone())
        RETURN upload_responses.pop_front().unwrap_or(
            Err(MistralError.internal("No mock response configured"))
        )

    FUNCTION list(request: ListFilesRequest) -> Result<ListFilesResponse>:
        recorded_list_requests.push(request.clone())
        RETURN list_responses.pop_front().unwrap_or(
            Ok(ListFilesResponse { data: [], object: "list", total: 0 })
        )

    FUNCTION retrieve(file_id: String) -> Result<FileObject>:
        recorded_retrieves.push(file_id.clone())
        RETURN retrieve_responses.get(file_id).cloned().unwrap_or(
            Err(MistralError.not_found("File", file_id))
        )

    FUNCTION delete(file_id: String) -> Result<DeleteFileResponse>:
        recorded_deletes.push(file_id.clone())
        RETURN delete_responses.get(file_id).cloned().unwrap_or(
            Ok(DeleteFileResponse { id: file_id, object: "file", deleted: true })
        )

    FUNCTION download(file_id: String) -> Result<FileContent>:
        recorded_downloads.push(file_id.clone())
        RETURN download_responses.get(file_id).cloned().unwrap_or(
            Err(MistralError.not_found("File", file_id))
        )
```

---

## 14. Fine-Tuning Service

### 14.1 Fine-Tuning Service Interface

```
INTERFACE FineTuningService:
    // Create a fine-tuning job
    FUNCTION create(request: CreateFineTuningJobRequest) -> Result<FineTuningJob>

    // List fine-tuning jobs
    FUNCTION list(request: ListFineTuningJobsRequest) -> Result<ListFineTuningJobsResponse>

    // Get a fine-tuning job
    FUNCTION get(job_id: String) -> Result<FineTuningJob>

    // Cancel a fine-tuning job
    FUNCTION cancel(job_id: String) -> Result<FineTuningJob>

    // Start a validated job
    FUNCTION start(job_id: String) -> Result<FineTuningJob>

    // Archive a completed job
    FUNCTION archive(job_id: String) -> Result<ArchiveJobResponse>

    // Unarchive a job
    FUNCTION unarchive(job_id: String) -> Result<UnarchiveJobResponse>
```

### 14.2 Fine-Tuning Data Types

```
STRUCT CreateFineTuningJobRequest:
    model: String                           // Base model ID
    training_files: Vec<TrainingFile>       // Training data files
    validation_files: Option<Vec<TrainingFile>>  // Validation data files
    hyperparameters: FineTuningHyperparams  // Training hyperparameters
    suffix: Option<String>                  // Custom suffix for model name
    integrations: Option<Vec<Integration>>  // Third-party integrations
    repositories: Option<Vec<Repository>>   // Git repositories
    auto_start: Option<bool>                // Auto-start after validation (default: true)

STRUCT TrainingFile:
    file_id: String                         // Uploaded file ID
    weight: Option<f64>                     // Sample weight (0.0 to 1.0)

STRUCT FineTuningHyperparams:
    training_steps: Option<u32>             // Number of training steps
    learning_rate: Option<f64>              // Learning rate (default varies by model)
    weight_decay: Option<f64>               // Weight decay for regularization
    warmup_fraction: Option<f64>            // Warmup fraction of training steps
    epochs: Option<f64>                     // Number of epochs
    fim_ratio: Option<f64>                  // FIM training ratio (0.0 to 1.0)
    seq_len: Option<u32>                    // Sequence length

STRUCT Integration:
    type: IntegrationType                   // Integration type
    wandb: Option<WandbConfig>              // W&B config if type is Wandb

ENUM IntegrationType:
    Wandb                                   // Weights & Biases

STRUCT WandbConfig:
    project: String                         // W&B project name
    name: Option<String>                    // Run name
    run_name: Option<String>                // Alternative run name field
    api_key: SecretString                   // W&B API key (redacted in logs)

STRUCT Repository:
    type: RepositoryType                    // Repository type
    name: String                            // Repository name
    owner: String                           // Repository owner
    ref: Option<String>                     // Git ref (branch/tag/commit)
    weight: Option<f64>                     // Sample weight
    token: Option<SecretString>             // Access token

ENUM RepositoryType:
    Github

STRUCT FineTuningJob:
    id: String                              // Job ID
    object: String                          // Always "fine_tuning.job"
    model: String                           // Base model ID
    fine_tuned_model: Option<String>        // Fine-tuned model ID (when complete)
    created_at: i64                         // Creation timestamp
    finished_at: Option<i64>                // Completion timestamp
    status: FineTuningStatus                // Job status
    training_files: Vec<String>             // Training file IDs
    validation_files: Option<Vec<String>>   // Validation file IDs
    hyperparameters: FineTuningHyperparams  // Training hyperparameters
    trained_tokens: Option<u64>             // Number of trained tokens
    metadata: Option<FineTuningMetadata>    // Additional metadata
    integrations: Option<Vec<Integration>>  // Configured integrations
    repositories: Option<Vec<Repository>>   // Configured repositories
    suffix: Option<String>                  // Custom suffix
    auto_start: bool                        // Auto-start setting

ENUM FineTuningStatus:
    Queued                                  // Job queued
    Started                                 // Job started
    Validating                              // Validating inputs
    Validated                               // Inputs validated
    Running                                 // Training in progress
    FailedValidation                        // Validation failed
    Failed                                  // Training failed
    Success                                 // Training completed
    Cancelled                               // Job cancelled
    CancellationRequested                   // Cancellation in progress

STRUCT FineTuningMetadata:
    expected_duration_seconds: Option<u64>  // Expected training duration
    cost: Option<f64>                       // Estimated cost
    cost_currency: Option<String>           // Cost currency
    train_tokens_per_step: Option<u64>      // Tokens per training step
    train_tokens: Option<u64>               // Total training tokens
    data_tokens: Option<u64>                // Total data tokens
    estimated_start_time: Option<i64>       // Estimated start time
    deprecated: Option<bool>                // Deprecated job flag
    details: Option<String>                 // Additional details
    epochs: Option<f64>                     // Training epochs
    training_steps: Option<u64>             // Training steps

STRUCT ListFineTuningJobsRequest:
    page: Option<u32>                       // Page number
    page_size: Option<u32>                  // Items per page
    model: Option<String>                   // Filter by base model
    status: Option<FineTuningStatus>        // Filter by status
    created_after: Option<i64>              // Filter by creation time
    created_by_me: Option<bool>             // Only my jobs
    wandb_project: Option<String>           // Filter by W&B project
    wandb_name: Option<String>              // Filter by W&B run name
    suffix: Option<String>                  // Filter by suffix

STRUCT ListFineTuningJobsResponse:
    data: Vec<FineTuningJob>                // List of jobs
    object: String                          // Always "list"
    total: u64                              // Total count

STRUCT ArchiveJobResponse:
    id: String                              // Job ID
    archived: bool                          // Always true

STRUCT UnarchiveJobResponse:
    id: String                              // Job ID
    archived: bool                          // Always false
```

### 14.3 Fine-Tuning Service Implementation

```
CLASS FineTuningServiceImpl IMPLEMENTS FineTuningService:
    transport: HttpTransport
    resilience: ResilienceOrchestrator
    tracer: TracingProvider
    logger: LoggingProvider
    config: ClientConfig

    CONSTRUCTOR(transport, resilience, tracer, logger, config):
        this.transport = transport
        this.resilience = resilience
        this.tracer = tracer
        this.logger = logger
        this.config = config

    FUNCTION create(request: CreateFineTuningJobRequest) -> Result<FineTuningJob>:
        span = tracer.start_span("mistral.fine_tuning.create")
        span.set_attribute("mistral.fine_tuning.model", request.model)
        span.set_attribute("mistral.fine_tuning.training_files_count",
                          request.training_files.len())

        TRY:
            // Validate request
            this.validate_create_request(request)?

            // Build request body (redact secrets)
            body = this.build_create_body(request)

            http_request = HttpRequest.builder()
                .method(POST)
                .url(config.base_url + "/v1/fine_tuning/jobs")
                .json(body)
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("fine_tuning.create")
            )?

            job = parse_json::<FineTuningJob>(response.body)?

            span.set_attribute("mistral.fine_tuning.job_id", job.id)
            logger.info("Fine-tuning job created", {
                "job_id": job.id,
                "model": job.model,
                "status": job.status.to_string()
            })

            RETURN Ok(job)

        CATCH error:
            span.record_error(error)
            logger.error("Failed to create fine-tuning job", {
                "error": error.to_string(),
                "model": request.model
            })
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION validate_create_request(request: CreateFineTuningJobRequest) -> Result<()>:
        // Validate model exists and is fine-tunable
        fine_tunable_models = [
            "open-mistral-7b",
            "open-mistral-nemo",
            "mistral-small-latest",
            "codestral-latest"
        ]

        // Note: Don't strictly validate model names as new models may be added
        IF request.training_files.is_empty():
            RETURN Err(ValidationError.new(
                "training_files_required",
                "At least one training file is required"
            ))

        // Validate hyperparameters
        IF request.hyperparameters.learning_rate IS SOME:
            lr = request.hyperparameters.learning_rate.unwrap()
            IF lr <= 0.0 OR lr > 1.0:
                RETURN Err(ValidationError.new(
                    "invalid_learning_rate",
                    "Learning rate must be between 0 and 1"
                ))

        IF request.hyperparameters.fim_ratio IS SOME:
            fim = request.hyperparameters.fim_ratio.unwrap()
            IF fim < 0.0 OR fim > 1.0:
                RETURN Err(ValidationError.new(
                    "invalid_fim_ratio",
                    "FIM ratio must be between 0 and 1"
                ))

        RETURN Ok(())

    FUNCTION build_create_body(request: CreateFineTuningJobRequest) -> JsonValue:
        body = json!({
            "model": request.model,
            "training_files": request.training_files.map(|f| {
                "file_id": f.file_id,
                "weight": f.weight
            }),
            "hyperparameters": {
                "training_steps": request.hyperparameters.training_steps,
                "learning_rate": request.hyperparameters.learning_rate,
                "weight_decay": request.hyperparameters.weight_decay,
                "warmup_fraction": request.hyperparameters.warmup_fraction,
                "epochs": request.hyperparameters.epochs,
                "fim_ratio": request.hyperparameters.fim_ratio,
                "seq_len": request.hyperparameters.seq_len
            }
        })

        IF request.validation_files IS SOME:
            body["validation_files"] = request.validation_files.map(|f| {
                "file_id": f.file_id,
                "weight": f.weight
            })

        IF request.suffix IS SOME:
            body["suffix"] = request.suffix

        IF request.auto_start IS SOME:
            body["auto_start"] = request.auto_start

        IF request.integrations IS SOME:
            // Redact API keys for logging purposes
            body["integrations"] = request.integrations.map(|i| {
                integration = { "type": i.type.to_string() }
                IF i.wandb IS SOME:
                    integration["wandb"] = {
                        "project": i.wandb.project,
                        "name": i.wandb.name,
                        "run_name": i.wandb.run_name,
                        "api_key": i.wandb.api_key.expose_secret()  // Only expose when sending
                    }
                integration
            })

        IF request.repositories IS SOME:
            body["repositories"] = request.repositories.map(|r| {
                "type": r.type.to_string(),
                "name": r.name,
                "owner": r.owner,
                "ref": r.ref,
                "weight": r.weight,
                "token": r.token?.expose_secret()
            })

        // Remove null values
        RETURN body.filter_nulls()

    FUNCTION list(request: ListFineTuningJobsRequest) -> Result<ListFineTuningJobsResponse>:
        span = tracer.start_span("mistral.fine_tuning.list")

        TRY:
            params = QueryParams.new()
            IF request.page IS SOME:
                params.add("page", request.page.to_string())
            IF request.page_size IS SOME:
                params.add("page_size", request.page_size.to_string())
            IF request.model IS SOME:
                params.add("model", request.model)
            IF request.status IS SOME:
                params.add("status", request.status.to_api_string())
            IF request.created_after IS SOME:
                params.add("created_after", request.created_after.to_string())
            IF request.created_by_me IS SOME:
                params.add("created_by_me", request.created_by_me.to_string())
            IF request.wandb_project IS SOME:
                params.add("wandb_project", request.wandb_project)
            IF request.wandb_name IS SOME:
                params.add("wandb_name", request.wandb_name)
            IF request.suffix IS SOME:
                params.add("suffix", request.suffix)

            http_request = HttpRequest.builder()
                .method(GET)
                .url(config.base_url + "/v1/fine_tuning/jobs")
                .query(params)
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("fine_tuning.list")
            )?

            list_response = parse_json::<ListFineTuningJobsResponse>(response.body)?

            span.set_attribute("mistral.fine_tuning.jobs_count", list_response.data.len())

            RETURN Ok(list_response)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION get(job_id: String) -> Result<FineTuningJob>:
        span = tracer.start_span("mistral.fine_tuning.get")
        span.set_attribute("mistral.fine_tuning.job_id", job_id)

        TRY:
            http_request = HttpRequest.builder()
                .method(GET)
                .url(config.base_url + "/v1/fine_tuning/jobs/" + job_id)
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("fine_tuning.get")
            )?

            RETURN Ok(parse_json::<FineTuningJob>(response.body)?)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION cancel(job_id: String) -> Result<FineTuningJob>:
        span = tracer.start_span("mistral.fine_tuning.cancel")
        span.set_attribute("mistral.fine_tuning.job_id", job_id)

        TRY:
            http_request = HttpRequest.builder()
                .method(POST)
                .url(config.base_url + "/v1/fine_tuning/jobs/" + job_id + "/cancel")
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("fine_tuning.cancel")
            )?

            job = parse_json::<FineTuningJob>(response.body)?

            logger.info("Fine-tuning job cancelled", {"job_id": job_id})

            RETURN Ok(job)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION start(job_id: String) -> Result<FineTuningJob>:
        span = tracer.start_span("mistral.fine_tuning.start")
        span.set_attribute("mistral.fine_tuning.job_id", job_id)

        TRY:
            http_request = HttpRequest.builder()
                .method(POST)
                .url(config.base_url + "/v1/fine_tuning/jobs/" + job_id + "/start")
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("fine_tuning.start")
            )?

            job = parse_json::<FineTuningJob>(response.body)?

            logger.info("Fine-tuning job started", {"job_id": job_id})

            RETURN Ok(job)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION archive(job_id: String) -> Result<ArchiveJobResponse>:
        span = tracer.start_span("mistral.fine_tuning.archive")
        span.set_attribute("mistral.fine_tuning.job_id", job_id)

        TRY:
            http_request = HttpRequest.builder()
                .method(POST)
                .url(config.base_url + "/v1/fine_tuning/jobs/" + job_id + "/archive")
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("fine_tuning.archive")
            )?

            RETURN Ok(parse_json::<ArchiveJobResponse>(response.body)?)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION unarchive(job_id: String) -> Result<UnarchiveJobResponse>:
        span = tracer.start_span("mistral.fine_tuning.unarchive")
        span.set_attribute("mistral.fine_tuning.job_id", job_id)

        TRY:
            http_request = HttpRequest.builder()
                .method(DELETE)
                .url(config.base_url + "/v1/fine_tuning/jobs/" + job_id + "/archive")
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("fine_tuning.unarchive")
            )?

            RETURN Ok(parse_json::<UnarchiveJobResponse>(response.body)?)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()
```

---

## 15. Agents Service

### 15.1 Agents Service Interface

```
INTERFACE AgentsService:
    // Create an agent
    FUNCTION create(request: CreateAgentRequest) -> Result<Agent>

    // List agents
    FUNCTION list(request: ListAgentsRequest) -> Result<ListAgentsResponse>

    // Get an agent
    FUNCTION get(agent_id: String) -> Result<Agent>

    // Update an agent
    FUNCTION update(agent_id: String, request: UpdateAgentRequest) -> Result<Agent>

    // Delete an agent
    FUNCTION delete(agent_id: String) -> Result<DeleteAgentResponse>

    // Create agent completion (sync)
    FUNCTION complete(agent_id: String, request: AgentCompletionRequest) -> Result<AgentCompletionResponse>

    // Create agent completion (stream)
    FUNCTION complete_stream(agent_id: String, request: AgentCompletionRequest) -> Result<Stream<AgentStreamEvent>>
```

### 15.2 Agents Data Types

```
STRUCT Agent:
    id: String                              // Agent ID
    object: String                          // Always "agent"
    name: String                            // Agent name
    description: Option<String>             // Agent description
    model: String                           // Model ID
    instructions: Option<String>            // System instructions
    tools: Option<Vec<AgentTool>>           // Available tools
    created_at: i64                         // Creation timestamp
    updated_at: Option<i64>                 // Last update timestamp

STRUCT CreateAgentRequest:
    name: String                            // Agent name (required)
    model: String                           // Model ID (required)
    description: Option<String>             // Agent description
    instructions: Option<String>            // System instructions
    tools: Option<Vec<AgentTool>>           // Available tools

STRUCT UpdateAgentRequest:
    name: Option<String>                    // Updated name
    description: Option<String>             // Updated description
    model: Option<String>                   // Updated model
    instructions: Option<String>            // Updated instructions
    tools: Option<Vec<AgentTool>>           // Updated tools

ENUM AgentTool:
    Function(FunctionTool)                  // Custom function tool
    WebSearch(WebSearchTool)                // Web search capability
    CodeInterpreter(CodeInterpreterTool)    // Code execution
    ImageGeneration(ImageGenerationTool)    // Image generation
    DocumentParser(DocumentParserTool)      // Document parsing

STRUCT FunctionTool:
    type: String                            // Always "function"
    function: FunctionDefinition            // Function definition

STRUCT WebSearchTool:
    type: String                            // Always "web_search"

STRUCT CodeInterpreterTool:
    type: String                            // Always "code_interpreter"

STRUCT ImageGenerationTool:
    type: String                            // Always "image_generation"

STRUCT DocumentParserTool:
    type: String                            // Always "document_parser"

STRUCT FunctionDefinition:
    name: String                            // Function name
    description: Option<String>             // Function description
    parameters: JsonSchema                  // JSON Schema for parameters

STRUCT ListAgentsRequest:
    page: Option<u32>                       // Page number
    page_size: Option<u32>                  // Items per page

STRUCT ListAgentsResponse:
    data: Vec<Agent>                        // List of agents
    object: String                          // Always "list"
    total: u64                              // Total count

STRUCT DeleteAgentResponse:
    id: String                              // Deleted agent ID
    object: String                          // Always "agent"
    deleted: bool                           // Always true

STRUCT AgentCompletionRequest:
    messages: Vec<Message>                  // Conversation messages
    max_tokens: Option<u32>                 // Maximum tokens to generate
    temperature: Option<f64>                // Sampling temperature
    top_p: Option<f64>                      // Nucleus sampling
    random_seed: Option<u64>                // Random seed
    tool_choice: Option<ToolChoice>         // Tool selection mode

STRUCT AgentCompletionResponse:
    id: String                              // Completion ID
    object: String                          // Always "agent.completion"
    model: String                           // Model used
    choices: Vec<AgentChoice>               // Response choices
    usage: Usage                            // Token usage
    created: i64                            // Creation timestamp

STRUCT AgentChoice:
    index: u32                              // Choice index
    message: AssistantMessage               // Response message
    finish_reason: FinishReason             // Completion reason

ENUM AgentStreamEvent:
    // Agent completion stream events
    AgentStart(AgentStartEvent)
    ContentDelta(ContentDeltaEvent)
    ToolUse(ToolUseEvent)
    ToolResult(ToolResultEvent)
    AgentDone(AgentDoneEvent)
    Error(ErrorEvent)

STRUCT AgentStartEvent:
    id: String                              // Completion ID
    model: String                           // Model being used

STRUCT ContentDeltaEvent:
    index: u32                              // Choice index
    delta: ContentDelta                     // Content delta

STRUCT ToolUseEvent:
    index: u32                              // Choice index
    id: String                              // Tool call ID
    name: String                            // Tool name
    arguments: String                       // Tool arguments (JSON)

STRUCT ToolResultEvent:
    index: u32                              // Choice index
    tool_call_id: String                    // Tool call ID
    content: String                         // Tool result

STRUCT AgentDoneEvent:
    id: String                              // Completion ID
    usage: Usage                            // Final token usage
    finish_reason: FinishReason             // Completion reason
```

### 15.3 Agents Service Implementation

```
CLASS AgentsServiceImpl IMPLEMENTS AgentsService:
    transport: HttpTransport
    resilience: ResilienceOrchestrator
    tracer: TracingProvider
    logger: LoggingProvider
    config: ClientConfig
    sse_parser: SseParser

    CONSTRUCTOR(transport, resilience, tracer, logger, config, sse_parser):
        this.transport = transport
        this.resilience = resilience
        this.tracer = tracer
        this.logger = logger
        this.config = config
        this.sse_parser = sse_parser

    FUNCTION create(request: CreateAgentRequest) -> Result<Agent>:
        span = tracer.start_span("mistral.agents.create")
        span.set_attribute("mistral.agent.name", request.name)
        span.set_attribute("mistral.agent.model", request.model)

        TRY:
            // Validate request
            this.validate_create_request(request)?

            // Build request body
            body = json!({
                "name": request.name,
                "model": request.model,
                "description": request.description,
                "instructions": request.instructions,
                "tools": request.tools?.map(|t| this.serialize_tool(t))
            }).filter_nulls()

            http_request = HttpRequest.builder()
                .method(POST)
                .url(config.base_url + "/v1/agents")
                .json(body)
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("agents.create")
            )?

            agent = parse_json::<Agent>(response.body)?

            span.set_attribute("mistral.agent.id", agent.id)
            logger.info("Agent created", {
                "agent_id": agent.id,
                "name": agent.name
            })

            RETURN Ok(agent)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION validate_create_request(request: CreateAgentRequest) -> Result<()>:
        IF request.name.is_empty():
            RETURN Err(ValidationError.new("name_required", "Agent name is required"))

        IF request.name.len() > 256:
            RETURN Err(ValidationError.new("name_too_long", "Agent name exceeds 256 characters"))

        IF request.model.is_empty():
            RETURN Err(ValidationError.new("model_required", "Model ID is required"))

        IF request.instructions IS SOME AND request.instructions.len() > 32768:
            RETURN Err(ValidationError.new(
                "instructions_too_long",
                "Instructions exceed 32768 characters"
            ))

        RETURN Ok(())

    FUNCTION serialize_tool(tool: AgentTool) -> JsonValue:
        MATCH tool:
            AgentTool.Function(f):
                RETURN json!({
                    "type": "function",
                    "function": {
                        "name": f.function.name,
                        "description": f.function.description,
                        "parameters": f.function.parameters
                    }
                })
            AgentTool.WebSearch(_):
                RETURN json!({"type": "web_search"})
            AgentTool.CodeInterpreter(_):
                RETURN json!({"type": "code_interpreter"})
            AgentTool.ImageGeneration(_):
                RETURN json!({"type": "image_generation"})
            AgentTool.DocumentParser(_):
                RETURN json!({"type": "document_parser"})

    FUNCTION list(request: ListAgentsRequest) -> Result<ListAgentsResponse>:
        span = tracer.start_span("mistral.agents.list")

        TRY:
            params = QueryParams.new()
            IF request.page IS SOME:
                params.add("page", request.page.to_string())
            IF request.page_size IS SOME:
                params.add("page_size", request.page_size.to_string())

            http_request = HttpRequest.builder()
                .method(GET)
                .url(config.base_url + "/v1/agents")
                .query(params)
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("agents.list")
            )?

            list_response = parse_json::<ListAgentsResponse>(response.body)?

            span.set_attribute("mistral.agents.count", list_response.data.len())

            RETURN Ok(list_response)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION get(agent_id: String) -> Result<Agent>:
        span = tracer.start_span("mistral.agents.get")
        span.set_attribute("mistral.agent.id", agent_id)

        TRY:
            http_request = HttpRequest.builder()
                .method(GET)
                .url(config.base_url + "/v1/agents/" + agent_id)
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("agents.get")
            )?

            RETURN Ok(parse_json::<Agent>(response.body)?)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION update(agent_id: String, request: UpdateAgentRequest) -> Result<Agent>:
        span = tracer.start_span("mistral.agents.update")
        span.set_attribute("mistral.agent.id", agent_id)

        TRY:
            body = json!({
                "name": request.name,
                "description": request.description,
                "model": request.model,
                "instructions": request.instructions,
                "tools": request.tools?.map(|t| this.serialize_tool(t))
            }).filter_nulls()

            http_request = HttpRequest.builder()
                .method(PATCH)
                .url(config.base_url + "/v1/agents/" + agent_id)
                .json(body)
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("agents.update")
            )?

            agent = parse_json::<Agent>(response.body)?

            logger.info("Agent updated", {"agent_id": agent_id})

            RETURN Ok(agent)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION delete(agent_id: String) -> Result<DeleteAgentResponse>:
        span = tracer.start_span("mistral.agents.delete")
        span.set_attribute("mistral.agent.id", agent_id)

        TRY:
            http_request = HttpRequest.builder()
                .method(DELETE)
                .url(config.base_url + "/v1/agents/" + agent_id)
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("agents.delete")
            )?

            result = parse_json::<DeleteAgentResponse>(response.body)?

            logger.info("Agent deleted", {"agent_id": agent_id})

            RETURN Ok(result)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION complete(agent_id: String, request: AgentCompletionRequest) -> Result<AgentCompletionResponse>:
        span = tracer.start_span("mistral.agents.complete")
        span.set_attribute("mistral.agent.id", agent_id)
        span.set_attribute("mistral.messages.count", request.messages.len())

        TRY:
            body = json!({
                "messages": request.messages.map(|m| serialize_message(m)),
                "max_tokens": request.max_tokens,
                "temperature": request.temperature,
                "top_p": request.top_p,
                "random_seed": request.random_seed,
                "tool_choice": request.tool_choice?.to_json()
            }).filter_nulls()

            http_request = HttpRequest.builder()
                .method(POST)
                .url(config.base_url + "/v1/agents/" + agent_id + "/completions")
                .json(body)
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("agents.complete")
            )?

            completion = parse_json::<AgentCompletionResponse>(response.body)?

            span.set_attribute("mistral.usage.prompt_tokens", completion.usage.prompt_tokens)
            span.set_attribute("mistral.usage.completion_tokens", completion.usage.completion_tokens)

            RETURN Ok(completion)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION complete_stream(agent_id: String, request: AgentCompletionRequest) -> Result<Stream<AgentStreamEvent>>:
        span = tracer.start_span("mistral.agents.complete_stream")
        span.set_attribute("mistral.agent.id", agent_id)
        span.set_attribute("mistral.streaming", true)

        TRY:
            body = json!({
                "messages": request.messages.map(|m| serialize_message(m)),
                "max_tokens": request.max_tokens,
                "temperature": request.temperature,
                "top_p": request.top_p,
                "random_seed": request.random_seed,
                "tool_choice": request.tool_choice?.to_json(),
                "stream": true
            }).filter_nulls()

            http_request = HttpRequest.builder()
                .method(POST)
                .url(config.base_url + "/v1/agents/" + agent_id + "/completions")
                .header("Accept", "text/event-stream")
                .json(body)
                .build()

            response_stream = transport.send_streaming(http_request)?

            // Create event stream
            event_stream = this.create_agent_event_stream(response_stream, span.clone())

            RETURN Ok(event_stream)

        CATCH error:
            span.record_error(error)
            span.end()
            RETURN Err(error)

    FUNCTION create_agent_event_stream(
        response_stream: ByteStream,
        span: Span
    ) -> Stream<AgentStreamEvent>:

        RETURN async_stream! {
            accumulator = AgentStreamAccumulator.new()

            FOR AWAIT sse_event IN sse_parser.parse(response_stream):
                MATCH sse_event:
                    SseEvent.Data(data):
                        IF data == "[DONE]":
                            // Stream complete
                            final_event = accumulator.finalize()
                            IF final_event IS SOME:
                                YIELD final_event
                            span.end()
                            BREAK

                        TRY:
                            chunk = parse_json::<AgentStreamChunk>(data)?
                            event = this.chunk_to_event(chunk, accumulator)?
                            IF event IS SOME:
                                YIELD event
                        CATCH parse_error:
                            span.record_error(parse_error)
                            YIELD AgentStreamEvent.Error(ErrorEvent {
                                message: parse_error.to_string()
                            })

                    SseEvent.Error(error):
                        span.record_error(error)
                        YIELD AgentStreamEvent.Error(ErrorEvent {
                            message: error.to_string()
                        })
                        span.end()
                        BREAK
        }
```

---

## 16. Batch Service

### 16.1 Batch Service Interface

```
INTERFACE BatchService:
    // Create a batch job
    FUNCTION create(request: CreateBatchJobRequest) -> Result<BatchJob>

    // List batch jobs
    FUNCTION list(request: ListBatchJobsRequest) -> Result<ListBatchJobsResponse>

    // Get a batch job
    FUNCTION get(job_id: String) -> Result<BatchJob>

    // Cancel a batch job
    FUNCTION cancel(job_id: String) -> Result<BatchJob>
```

### 16.2 Batch Data Types

```
STRUCT CreateBatchJobRequest:
    input_files: Vec<String>                // Input file IDs
    endpoint: BatchEndpoint                 // Target endpoint
    model: String                           // Model to use
    metadata: Option<Map<String, String>>   // Custom metadata
    timeout_hours: Option<u32>              // Job timeout (1-168 hours)

ENUM BatchEndpoint:
    ChatCompletions                         // /v1/chat/completions
    FimCompletions                          // /v1/fim/completions
    Embeddings                              // /v1/embeddings
    Moderations                             // /v1/moderations

STRUCT BatchJob:
    id: String                              // Job ID
    object: String                          // Always "batch"
    input_files: Vec<String>                // Input file IDs
    endpoint: BatchEndpoint                 // Target endpoint
    model: String                           // Model ID
    status: BatchStatus                     // Job status
    created_at: i64                         // Creation timestamp
    started_at: Option<i64>                 // Start timestamp
    completed_at: Option<i64>               // Completion timestamp
    errors: Option<BatchErrors>             // Error details
    output_file: Option<String>             // Output file ID
    error_file: Option<String>              // Error file ID
    metadata: Option<Map<String, String>>   // Custom metadata
    total_requests: u64                     // Total number of requests
    completed_requests: u64                 // Completed requests
    failed_requests: u64                    // Failed requests
    timeout_hours: u32                      // Job timeout

ENUM BatchStatus:
    Queued                                  // Job queued
    InProgress                              // Job running
    Completed                               // All requests completed
    PartiallyCompleted                      // Some requests failed
    Failed                                  // Job failed
    Cancelling                              // Cancellation in progress
    Cancelled                               // Job cancelled
    Expired                                 // Job expired

STRUCT BatchErrors:
    object: String                          // Always "list"
    data: Vec<BatchError>                   // List of errors

STRUCT BatchError:
    code: String                            // Error code
    message: String                         // Error message
    line: Option<u64>                       // Line number in input

STRUCT ListBatchJobsRequest:
    page: Option<u32>                       // Page number
    page_size: Option<u32>                  // Items per page
    status: Option<BatchStatus>             // Filter by status
    model: Option<String>                   // Filter by model
    created_after: Option<i64>              // Filter by creation time
    created_before: Option<i64>             // Filter before time

STRUCT ListBatchJobsResponse:
    data: Vec<BatchJob>                     // List of jobs
    object: String                          // Always "list"
    total: u64                              // Total count
```

### 16.3 Batch Service Implementation

```
CLASS BatchServiceImpl IMPLEMENTS BatchService:
    transport: HttpTransport
    resilience: ResilienceOrchestrator
    tracer: TracingProvider
    logger: LoggingProvider
    config: ClientConfig

    CONSTRUCTOR(transport, resilience, tracer, logger, config):
        this.transport = transport
        this.resilience = resilience
        this.tracer = tracer
        this.logger = logger
        this.config = config

    FUNCTION create(request: CreateBatchJobRequest) -> Result<BatchJob>:
        span = tracer.start_span("mistral.batch.create")
        span.set_attribute("mistral.batch.endpoint", request.endpoint.to_string())
        span.set_attribute("mistral.batch.model", request.model)
        span.set_attribute("mistral.batch.input_files_count", request.input_files.len())

        TRY:
            // Validate request
            this.validate_create_request(request)?

            body = json!({
                "input_files": request.input_files,
                "endpoint": request.endpoint.to_api_string(),
                "model": request.model,
                "metadata": request.metadata,
                "timeout_hours": request.timeout_hours.unwrap_or(24)
            }).filter_nulls()

            http_request = HttpRequest.builder()
                .method(POST)
                .url(config.base_url + "/v1/batch/jobs")
                .json(body)
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("batch.create")
            )?

            job = parse_json::<BatchJob>(response.body)?

            span.set_attribute("mistral.batch.job_id", job.id)
            logger.info("Batch job created", {
                "job_id": job.id,
                "model": job.model,
                "total_requests": job.total_requests
            })

            RETURN Ok(job)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION validate_create_request(request: CreateBatchJobRequest) -> Result<()>:
        IF request.input_files.is_empty():
            RETURN Err(ValidationError.new(
                "input_files_required",
                "At least one input file is required"
            ))

        IF request.input_files.len() > 100:
            RETURN Err(ValidationError.new(
                "too_many_input_files",
                "Maximum 100 input files allowed per batch"
            ))

        IF request.model.is_empty():
            RETURN Err(ValidationError.new("model_required", "Model ID is required"))

        IF request.timeout_hours IS SOME:
            hours = request.timeout_hours.unwrap()
            IF hours < 1 OR hours > 168:
                RETURN Err(ValidationError.new(
                    "invalid_timeout",
                    "Timeout must be between 1 and 168 hours"
                ))

        RETURN Ok(())

    FUNCTION list(request: ListBatchJobsRequest) -> Result<ListBatchJobsResponse>:
        span = tracer.start_span("mistral.batch.list")

        TRY:
            params = QueryParams.new()
            IF request.page IS SOME:
                params.add("page", request.page.to_string())
            IF request.page_size IS SOME:
                params.add("page_size", request.page_size.to_string())
            IF request.status IS SOME:
                params.add("status", request.status.to_api_string())
            IF request.model IS SOME:
                params.add("model", request.model)
            IF request.created_after IS SOME:
                params.add("created_after", request.created_after.to_string())
            IF request.created_before IS SOME:
                params.add("created_before", request.created_before.to_string())

            http_request = HttpRequest.builder()
                .method(GET)
                .url(config.base_url + "/v1/batch/jobs")
                .query(params)
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("batch.list")
            )?

            list_response = parse_json::<ListBatchJobsResponse>(response.body)?

            span.set_attribute("mistral.batch.jobs_count", list_response.data.len())

            RETURN Ok(list_response)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION get(job_id: String) -> Result<BatchJob>:
        span = tracer.start_span("mistral.batch.get")
        span.set_attribute("mistral.batch.job_id", job_id)

        TRY:
            http_request = HttpRequest.builder()
                .method(GET)
                .url(config.base_url + "/v1/batch/jobs/" + job_id)
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("batch.get")
            )?

            RETURN Ok(parse_json::<BatchJob>(response.body)?)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()

    FUNCTION cancel(job_id: String) -> Result<BatchJob>:
        span = tracer.start_span("mistral.batch.cancel")
        span.set_attribute("mistral.batch.job_id", job_id)

        TRY:
            http_request = HttpRequest.builder()
                .method(POST)
                .url(config.base_url + "/v1/batch/jobs/" + job_id + "/cancel")
                .build()

            response = resilience.execute(
                operation = || transport.send(http_request),
                context = ResilienceContext.new("batch.cancel")
            )?

            job = parse_json::<BatchJob>(response.body)?

            logger.info("Batch job cancelled", {"job_id": job_id})

            RETURN Ok(job)

        CATCH error:
            span.record_error(error)
            RETURN Err(error)
        FINALLY:
            span.end()
```

---

## 17. Error Handling Patterns

### 17.1 Unified Error Mapper

```
CLASS MistralErrorMapper:
    logger: LoggingProvider

    FUNCTION map_http_error(status: HttpStatus, body: Bytes, headers: Headers) -> MistralError:
        // Try to parse API error response
        api_error = TRY parse_json::<ApiErrorResponse>(body)

        IF api_error IS OK:
            error_detail = api_error.error

            MATCH status:
                400:
                    RETURN MistralError.BadRequest(BadRequestError {
                        message: error_detail.message,
                        type: error_detail.type,
                        param: error_detail.param,
                        code: error_detail.code
                    })

                401:
                    RETURN MistralError.Authentication(AuthenticationError {
                        message: error_detail.message
                    })

                403:
                    RETURN MistralError.Permission(PermissionError {
                        message: error_detail.message
                    })

                404:
                    RETURN MistralError.NotFound(NotFoundError {
                        message: error_detail.message,
                        resource: error_detail.param
                    })

                422:
                    RETURN MistralError.Validation(ValidationError {
                        message: error_detail.message,
                        type: error_detail.type,
                        errors: this.parse_validation_errors(error_detail)
                    })

                429:
                    retry_after = this.extract_retry_after(headers)
                    RETURN MistralError.RateLimit(RateLimitError {
                        message: error_detail.message,
                        retry_after: retry_after
                    })

                500:
                    RETURN MistralError.Internal(InternalError {
                        message: error_detail.message,
                        request_id: headers.get("x-request-id")
                    })

                502:
                    RETURN MistralError.BadGateway(BadGatewayError {
                        message: "Bad gateway - upstream error"
                    })

                503:
                    retry_after = this.extract_retry_after(headers)
                    RETURN MistralError.ServiceUnavailable(ServiceUnavailableError {
                        message: error_detail.message,
                        retry_after: retry_after
                    })

                504:
                    RETURN MistralError.GatewayTimeout(GatewayTimeoutError {
                        message: "Gateway timeout - request took too long"
                    })

                _:
                    RETURN MistralError.Unknown(UnknownError {
                        status: status,
                        message: error_detail.message,
                        body: body.to_string()
                    })

        // Fallback for non-JSON responses
        RETURN MistralError.Unknown(UnknownError {
            status: status,
            message: format!("HTTP {} error", status),
            body: body.to_string()
        })

    FUNCTION extract_retry_after(headers: Headers) -> Option<Duration>:
        retry_header = headers.get("Retry-After")?

        // Try parsing as seconds
        IF seconds = TRY retry_header.parse::<u64>():
            RETURN Some(Duration.from_secs(seconds))

        // Try parsing as HTTP date
        IF date = TRY parse_http_date(retry_header):
            delay = date.duration_since(now())
            RETURN Some(delay.max(Duration.ZERO))

        RETURN None

    FUNCTION parse_validation_errors(error: ApiErrorDetail) -> Vec<FieldError>:
        // Parse validation errors from error detail
        IF error.type == "invalid_request_error" AND error.param IS SOME:
            RETURN [FieldError {
                field: error.param,
                message: error.message,
                code: error.code.unwrap_or("invalid")
            }]
        RETURN []
```

### 17.2 Error Recovery Strategies

```
CLASS ErrorRecoveryStrategies:

    FUNCTION should_retry(error: MistralError) -> bool:
        MATCH error:
            MistralError.RateLimit(_):
                RETURN true
            MistralError.ServiceUnavailable(_):
                RETURN true
            MistralError.GatewayTimeout(_):
                RETURN true
            MistralError.BadGateway(_):
                RETURN true
            MistralError.Internal(e):
                // Retry internal errors as they may be transient
                RETURN true
            MistralError.Timeout(_):
                RETURN true
            MistralError.Connection(_):
                RETURN true
            _:
                RETURN false

    FUNCTION get_retry_delay(error: MistralError, attempt: u32) -> Duration:
        MATCH error:
            MistralError.RateLimit(e):
                IF e.retry_after IS SOME:
                    RETURN e.retry_after
                // Default backoff for rate limits
                RETURN Duration.from_secs(min(60, 2.pow(attempt)))

            MistralError.ServiceUnavailable(e):
                IF e.retry_after IS SOME:
                    RETURN e.retry_after
                RETURN Duration.from_secs(min(30, 2.pow(attempt)))

            _:
                // Exponential backoff with jitter
                base = Duration.from_secs(min(30, 2.pow(attempt)))
                jitter = random(0.0, 0.3) * base.as_secs_f64()
                RETURN base + Duration.from_secs_f64(jitter)

    FUNCTION should_circuit_break(error: MistralError) -> bool:
        MATCH error:
            MistralError.ServiceUnavailable(_):
                RETURN true
            MistralError.Internal(_):
                RETURN true
            MistralError.BadGateway(_):
                RETURN true
            MistralError.GatewayTimeout(_):
                RETURN true
            _:
                RETURN false
```

---

## 18. Observability Patterns

### 18.1 Metrics Definitions

```
STRUCT MistralMetrics:
    // Request metrics
    request_count: Counter<u64>                 // Total requests by method, status
    request_duration_ms: Histogram<f64>         // Request latency histogram
    request_size_bytes: Histogram<u64>          // Request body size
    response_size_bytes: Histogram<u64>         // Response body size

    // Token metrics
    prompt_tokens: Counter<u64>                 // Prompt tokens consumed
    completion_tokens: Counter<u64>             // Completion tokens generated
    total_tokens: Counter<u64>                  // Total tokens (prompt + completion)

    // Streaming metrics
    stream_chunks: Counter<u64>                 // SSE chunks received
    stream_duration_ms: Histogram<f64>          // Total stream duration
    time_to_first_token_ms: Histogram<f64>      // Time to first chunk

    // Error metrics
    error_count: Counter<u64>                   // Errors by type
    retry_count: Counter<u64>                   // Retry attempts
    circuit_breaker_state: Gauge<String>        // Circuit breaker state

    // Rate limiting metrics
    rate_limit_rejections: Counter<u64>         // Requests rejected by rate limit
    rate_limit_wait_ms: Histogram<f64>          // Time spent waiting for rate limit

    FUNCTION record_request(method: String, endpoint: String, status: u16, duration: Duration):
        request_count.increment({
            "method": method,
            "endpoint": endpoint,
            "status": status.to_string()
        })
        request_duration_ms.record(duration.as_millis_f64(), {
            "method": method,
            "endpoint": endpoint
        })

    FUNCTION record_tokens(prompt: u64, completion: u64, model: String):
        prompt_tokens.increment(prompt, {"model": model})
        completion_tokens.increment(completion, {"model": model})
        total_tokens.increment(prompt + completion, {"model": model})

    FUNCTION record_error(error_type: String, endpoint: String):
        error_count.increment({
            "type": error_type,
            "endpoint": endpoint
        })

    FUNCTION record_stream_metrics(chunks: u64, duration: Duration, ttft: Duration, model: String):
        stream_chunks.increment(chunks, {"model": model})
        stream_duration_ms.record(duration.as_millis_f64(), {"model": model})
        time_to_first_token_ms.record(ttft.as_millis_f64(), {"model": model})
```

### 18.2 Structured Logging

```
CLASS MistralLogger:
    inner: LoggingProvider
    default_fields: Map<String, String>

    FUNCTION with_fields(fields: Map<String, String>) -> MistralLogger:
        new_fields = default_fields.clone()
        new_fields.extend(fields)
        RETURN MistralLogger { inner: inner.clone(), default_fields: new_fields }

    FUNCTION log_request(level: LogLevel, operation: String, request: HttpRequest):
        // Redact authorization header
        headers = request.headers.clone()
        IF headers.contains("Authorization"):
            headers.set("Authorization", "[REDACTED]")

        inner.log(level, "Mistral API request", {
            ...default_fields,
            "operation": operation,
            "method": request.method,
            "url": redact_url(request.url),
            "headers": headers.to_json()
        })

    FUNCTION log_response(level: LogLevel, operation: String, response: HttpResponse, duration: Duration):
        inner.log(level, "Mistral API response", {
            ...default_fields,
            "operation": operation,
            "status": response.status,
            "duration_ms": duration.as_millis(),
            "content_length": response.headers.get("Content-Length")
        })

    FUNCTION log_stream_event(level: LogLevel, event_type: String, event: StreamEvent):
        // Only log metadata, not content (privacy)
        inner.log(level, "Mistral stream event", {
            ...default_fields,
            "event_type": event_type,
            "has_content": event.has_content(),
            "has_tool_call": event.has_tool_call()
        })

    FUNCTION log_error(error: MistralError, operation: String, context: Map<String, String>):
        inner.log(LogLevel.Error, "Mistral API error", {
            ...default_fields,
            ...context,
            "operation": operation,
            "error_type": error.type_name(),
            "error_message": error.message(),
            "is_retryable": error.is_retryable()
        })
```

---

## 19. Testing Patterns

### 19.1 Test Fixtures

```
MODULE TestFixtures:

    FUNCTION sample_chat_request() -> ChatCompletionRequest:
        RETURN ChatCompletionRequest {
            model: "mistral-large-latest",
            messages: [
                Message.System(SystemMessage {
                    content: "You are a helpful assistant."
                }),
                Message.User(UserMessage {
                    content: TextContent("What is 2+2?")
                })
            ],
            temperature: Some(0.7),
            max_tokens: Some(100),
            stream: false,
            ..Default::default()
        }

    FUNCTION sample_chat_response() -> ChatCompletionResponse:
        RETURN ChatCompletionResponse {
            id: "chatcmpl-abc123",
            object: "chat.completion",
            model: "mistral-large-latest",
            created: 1700000000,
            choices: [
                ChatChoice {
                    index: 0,
                    message: AssistantMessage {
                        role: "assistant",
                        content: Some("2+2 equals 4."),
                        tool_calls: None,
                        prefix: false
                    },
                    finish_reason: FinishReason.Stop
                }
            ],
            usage: Usage {
                prompt_tokens: 20,
                completion_tokens: 8,
                total_tokens: 28
            }
        }

    FUNCTION sample_stream_chunks() -> Vec<ChatCompletionChunk>:
        RETURN [
            ChatCompletionChunk {
                id: "chatcmpl-abc123",
                object: "chat.completion.chunk",
                model: "mistral-large-latest",
                created: 1700000000,
                choices: [
                    StreamChoice {
                        index: 0,
                        delta: ContentDelta { content: Some("2") },
                        finish_reason: None
                    }
                ],
                usage: None
            },
            ChatCompletionChunk {
                id: "chatcmpl-abc123",
                object: "chat.completion.chunk",
                model: "mistral-large-latest",
                created: 1700000000,
                choices: [
                    StreamChoice {
                        index: 0,
                        delta: ContentDelta { content: Some("+2") },
                        finish_reason: None
                    }
                ],
                usage: None
            },
            ChatCompletionChunk {
                id: "chatcmpl-abc123",
                object: "chat.completion.chunk",
                model: "mistral-large-latest",
                created: 1700000000,
                choices: [
                    StreamChoice {
                        index: 0,
                        delta: ContentDelta { content: Some(" equals 4.") },
                        finish_reason: Some(FinishReason.Stop)
                    }
                ],
                usage: Some(Usage {
                    prompt_tokens: 20,
                    completion_tokens: 8,
                    total_tokens: 28
                })
            }
        ]

    FUNCTION sample_file_object() -> FileObject:
        RETURN FileObject {
            id: "file-abc123",
            object: "file",
            bytes: 1024,
            created_at: 1700000000,
            filename: "training_data.jsonl",
            purpose: FilePurpose.FineTune,
            status: FileStatus.Processed,
            status_details: None
        }

    FUNCTION sample_fine_tuning_job() -> FineTuningJob:
        RETURN FineTuningJob {
            id: "ftjob-abc123",
            object: "fine_tuning.job",
            model: "open-mistral-7b",
            fine_tuned_model: None,
            created_at: 1700000000,
            finished_at: None,
            status: FineTuningStatus.Running,
            training_files: ["file-abc123"],
            validation_files: None,
            hyperparameters: FineTuningHyperparams {
                training_steps: Some(1000),
                learning_rate: Some(0.0001),
                ..Default::default()
            },
            trained_tokens: Some(50000),
            metadata: None,
            integrations: None,
            repositories: None,
            suffix: Some("my-model"),
            auto_start: true
        }

    FUNCTION sample_agent() -> Agent:
        RETURN Agent {
            id: "agent-abc123",
            object: "agent",
            name: "Test Agent",
            description: Some("A test agent for unit tests"),
            model: "mistral-large-latest",
            instructions: Some("You are a helpful test assistant."),
            tools: Some([
                AgentTool.Function(FunctionTool {
                    type: "function",
                    function: FunctionDefinition {
                        name: "get_weather",
                        description: Some("Get weather for a city"),
                        parameters: json!({
                            "type": "object",
                            "properties": {
                                "city": {"type": "string"}
                            },
                            "required": ["city"]
                        })
                    }
                })
            ]),
            created_at: 1700000000,
            updated_at: None
        }

    FUNCTION sample_batch_job() -> BatchJob:
        RETURN BatchJob {
            id: "batch-abc123",
            object: "batch",
            input_files: ["file-input123"],
            endpoint: BatchEndpoint.ChatCompletions,
            model: "mistral-large-latest",
            status: BatchStatus.InProgress,
            created_at: 1700000000,
            started_at: Some(1700000100),
            completed_at: None,
            errors: None,
            output_file: None,
            error_file: None,
            metadata: None,
            total_requests: 100,
            completed_requests: 50,
            failed_requests: 0,
            timeout_hours: 24
        }
```

### 19.2 Mock Transport

```
CLASS MockTransport IMPLEMENTS HttpTransport:
    responses: Queue<MockResponse>
    recorded_requests: Vec<HttpRequest>
    delay: Option<Duration>

    STRUCT MockResponse:
        status: u16
        headers: Headers
        body: Bytes
        delay: Option<Duration>

    FUNCTION queue_response(response: MockResponse):
        responses.push_back(response)

    FUNCTION queue_json_response<T: Serialize>(status: u16, body: T):
        responses.push_back(MockResponse {
            status: status,
            headers: Headers.from([("Content-Type", "application/json")]),
            body: serialize_json(body).into_bytes(),
            delay: None
        })

    FUNCTION queue_sse_response(events: Vec<String>):
        body = events.join("\n\n")
        responses.push_back(MockResponse {
            status: 200,
            headers: Headers.from([("Content-Type", "text/event-stream")]),
            body: body.into_bytes(),
            delay: None
        })

    FUNCTION queue_error(status: u16, error_type: String, message: String):
        error_body = json!({
            "error": {
                "type": error_type,
                "message": message
            }
        })
        responses.push_back(MockResponse {
            status: status,
            headers: Headers.from([("Content-Type", "application/json")]),
            body: serialize_json(error_body).into_bytes(),
            delay: None
        })

    FUNCTION send(request: HttpRequest) -> Result<HttpResponse>:
        recorded_requests.push(request.clone())

        IF delay IS SOME:
            sleep(delay)

        IF responses.is_empty():
            RETURN Err(MockError.new("No mock response configured"))

        mock_response = responses.pop_front()

        IF mock_response.delay IS SOME:
            sleep(mock_response.delay)

        RETURN Ok(HttpResponse {
            status: mock_response.status,
            headers: mock_response.headers,
            body: mock_response.body
        })

    FUNCTION send_streaming(request: HttpRequest) -> Result<ByteStream>:
        recorded_requests.push(request.clone())

        IF responses.is_empty():
            RETURN Err(MockError.new("No mock response configured"))

        mock_response = responses.pop_front()

        // Create async stream from body
        stream = async_stream! {
            FOR chunk IN mock_response.body.chunks(256):
                YIELD Ok(chunk)
        }

        RETURN Ok(stream)

    FUNCTION get_recorded_requests() -> Vec<HttpRequest>:
        RETURN recorded_requests.clone()

    FUNCTION assert_request_count(expected: usize):
        ASSERT_EQ(recorded_requests.len(), expected)

    FUNCTION assert_last_request_url(expected: String):
        last = recorded_requests.last().expect("No requests recorded")
        ASSERT_EQ(last.url, expected)

    FUNCTION assert_last_request_method(expected: HttpMethod):
        last = recorded_requests.last().expect("No requests recorded")
        ASSERT_EQ(last.method, expected)
```

### 19.3 Integration Test Helpers

```
MODULE IntegrationTestHelpers:

    FUNCTION create_test_client(api_key: String) -> MistralClient:
        RETURN MistralClient.builder()
            .api_key(api_key)
            .base_url("https://api.mistral.ai")
            .timeout(Duration.from_secs(60))
            .retry(RetryConfig {
                max_attempts: 3,
                initial_delay: Duration.from_millis(100),
                max_delay: Duration.from_secs(5),
                backoff_multiplier: 2.0
            })
            .build()

    FUNCTION skip_if_no_api_key():
        IF env("MISTRAL_API_KEY").is_none():
            SKIP("MISTRAL_API_KEY not set")

    FUNCTION wait_for_job_completion(
        client: MistralClient,
        job_id: String,
        timeout: Duration
    ) -> Result<FineTuningJob>:

        deadline = now() + timeout
        poll_interval = Duration.from_secs(10)

        WHILE now() < deadline:
            job = client.fine_tuning().get(job_id)?

            MATCH job.status:
                FineTuningStatus.Success:
                    RETURN Ok(job)
                FineTuningStatus.Failed:
                    RETURN Err(TestError.new("Job failed"))
                FineTuningStatus.Cancelled:
                    RETURN Err(TestError.new("Job cancelled"))
                _:
                    sleep(poll_interval)

        RETURN Err(TestError.new("Timeout waiting for job"))

    FUNCTION create_test_file(client: MistralClient, content: String) -> Result<FileObject>:
        file_data = FileData {
            name: "test_file_" + random_string(8) + ".jsonl",
            content: content.into_bytes(),
            content_type: "application/jsonl"
        }

        RETURN client.files().upload(FileUploadRequest {
            file: file_data,
            purpose: FilePurpose.FineTune
        })

    FUNCTION cleanup_test_resources(client: MistralClient, resources: TestResources):
        FOR file_id IN resources.files:
            TRY client.files().delete(file_id)

        FOR job_id IN resources.fine_tuning_jobs:
            TRY:
                job = client.fine_tuning().get(job_id)?
                IF job.status.is_active():
                    client.fine_tuning().cancel(job_id)?

        FOR agent_id IN resources.agents:
            TRY client.agents().delete(agent_id)

        FOR batch_id IN resources.batch_jobs:
            TRY:
                job = client.batch().get(batch_id)?
                IF job.status.is_active():
                    client.batch().cancel(batch_id)?
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode part 3 |

---

**Pseudocode Phase Status: Part 3 COMPLETE**

*Files, Fine-Tuning, Agents, and Batch service pseudocode documented.*
