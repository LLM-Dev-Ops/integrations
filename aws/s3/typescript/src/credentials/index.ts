/**
 * AWS Credentials Management
 *
 * Provides credential types and providers for AWS authentication.
 */

import { CredentialsError } from "../error";
import * as fs from "fs";
import * as path from "path";

/**
 * AWS credentials.
 */
export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date;
}

/**
 * Create long-term credentials.
 */
export function createCredentials(
  accessKeyId: string,
  secretAccessKey: string
): AwsCredentials {
  return { accessKeyId, secretAccessKey };
}

/**
 * Create temporary credentials with session token.
 */
export function createTemporaryCredentials(
  accessKeyId: string,
  secretAccessKey: string,
  sessionToken: string,
  expiration?: Date
): AwsCredentials {
  return { accessKeyId, secretAccessKey, sessionToken, expiration };
}

/**
 * Check if credentials are expired.
 */
export function isExpired(credentials: AwsCredentials): boolean {
  if (!credentials.expiration) {
    return false;
  }
  return new Date() >= credentials.expiration;
}

/**
 * Check if credentials will expire within the given milliseconds.
 */
export function willExpireWithin(credentials: AwsCredentials, ms: number): boolean {
  if (!credentials.expiration) {
    return false;
  }
  return new Date(Date.now() + ms) >= credentials.expiration;
}

/**
 * Check if credentials are temporary (have session token).
 */
export function isTemporary(credentials: AwsCredentials): boolean {
  return credentials.sessionToken !== undefined;
}

/**
 * Credentials provider interface.
 */
export interface CredentialsProvider {
  /**
   * Get credentials from this provider.
   */
  getCredentials(): Promise<AwsCredentials>;

  /**
   * Refresh credentials if possible.
   */
  refreshCredentials?(): Promise<AwsCredentials>;

  /**
   * Provider name for debugging.
   */
  readonly name: string;
}

/**
 * Static credentials provider for explicit configuration.
 */
export class StaticCredentialsProvider implements CredentialsProvider {
  readonly name = "static";
  private credentials: AwsCredentials;

  constructor(credentials: AwsCredentials) {
    this.credentials = credentials;
  }

  async getCredentials(): Promise<AwsCredentials> {
    if (isExpired(this.credentials)) {
      throw new CredentialsError(
        `Credentials expired at ${this.credentials.expiration?.toISOString()}`,
        "Expired"
      );
    }
    return this.credentials;
  }
}

/**
 * Environment variables credentials provider.
 */
export class EnvCredentialsProvider implements CredentialsProvider {
  readonly name = "environment";

  async getCredentials(): Promise<AwsCredentials> {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!accessKeyId || !secretAccessKey) {
      throw new CredentialsError(
        "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set",
        "NotFound"
      );
    }

    const sessionToken = process.env.AWS_SESSION_TOKEN;

    return {
      accessKeyId,
      secretAccessKey,
      sessionToken,
    };
  }
}

/**
 * Profile file credentials provider.
 */
export class ProfileCredentialsProvider implements CredentialsProvider {
  readonly name = "profile";
  private profileName: string;
  private credentialsFilePath?: string;

  constructor(profileName?: string, credentialsFilePath?: string) {
    this.profileName = profileName ?? process.env.AWS_PROFILE ?? "default";
    this.credentialsFilePath = credentialsFilePath;
  }

