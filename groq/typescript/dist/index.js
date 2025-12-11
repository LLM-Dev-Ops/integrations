"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  BearerAuthProvider: () => BearerAuthProvider,
  ChatStream: () => ChatStream,
  CircuitBreaker: () => CircuitBreaker,
  CircuitState: () => CircuitState,
  ConsoleLogger: () => ConsoleLogger,
  DefaultMetricsCollector: () => DefaultMetricsCollector,
  GroqClient: () => GroqClient,
  GroqClientBuilder: () => GroqClientBuilder,
  GroqConfig: () => GroqConfig,
  GroqConfigBuilder: () => GroqConfigBuilder,
  GroqError: () => GroqError,
  GroqErrorCode: () => GroqErrorCode,
  KnownModels: () => KnownModels,
  LogLevel: () => LogLevel,
  MockTransport: () => MockTransport,
  RateLimitManager: () => RateLimitManager,
  ResilienceOrchestrator: () => ResilienceOrchestrator,
  RetryPolicy: () => RetryPolicy,
  assistantMessage: () => assistantMessage,
  audioFromBuffer: () => audioFromBuffer,
  audioFromPath: () => audioFromPath,
  audioFromStream: () => audioFromStream,
  createBearerAuth: () => createBearerAuth,
  createMockTransport: () => createMockTransport,
  createTool: () => createTool,
  errorResponse: () => errorResponse,
  getContextWindow: () => getContextWindow,
  isGroqError: () => isGroqError,
  isKnownModel: () => isKnownModel,
  isRetryableError: () => isRetryableError,
  isWhisperModel: () => isWhisperModel,
  jsonResponse: () => jsonResponse,
  mockChatChunks: () => mockChatChunks,
  mockChatResponse: () => mockChatResponse,
  mockModel: () => mockModel,
  mockModelList: () => mockModelList,
  mockTranscriptionResponse: () => mockTranscriptionResponse,
  mockTranslationResponse: () => mockTranslationResponse,
  parseToolArguments: () => parseToolArguments,
  supportsVision: () => supportsVision,
  systemMessage: () => systemMessage,
  toolMessage: () => toolMessage,
  userMessage: () => userMessage
});
module.exports = __toCommonJS(index_exports);

// src/errors/index.ts
var GroqErrorCode = /* @__PURE__ */ ((GroqErrorCode2) => {
  GroqErrorCode2["Configuration"] = "configuration_error";
  GroqErrorCode2["Authentication"] = "authentication_error";
  GroqErrorCode2["Authorization"] = "authorization_error";
  GroqErrorCode2["Validation"] = "validation_error";
  GroqErrorCode2["Model"] = "model_error";
  GroqErrorCode2["ContextLength"] = "context_length_exceeded";
  GroqErrorCode2["ContentFilter"] = "content_filter_error";
  GroqErrorCode2["RateLimit"] = "rate_limit_error";
  GroqErrorCode2["Server"] = "server_error";
  GroqErrorCode2["Network"] = "network_error";
  GroqErrorCode2["Timeout"] = "timeout_error";
  GroqErrorCode2["Stream"] = "stream_error";
  GroqErrorCode2["CircuitOpen"] = "circuit_open";
  GroqErrorCode2["Unknown"] = "unknown_error";
  return GroqErrorCode2;
})(GroqErrorCode || {});
var GroqError = class _GroqError extends Error {
  /** Error code. */
  code;
  /** Additional error details. */
  details;
  constructor(code, message, details = {}) {
    super(message);
    this.name = "GroqError";
    this.code = code;
    this.details = details;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, _GroqError);
    }
  }
  /**
   * Returns true if this error is retryable.
   */
  isRetryable() {
    return [
      "rate_limit_error" /* RateLimit */,
      "server_error" /* Server */,
      "network_error" /* Network */,
      "timeout_error" /* Timeout */,
      "circuit_open" /* CircuitOpen */
    ].includes(this.code);
  }
  /**
   * Returns the retry-after duration in seconds if available.
   */
  getRetryAfter() {
    return this.details.retryAfter;
  }
  /**
   * Returns true if this error should trigger circuit breaker.
   */
  shouldCircuitBreak() {
    return this.code === "server_error" /* Server */ || this.code === "timeout_error" /* Timeout */ || this.details.statusCode !== void 0 && this.details.statusCode >= 500 && this.details.statusCode <= 504;
  }
  /**
   * Creates a configuration error.
   */
  static configuration(message) {
    return new _GroqError("configuration_error" /* Configuration */, message);
  }
  /**
   * Creates an authentication error.
   */
  static authentication(message, apiKeyHint) {
    return new _GroqError("authentication_error" /* Authentication */, message, { apiKeyHint });
  }
  /**
   * Creates a validation error.
   */
  static validation(message, param, value) {
    return new _GroqError("validation_error" /* Validation */, message, { param, value });
  }
  /**
   * Creates a model error.
   */
  static model(message, model) {
    return new _GroqError("model_error" /* Model */, message, { model });
  }
  /**
   * Creates a rate limit error.
   */
  static rateLimit(message, retryAfter) {
    return new _GroqError("rate_limit_error" /* RateLimit */, message, { retryAfter });
  }
  /**
   * Creates a server error.
   */
  static server(message, statusCode, requestId) {
    return new _GroqError("server_error" /* Server */, message, { statusCode, requestId });
  }
  /**
   * Creates a network error.
   */
  static network(message, cause) {
    return new _GroqError("network_error" /* Network */, message, { cause });
  }
  /**
   * Creates a timeout error.
   */
  static timeout(message) {
    return new _GroqError("timeout_error" /* Timeout */, message);
  }
  /**
   * Creates a stream error.
   */
  static stream(message) {
    return new _GroqError("stream_error" /* Stream */, message);
  }
  /**
   * Creates a circuit open error.
   */
  static circuitOpen() {
    return new _GroqError(
      "circuit_open" /* CircuitOpen */,
      "Circuit breaker open: service temporarily unavailable"
    );
  }
  /**
   * Converts to JSON.
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details
    };
  }
};
function isGroqError(error) {
  return error instanceof GroqError;
}
function isRetryableError(error) {
  if (isGroqError(error)) {
    return error.isRetryable();
  }
  return false;
}
function fromApiError(status, body, requestId) {
  const { error } = body;
  const errorType = error.type ?? "";
  switch (status) {
    case 401:
      return GroqError.authentication(error.message);
    case 403:
      return new GroqError("authorization_error" /* Authorization */, error.message);
    case 404:
      if (errorType === "model_not_found") {
        return GroqError.model(error.message, error.param);
      }
      return new GroqError("model_error" /* Model */, error.message);
    case 400:
      return GroqError.validation(error.message, error.param);
    case 429:
      return GroqError.rateLimit(error.message);
    default:
      if (status >= 500 && status < 600) {
        return GroqError.server(error.message, status, requestId);
      }
      return new GroqError("unknown_error" /* Unknown */, error.message, {
        statusCode: status,
        requestId
      });
  }
}

