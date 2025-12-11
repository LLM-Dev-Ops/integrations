/**
 * OAuth2 Error Mapping
 *
 * Map RFC 6749 error codes to error classes.
 */

import {
  OAuth2Error,
  AuthorizationError,
  ProviderError,
  TokenError,
} from "./types";

/**
 * OAuth2 error response from provider.
 */
export interface OAuth2ErrorResponse {
  error: string;
  error_description?: string;
  error_uri?: string;
}

/**
 * Map RFC 6749 authorization error codes.
 */
export function mapAuthorizationError(
  response: OAuth2ErrorResponse,
  requestId?: string
): AuthorizationError {
  const { error, error_description, error_uri } = response;
  const message = error_description || error;

  switch (error) {
    case "access_denied":
      return new AuthorizationError(message, "AccessDenied", {
        errorCode: error,
        errorUri: error_uri,
        requestId,
      });

    case "invalid_request":
      return new AuthorizationError(message, "InvalidRequest", {
        errorCode: error,
        errorUri: error_uri,
        requestId,
      });

    case "invalid_scope":
      return new AuthorizationError(message, "InvalidScope", {
        errorCode: error,
        errorUri: error_uri,
        requestId,
      });

    case "server_error":
      return new AuthorizationError(message, "ServerError", {
        errorCode: error,
        errorUri: error_uri,
        requestId,
      });

    case "temporarily_unavailable":
      return new AuthorizationError(message, "TemporarilyUnavailable", {
        errorCode: error,
        errorUri: error_uri,
        requestId,
      });

    // Device flow errors (RFC 8628)
    case "authorization_pending":
      // This is not really an error, handled separately
      return new AuthorizationError(message, "InvalidRequest", {
        errorCode: error,
        requestId,
      });

    case "slow_down":
      return new AuthorizationError(message, "SlowDown", {
        errorCode: error,
        requestId,
      });

    case "expired_token":
      return new AuthorizationError(message, "DeviceCodeExpired", {
        errorCode: error,
        requestId,
      });

    default:
      return new AuthorizationError(message, "InvalidRequest", {
        errorCode: error,
        errorUri: error_uri,
        requestId,
      });
  }
}

/**
 * Map RFC 6749 token error codes.
 */
export function mapTokenError(
  response: OAuth2ErrorResponse,
  requestId?: string
): ProviderError {
  const { error, error_description, error_uri } = response;
  const message = error_description || error;

  switch (error) {
    case "invalid_client":
      return new ProviderError(message, "InvalidClient", {
        errorCode: error,
        errorDescription: error_description,
        requestId,
      });

    case "invalid_grant":
      return new ProviderError(message, "InvalidGrant", {
        errorCode: error,
        errorDescription: error_description,
        requestId,
      });

    case "invalid_request":
      return new ProviderError(message, "InvalidRequest", {
        errorCode: error,
        errorDescription: error_description,
        requestId,
      });

    case "invalid_scope":
      return new ProviderError(message, "InvalidScope", {
        errorCode: error,
        errorDescription: error_description,
        requestId,
      });

    case "unauthorized_client":
      return new ProviderError(message, "UnauthorizedClient", {
        errorCode: error,
        errorDescription: error_description,
        requestId,
      });

    case "unsupported_grant_type":
      return new ProviderError(message, "UnsupportedGrantType", {
        errorCode: error,
        errorDescription: error_description,
        requestId,
      });

    case "server_error":
      return new ProviderError(message, "ServerError", {
        errorCode: error,
        errorDescription: error_description,
        requestId,
        retryable: true,
      });

    case "temporarily_unavailable":
      return new ProviderError(message, "TemporarilyUnavailable", {
        errorCode: error,
        errorDescription: error_description,
        requestId,
        retryable: true,
      });

    default:
      return new ProviderError(message, "InvalidRequest", {
        errorCode: error,
        errorDescription: error_description,
        requestId,
      });
  }
}

/**
 * Parse error from HTTP response body.
 */
export function parseErrorResponse(body: string): OAuth2ErrorResponse | null {
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed.error === "string") {
      return {
        error: parsed.error,
        error_description: parsed.error_description,
        error_uri: parsed.error_uri,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Create error from HTTP response.
 */
export function createErrorFromResponse(
  status: number,
  body: string,
  requestId?: string
): OAuth2Error {
  const errorResponse = parseErrorResponse(body);

  if (errorResponse) {
    // Token endpoint errors
    return mapTokenError(errorResponse, requestId);
  }

  // No standard error response, create based on status
  switch (status) {
    case 400:
      return new ProviderError("Bad request", "InvalidRequest", { requestId });
    case 401:
      return new ProviderError("Unauthorized", "InvalidClient", { requestId });
    case 403:
      return new ProviderError("Forbidden", "UnauthorizedClient", { requestId });
    case 429:
      return new ProviderError("Rate limited", "TemporarilyUnavailable", {
        requestId,
        retryable: true,
      });
    case 500:
    case 502:
    case 503:
    case 504:
      return new ProviderError("Server error", "ServerError", {
        requestId,
        retryable: true,
      });
    default:
      return new ProviderError(`HTTP ${status}`, "ServerError", { requestId });
  }
}
