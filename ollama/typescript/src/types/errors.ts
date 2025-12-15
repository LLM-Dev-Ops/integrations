/**
 * Ollama Integration - Error Types
 *
 * Comprehensive error handling types for the Ollama client.
 * Based on SPARC specification for error categorization and recovery.
 */

/**
 * Ollama error codes
 */
export enum OllamaErrorCode {
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  SERVER_NOT_RUNNING = 'SERVER_NOT_RUNNING',
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  MODEL_LOADING = 'MODEL_LOADING',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONTEXT_LENGTH_ERROR = 'CONTEXT_LENGTH_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  STREAM_ERROR = 'STREAM_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SIMULATION_ERROR = 'SIMULATION_ERROR',
}

/**
 * Base Ollama error class with recovery hints and retry logic
 */
export class OllamaError extends Error {
  readonly code: OllamaErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: OllamaErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'OllamaError';
    this.code = code;
    this.details = details;

    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, OllamaError);
    }
  }

  /**
   * Check if error is retryable
   *
   * Retryable errors are typically transient and may succeed on retry.
   */
  isRetryable(): boolean {
    return [
      OllamaErrorCode.SERVER_NOT_RUNNING,
      OllamaErrorCode.MODEL_LOADING,
      OllamaErrorCode.CONNECTION_ERROR,
      OllamaErrorCode.TIMEOUT_ERROR,
      OllamaErrorCode.STREAM_ERROR,
      OllamaErrorCode.INTERNAL_ERROR,
    ].includes(this.code);
  }

  /**
   * Get recovery hint for this error
   *
   * Provides actionable guidance for resolving the error.
   */
  recoveryHint(): string | undefined {
    switch (this.code) {
      case OllamaErrorCode.SERVER_NOT_RUNNING:
        return "Run 'ollama serve' or start the Ollama application";
      case OllamaErrorCode.MODEL_NOT_FOUND:
        const model = this.details?.model as string;
        return model ? `Run 'ollama pull ${model}' to download the model` : undefined;
      case OllamaErrorCode.MODEL_LOADING:
        return 'Wait for the model to finish loading and retry';
      case OllamaErrorCode.CONTEXT_LENGTH_ERROR:
        return 'Reduce prompt size or increase context window via num_ctx option';
      case OllamaErrorCode.TIMEOUT_ERROR:
        return 'Increase timeout or use a smaller/faster model';
      default:
        return undefined;
    }
  }

  /**
   * Create connection error
   */
  static connectionError(message: string, address: string, cause?: string): OllamaError {
    return new OllamaError(
      OllamaErrorCode.CONNECTION_ERROR,
      message,
      { address, cause }
    );
  }

  /**
   * Create server not running error
   */
  static serverNotRunning(message?: string): OllamaError {
    return new OllamaError(
      OllamaErrorCode.SERVER_NOT_RUNNING,
      message || 'Ollama server is not running',
      { hint: "Run 'ollama serve' or start the Ollama application" }
    );
  }

  /**
   * Create model not found error
   */
  static modelNotFound(model: string, available?: string[]): OllamaError {
    return new OllamaError(
      OllamaErrorCode.MODEL_NOT_FOUND,
      `Model not found: ${model}`,
      { model, available }
    );
  }

  /**
   * Create model loading error
   */
  static modelLoading(model: string, progress?: number): OllamaError {
    return new OllamaError(
      OllamaErrorCode.MODEL_LOADING,
      `Model is loading: ${model}`,
      { model, progress }
    );
  }

  /**
   * Create validation error
   */
  static validationError(message: string, field?: string, value?: string): OllamaError {
    return new OllamaError(
      OllamaErrorCode.VALIDATION_ERROR,
      message,
      { field, value }
    );
  }

  /**
   * Create context length error
   */
  static contextLengthError(
    message: string,
    maxContext: number,
    requested: number
  ): OllamaError {
    return new OllamaError(
      OllamaErrorCode.CONTEXT_LENGTH_ERROR,
      message,
      { maxContext, requested }
    );
  }

  /**
   * Create timeout error
   */
  static timeout(operation: string, timeoutMs: number): OllamaError {
    return new OllamaError(
      OllamaErrorCode.TIMEOUT_ERROR,
      `${operation} timed out after ${timeoutMs}ms`,
      { operation, timeoutMs }
    );
  }

  /**
   * Create stream error
   */
  static streamError(message: string, partialResponse?: string): OllamaError {
    return new OllamaError(
      OllamaErrorCode.STREAM_ERROR,
      message,
      { partialResponse }
    );
  }

  /**
   * Create internal error
   */
  static internalError(message: string, statusCode?: number): OllamaError {
    return new OllamaError(
      OllamaErrorCode.INTERNAL_ERROR,
      message,
      { statusCode }
    );
  }

  /**
   * Create simulation error
   */
  static simulationError(message: string, cause: string): OllamaError {
    return new OllamaError(
      OllamaErrorCode.SIMULATION_ERROR,
      message,
      { cause }
    );
  }
}