// src/config/index.ts
var DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
var DEFAULT_TIMEOUT_MS = 6e4;
var DEFAULT_MAX_RETRIES = 3;
var GroqConfig = class _GroqConfig {
  /** API key for authentication. */
  apiKey;
  /** Base URL for API requests. */
  baseUrl;
  /** Request timeout in milliseconds. */
  timeout;
  /** Maximum retry attempts. */
  maxRetries;
  /** Custom headers. */
  customHeaders;
  constructor(options) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.customHeaders = options.customHeaders ?? {};
  }
  /**
   * Creates a new configuration builder.
   */
  static builder() {
    return new GroqConfigBuilder();
  }
  /**
   * Creates a configuration from environment variables.
   */
  static fromEnv() {
    const apiKey = process.env["GROQ_API_KEY"];
    if (!apiKey) {
      throw GroqError.configuration("GROQ_API_KEY environment variable not set");
    }
    const builder = new GroqConfigBuilder().apiKey(apiKey);
    const baseUrl = process.env["GROQ_BASE_URL"];
    if (baseUrl) {
      builder.baseUrl(baseUrl);
    }
    const timeout = process.env["GROQ_TIMEOUT"];
    if (timeout) {
      const ms = parseInt(timeout, 10);
      if (!isNaN(ms)) {
        builder.timeout(ms);
      }
    }
    const maxRetries = process.env["GROQ_MAX_RETRIES"];
    if (maxRetries) {
      const retries = parseInt(maxRetries, 10);
      if (!isNaN(retries)) {
        builder.maxRetries(retries);
      }
    }
    return builder.build();
  }
  /**
   * Creates configuration from options.
   */
  static fromOptions(options) {
    return new _GroqConfig(options);
  }
  /**
   * Returns a hint of the API key for debugging.
   */
  getApiKeyHint() {
    if (this.apiKey.length > 4) {
      return `...${this.apiKey.slice(-4)}`;
    }
    return "****";
  }
  /**
   * Builds the full URL for an endpoint.
   */
  getEndpointUrl(path) {
    return `${this.baseUrl}/${path.replace(/^\//, "")}`;
  }
};
var GroqConfigBuilder = class {
  _apiKey;
  _baseUrl;
  _timeout;
  _maxRetries;
  _customHeaders = {};
  /**
   * Sets the API key.
   */
  apiKey(key) {
    this._apiKey = key;
    return this;
  }
  /**
   * Sets the API key from an environment variable.
   */
  apiKeyFromEnv(varName = "GROQ_API_KEY") {
    const key = process.env[varName];
    if (!key) {
      throw GroqError.configuration(`Environment variable ${varName} not set`);
    }
    this._apiKey = key;
    return this;
  }
  /**
   * Sets the base URL.
   */
  baseUrl(url) {
    this._baseUrl = url;
    return this;
  }
  /**
   * Sets the request timeout in milliseconds.
   */
  timeout(ms) {
    this._timeout = ms;
    return this;
  }
  /**
   * Sets the timeout in seconds.
   */
  timeoutSecs(secs) {
    this._timeout = secs * 1e3;
    return this;
  }
  /**
   * Sets the maximum retry attempts.
   */
  maxRetries(retries) {
    this._maxRetries = retries;
    return this;
  }
  /**
   * Adds a custom header.
   */
  header(name, value) {
    this._customHeaders[name] = value;
    return this;
  }
  /**
   * Builds the configuration.
   */
  build() {
    if (!this._apiKey) {
      throw GroqError.configuration("API key is required");
    }
    if (this._apiKey.length === 0) {
      throw GroqError.configuration("API key cannot be empty");
    }
    if (!this._apiKey.startsWith("gsk_")) {
      console.warn("API key does not match expected Groq format (gsk_*)");
    }
    if (this._baseUrl && !this._baseUrl.startsWith("https://")) {
      throw GroqError.configuration("Base URL must use HTTPS");
    }
    return GroqConfig.fromOptions({
      apiKey: this._apiKey,
      baseUrl: this._baseUrl,
      timeout: this._timeout,
      maxRetries: this._maxRetries,
      customHeaders: Object.keys(this._customHeaders).length > 0 ? this._customHeaders : void 0
    });
  }
};

// src/auth/index.ts
var BearerAuthProvider = class {
  apiKey;
  constructor(apiKey) {
    if (!apiKey || apiKey.length === 0) {
      throw new Error("API key cannot be empty");
    }
    this.apiKey = apiKey;
  }
  getAuthHeader() {
    return `Bearer ${this.apiKey}`;
  }
  getApiKeyHint() {
    if (this.apiKey.length > 4) {
      return `...${this.apiKey.slice(-4)}`;
    }
    return "****";
  }
};
function createBearerAuth(apiKey) {
  return new BearerAuthProvider(apiKey);
}

