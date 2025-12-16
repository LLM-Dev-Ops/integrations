/**
 * Main R2 client implementation
 * Based on SPARC specification section 4.1
 * @module @studiorack/cloudflare-r2/client
 */

import type {
  R2Client,
  R2ObjectsService,
  R2MultipartService,
  R2PresignService,
} from './interface.js';
import type { NormalizedR2Config } from '../config/index.js';
import type { HttpTransport } from '../transport/index.js';
import type { R2Signer } from '../signing/index.js';

/**
 * Main R2 client implementation
 *
 * Orchestrates all R2 operations through specialized service instances.
 * Each service (objects, multipart, presign) is initialized with the necessary
 * dependencies (config, transport, signer) and exposed as a public property.
 *
 * The client manages the lifecycle of the HTTP transport and ensures
 * proper cleanup when close() is called.
 */
export class R2ClientImpl implements R2Client {
  /**
   * Service for object operations (get, put, delete, head, list)
   */
  readonly objects: R2ObjectsService;

  /**
   * Service for multipart upload operations
   */
  readonly multipart: R2MultipartService;

  /**
   * Service for presigned URL generation
   */
  readonly presign: R2PresignService;

  /**
   * HTTP transport for making requests
   */
  private readonly transport: HttpTransport;

  /**
   * Request signer for authentication
   */
  private readonly signer: R2Signer;

  /**
   * Normalized configuration
   */
  private readonly config: NormalizedR2Config;

  /**
   * Whether the client has been closed
   */
  private closed = false;

  /**
   * Creates a new R2 client instance
   *
   * @param config - Normalized R2 configuration
   * @param transport - HTTP transport (typically ResilientTransport wrapping FetchTransport)
   * @param signer - Request signer for authentication
   */
  constructor(
    config: NormalizedR2Config,
    transport: HttpTransport,
    signer: R2Signer
  ) {
    this.config = config;
    this.transport = transport;
    this.signer = signer;

    // Initialize services
    // Note: These will be replaced with actual service implementations
    // For now, create empty objects to satisfy the interface
    this.objects = {} as R2ObjectsService;
    this.multipart = {} as R2MultipartService;
    this.presign = {} as R2PresignService;

    // TODO: When service implementations are available, initialize them like:
    // this.objects = new ObjectsService(config, transport, signer);
    // this.multipart = new MultipartService(config, transport, signer);
    // this.presign = new PresignService(config, signer);
  }

  /**
   * Closes the client and releases all resources
   *
   * Shuts down the HTTP transport and marks the client as closed.
   * The client cannot be used after calling close().
   *
   * @throws {Error} If the client is already closed
   */
  async close(): Promise<void> {
    if (this.closed) {
      throw new Error('Client is already closed');
    }

    this.closed = true;

    // Close the HTTP transport
    await this.transport.close();
  }

  /**
   * Gets the normalized configuration
   * @internal
   */
  getConfig(): NormalizedR2Config {
    return this.config;
  }

  /**
   * Gets the HTTP transport
   * @internal
   */
  getTransport(): HttpTransport {
    return this.transport;
  }

  /**
   * Gets the request signer
   * @internal
   */
  getSigner(): R2Signer {
    return this.signer;
  }

  /**
   * Checks if the client is closed
   * @internal
   */
  isClosed(): boolean {
    return this.closed;
  }
}