  async getCredentials(): Promise<AwsCredentials> {
    const filePath = this.getCredentialsFilePath();

    if (!fs.existsSync(filePath)) {
      throw new CredentialsError(
        `Credentials file not found: ${filePath}`,
        "ProfileError"
      );
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const credentials = this.parseCredentialsFile(content);

    const profile = credentials[this.profileName];
    if (!profile) {
      throw new CredentialsError(
        `Profile not found: ${this.profileName}`,
        "ProfileError"
      );
    }

    if (!profile.aws_access_key_id || !profile.aws_secret_access_key) {
      throw new CredentialsError(
        `Incomplete credentials in profile: ${this.profileName}`,
        "ProfileError"
      );
    }

    return {
      accessKeyId: profile.aws_access_key_id,
      secretAccessKey: profile.aws_secret_access_key,
      sessionToken: profile.aws_session_token,
    };
  }

  private getCredentialsFilePath(): string {
    if (this.credentialsFilePath) {
      return this.credentialsFilePath;
    }

    if (process.env.AWS_SHARED_CREDENTIALS_FILE) {
      return process.env.AWS_SHARED_CREDENTIALS_FILE;
    }

    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
    return path.join(homeDir, ".aws", "credentials");
  }

  private parseCredentialsFile(
    content: string
  ): Record<string, Record<string, string>> {
    const result: Record<string, Record<string, string>> = {};
    let currentProfile = "";

    for (const line of content.split("\n")) {
      const trimmed = line.trim();

      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        currentProfile = trimmed.slice(1, -1);
        result[currentProfile] = {};
      } else if (currentProfile && trimmed.includes("=")) {
        const [key, ...valueParts] = trimmed.split("=");
        result[currentProfile][key.trim()] = valueParts.join("=").trim();
      }
    }

    return result;
  }
}

/**
 * IMDS (EC2 Instance Metadata Service) configuration.
 */
export interface ImdsConfig {
  endpoint?: string;
  version?: "v1" | "v2" | "auto";
  timeout?: number;
  retries?: number;
  tokenTtlSeconds?: number;
}

/**
 * IMDS credentials provider for EC2/ECS environments.
 */
export class ImdsCredentialsProvider implements CredentialsProvider {
  readonly name = "imds";
  private config: Required<ImdsConfig>;
  private cachedToken?: { token: string; expiresAt: Date };
  private cachedCredentials?: AwsCredentials;

  constructor(config?: ImdsConfig) {
    this.config = {
      endpoint: config?.endpoint ?? "http://169.254.169.254",
      version: config?.version ?? "auto",
      timeout: config?.timeout ?? 1000,
      retries: config?.retries ?? 3,
      tokenTtlSeconds: config?.tokenTtlSeconds ?? 21600,
    };
  }

  async getCredentials(): Promise<AwsCredentials> {
    // Check cache first
    if (this.cachedCredentials && !willExpireWithin(this.cachedCredentials, 5 * 60 * 1000)) {
      return this.cachedCredentials;
    }

    // Check for ECS environment
    if (this.isEcsEnvironment()) {
      return this.getEcsCredentials();
    }

    // Try IMDS
    const credentials = await this.fetchImdsCredentials();
    this.cachedCredentials = credentials;
    return credentials;
  }

  async refreshCredentials(): Promise<AwsCredentials> {
    this.cachedCredentials = undefined;
    return this.getCredentials();
  }

  private isEcsEnvironment(): boolean {
    return (
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI !== undefined ||
      process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI !== undefined
    );
  }

  private async getEcsCredentials(): Promise<AwsCredentials> {
    let url: string;

    if (process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI) {
      url = `http://169.254.170.2${process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI}`;
    } else if (process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI) {
      url = process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI;
    } else {
      throw new CredentialsError("ECS credentials URI not found", "ImdsError");
    }

    const response = await this.fetchWithRetry(url, {
      headers: process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN
        ? { Authorization: process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN }
        : undefined,
    });

    return this.parseCredentialsResponse(response);
  }