// src/transport/index.ts
var import_axios = __toESM(require("axios"));
var import_form_data = __toESM(require("form-data"));
var AxiosTransport = class {
  client;
  auth;
  config;
  constructor(config, auth) {
    this.config = config;
    this.auth = auth;
    this.client = import_axios.default.create({
      baseURL: config.baseUrl,
      timeout: config.timeout,
      headers: {
        "Content-Type": "application/json",
        ...config.customHeaders
      },
      validateStatus: () => true
      // Handle all status codes
    });
  }
  async request(req) {
    const axiosConfig = {
      method: req.method,
      url: req.path,
      headers: {
        Authorization: this.auth.getAuthHeader(),
        ...req.headers
      },
      timeout: req.timeout ?? this.config.timeout
    };
    if (req.body) {
      if (req.body instanceof import_form_data.default) {
        axiosConfig.data = req.body;
        axiosConfig.headers = {
          ...axiosConfig.headers,
          ...req.body.getHeaders()
        };
      } else {
        axiosConfig.data = req.body;
      }
    }
    try {
      const response = await this.client.request(axiosConfig);
      const requestId = this.extractRequestId(response);
      if (response.status >= 400) {
        throw this.handleErrorResponse(response.status, response.data, requestId);
      }
      return {
        status: response.status,
        headers: this.normalizeHeaders(response.headers),
        data: response.data,
        requestId
      };
    } catch (error) {
      if (error instanceof GroqError) {
        throw error;
      }
      if (import_axios.default.isAxiosError(error)) {
        if (error.code === "ECONNABORTED") {
          throw GroqError.timeout(`Request timed out after ${this.config.timeout}ms`);
        }
        if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
          throw GroqError.network(`Network error: ${error.message}`, error);
        }
        throw GroqError.network(error.message, error);
      }
      throw GroqError.network(
        error instanceof Error ? error.message : "Unknown network error"
      );
    }
  }
  async stream(req) {
    const axiosConfig = {
      method: req.method,
      url: req.path,
      headers: {
        Authorization: this.auth.getAuthHeader(),
        Accept: "text/event-stream",
        ...req.headers
      },
      timeout: 0,
      // No timeout for streaming
      responseType: "stream"
    };
    if (req.body) {
      axiosConfig.data = req.body;
    }
    try {
      const response = await this.client.request(axiosConfig);
      const requestId = this.extractRequestId(response);
      if (response.status >= 400) {
        const chunks = [];
        for await (const chunk of response.data) {
          chunks.push(chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
        throw this.handleErrorResponse(response.status, body, requestId);
      }
      return {
        events: this.createEventIterator(response.data),
        requestId
      };
    } catch (error) {
      if (error instanceof GroqError) {
        throw error;
      }
      if (import_axios.default.isAxiosError(error)) {
        throw GroqError.network(error.message, error);
      }
      throw GroqError.network(
        error instanceof Error ? error.message : "Unknown streaming error"
      );
    }
  }
  async *createEventIterator(stream) {
    let buffer = "";
    for await (const chunk of stream) {
      buffer += chunk.toString("utf-8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          const data = trimmed.slice(6);
          if (data !== "[DONE]") {
            yield data;
          }
        }
      }
    }
    if (buffer.trim().startsWith("data: ")) {
      const data = buffer.trim().slice(6);
      if (data !== "[DONE]") {
        yield data;
      }
    }
  }
  extractRequestId(response) {
    return response.headers["x-request-id"] ?? response.headers["x-groq-request-id"] ?? void 0;
  }
  normalizeHeaders(headers) {
    const result = {};
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === "string") {
        result[key.toLowerCase()] = value;
      } else if (Array.isArray(value)) {
        result[key.toLowerCase()] = value.join(", ");
      }
    }
    return result;
  }
  handleErrorResponse(status, data, requestId) {
    if (this.isApiErrorResponse(data)) {
      return fromApiError(status, data, requestId);
    }
    return GroqError.server(
      `HTTP ${status}: ${JSON.stringify(data)}`,
      status,
      requestId
    );
  }
  isApiErrorResponse(data) {
    return typeof data === "object" && data !== null && "error" in data && typeof data.error === "object" && "message" in data.error;
  }
};

// src/services/chat.ts
var ChatStream = class {
  response;
  constructor(response) {
    this.response = response;
  }
  /**
   * Returns the request ID.
   */
  get requestId() {
    return this.response.requestId;
  }
  async *[Symbol.asyncIterator]() {
    for await (const event of this.response.events) {
      try {
        const chunk = JSON.parse(event);
        yield chunk;
      } catch {
        throw GroqError.stream(`Failed to parse streaming chunk: ${event}`);
      }
    }
  }
  /**
   * Collects all chunks and assembles the full response.
   */
  async collect() {
    let id = "";
    let model = "";
    let created = 0;
    let systemFingerprint;
    let content = "";
    let finishReason = null;
    const toolCalls = /* @__PURE__ */ new Map();
    let usage = void 0;
    for await (const chunk of this) {
      id = chunk.id;
      model = chunk.model;
      created = chunk.created;
      systemFingerprint = chunk.system_fingerprint;
      if (chunk.usage) {
        usage = chunk.usage;
      }
      if (chunk.x_groq?.usage) {
        usage = chunk.x_groq.usage;
      }
      for (const choice of chunk.choices) {
        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
        const delta = choice.delta;
        if (delta.content) {
          content += delta.content;
        }
        if (delta.tool_calls) {
          this.accumulateToolCalls(delta.tool_calls, toolCalls);
        }
      }
    }
    const message = {
      role: "assistant",
      content: content || null,
      tool_calls: toolCalls.size > 0 ? Array.from(toolCalls.values()) : void 0
    };
    return {
      id,
      object: "chat.completion",
      created,
      model,
      system_fingerprint: systemFingerprint,
      choices: [
        {
          index: 0,
          message,
          finish_reason: finishReason
        }
      ],
      usage
    };
  }
  accumulateToolCalls(deltas, accumulated) {
    for (const delta of deltas) {
      const existing = accumulated.get(delta.index);
      if (!existing) {
        accumulated.set(delta.index, {
          id: delta.id ?? "",
          type: "function",
          function: {
            name: delta.function?.name ?? "",
            arguments: delta.function?.arguments ?? ""
          }
        });
      } else {
        if (delta.function?.arguments) {
          existing.function.arguments += delta.function.arguments;
        }
      }
    }
  }
};
var DefaultChatService = class {
  transport;
  constructor(transport) {
    this.transport = transport;
  }
  async create(request) {
    this.validateRequest(request);
    const response = await this.transport.request({
      method: "POST",
      path: "chat/completions",
      body: { ...request, stream: false }
    });
    return response.data;
  }
  async createStream(request) {
    this.validateRequest(request);
    const streamingResponse = await this.transport.stream({
      method: "POST",
      path: "chat/completions",
      body: {
        ...request,
        stream: true,
        stream_options: request.stream_options ?? { include_usage: true }
      }
    });
    return new ChatStream(streamingResponse);
  }
  validateRequest(request) {
    if (!request.model) {
      throw GroqError.validation("Model is required", "model");
    }
    if (!request.messages || request.messages.length === 0) {
      throw GroqError.validation("At least one message is required", "messages");
    }
    if (request.temperature !== void 0) {
      if (request.temperature < 0 || request.temperature > 2) {
        throw GroqError.validation(
          "Temperature must be between 0 and 2",
          "temperature",
          String(request.temperature)
        );
      }
    }
    if (request.top_p !== void 0) {
      if (request.top_p < 0 || request.top_p > 1) {
        throw GroqError.validation(
          "Top-p must be between 0 and 1",
          "top_p",
          String(request.top_p)
        );
      }
    }
    if (request.max_tokens !== void 0 && request.max_tokens <= 0) {
      throw GroqError.validation(
        "Max tokens must be positive",
        "max_tokens",
        String(request.max_tokens)
      );
    }
  }
};

