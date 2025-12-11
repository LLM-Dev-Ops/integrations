/**
 * SMTP transport layer with connection pooling.
 */

import * as net from 'net';
import * as tls from 'tls';
import { EventEmitter } from 'events';
import { SmtpError, SmtpErrorKind } from '../errors';
import {
  SmtpConfig,
  TlsMode,
  TlsConfig,
  PoolConfig,
} from '../config';
import {
  SmtpResponse,
  parseResponse,
  SmtpSession,
  TransactionState,
} from '../protocol';

/**
 * SMTP transport interface.
 */
export interface SmtpTransport {
  /** Connects to the SMTP server. */
  connect(): Promise<SmtpResponse>;
  /** Sends a command and receives a response. */
  sendCommand(command: string): Promise<SmtpResponse>;
  /** Sends raw data (for DATA command content). */
  sendData(data: Buffer | string): Promise<void>;
  /** Upgrades to TLS (STARTTLS). */
  upgradeTls(config: TlsConfig): Promise<void>;
  /** Closes the connection. */
  close(): Promise<void>;
  /** Checks if connected. */
  isConnected(): boolean;
  /** Checks if TLS is active. */
  isTlsActive(): boolean;
  /** Gets the session. */
  getSession(): SmtpSession;
}

/**
 * Response reader for handling SMTP responses.
 */
class ResponseReader {
  private buffer = '';
  private lines: string[] = [];

  /**
   * Adds data to the buffer.
   */
  addData(data: string): void {
    this.buffer += data;
    this.processBuffer();
  }

  /**
   * Checks if a complete response is available.
   */
  hasCompleteResponse(): boolean {
    if (this.lines.length === 0) {
      return false;
    }
    const lastLine = this.lines[this.lines.length - 1];
    // Complete response ends with "XXX " (space after code, not hyphen)
    return lastLine !== undefined && lastLine.length >= 4 && lastLine[3] !== '-';
  }

  /**
   * Gets the complete response.
   */
  getResponse(): SmtpResponse {
    const response = parseResponse(this.lines);
    this.lines = [];
    return response;
  }

  /**
   * Clears the buffer.
   */
  clear(): void {
    this.buffer = '';
    this.lines = [];
  }

  private processBuffer(): void {
    const lineEnd = this.buffer.indexOf('\r\n');
    if (lineEnd !== -1) {
      const line = this.buffer.substring(0, lineEnd);
      this.buffer = this.buffer.substring(lineEnd + 2);
      this.lines.push(line);
      this.processBuffer(); // Recursively process remaining buffer
    }
  }
}

/**
 * TCP transport implementation.
 */
export class TcpTransport implements SmtpTransport {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private readonly host: string;
  private readonly port: number;
  private readonly connectTimeout: number;
  private readonly commandTimeout: number;
  private readonly tlsConfig: TlsConfig;
  private readonly session: SmtpSession;
  private readonly reader: ResponseReader;
  private isTls = false;

  constructor(config: SmtpConfig) {
    this.host = config.host;
    this.port = config.port;
    this.connectTimeout = config.connectTimeout;
    this.commandTimeout = config.commandTimeout;
    this.tlsConfig = config.tls;
    this.session = new SmtpSession();
    this.reader = new ResponseReader();
  }

  async connect(): Promise<SmtpResponse> {
    if (this.tlsConfig.mode === TlsMode.Implicit) {
      return this.connectImplicitTls();
    }
    return this.connectPlain();
  }

