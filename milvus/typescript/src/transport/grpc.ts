import * as grpc from '@grpc/grpc-js';
import { MilvusConfig, AuthConfig } from '../config/types.js';
import {
  MilvusConnectionError,
  MilvusTimeoutError,
} from '../errors/index.js';
import { executeWithRetry, withTimeout } from './retry.js';

/**
 * gRPC transport layer for Milvus communication.
 */
export class GrpcTransport {
  private client: grpc.Client | null = null;
  private readonly config: MilvusConfig;

  constructor(config: MilvusConfig) {
    this.config = config;
    // Auth metadata is created when needed
    this.createMetadata(config.auth);
  }

  /**
   * Connect to Milvus server.
   */
  async connect(): Promise<void> {
    const address = `${this.config.host}:${this.config.port}`;
    const credentials = this.createCredentials();

    try {
      // For a real implementation, we would load Milvus proto definitions
      // and create the proper gRPC client. Here we provide a simplified version.
      await withTimeout(
        this.establishConnection(address, credentials),
        this.config.poolConfig.connectTimeoutMs,
        `Connection to ${address} timed out`
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('timed out')) {
        throw new MilvusTimeoutError(
          `Connection to ${address} timed out`,
          this.config.poolConfig.connectTimeoutMs
        );
      }
      throw new MilvusConnectionError(
        `Failed to connect to ${address}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Close the connection.
   */
  async close(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.client !== null;
  }

  /**
   * Execute a gRPC call with retry.
   */
  async call<TRequest, TResponse>(
    method: string,
    request: TRequest
  ): Promise<TResponse> {
    return executeWithRetry(
      async () => {
        if (!this.client) {
          throw new MilvusConnectionError('Not connected to Milvus');
        }

        return await withTimeout(
          this.executeCall<TRequest, TResponse>(method, request),
          this.config.timeoutMs,
          `Call to ${method} timed out`
        );
      },
      {
        operationName: method,
        config: this.config.retryConfig,
      }
    );
  }

  /**
   * Create gRPC credentials based on TLS configuration.
   */
  private createCredentials(): grpc.ChannelCredentials {
    if (this.config.tls) {
      // For TLS connections
      // In a real implementation, we would read cert files here
      return grpc.credentials.createSsl();
    }
    return grpc.credentials.createInsecure();
  }

  /**
   * Create metadata with authentication headers.
   */
  private createMetadata(auth: AuthConfig): grpc.Metadata {
    const metadata = new grpc.Metadata();

    switch (auth.type) {
      case 'token':
        metadata.add('authorization', `Bearer ${auth.token}`);
        break;
      case 'userPass':
        metadata.add('username', auth.username);
        metadata.add('password', auth.password);
        break;
      case 'none':
      default:
        break;
    }

    return metadata;
  }

  /**
   * Establish connection to Milvus.
   */
  private async establishConnection(
    address: string,
    credentials: grpc.ChannelCredentials
  ): Promise<void> {
    // In a real implementation, we would:
    // 1. Load the Milvus proto definitions
    // 2. Create the gRPC client
    // 3. Wait for the channel to be ready

    return new Promise((resolve, reject) => {
      // Simulated connection - in production, use actual proto loading
      const channel = new grpc.Channel(address, credentials, {});

      const deadline = Date.now() + this.config.poolConfig.connectTimeoutMs;

      channel.watchConnectivityState(
        grpc.connectivityState.IDLE,
        deadline,
        (error) => {
          if (error) {
            reject(error);
            return;
          }

          const state = channel.getConnectivityState(true);
          if (state === grpc.connectivityState.READY) {
            resolve();
          } else {
            // Wait for READY state
            const checkReady = () => {
              const currentState = channel.getConnectivityState(false);
              if (currentState === grpc.connectivityState.READY) {
                resolve();
              } else if (
                currentState === grpc.connectivityState.TRANSIENT_FAILURE ||
                currentState === grpc.connectivityState.SHUTDOWN
              ) {
                reject(new Error(`Connection failed: state=${currentState}`));
              } else {
                setTimeout(checkReady, 100);
              }
            };
            checkReady();
          }
        }
      );
    });
  }

  /**
   * Execute a single gRPC call.
   */
  private executeCall<TRequest, TResponse>(
    _method: string,
    _request: TRequest
  ): Promise<TResponse> {
    return new Promise((_resolve, reject) => {
      // In a real implementation, this would call the actual gRPC method
      // For now, we provide a mock structure

      // Simulated call - replace with actual gRPC client call
      reject(
        new MilvusConnectionError(
          'gRPC client not fully implemented - use mock transport for testing'
        )
      );
    });
  }
}

/**
 * Create a gRPC transport instance.
 */
export function createGrpcTransport(config: MilvusConfig): GrpcTransport {
  return new GrpcTransport(config);
}