// src/services/audio.ts
var import_fs = require("fs");
var import_form_data2 = __toESM(require("form-data"));
var DefaultAudioService = class {
  transport;
  constructor(transport) {
    this.transport = transport;
  }
  async transcribe(request) {
    this.validateTranscriptionRequest(request);
    const formData = await this.buildTranscriptionForm(request);
    const response = await this.transport.request({
      method: "POST",
      path: "audio/transcriptions",
      body: formData
    });
    return response.data;
  }
  async translate(request) {
    this.validateTranslationRequest(request);
    const formData = await this.buildTranslationForm(request);
    const response = await this.transport.request({
      method: "POST",
      path: "audio/translations",
      body: formData
    });
    return response.data;
  }
  validateTranscriptionRequest(request) {
    if (!request.file) {
      throw GroqError.validation("Audio file is required", "file");
    }
    if (!request.model) {
      throw GroqError.validation("Model is required", "model");
    }
    if (request.temperature !== void 0) {
      if (request.temperature < 0 || request.temperature > 1) {
        throw GroqError.validation(
          "Temperature must be between 0 and 1",
          "temperature",
          String(request.temperature)
        );
      }
    }
  }
  validateTranslationRequest(request) {
    if (!request.file) {
      throw GroqError.validation("Audio file is required", "file");
    }
    if (!request.model) {
      throw GroqError.validation("Model is required", "model");
    }
    if (request.temperature !== void 0) {
      if (request.temperature < 0 || request.temperature > 1) {
        throw GroqError.validation(
          "Temperature must be between 0 and 1",
          "temperature",
          String(request.temperature)
        );
      }
    }
  }
  async buildTranscriptionForm(request) {
    const form = new import_form_data2.default();
    await this.appendAudioFile(form, request.file);
    form.append("model", request.model);
    if (request.language) {
      form.append("language", request.language);
    }
    if (request.prompt) {
      form.append("prompt", request.prompt);
    }
    if (request.response_format) {
      form.append("response_format", request.response_format);
    }
    if (request.temperature !== void 0) {
      form.append("temperature", String(request.temperature));
    }
    if (request.timestamp_granularities && request.timestamp_granularities.length > 0) {
      for (const granularity of request.timestamp_granularities) {
        form.append("timestamp_granularities[]", granularity);
      }
    }
    return form;
  }
  async buildTranslationForm(request) {
    const form = new import_form_data2.default();
    await this.appendAudioFile(form, request.file);
    form.append("model", request.model);
    if (request.prompt) {
      form.append("prompt", request.prompt);
    }
    if (request.response_format) {
      form.append("response_format", request.response_format);
    }
    if (request.temperature !== void 0) {
      form.append("temperature", String(request.temperature));
    }
    return form;
  }
  async appendAudioFile(form, input) {
    switch (input.type) {
      case "path":
        form.append("file", (0, import_fs.createReadStream)(input.path));
        break;
      case "buffer":
        form.append("file", input.buffer, {
          filename: input.filename,
          contentType: this.getContentType(input.filename)
        });
        break;
      case "stream":
        form.append("file", input.stream, {
          filename: input.filename,
          contentType: this.getContentType(input.filename)
        });
        break;
    }
  }
  getContentType(filename) {
    const ext = filename.split(".").pop()?.toLowerCase();
    const contentTypes = {
      flac: "audio/flac",
      mp3: "audio/mpeg",
      mp4: "audio/mp4",
      mpeg: "audio/mpeg",
      mpga: "audio/mpeg",
      m4a: "audio/mp4",
      ogg: "audio/ogg",
      wav: "audio/wav",
      webm: "audio/webm"
    };
    return contentTypes[ext ?? ""] ?? "application/octet-stream";
  }
};

// src/services/models.ts
var DefaultModelsService = class {
  transport;
  constructor(transport) {
    this.transport = transport;
  }
  async list() {
    const response = await this.transport.request({
      method: "GET",
      path: "models"
    });
    return response.data;
  }
  async get(modelId) {
    if (!modelId || modelId.length === 0) {
      throw GroqError.validation("Model ID is required", "model");
    }
    const response = await this.transport.request({
      method: "GET",
      path: `models/${encodeURIComponent(modelId)}`
    });
    return response.data;
  }
};

// src/resilience/retry.ts
var DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1e3,
  maxDelayMs: 6e4,
  multiplier: 2,
  jitterFactor: 0.1
};
var RetryPolicy = class _RetryPolicy {
  config;
  constructor(config = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }
  /**
   * Executes a function with retry logic.
   */
  async execute(fn) {
    let lastError;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (!this.shouldRetry(error, attempt)) {
          throw lastError;
        }
        const delay = this.getDelay(error, attempt);
        await this.sleep(delay);
      }
    }
    throw lastError ?? new Error("Retry failed");
  }
  /**
   * Determines if a request should be retried.
   */
  shouldRetry(error, attempt) {
    if (attempt >= this.config.maxRetries) {
      return false;
    }
    return isRetryableError(error);
  }
  /**
   * Calculates the delay before the next retry.
   */
  getDelay(error, attempt) {
    if (error instanceof GroqError) {
      const retryAfter = error.getRetryAfter();
      if (retryAfter !== void 0) {
        return retryAfter * 1e3;
      }
    }
    const baseDelay = this.config.initialDelayMs * Math.pow(this.config.multiplier, attempt);
    const cappedDelay = Math.min(baseDelay, this.config.maxDelayMs);
    const jitter = cappedDelay * this.config.jitterFactor * (Math.random() * 2 - 1);
    return Math.max(0, cappedDelay + jitter);
  }
  /**
   * Sleeps for the specified duration.
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  /**
   * Creates a new retry policy with updated config.
   */
  withConfig(config) {
    return new _RetryPolicy({ ...this.config, ...config });
  }
};

