/**
 * AWS Secrets Manager Type Definitions
 *
 * Core types for the Secrets Manager integration following the SPARC specification.
 * Provides type-safe interfaces for secret retrieval, versioning, and rotation.
 *
 * @module types
 */

/**
 * AWS credentials for API requests.
 * Matches the standard AWS credential format used by other integrations.
 */
export interface AwsCredentials {
  /** AWS access key ID */
  accessKeyId: string;
  /** AWS secret access key */
  secretAccessKey: string;
  /** Optional session token for temporary credentials */
  sessionToken?: string;
  /** Optional expiration time for temporary credentials */
  expiration?: Date;
}

/**
 * Provider interface for retrieving AWS credentials.
 */
export interface CredentialProvider {
  /**
   * Retrieves AWS credentials.
   * @returns Promise resolving to valid AWS credentials
   */
  getCredentials(): Promise<AwsCredentials>;

  /**
   * Checks if the current credentials are expired.
   * @returns true if credentials are expired or not available
   */
  isExpired(): boolean;

  /**
   * Force refresh of credentials.
   * @returns Promise resolving to fresh credentials
   */
  refresh?(): Promise<AwsCredentials>;
}

/**
 * Version stage labels for AWS Secrets Manager.
 * Used to identify the lifecycle stage of a secret version.
 */
export type VersionStage = 'AWSCURRENT' | 'AWSPREVIOUS' | 'AWSPENDING';

/**
 * Options for retrieving a secret value.
 */
export interface GetSecretOptions {
  /**
   * Specific version ID to retrieve.
   * If not specified, retrieves the version marked as AWSCURRENT.
   */
  versionId?: string;

  /**
   * Version stage to retrieve (AWSCURRENT, AWSPREVIOUS, AWSPENDING).
   * Cannot be used together with versionId.
   */
  versionStage?: VersionStage;
}

/**
 * Options for listing secrets.
 */
export interface ListSecretsOptions {
  /**
   * Maximum number of results to return.
   * @default 100
   */
  maxResults?: number;

  /**
   * Pagination token from previous request.
   */
  nextToken?: string;

  /**
   * Filter secrets by name prefix.
   */
  filters?: SecretFilter[];

  /**
   * Include secrets marked for deletion.
   * @default false
   */
  includePlannedDeletion?: boolean;
}

/**
 * Filter for listing secrets.
 */
export interface SecretFilter {
  /**
   * Filter key.
   */
  key: 'description' | 'name' | 'tag-key' | 'tag-value' | 'primary-region' | 'owning-service' | 'all';

  /**
   * Filter values.
   */
  values: string[];
}

/**
 * Retrieved secret value.
 */
export interface SecretValue {
  /**
   * ARN of the secret.
   */
  arn: string;

  /**
   * Name of the secret.
   */
  name: string;

  /**
   * Secret value as a string.
   * Either secretString or secretBinary will be populated, not both.
   */
  secretString?: string;

  /**
   * Secret value as binary (base64 encoded).
   */
  secretBinary?: string;

  /**
   * Version ID of the retrieved secret.
   */
  versionId: string;

  /**
   * Version stages attached to this version.
   */
  versionStages: VersionStage[];

  /**
   * Date when this version was created.
   */
  createdDate: Date;
}

/**
 * Secret metadata without the value.
 */
export interface SecretMetadata {
  /**
   * ARN of the secret.
   */
  arn: string;

  /**
   * Name of the secret.
   */
  name: string;

  /**
   * Description of the secret.
   */
  description?: string;

  /**
   * KMS key ID used for encryption.
   */
  kmsKeyId?: string;

  /**
   * Whether rotation is enabled.
   */
  rotationEnabled: boolean;

  /**
   * ARN of the Lambda function that rotates the secret.
   */
  rotationLambdaArn?: string;

  /**
   * Rotation rules for the secret.
   */
  rotationRules?: RotationRules;

  /**
   * Date of the last rotation attempt.
   */
  lastRotatedDate?: Date;

  /**
   * Date when the secret was last accessed.
   */
  lastAccessedDate?: Date;

  /**
   * Date when the secret was last changed.
   */
  lastChangedDate?: Date;

  /**
   * Date when the secret is scheduled for deletion.
   */
  deletedDate?: Date;

  /**
   * Date when the secret was created.
   */
  createdDate: Date;

  /**
   * Tags attached to the secret.
   */
  tags: Record<string, string>;

  /**
   * Version IDs to stages mapping.
   */
  versionIdsToStages?: Record<string, VersionStage[]>;