  private async fetchImdsCredentials(): Promise<AwsCredentials> {
    let token: string | undefined;

    // Try to get IMDSv2 token
    if (this.config.version === "v2" || this.config.version === "auto") {
      try {
        token = await this.getImdsToken();
      } catch {
        if (this.config.version === "v2") {
          throw new CredentialsError("Failed to get IMDSv2 token", "ImdsError");
        }
        // Fall back to v1 for "auto"
      }
    }

    // Get role name
    const roleUrl = `${this.config.endpoint}/latest/meta-data/iam/security-credentials/`;
    const roleResponse = await this.fetchWithRetry(roleUrl, {
      headers: token ? { "X-aws-ec2-metadata-token": token } : undefined,
    });

    const roleName = roleResponse.trim().split("\n")[0];
    if (!roleName) {
      throw new CredentialsError("No IAM role found", "ImdsError");
    }

    // Get credentials for role
    const credentialsUrl = `${this.config.endpoint}/latest/meta-data/iam/security-credentials/${roleName}`;
    const credentialsResponse = await this.fetchWithRetry(credentialsUrl, {
      headers: token ? { "X-aws-ec2-metadata-token": token } : undefined,
    });

    return this.parseCredentialsResponse(credentialsResponse);
  }

  private async getImdsToken(): Promise<string> {
    // Check cache
    if (this.cachedToken && this.cachedToken.expiresAt > new Date()) {
      return this.cachedToken.token;
    }

    const url = `${this.config.endpoint}/latest/api/token`;
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "X-aws-ec2-metadata-token-ttl-seconds": String(this.config.tokenTtlSeconds),
      },
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new CredentialsError(`Failed to get IMDS token: ${response.status}`, "ImdsError");
    }

    const token = await response.text();
    this.cachedToken = {
      token,
      expiresAt: new Date(Date.now() + (this.config.tokenTtlSeconds - 60) * 1000),
    };

    return token;
  }

  private async fetchWithRetry(
    url: string,
    options?: { headers?: Record<string, string> }
  ): Promise<string> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: options?.headers,
          signal: AbortSignal.timeout(this.config.timeout),
        });

        if (response.status === 401) {
          throw new CredentialsError("IMDSv2 token required", "ImdsError");
        }

        if (!response.ok) {
          throw new CredentialsError(`IMDS request failed: ${response.status}`, "ImdsError");
        }

        return await response.text();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.config.retries) {
          await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attempt)));
        }
      }
    }

    throw lastError ?? new CredentialsError("IMDS request failed after retries", "ImdsError");
  }

  private parseCredentialsResponse(response: string): AwsCredentials {
    interface CredentialsJson {
      AccessKeyId: string;
      SecretAccessKey: string;
      Token?: string;
      Expiration?: string;
    }

    const json: CredentialsJson = JSON.parse(response);

    return {
      accessKeyId: json.AccessKeyId,
      secretAccessKey: json.SecretAccessKey,
      sessionToken: json.Token,
      expiration: json.Expiration ? new Date(json.Expiration) : undefined,
    };
  }
}

/**
 * Chain credentials provider that tries multiple sources.
 */
export class ChainCredentialsProvider implements CredentialsProvider {
  readonly name = "chain";
  private providers: CredentialsProvider[];

  constructor(providers?: CredentialsProvider[]) {
    this.providers = providers ?? [
      new EnvCredentialsProvider(),
      new ProfileCredentialsProvider(),
      new ImdsCredentialsProvider(),
    ];
  }

  async getCredentials(): Promise<AwsCredentials> {
    const errors: string[] = [];

    for (const provider of this.providers) {
      try {
        return await provider.getCredentials();
      } catch (error) {
        errors.push(`${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new CredentialsError(
      `No credentials found. Tried: ${errors.join("; ")}`,
      "NotFound"
    );
  }

  async refreshCredentials(): Promise<AwsCredentials> {
    // Find the provider that has credentials and refresh them
    for (const provider of this.providers) {
      try {
        await provider.getCredentials();
        if (provider.refreshCredentials) {
          return await provider.refreshCredentials();
        }
        return await provider.getCredentials();
      } catch {
        continue;
      }
    }

    throw new CredentialsError("No credentials to refresh", "RefreshFailed");
  }
}