// src/resilience/circuit_breaker.ts
var CircuitState = /* @__PURE__ */ ((CircuitState2) => {
  CircuitState2["Closed"] = "closed";
  CircuitState2["Open"] = "open";
  CircuitState2["HalfOpen"] = "half_open";
  return CircuitState2;
})(CircuitState || {});
var DEFAULT_CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,
  resetTimeoutMs: 3e4,
  successThreshold: 3,
  minimumRequests: 10
};
var CircuitBreaker = class {
  config;
  state = "closed" /* Closed */;
  failureCount = 0;
  successCount = 0;
  requestCount = 0;
  lastFailureTime = null;
  openedAt = null;
  constructor(config = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }
  /**
   * Gets the current circuit state.
   */
  getState() {
    this.checkStateTransition();
    return this.state;
  }
  /**
   * Checks if the circuit allows requests.
   */
  isAllowed() {
    this.checkStateTransition();
    return this.state !== "open" /* Open */;
  }
  /**
   * Executes a function with circuit breaker protection.
   */
  async execute(fn) {
    if (!this.isAllowed()) {
      throw GroqError.circuitOpen();
    }
    this.requestCount++;
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }
  /**
   * Records a successful request.
   */
  recordSuccess() {
    this.checkStateTransition();
    switch (this.state) {
      case "closed" /* Closed */:
        this.failureCount = 0;
        break;
      case "half_open" /* HalfOpen */:
        this.successCount++;
        if (this.successCount >= this.config.successThreshold) {
          this.close();
        }
        break;
      case "open" /* Open */:
        break;
    }
  }
  /**
   * Records a failed request.
   */
  recordFailure(error) {
    this.checkStateTransition();
    if (!this.shouldCountFailure(error)) {
      return;
    }
    this.lastFailureTime = Date.now();
    switch (this.state) {
      case "closed" /* Closed */:
        this.failureCount++;
        if (this.requestCount >= this.config.minimumRequests && this.failureCount >= this.config.failureThreshold) {
          this.open();
        }
        break;
      case "half_open" /* HalfOpen */:
        this.open();
        break;
      case "open" /* Open */:
        break;
    }
  }
  /**
   * Manually resets the circuit breaker.
   */
  reset() {
    this.state = "closed" /* Closed */;
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.lastFailureTime = null;
    this.openedAt = null;
  }
  /**
   * Gets circuit breaker statistics.
   */
  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      requestCount: this.requestCount,
      lastFailureTime: this.lastFailureTime
    };
  }
  open() {
    this.state = "open" /* Open */;
    this.openedAt = Date.now();
    this.successCount = 0;
  }
  close() {
    this.state = "closed" /* Closed */;
    this.failureCount = 0;
    this.successCount = 0;
    this.openedAt = null;
  }
  halfOpen() {
    this.state = "half_open" /* HalfOpen */;
    this.successCount = 0;
  }
  checkStateTransition() {
    if (this.state === "open" /* Open */ && this.openedAt !== null) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.config.resetTimeoutMs) {
        this.halfOpen();
      }
    }
  }
  shouldCountFailure(error) {
    if (!(error instanceof GroqError)) {
      return true;
    }
    return error.shouldCircuitBreak();
  }
};

// src/types/common.ts
function parseRateLimitInfo(headers) {
  const info = {};
  const limitRequests = headers["x-ratelimit-limit-requests"];
  if (limitRequests) {
    info.limitRequests = parseInt(limitRequests, 10);
  }
  const remainingRequests = headers["x-ratelimit-remaining-requests"];
  if (remainingRequests) {
    info.remainingRequests = parseInt(remainingRequests, 10);
  }
  const limitTokens = headers["x-ratelimit-limit-tokens"];
  if (limitTokens) {
    info.limitTokens = parseInt(limitTokens, 10);
  }
  const remainingTokens = headers["x-ratelimit-remaining-tokens"];
  if (remainingTokens) {
    info.remainingTokens = parseInt(remainingTokens, 10);
  }
  const resetRequests = headers["x-ratelimit-reset-requests"];
  if (resetRequests) {
    info.resetRequests = parseResetTime(resetRequests);
  }
  const resetTokens = headers["x-ratelimit-reset-tokens"];
  if (resetTokens) {
    info.resetTokens = parseResetTime(resetTokens);
  }
  return info;
}
function parseResetTime(value) {
  const match = value.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
  if (!match) {
    return 0;
  }
  const numStr = match[1];
  if (!numStr) {
    return 0;
  }
  const num = parseFloat(numStr);
  const unit = match[2] ?? "s";
  switch (unit) {
    case "ms":
      return num / 1e3;
    case "s":
      return num;
    case "m":
      return num * 60;
    case "h":
      return num * 3600;
    default:
      return num;
  }
}

// src/resilience/rate_limit.ts
var RateLimitManager = class {
  state = {
    requests: {},
    tokens: {},
    updatedAt: /* @__PURE__ */ new Date()
  };
  /**
   * Updates rate limit state from response headers.
   */
  updateFromHeaders(headers) {
    const info = parseRateLimitInfo(headers);
    this.updateFromInfo(info);
  }
  /**
   * Updates rate limit state from parsed info.
   */
  updateFromInfo(info) {
    const now = /* @__PURE__ */ new Date();
    if (info.limitRequests !== void 0) {
      this.state.requests.limit = info.limitRequests;
    }
    if (info.remainingRequests !== void 0) {
      this.state.requests.remaining = info.remainingRequests;
    }
    if (info.resetRequests !== void 0) {
      this.state.requests.resetAt = new Date(now.getTime() + info.resetRequests * 1e3);
    }
    if (info.limitTokens !== void 0) {
      this.state.tokens.limit = info.limitTokens;
    }
    if (info.remainingTokens !== void 0) {
      this.state.tokens.remaining = info.remainingTokens;
    }
    if (info.resetTokens !== void 0) {
      this.state.tokens.resetAt = new Date(now.getTime() + info.resetTokens * 1e3);
    }
    this.state.updatedAt = now;
  }
  /**
   * Checks if a request should be allowed based on current limits.
   */
  shouldAllowRequest() {
    if (this.state.requests.remaining === void 0) {
      return true;
    }
    if (this.state.requests.remaining <= 0) {
      if (this.state.requests.resetAt && /* @__PURE__ */ new Date() >= this.state.requests.resetAt) {
        return true;
      }
      return false;
    }
    return true;
  }
  /**
   * Gets the time until the rate limit resets in milliseconds.
   */
  getTimeUntilReset() {
    if (!this.state.requests.resetAt) {
      return void 0;
    }
    const now = /* @__PURE__ */ new Date();
    const resetTime = this.state.requests.resetAt;
    if (now >= resetTime) {
      return 0;
    }
    return resetTime.getTime() - now.getTime();
  }
  /**
   * Gets the current rate limit state.
   */
  getState() {
    return { ...this.state };
  }
  /**
   * Gets remaining requests, if known.
   */
  getRemainingRequests() {
    return this.state.requests.remaining;
  }
  /**
   * Gets remaining tokens, if known.
   */
  getRemainingTokens() {
    return this.state.tokens.remaining;
  }
  /**
   * Resets the rate limit state.
   */
  reset() {
    this.state = {
      requests: {},
      tokens: {},
      updatedAt: /* @__PURE__ */ new Date()
    };
  }
  /**
   * Estimates token usage for a request.
   * This is a rough estimate based on character count.
   */
  static estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }
};