  /**
   * Primary region for the secret.
   */
  primaryRegion?: string;

  /**
   * Replication status for multi-region secrets.
   */
  replicationStatus?: ReplicationStatus[];
}

/**
 * Rotation rules for a secret.
 */
export interface RotationRules {
  /**
   * Number of days between automatic rotations.
   */
  automaticallyAfterDays?: number;

  /**
   * Duration of the rotation window.
   */
  duration?: string;

  /**
   * Cron expression for rotation schedule.
   */
  scheduleExpression?: string;
}

/**
 * Replication status for multi-region secrets.
 */
export interface ReplicationStatus {
  /**
   * Region where the secret is replicated.
   */
  region: string;

  /**
   * KMS key ID in the replica region.
   */
  kmsKeyId?: string;

  /**
   * Replication status.
   */
  status: 'InSync' | 'Failed' | 'InProgress';

  /**
   * Status message.
   */
  statusMessage?: string;

  /**
   * Last access date in this region.
   */
  lastAccessedDate?: Date;
}

/**
 * Result of a rotation trigger.
 */
export interface RotationResult {
  /**
   * ARN of the secret.
   */
  arn: string;

  /**
   * Name of the secret.
   */
  name: string;

  /**
   * New version ID being created.
   */
  versionId: string;
}

/**
 * Response from listing secrets.
 */
export interface ListSecretsResponse {
  /**
   * List of secret metadata.
   */
  secrets: SecretMetadata[];

  /**
   * Token for the next page of results.
   */
  nextToken?: string;
}

/**
 * AWS API request for GetSecretValue.
 */
export interface GetSecretValueRequest {
  SecretId: string;
  VersionId?: string;
  VersionStage?: string;
}

/**
 * AWS API response for GetSecretValue.
 */
export interface GetSecretValueResponse {
  ARN: string;
  Name: string;
  VersionId: string;
  SecretString?: string;
  SecretBinary?: string;
  VersionStages: string[];
  CreatedDate: number;
}

/**
 * AWS API request for DescribeSecret.
 */
export interface DescribeSecretRequest {
  SecretId: string;
}

/**
 * AWS API response for DescribeSecret.
 */
export interface DescribeSecretResponse {
  ARN: string;
  Name: string;
  Description?: string;
  KmsKeyId?: string;
  RotationEnabled: boolean;
  RotationLambdaARN?: string;
  RotationRules?: {
    AutomaticallyAfterDays?: number;
    Duration?: string;
    ScheduleExpression?: string;
  };
  LastRotatedDate?: number;
  LastAccessedDate?: number;
  LastChangedDate?: number;
  DeletedDate?: number;
  CreatedDate: number;
  Tags?: Array<{ Key: string; Value: string }>;
  VersionIdsToStages?: Record<string, string[]>;
  PrimaryRegion?: string;
  ReplicationStatus?: Array<{
    Region: string;
    KmsKeyId?: string;
    Status: string;
    StatusMessage?: string;
    LastAccessedDate?: number;
  }>;
}

/**
 * AWS API request for ListSecrets.
 */
export interface ListSecretsRequest {
  MaxResults?: number;
  NextToken?: string;
  Filters?: Array<{
    Key: string;
    Values: string[];
  }>;
  IncludePlannedDeletion?: boolean;
}

/**
 * AWS API response for ListSecrets.
 */
export interface ListSecretsApiResponse {
  SecretList: DescribeSecretResponse[];
  NextToken?: string;
}

/**
 * AWS API request for RotateSecret.
 */
export interface RotateSecretRequest {
  SecretId: string;
  ClientRequestToken?: string;
  RotationLambdaARN?: string;
  RotationRules?: {
    AutomaticallyAfterDays?: number;
    Duration?: string;
    ScheduleExpression?: string;
  };
  RotateImmediately?: boolean;
}

/**
 * AWS API response for RotateSecret.
 */
export interface RotateSecretResponse {
  ARN: string;
  Name: string;
  VersionId: string;
}

/**
 * AWS error response structure.
 */
export interface AwsErrorResponse {
  __type?: string;
  message?: string;
  Message?: string;
}

/**
 * HTTP request structure.
 */
export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

/**
 * HTTP response structure.
 */
export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Signed request structure.
 */
export interface SignedRequest {
  headers: Record<string, string>;
  url: string;
  method: string;
  body?: string;
}

/**
 * Signing parameters for AWS SigV4.
 */
export interface SigningParams {
  region: string;
  service: string;
  credentials: AwsCredentials;
  date?: Date;
}
