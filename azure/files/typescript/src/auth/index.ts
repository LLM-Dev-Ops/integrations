/**
 * Azure Files Authentication Module
 *
 * Provides authentication support for Azure Files REST API.
 */

import { AzureCredentials, API_VERSION } from "../config/index.js";
import { ConfigurationError } from "../errors.js";
import { SharedKeyAuthProvider, createSharedKeyAuth } from "./shared-key.js";
import { SasTokenAuthProvider, createSasTokenAuth } from "./sas.js";

export { SharedKeyAuthProvider, createSharedKeyAuth } from "./shared-key.js";
export {
  SasTokenAuthProvider,
  createSasTokenAuth,
  SasGenerator,
  createSasGenerator,
  type SasPermissions,
  type SasGenerationOptions,
  type SasToken,
} from "./sas.js";

/**
 * Combined auth provider interface.
 */
export interface AzureAuthProvider {
  /**
   * Sign a request or return modified URL/headers.
   */
  signRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    contentLength?: number
  ): { url: string; headers: Record<string, string> };

  /**
   * Get the account name associated with this provider.
   */
  getAccountName(): string;
}

/**
 * Shared key auth provider wrapper.
 */
class SharedKeyAuthProviderWrapper implements AzureAuthProvider {
  private provider: SharedKeyAuthProvider;
  private accountName: string;

  constructor(accountName: string, accountKey: string) {
    this.accountName = accountName;
    this.provider = createSharedKeyAuth(accountName, accountKey);
  }

  signRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    contentLength?: number
  ): { url: string; headers: Record<string, string> } {
    const signed = this.provider.signRequest(method, url, headers, contentLength ?? 0);
    return { url, headers: signed.headers };
  }

  getAccountName(): string {
    return this.accountName;
  }
}

/**
 * SAS token auth provider wrapper.
 */
class SasTokenAuthProviderWrapper implements AzureAuthProvider {
  private provider: SasTokenAuthProvider;
  private accountName: string;

  constructor(accountName: string, token: string) {
    this.accountName = accountName;
    this.provider = createSasTokenAuth(token);
  }

  signRequest(
    _method: string,
    url: string,
    headers: Record<string, string>,
    _contentLength?: number
  ): { url: string; headers: Record<string, string> } {
    // Add required headers but don't sign - SAS is appended to URL
    const newHeaders = {
      ...headers,
      "x-ms-date": new Date().toUTCString(),
      "x-ms-version": API_VERSION,
    };

    return {
      url: this.provider.applyToUrl(url),
      headers: newHeaders,
    };
  }

  getAccountName(): string {
    return this.accountName;
  }
}

/**
 * Create an auth provider from credentials.
 */
export function createAuthProvider(
  credentials: AzureCredentials,
  accountName?: string
): AzureAuthProvider {
  switch (credentials.type) {
    case "shared_key":
      return new SharedKeyAuthProviderWrapper(credentials.accountName, credentials.accountKey);

    case "sas_token":
      if (!accountName) {
        throw new ConfigurationError(
          "Account name must be provided when using SAS token authentication",
          "MissingCredentials"
        );
      }
      return new SasTokenAuthProviderWrapper(accountName, credentials.token);

    case "connection_string":
      return parseConnectionString(credentials.connectionString);

    default:
      throw new ConfigurationError(
        "Invalid credentials type",
        "MissingCredentials"
      );
  }
}

/**
 * Parse Azure Storage connection string and create auth provider.
 */
function parseConnectionString(connectionString: string): AzureAuthProvider {
  const parts = new Map<string, string>();

  for (const part of connectionString.split(";")) {
    const [key, ...valueParts] = part.split("=");
    if (key && valueParts.length > 0) {
      parts.set(key, valueParts.join("="));
    }
  }

  const accountName = parts.get("AccountName");
  const accountKey = parts.get("AccountKey");
  const sasToken = parts.get("SharedAccessSignature");

  if (accountName && accountKey) {
    return new SharedKeyAuthProviderWrapper(accountName, accountKey);
  }

  if (accountName && sasToken) {
    return new SasTokenAuthProviderWrapper(accountName, sasToken);
  }

  throw new ConfigurationError(
    "Connection string must contain either AccountKey or SharedAccessSignature",
    "MissingCredentials"
  );
}