// src/resilience/index.ts
var ResilienceOrchestrator = class {
  retryPolicy;
  circuitBreaker;
  rateLimitManager;
  enableRateLimitTracking;
  constructor(config = {}) {
    this.retryPolicy = new RetryPolicy(config.retry);
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
    this.rateLimitManager = new RateLimitManager();
    this.enableRateLimitTracking = config.enableRateLimitTracking ?? true;
  }
  /**
   * Executes a function with full resilience protection.
   */
  async execute(fn) {
    if (this.enableRateLimitTracking && !this.rateLimitManager.shouldAllowRequest()) {
      const waitTime = this.rateLimitManager.getTimeUntilReset();
      if (waitTime !== void 0 && waitTime > 0) {
        await this.sleep(waitTime);
      }
    }
    return this.circuitBreaker.execute(() => this.retryPolicy.execute(fn));
  }
  /**
   * Updates rate limits from response headers.
   */
  updateRateLimits(headers) {
    if (this.enableRateLimitTracking) {
      this.rateLimitManager.updateFromHeaders(headers);
    }
  }
  /**
   * Gets the rate limit manager.
   */
  getRateLimitManager() {
    return this.rateLimitManager;
  }
  /**
   * Gets the circuit breaker.
   */
  getCircuitBreaker() {
    return this.circuitBreaker;
  }
  /**
   * Resets all resilience state.
   */
  reset() {
    this.circuitBreaker.reset();
    this.rateLimitManager.reset();
  }
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};

// src/observability/logging.ts
var LogLevel = /* @__PURE__ */ ((LogLevel2) => {
  LogLevel2["Debug"] = "debug";
  LogLevel2["Info"] = "info";
  LogLevel2["Warn"] = "warn";
  LogLevel2["Error"] = "error";
  return LogLevel2;
})(LogLevel || {});
var LOG_LEVEL_PRIORITY = {
  ["debug" /* Debug */]: 0,
  ["info" /* Info */]: 1,
  ["warn" /* Warn */]: 2,
  ["error" /* Error */]: 3
};
var DEFAULT_LOG_CONFIG = {
  level: "info" /* Info */,
  timestamps: true,
  json: false
};
var ConsoleLogger = class _ConsoleLogger {
  config;
  baseContext;
  constructor(config = {}, baseContext = {}) {
    this.config = { ...DEFAULT_LOG_CONFIG, ...config };
    this.baseContext = { ...this.config.context, ...baseContext };
  }
  debug(message, context) {
    this.log("debug" /* Debug */, message, context);
  }
  info(message, context) {
    this.log("info" /* Info */, message, context);
  }
  warn(message, context) {
    this.log("warn" /* Warn */, message, context);
  }
  error(message, error, context) {
    this.log("error" /* Error */, message, context, error);
  }
  child(context) {
    return new _ConsoleLogger(this.config, { ...this.baseContext, ...context });
  }
  log(level, message, context, error) {
    if (!this.shouldLog(level)) {
      return;
    }
    const entry = {
      level,
      message,
      timestamp: /* @__PURE__ */ new Date(),
      context: { ...this.baseContext, ...context },
      error
    };
    if (this.config.json) {
      this.outputJson(entry);
    } else {
      this.outputText(entry);
    }
  }
  shouldLog(level) {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.level];
  }
  outputJson(entry) {
    const output = {
      level: entry.level,
      message: entry.message,
      timestamp: entry.timestamp.toISOString(),
      ...entry.context,
      ...entry.error && {
        error: {
          name: entry.error.name,
          message: entry.error.message,
          stack: entry.error.stack
        }
      }
    };
    console.log(JSON.stringify(output));
  }
  outputText(entry) {
    const parts = [];
    if (this.config.timestamps) {
      parts.push(`[${entry.timestamp.toISOString()}]`);
    }
    parts.push(`[${entry.level.toUpperCase()}]`);
    parts.push(entry.message);
    if (entry.context && Object.keys(entry.context).length > 0) {
      parts.push(JSON.stringify(entry.context));
    }
    const logFn = this.getLogFunction(entry.level);
    logFn(parts.join(" "));
    if (entry.error) {
      console.error(entry.error);
    }
  }
  getLogFunction(level) {
    switch (level) {
      case "debug" /* Debug */:
        return console.debug;
      case "info" /* Info */:
        return console.info;
      case "warn" /* Warn */:
        return console.warn;
      case "error" /* Error */:
        return console.error;
    }
  }
};
var NoopLogger = class {
  debug() {
  }
  info() {
  }
  warn() {
  }
  error() {
  }
  child() {
    return this;
  }
};

// src/observability/metrics.ts
var DefaultMetricsCollector = class {
  metrics = [];
  maxEntries;
  constructor(maxEntries = 1e3) {
    this.maxEntries = maxEntries;
  }
  record(metrics) {
    this.metrics.push(metrics);
    if (this.metrics.length > this.maxEntries) {
      this.metrics.shift();
    }
  }
  getAggregated() {
    const latencies = this.metrics.map((m) => m.durationMs).sort((a, b) => a - b);
    return {
      totalRequests: this.metrics.length,
      successfulRequests: this.metrics.filter((m) => m.success).length,
      failedRequests: this.metrics.filter((m) => !m.success).length,
      totalTokens: this.metrics.reduce((sum, m) => sum + (m.totalTokens ?? 0), 0),
      averageLatencyMs: this.average(latencies),
      p50LatencyMs: this.percentile(latencies, 50),
      p95LatencyMs: this.percentile(latencies, 95),
      p99LatencyMs: this.percentile(latencies, 99),
      byEndpoint: this.countBy((m) => m.endpoint),
      byModel: this.countBy((m) => m.model ?? "unknown"),
      byErrorCode: this.countBy((m) => m.errorCode ?? "none")
    };
  }
  reset() {
    this.metrics.length = 0;
  }
  average(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
  percentile(sortedValues, percentile) {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil(percentile / 100 * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)] ?? 0;
  }
  countBy(keyFn) {
    const result = {};
    for (const m of this.metrics) {
      const key = keyFn(m);
      result[key] = (result[key] ?? 0) + 1;
    }
    return result;
  }
};
var NoopMetricsCollector = class {
  record() {
  }
  getAggregated() {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      averageLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      byEndpoint: {},
      byModel: {},
      byErrorCode: {}
    };
  }
  reset() {
  }
};

