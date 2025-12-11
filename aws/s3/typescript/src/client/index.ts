/**
 * S3 Client
 *
 * High-level client for S3 operations.
 */

import { S3Config, configBuilder } from "../config";
import {
  AwsCredentials,
  CredentialsProvider,
  ChainCredentialsProvider,
} from "../credentials";
import { ConfigurationError } from "../error";
import { AwsSignerV4 } from "../signing";
import { HttpTransport, FetchTransport } from "../transport";
import {
  ObjectsService,
  BucketsService,
  MultipartService,
  TaggingService,
  PresignService,
} from "../services";

/**
 * S3 Client interface.
 */
export interface S3Client {
  /** Objects service for object operations. */
  objects(): ObjectsService;

  /** Buckets service for bucket operations. */
  buckets(): BucketsService;

  /** Multipart service for multipart upload operations. */
  multipart(): MultipartService;

  /** Tagging service for object/bucket tagging operations. */
  tagging(): TaggingService;

  /** Presign service for generating presigned URLs. */
  presign(): PresignService;

  /** Get the configuration. */
  config(): S3Config;
}

/**
 * S3 Client implementation.
 */
export class S3ClientImpl implements S3Client {
  private _config: S3Config;
  private _transport: HttpTransport;
  private _signer: AwsSignerV4;
  private _credentialsProvider?: CredentialsProvider;

  private _objectsService?: ObjectsService;
  private _bucketsService?: BucketsService;
  private _multipartService?: MultipartService;
  private _taggingService?: TaggingService;
  private _presignService?: PresignService;

  constructor(
    config: S3Config,
    transport: HttpTransport,
    signer: AwsSignerV4,
    credentialsProvider?: CredentialsProvider
  ) {
    this._config = config;
    this._transport = transport;
    this._signer = signer;
    this._credentialsProvider = credentialsProvider;
  }

  objects(): ObjectsService {
    if (!this._objectsService) {
      this._objectsService = new ObjectsService(this._config, this._transport, this._signer);
    }
    return this._objectsService;
  }

  buckets(): BucketsService {
    if (!this._bucketsService) {
      this._bucketsService = new BucketsService(this._config, this._transport, this._signer);
    }
    return this._bucketsService;
  }

  multipart(): MultipartService {
    if (!this._multipartService) {
      this._multipartService = new MultipartService(this._config, this._transport, this._signer);
    }
    return this._multipartService;
  }

  tagging(): TaggingService {
    if (!this._taggingService) {
      this._taggingService = new TaggingService(this._config, this._transport, this._signer);
    }
    return this._taggingService;
  }

  presign(): PresignService {
    if (!this._presignService) {
      this._presignService = new PresignService(this._config, this._signer);
    }
    return this._presignService;
  }

  config(): S3Config {
    return this._config;
  }

  /**
   * Refresh credentials if using a credentials provider.
   */
  async refreshCredentials(): Promise<void> {
    if (this._credentialsProvider) {
      const credentials = await this._credentialsProvider.refreshCredentials?.();
      if (credentials) {
        this._signer.updateCredentials(credentials);
      }
    }
  }
}

/**
 * S3 Client builder.
 */
export class S3ClientBuilder {
  private _config?: S3Config;
  private _credentials?: AwsCredentials;
  private _credentialsProvider?: CredentialsProvider;
  private _transport?: HttpTransport;
  private _fromEnv: boolean = false;

  /**
   * Set the configuration.
   */
  config(config: S3Config): this {
    this._config = config;
    return this;
  }

  /**
   * Set explicit credentials.
   */
  credentials(credentials: AwsCredentials): this {
    this._credentials = credentials;
    return this;
  }

  /**
   * Set a credentials provider.
   */
  credentialsProvider(provider: CredentialsProvider): this {
    this._credentialsProvider = provider;
    return this;
  }

  /**
   * Set a custom HTTP transport.
   */
  transport(transport: HttpTransport): this {
    this._transport = transport;
    return this;
  }

  /**
   * Load configuration from environment variables.
   */
  fromEnv(): this {
    this._fromEnv = true;
    return this;
  }

  /**
   * Build the S3 client.
   */
  async build(): Promise<S3Client> {
    // Build configuration
    let config: S3Config;
    if (this._config) {
      config = this._config;
    } else if (this._fromEnv) {
      config = configBuilder().fromEnv().build();
    } else {
      throw new ConfigurationError("Configuration must be provided");
    }

    // Get credentials
    let credentials: AwsCredentials;
    let credentialsProvider: CredentialsProvider | undefined;

    if (this._credentials) {
      credentials = this._credentials;
    } else if (config.credentials) {
      credentials = config.credentials;
    } else if (this._credentialsProvider) {
      credentialsProvider = this._credentialsProvider;
      credentials = await credentialsProvider.getCredentials();
    } else {
      // Use default chain
      credentialsProvider = new ChainCredentialsProvider();
      credentials = await credentialsProvider.getCredentials();
    }

    // Create transport
    const transport = this._transport ?? new FetchTransport(config.timeout);

    // Create signer
    const signer = new AwsSignerV4(credentials, config.region, "s3");

    return new S3ClientImpl(config, transport, signer, credentialsProvider);
  }
}

/**
 * Create a new S3 client builder.
 */
export function clientBuilder(): S3ClientBuilder {
  return new S3ClientBuilder();
}

/**
 * Create an S3 client from environment variables.
 */
export async function createClientFromEnv(): Promise<S3Client> {
  return clientBuilder().fromEnv().build();
}

/**
 * Create an S3 client with explicit configuration.
 */
export async function createClient(config: S3Config): Promise<S3Client> {
  return clientBuilder().config(config).build();
}