  private async connectPlain(): Promise<SmtpResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.socket) {
          this.socket.destroy();
        }
        reject(
          new SmtpError(
            SmtpErrorKind.ConnectTimeout,
            `Connection timeout after ${this.connectTimeout}ms`
          )
        );
      }, this.connectTimeout);

      this.socket = net.createConnection({
        host: this.host,
        port: this.port,
      });

      this.socket.once('connect', () => {
        clearTimeout(timeout);
        this.session.transition(TransactionState.Connected);
        this.waitForGreeting().then(resolve).catch(reject);
      });

      this.socket.once('error', (err) => {
        clearTimeout(timeout);
        reject(new SmtpError(SmtpErrorKind.ConnectionRefused, err.message, { cause: err }));
      });

      this.socket.setEncoding('utf-8');
    });
  }

  private async connectImplicitTls(): Promise<SmtpResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.socket) {
          this.socket.destroy();
        }
        reject(
          new SmtpError(
            SmtpErrorKind.ConnectTimeout,
            `Connection timeout after ${this.connectTimeout}ms`
          )
        );
      }, this.connectTimeout);

      const options: tls.ConnectionOptions = {
        host: this.host,
        port: this.port,
        servername: this.tlsConfig.sniOverride ?? this.host,
        minVersion: this.tlsConfig.minVersion as tls.SecureVersion,
        rejectUnauthorized: this.tlsConfig.verifyCertificate && !this.tlsConfig.acceptInvalidCerts,
      };

      if (this.tlsConfig.caCertPath) {
        // CA cert would be loaded here
      }

      this.socket = tls.connect(options);
      this.isTls = true;

      this.socket.once('secureConnect', () => {
        clearTimeout(timeout);
        this.session.transition(TransactionState.Connected);
        this.session.enableTls();
        this.waitForGreeting().then(resolve).catch(reject);
      });

      this.socket.once('error', (err) => {
        clearTimeout(timeout);
        reject(new SmtpError(SmtpErrorKind.TlsHandshakeFailed, err.message, { cause: err }));
      });

      this.socket.setEncoding('utf-8');
    });
  }

  private waitForGreeting(): Promise<SmtpResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new SmtpError(SmtpErrorKind.ConnectionReset, 'Socket not connected'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(
          new SmtpError(
            SmtpErrorKind.ReadTimeout,
            `Greeting timeout after ${this.commandTimeout}ms`
          )
        );
      }, this.commandTimeout);

      const onData = (data: string): void => {
        this.reader.addData(data);
        if (this.reader.hasCompleteResponse()) {
          clearTimeout(timeout);
          this.socket?.removeListener('data', onData);
          const response = this.reader.getResponse();
          if (response.code >= 200 && response.code < 400) {
            this.session.transition(TransactionState.Greeting);
          }
          resolve(response);
        }
      };

      this.socket.on('data', onData);
    });
  }

  async sendCommand(command: string): Promise<SmtpResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.isConnected()) {
        reject(new SmtpError(SmtpErrorKind.ConnectionReset, 'Not connected'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(
          new SmtpError(
            SmtpErrorKind.CommandTimeout,
            `Command timeout after ${this.commandTimeout}ms`
          )
        );
      }, this.commandTimeout);

      this.reader.clear();

      const onData = (data: string): void => {
        this.reader.addData(data);
        if (this.reader.hasCompleteResponse()) {
          clearTimeout(timeout);
          this.socket?.removeListener('data', onData);
          resolve(this.reader.getResponse());
        }
      };

      this.socket.on('data', onData);

      // Append CRLF if not present
      const commandLine = command.endsWith('\r\n') ? command : command + '\r\n';
      this.socket.write(commandLine, 'utf-8', (err) => {
        if (err) {
          clearTimeout(timeout);
          this.socket?.removeListener('data', onData);
          reject(new SmtpError(SmtpErrorKind.WriteTimeout, err.message, { cause: err }));
        }
      });
    });
  }

  async sendData(data: Buffer | string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.isConnected()) {
        reject(new SmtpError(SmtpErrorKind.ConnectionReset, 'Not connected'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(
          new SmtpError(
            SmtpErrorKind.WriteTimeout,
            `Data send timeout after ${this.commandTimeout}ms`
          )
        );
      }, this.commandTimeout);

      this.socket.write(data, (err) => {
        clearTimeout(timeout);
        if (err) {
          reject(new SmtpError(SmtpErrorKind.WriteTimeout, err.message, { cause: err }));
        } else {
          resolve();
        }
      });
    });
  }

  async upgradeTls(config: TlsConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.isTls) {
        reject(
          new SmtpError(SmtpErrorKind.TlsHandshakeFailed, 'Cannot upgrade: already TLS or not connected')
        );
        return;
      }

      const plainSocket = this.socket as net.Socket;

      const options: tls.ConnectionOptions = {
        socket: plainSocket,
        servername: config.sniOverride ?? this.host,
        minVersion: config.minVersion as tls.SecureVersion,
        rejectUnauthorized: config.verifyCertificate && !config.acceptInvalidCerts,
      };

      const tlsSocket = tls.connect(options);

      tlsSocket.once('secureConnect', () => {
        this.socket = tlsSocket;
        this.isTls = true;
        this.session.enableTls();
        this.session.transition(TransactionState.TlsEstablished);
        resolve();
      });

      tlsSocket.once('error', (err) => {
        reject(new SmtpError(SmtpErrorKind.TlsHandshakeFailed, err.message, { cause: err }));
      });

      tlsSocket.setEncoding('utf-8');
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.socket) {
        this.socket.end(() => {
          this.socket = null;
          this.isTls = false;
          this.session.disconnect();
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  isTlsActive(): boolean {
    return this.isTls;
  }

  getSession(): SmtpSession {
    return this.session;
  }
}

/**
 * Pooled connection wrapper.
 */
export interface PooledConnection {
  /** Unique connection ID. */
  id: string;
  /** The underlying transport. */
  transport: SmtpTransport;
  /** Creation timestamp. */
  createdAt: Date;
  /** Last used timestamp. */
  lastUsedAt: Date;
  /** Number of emails sent on this connection. */
  usageCount: number;
  /** Whether the connection is currently in use. */
  inUse: boolean;
}

/**
 * Connection pool for SMTP connections.
 */
export class ConnectionPool extends EventEmitter {
  private readonly config: SmtpConfig;
  private readonly poolConfig: PoolConfig;
  private readonly connections: Map<string, PooledConnection> = new Map();
  private readonly pending: Array<{
    resolve: (conn: PooledConnection) => void;
    reject: (err: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];
  private healthCheckInterval?: NodeJS.Timeout;
  private idCounter = 0;
  private closed = false;

  constructor(config: SmtpConfig) {
    super();
    this.config = config;
    this.poolConfig = config.pool;

    if (this.poolConfig.healthCheckEnabled) {
      this.startHealthCheck();
    }
  }

  /**
   * Acquires a connection from the pool.
   */
  async acquire(): Promise<PooledConnection> {
    if (this.closed) {
      throw new SmtpError(SmtpErrorKind.PoolExhausted, 'Pool is closed');
    }

    // Try to find an idle connection
    for (const conn of this.connections.values()) {
      if (!conn.inUse && this.isConnectionHealthy(conn)) {
        conn.inUse = true;
        conn.lastUsedAt = new Date();
        return conn;
      }
    }

    // Create a new connection if under limit
    if (this.connections.size < this.poolConfig.maxConnections) {
      return this.createConnection();
    }

    // Wait for a connection to become available
    return this.waitForConnection();
  }

  /**
   * Releases a connection back to the pool.
   */
  release(connection: PooledConnection): void {
    const conn = this.connections.get(connection.id);
    if (!conn) {
      return;
    }

    conn.inUse = false;
    conn.lastUsedAt = new Date();
    conn.usageCount++;

    // Check if any pending requests can be satisfied
    if (this.pending.length > 0) {
      const waiter = this.pending.shift();
      if (waiter) {
        clearTimeout(waiter.timeout);
        conn.inUse = true;
        waiter.resolve(conn);
      }
    }
  }

  /**
   * Destroys a connection.
   */
  async destroy(connection: PooledConnection): Promise<void> {
    const conn = this.connections.get(connection.id);
    if (conn) {
      this.connections.delete(connection.id);
      await conn.transport.close();
    }
  }

  /**
   * Gets pool status.
   */
  getStatus(): {
    total: number;
    idle: number;
    inUse: number;
    pending: number;
    maxSize: number;
  } {
    let idle = 0;
    let inUse = 0;

    for (const conn of this.connections.values()) {
      if (conn.inUse) {
        inUse++;
      } else {
        idle++;
      }
    }

    return {
      total: this.connections.size,
      idle,
      inUse,
      pending: this.pending.length,
      maxSize: this.poolConfig.maxConnections,
    };
  }

  /**
   * Closes the pool and all connections.
   */
  async close(): Promise<void> {
    this.closed = true;

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Reject pending waiters
    for (const waiter of this.pending) {
      clearTimeout(waiter.timeout);
      waiter.reject(new SmtpError(SmtpErrorKind.PoolExhausted, 'Pool is closing'));
    }
    this.pending.length = 0;

    // Close all connections
    const closePromises: Promise<void>[] = [];
    for (const conn of this.connections.values()) {
      closePromises.push(conn.transport.close());
    }
    await Promise.all(closePromises);
    this.connections.clear();
  }

  private async createConnection(): Promise<PooledConnection> {
    const id = `conn-${++this.idCounter}`;
    const transport = new TcpTransport(this.config);

    try {
      await transport.connect();
    } catch (err) {
      throw err;
    }

    const conn: PooledConnection = {
      id,
      transport,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      usageCount: 0,
      inUse: true,
    };

    this.connections.set(id, conn);
    return conn;
  }

  private waitForConnection(): Promise<PooledConnection> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.pending.findIndex((w) => w.resolve === resolve);
        if (index !== -1) {
          this.pending.splice(index, 1);
        }
        reject(
          new SmtpError(
            SmtpErrorKind.AcquireTimeout,
            `Connection acquire timeout after ${this.poolConfig.acquireTimeout}ms`
          )
        );
      }, this.poolConfig.acquireTimeout);

      this.pending.push({ resolve, reject, timeout });
    });
  }

  private isConnectionHealthy(conn: PooledConnection): boolean {
    // Check if transport is connected
    if (!conn.transport.isConnected()) {
      return false;
    }

    // Check max lifetime
    const age = Date.now() - conn.createdAt.getTime();
    if (age > this.poolConfig.maxLifetime) {
      return false;
    }

    // Check idle timeout
    const idleTime = Date.now() - conn.lastUsedAt.getTime();
    if (idleTime > this.poolConfig.idleTimeout) {
      return false;
    }

    return true;
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.poolConfig.healthCheckInterval);
  }

  private async performHealthCheck(): Promise<void> {
    const unhealthyConnections: string[] = [];

    for (const [id, conn] of this.connections) {
      if (!conn.inUse && !this.isConnectionHealthy(conn)) {
        unhealthyConnections.push(id);
      }
    }

    // Remove unhealthy connections
    for (const id of unhealthyConnections) {
      const conn = this.connections.get(id);
      if (conn) {
        this.connections.delete(id);
        await conn.transport.close();
      }
    }

    // Ensure minimum idle connections
    const idleCount = [...this.connections.values()].filter((c) => !c.inUse).length;
    const toCreate = Math.min(
      this.poolConfig.minIdle - idleCount,
      this.poolConfig.maxConnections - this.connections.size
    );

    for (let i = 0; i < toCreate; i++) {
      try {
        const conn = await this.createConnection();
        conn.inUse = false; // Mark as idle
      } catch {
        // Ignore errors during pre-warming
      }
    }
  }
}

/**
 * Creates a transport from configuration.
 */
export function createTransport(config: SmtpConfig): SmtpTransport {
  return new TcpTransport(config);
}

/**
 * Creates a connection pool from configuration.
 */
export function createConnectionPool(config: SmtpConfig): ConnectionPool {
  return new ConnectionPool(config);
}