// src/client/index.ts
var GroqClient = class _GroqClient {
  /** Chat completions service. */
  chat;
  /** Audio transcription/translation service. */
  audio;
  /** Models service. */
  models;
  config;
  transport;
  auth;
  resilience;
  logger;
  metrics;
  constructor(options = {}) {
    const configBuilder = GroqConfig.builder();
    if (options.apiKey) {
      configBuilder.apiKey(options.apiKey);
    } else if (process.env["GROQ_API_KEY"]) {
      configBuilder.apiKeyFromEnv();
    } else {
      throw new Error("API key is required. Provide apiKey option or set GROQ_API_KEY environment variable.");
    }
    if (options.baseUrl) {
      configBuilder.baseUrl(options.baseUrl);
    }
    if (options.timeout !== void 0) {
      configBuilder.timeout(options.timeout);
    }
    if (options.maxRetries !== void 0) {
      configBuilder.maxRetries(options.maxRetries);
    }
    if (options.customHeaders) {
      for (const [name, value] of Object.entries(options.customHeaders)) {
        configBuilder.header(name, value);
      }
    }
    this.config = configBuilder.build();
    this.auth = options.authProvider ?? new BearerAuthProvider(this.config.apiKey);
    this.transport = options.transport ?? new AxiosTransport(this.config, this.auth);
    this.resilience = new ResilienceOrchestrator(options.resilience);
    this.logger = options.logger ?? new NoopLogger();
    this.metrics = options.metrics ?? new NoopMetricsCollector();
    this.chat = new DefaultChatService(this.transport);
    this.audio = new DefaultAudioService(this.transport);
    this.models = new DefaultModelsService(this.transport);
  }
  /**
   * Gets the configuration.
   */
  getConfig() {
    return this.config;
  }
  /**
   * Gets the resilience orchestrator.
   */
  getResilience() {
    return this.resilience;
  }
  /**
   * Gets the logger.
   */
  getLogger() {
    return this.logger;
  }
  /**
   * Gets the metrics collector.
   */
  getMetrics() {
    return this.metrics;
  }
  /**
   * Creates a new client builder.
   */
  static builder() {
    return new GroqClientBuilder();
  }
  /**
   * Creates a client from environment variables.
   */
  static fromEnv() {
    return new _GroqClient();
  }
};
var GroqClientBuilder = class {
  options = {};
  /**
   * Sets the API key.
   */
  apiKey(key) {
    this.options.apiKey = key;
    return this;
  }
  /**
   * Sets the API key from an environment variable.
   */
  apiKeyFromEnv(varName = "GROQ_API_KEY") {
    const key = process.env[varName];
    if (!key) {
      throw new Error(`Environment variable ${varName} not set`);
    }
    this.options.apiKey = key;
    return this;
  }
  /**
   * Sets the base URL.
   */
  baseUrl(url) {
    this.options.baseUrl = url;
    return this;
  }
  /**
   * Sets the request timeout in milliseconds.
   */
  timeout(ms) {
    this.options.timeout = ms;
    return this;
  }
  /**
   * Sets the timeout in seconds.
   */
  timeoutSecs(secs) {
    this.options.timeout = secs * 1e3;
    return this;
  }
  /**
   * Sets the maximum retry attempts.
   */
  maxRetries(retries) {
    this.options.maxRetries = retries;
    return this;
  }
  /**
   * Adds a custom header.
   */
  header(name, value) {
    this.options.customHeaders = this.options.customHeaders ?? {};
    this.options.customHeaders[name] = value;
    return this;
  }
  /**
   * Sets the resilience configuration.
   */
  resilience(config) {
    this.options.resilience = config;
    return this;
  }
  /**
   * Sets the logger.
   */
  logger(logger) {
    this.options.logger = logger;
    return this;
  }
  /**
   * Enables console logging at the specified level.
   */
  withConsoleLogging(level = "info" /* Info */) {
    this.options.logger = new ConsoleLogger({ level });
    return this;
  }
  /**
   * Sets the metrics collector.
   */
  metrics(collector) {
    this.options.metrics = collector;
    return this;
  }
  /**
   * Enables default metrics collection.
   */
  withMetrics(maxEntries = 1e3) {
    this.options.metrics = new DefaultMetricsCollector(maxEntries);
    return this;
  }
  /**
   * Sets a custom transport (for testing).
   */
  transport(transport) {
    this.options.transport = transport;
    return this;
  }
  /**
   * Sets a custom auth provider.
   */
  authProvider(provider) {
    this.options.authProvider = provider;
    return this;
  }
  /**
   * Builds the client.
   */
  build() {
    return new GroqClient(this.options);
  }
};

// src/types/models.ts
var KnownModels = {
  // LLaMA models
  LLAMA_3_3_70B_VERSATILE: "llama-3.3-70b-versatile",
  LLAMA_3_3_70B_SPECDEC: "llama-3.3-70b-specdec",
  LLAMA_3_2_90B_VISION: "llama-3.2-90b-vision-preview",
  LLAMA_3_2_11B_VISION: "llama-3.2-11b-vision-preview",
  LLAMA_3_2_3B: "llama-3.2-3b-preview",
  LLAMA_3_2_1B: "llama-3.2-1b-preview",
  LLAMA_3_1_70B_VERSATILE: "llama-3.1-70b-versatile",
  LLAMA_3_1_8B_INSTANT: "llama-3.1-8b-instant",
  LLAMA_GUARD_3_8B: "llama-guard-3-8b",
  // Mixtral models
  MIXTRAL_8X7B: "mixtral-8x7b-32768",
  // Gemma models
  GEMMA_2_9B: "gemma2-9b-it",
  GEMMA_7B: "gemma-7b-it",
  // Whisper models
  WHISPER_LARGE_V3: "whisper-large-v3",
  WHISPER_LARGE_V3_TURBO: "whisper-large-v3-turbo",
  DISTIL_WHISPER: "distil-whisper-large-v3-en",
  // Other models
  LLAVA_V1_5_7B: "llava-v1.5-7b-4096-preview"
};
function isKnownModel(modelId) {
  return Object.values(KnownModels).includes(modelId);
}
function supportsVision(modelId) {
  return modelId.includes("vision") || modelId.includes("llava");
}
function isWhisperModel(modelId) {
  return modelId.includes("whisper");
}
function getContextWindow(modelId) {
  const contextWindows = {
    "llama-3.3-70b-versatile": 128e3,
    "llama-3.3-70b-specdec": 8192,
    "llama-3.2-90b-vision-preview": 8192,
    "llama-3.2-11b-vision-preview": 8192,
    "llama-3.2-3b-preview": 8192,
    "llama-3.2-1b-preview": 8192,
    "llama-3.1-70b-versatile": 128e3,
    "llama-3.1-8b-instant": 128e3,
    "mixtral-8x7b-32768": 32768,
    "gemma2-9b-it": 8192,
    "gemma-7b-it": 8192
  };
  return contextWindows[modelId];
}

