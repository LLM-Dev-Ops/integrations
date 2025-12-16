/**
 * Environment variable loading for DynamoDB configuration.
 * @module config/environment
 */

import type { DynamoDBConfig, CredentialsConfig } from './config.js';
import { DEFAULT_REGION } from './defaults.js';

/**
 * Loads DynamoDB configuration from environment variables.
 *
 * Supported environment variables:
 * - AWS_REGION: AWS region (e.g., 'us-east-1', 'eu-west-1')
 * - AWS_ACCESS_KEY_ID: AWS access key ID for static credentials
 * - AWS_SECRET_ACCESS_KEY: AWS secret access key for static credentials
 * - AWS_SESSION_TOKEN: Optional AWS session token for temporary credentials
 * - AWS_PROFILE: AWS profile name for profile-based credentials
 * - AWS_ROLE_ARN: ARN of the IAM role to assume
 * - AWS_EXTERNAL_ID: External ID for role assumption
 * - AWS_WEB_IDENTITY_TOKEN_FILE: Path to web identity token file
 * - DYNAMODB_ENDPOINT: Custom DynamoDB endpoint (e.g., 'http://localhost:8000')
 * - DYNAMODB_LOCAL: Set to 'true' to use local DynamoDB endpoint
 *
 * @returns DynamoDB configuration populated from environment variables
 */
export function loadConfigFromEnv(): DynamoDBConfig {
  const config: DynamoDBConfig = {};

  // Load region
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (region) {
    config.region = region;
  } else {
    config.region = DEFAULT_REGION;
  }

  // Load credentials
  config.credentials = loadCredentialsFromEnv();

  // Load endpoint
  const endpoint = process.env.DYNAMODB_ENDPOINT;
  if (endpoint) {
    config.endpoint = endpoint;
  } else if (process.env.DYNAMODB_LOCAL === 'true') {
    // Default local DynamoDB endpoint
    config.endpoint = 'http://localhost:8000';
  }

  return config;
}

/**
 * Loads credentials configuration from environment variables.
 *
 * Priority order:
 * 1. Web Identity (if AWS_WEB_IDENTITY_TOKEN_FILE is set)
 * 2. Role (if AWS_ROLE_ARN is set without web identity)
 * 3. Static credentials (if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set)
 * 4. Profile (if AWS_PROFILE is set)
 * 5. Environment (default fallback for AWS SDK credential chain)
 *
 * @returns Credentials configuration or undefined if no credentials are found
 */
function loadCredentialsFromEnv(): CredentialsConfig | undefined {
  // Web Identity credentials (highest priority for EKS/ECS)
  const webIdentityTokenFile = process.env.AWS_WEB_IDENTITY_TOKEN_FILE;
  const roleArn = process.env.AWS_ROLE_ARN;

  if (webIdentityTokenFile && roleArn) {
    return {
      type: 'webIdentity',
      roleArn,
      tokenFile: webIdentityTokenFile,
    };
  }

  // Role credentials (without web identity)
  if (roleArn) {
    const externalId = process.env.AWS_EXTERNAL_ID;
    return {
      type: 'role',
      roleArn,
      externalId,
    };
  }

  // Static credentials
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;

  if (accessKeyId && secretAccessKey) {
    return {
      type: 'static',
      accessKeyId,
      secretAccessKey,
      sessionToken,
    };
  }

  // Profile credentials
  const profile = process.env.AWS_PROFILE;
  if (profile) {
    return {
      type: 'profile',
      profileName: profile,
    };
  }

  // Default to environment credential chain
  // This allows the AWS SDK to use its default credential provider chain
  // (instance metadata, ECS task role, etc.)
  return {
    type: 'environment',
  };
}

/**
 * Gets an environment variable value.
 *
 * @param key - Environment variable key
 * @param defaultValue - Default value if the variable is not set
 * @returns Environment variable value or default
 */
export function getEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

/**
 * Gets an environment variable as a number.
 *
 * @param key - Environment variable key
 * @param defaultValue - Default value if the variable is not set or invalid
 * @returns Environment variable value as number or default
 */
export function getEnvNumber(key: string, defaultValue?: number): number | undefined {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    return defaultValue;
  }

  return parsed;
}

/**
 * Gets an environment variable as a boolean.
 *
 * @param key - Environment variable key
 * @param defaultValue - Default value if the variable is not set
 * @returns Environment variable value as boolean or default
 */
export function getEnvBoolean(key: string, defaultValue = false): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }

  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Checks if running in AWS Lambda environment.
 *
 * @returns True if running in Lambda
 */
export function isLambdaEnvironment(): boolean {
  return process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;
}

/**
 * Checks if running in AWS ECS environment.
 *
 * @returns True if running in ECS
 */
export function isECSEnvironment(): boolean {
  return process.env.ECS_CONTAINER_METADATA_URI !== undefined ||
         process.env.ECS_CONTAINER_METADATA_URI_V4 !== undefined;
}

/**
 * Checks if running in AWS EKS environment.
 *
 * @returns True if running in EKS
 */
export function isEKSEnvironment(): boolean {
  return process.env.AWS_WEB_IDENTITY_TOKEN_FILE !== undefined &&
         process.env.AWS_ROLE_ARN !== undefined;
}