// src/mocks/index.ts
var MockTransport = class {
  responses = /* @__PURE__ */ new Map();
  defaultResponse;
  recordedRequests = [];
  constructor(defaultResponse) {
    this.defaultResponse = defaultResponse ?? {
      status: 200,
      data: {}
    };
  }
  /**
   * Configures a response for a specific path.
   */
  onPath(path, response) {
    const existing = this.responses.get(path) ?? [];
    existing.push(response);
    this.responses.set(path, existing);
    return this;
  }
  /**
   * Clears all configured responses.
   */
  clearResponses() {
    this.responses.clear();
    return this;
  }
  /**
   * Gets recorded requests.
   */
  getRecordedRequests() {
    return [...this.recordedRequests];
  }
  /**
   * Clears recorded requests.
   */
  clearRecordedRequests() {
    this.recordedRequests.length = 0;
    return this;
  }
  async request(req) {
    this.recordedRequests.push({ request: req, timestamp: /* @__PURE__ */ new Date() });
    const response = this.getNextResponse(req.path);
    if (response.delay) {
      await this.sleep(response.delay);
    }
    if (response.error) {
      throw response.error;
    }
    return {
      status: response.status,
      headers: response.headers ?? {},
      data: response.data,
      requestId: "mock-request-id"
    };
  }
  async stream(req) {
    this.recordedRequests.push({ request: req, timestamp: /* @__PURE__ */ new Date() });
    const response = this.getNextResponse(req.path);
    if (response.delay) {
      await this.sleep(response.delay);
    }
    if (response.error) {
      throw response.error;
    }
    const chunks = Array.isArray(response.data) ? response.data : [response.data];
    return {
      events: this.createChunkIterator(chunks),
      requestId: "mock-request-id"
    };
  }
  getNextResponse(path) {
    const responses = this.responses.get(path);
    if (!responses || responses.length === 0) {
      return this.defaultResponse;
    }
    if (responses.length > 1) {
      return responses.shift() ?? this.defaultResponse;
    }
    return responses[0] ?? this.defaultResponse;
  }
  async *createChunkIterator(chunks) {
    for (const chunk of chunks) {
      yield JSON.stringify(chunk);
    }
  }
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};
function createMockTransport(defaultResponse) {
  return new MockTransport(defaultResponse);
}
function jsonResponse(data, status = 200) {
  return { status, data };
}
function errorResponse(message, status = 500, code) {
  return {
    status,
    data: {
      error: {
        message,
        type: code ?? "server_error"
      }
    }
  };
}
function mockChatResponse(content, model = KnownModels.LLAMA_3_3_70B_VERSATILE) {
  return {
    id: "chatcmpl-mock-123",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1e3),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content
        },
        finish_reason: "stop"
      }
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
      prompt_time: 1e-3,
      completion_time: 0.05,
      total_time: 0.051
    }
  };
}
function mockChatChunks(content, model = KnownModels.LLAMA_3_3_70B_VERSATILE) {
  const id = "chatcmpl-mock-stream-123";
  const created = Math.floor(Date.now() / 1e3);
  const words = content.split(" ");
  const chunks = [];
  chunks.push({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: { role: "assistant", content: "" },
        finish_reason: null
      }
    ]
  });
  for (let i = 0; i < words.length; i++) {
    const word = i === 0 ? words[i] : " " + words[i];
    chunks.push({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [
        {
          index: 0,
          delta: { content: word },
          finish_reason: null
        }
      ]
    });
  }
  chunks.push({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: "stop"
      }
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: words.length,
      total_tokens: 10 + words.length
    }
  });
  return chunks;
}
function mockTranscriptionResponse(text) {
  return {
    text,
    task: "transcribe",
    language: "en",
    duration: 10.5
  };
}
function mockTranslationResponse(text) {
  return {
    text,
    task: "translate",
    language: "es",
    duration: 10.5
  };
}
function mockModel(id) {
  return {
    id,
    object: "model",
    created: Math.floor(Date.now() / 1e3),
    owned_by: "groq",
    active: true,
    context_window: 8192
  };
}
function mockModelList() {
  return {
    object: "list",
    data: [
      mockModel(KnownModels.LLAMA_3_3_70B_VERSATILE),
      mockModel(KnownModels.LLAMA_3_1_8B_INSTANT),
      mockModel(KnownModels.MIXTRAL_8X7B),
      mockModel(KnownModels.WHISPER_LARGE_V3)
    ]
  };
}

// src/types/chat.ts
function systemMessage(content) {
  return { role: "system", content };
}
function userMessage(content) {
  return { role: "user", content };
}
function assistantMessage(content, toolCalls) {
  const msg = { role: "assistant", content };
  if (toolCalls && toolCalls.length > 0) {
    msg.tool_calls = toolCalls;
  }
  return msg;
}
function toolMessage(toolCallId, content) {
  return { role: "tool", tool_call_id: toolCallId, content };
}

// src/types/tools.ts
function createTool(name, description, parameters) {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters
    }
  };
}
function parseToolArguments(toolCall) {
  try {
    return JSON.parse(toolCall.function.arguments);
  } catch {
    throw new Error(`Failed to parse tool arguments for ${toolCall.function.name}`);
  }
}

// src/types/audio.ts
function audioFromPath(path) {
  return { type: "path", path };
}
function audioFromBuffer(buffer, filename) {
  return { type: "buffer", buffer, filename };
}
function audioFromStream(stream, filename) {
  return { type: "stream", stream, filename };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BearerAuthProvider,
  ChatStream,
  CircuitBreaker,
  CircuitState,
  ConsoleLogger,
  DefaultMetricsCollector,
  GroqClient,
  GroqClientBuilder,
  GroqConfig,
  GroqConfigBuilder,
  GroqError,
  GroqErrorCode,
  KnownModels,
  LogLevel,
  MockTransport,
  RateLimitManager,
  ResilienceOrchestrator,
  RetryPolicy,
  assistantMessage,
  audioFromBuffer,
  audioFromPath,
  audioFromStream,
  createBearerAuth,
  createMockTransport,
  createTool,
  errorResponse,
  getContextWindow,
  isGroqError,
  isKnownModel,
  isRetryableError,
  isWhisperModel,
  jsonResponse,
  mockChatChunks,
  mockChatResponse,
  mockModel,
  mockModelList,
  mockTranscriptionResponse,
  mockTranslationResponse,
  parseToolArguments,
  supportsVision,
  systemMessage,
  toolMessage,
  userMessage
});
