/**
 * SMTP client implementation.
 */

import { SmtpError, SmtpErrorKind } from '../errors';
import {
  SmtpConfig,
  SmtpConfigOptions,
  createSmtpConfig,
  TlsMode,
  AuthMethod,
} from '../config';
import {
  Email,
  EmailOptions,
  createEmail,
  Address,
  SendResult,
  BatchSendResult,
  RejectedRecipient,
  PoolStatus,
  ConnectionInfo,
  formatAddressForSmtp,
} from '../types';
import {
  Authenticator,
  StaticCredentialProvider,
} from '../auth';
import {
  ConnectionPool,
  PooledConnection,
  createConnectionPool,
} from '../transport';
import {
  SmtpResponse,
  SmtpSession,
  TransactionState,
  parseCapabilities,
  isSuccessResponse,
} from '../protocol';
import { MimeEncoder, createMimeEncoder, prepareMessageData, generateMessageId } from '../mime';
import {
  ResilienceOrchestrator,
  CircuitState,
} from '../resilience';
import {
  Logger,
  MetricsCollector,
  TracingHook,
  CompositeTracingHook,
  Timer,
  createRequestContext,
  createNoopLogger,
  createMetricsCollector,
} from '../observability';

/**
 * SMTP client options.
 */
export interface SmtpClientOptions extends SmtpConfigOptions {
  /** Logger instance. */
  logger?: Logger;
  /** Tracing hooks. */
  tracingHooks?: TracingHook[];
  /** Domain for message IDs. */
  domain?: string;
}

/**
 * SMTP client for sending emails.
 */
export class SmtpClient {
  private readonly config: SmtpConfig;
  private readonly pool: ConnectionPool;
  private readonly authenticator: Authenticator;
  private readonly mimeEncoder: MimeEncoder;
  private readonly resilience: ResilienceOrchestrator;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private readonly tracingHooks: CompositeTracingHook;
  private readonly domain?: string;
  private closed = false;

  constructor(options: SmtpClientOptions) {
    this.config = createSmtpConfig(options);
    this.pool = createConnectionPool(this.config);
    this.mimeEncoder = createMimeEncoder(options.domain);
    this.domain = options.domain;

    // Set up authenticator
    this.authenticator = new Authenticator(this.config.authMethod);
    if (this.config.username && this.config.password) {
      this.authenticator.withCredentials(
        new StaticCredentialProvider(this.config.username, this.config.password)
      );
    }

    // Set up resilience
    this.resilience = new ResilienceOrchestrator(
      this.config.retry,
      this.config.circuitBreaker,
      this.config.rateLimit
    );

    // Set up observability
    this.logger = options.logger ?? createNoopLogger();
    this.metrics = createMetricsCollector();
    this.tracingHooks = new CompositeTracingHook();
    if (options.tracingHooks) {
      for (const hook of options.tracingHooks) {
        this.tracingHooks.addHook(hook);
      }
    }

    // Listen for circuit breaker events
    this.resilience.getCircuitBreaker().onEvent((event) => {
      if (event.type === 'state_change' && event.to === CircuitState.Open) {
        this.metrics.recordCircuitBreakerTrip();
      }
    });
  }

  /**
   * Sends a single email.
   */
  async send(email: Email | EmailOptions): Promise<SendResult> {
    if (this.closed) {
      throw new SmtpError(SmtpErrorKind.PoolExhausted, 'Client is closed');
    }

    const emailObj = 'from' in email && typeof (email as Email).from === 'object'
      ? email as Email
      : createEmail(email as EmailOptions);

    const context = createRequestContext('send_email', {
      to: emailObj.to.map((a) => a.email).join(','),
    });
    const timer = Timer.start();

    this.tracingHooks.onOperationStart?.(context);
    this.logger.info('Sending email', { to: emailObj.to.length, subject: emailObj.subject });

    try {
      const result = await this.resilience.execute(
        () => this.sendWithConnection(emailObj),
        'send_email'
      );

      this.tracingHooks.onOperationSuccess?.(context, timer.elapsed());
      this.tracingHooks.onEmailSent?.(result.messageId, result.accepted.length, result.durationMs);
      this.metrics.recordEmailSent(0, result.durationMs); // TODO: calculate bytes

      return result;
    } catch (err) {
      const error = err as Error;
      this.tracingHooks.onOperationError?.(context, error, timer.elapsed());
      this.metrics.recordEmailFailed();
      this.logger.error('Failed to send email', error);
      throw err;
    }
  }

  /**
   * Sends multiple emails in batch.
   */
  async sendBatch(emails: Array<Email | EmailOptions>): Promise<BatchSendResult> {
    if (this.closed) {
      throw new SmtpError(SmtpErrorKind.PoolExhausted, 'Client is closed');
    }

    const timer = Timer.start();
    const results: BatchSendResult['results'] = [];
    let succeeded = 0;
    let failed = 0;

    for (const email of emails) {
      try {
        const result = await this.send(email);
        results.push({ success: true, result });
        succeeded++;
      } catch (err) {
        results.push({ success: false, error: err as Error });
        failed++;
      }
    }

    return {
      results,
      total: emails.length,
      succeeded,
      failed,
      durationMs: timer.elapsed(),
    };
  }

  /**
   * Verifies connection to the SMTP server.
   */
  async verify(): Promise<boolean> {
    if (this.closed) {
      return false;
    }

    try {
      const conn = await this.pool.acquire();
      try {
        // Send NOOP to verify connection
        const response = await conn.transport.sendCommand('NOOP');
        return isSuccessResponse(response);
      } finally {
        this.pool.release(conn);
      }
    } catch {
      return false;
    }
  }

  /**
   * Gets connection information.
   */
  async getConnectionInfo(): Promise<ConnectionInfo | undefined> {
    if (this.closed) {
      return undefined;
    }

    try {
      const conn = await this.pool.acquire();
      try {
        const session = conn.transport.getSession();
        const caps = session.getCapabilities();

        return {
          host: this.config.host,
          port: this.config.port,
          tlsEnabled: conn.transport.isTlsActive(),
          capabilities: caps?.raw ?? [],
          banner: '',
          authenticatedUser: session.isSessionAuthenticated() ? this.config.username : undefined,
        };
      } finally {
        this.pool.release(conn);
      }
    } catch {
      return undefined;
    }
  }

  /**
   * Gets pool status.
   */
  getPoolStatus(): PoolStatus {
    const status = this.pool.getStatus();
    return {
      total: status.total,
      idle: status.idle,
      inUse: status.inUse,
      pending: status.pending,
      maxSize: status.maxSize,
    };
  }

  /**
   * Gets metrics.
   */
  getMetrics(): ReturnType<MetricsCollector['getMetrics']> {
    return this.metrics.getMetrics();
  }

  /**
   * Gets statistics.
   */
  getStats(): ReturnType<MetricsCollector['getStats']> {
    return this.metrics.getStats();
  }

  /**
   * Gets circuit breaker state.
   */
  getCircuitState(): CircuitState {
    return this.resilience.getCircuitBreaker().getState();
  }

  /**
   * Adds a tracing hook.
   */
  addTracingHook(hook: TracingHook): void {
    this.tracingHooks.addHook(hook);
  }

  /**
   * Removes a tracing hook.
   */
  removeTracingHook(hook: TracingHook): void {
    this.tracingHooks.removeHook(hook);
  }

  /**
   * Closes the client and releases resources.
   */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    await this.pool.close();
    this.logger.info('SMTP client closed');
  }

  private async sendWithConnection(email: Email): Promise<SendResult> {
    const timer = Timer.start();
    const conn = await this.acquireAndPrepareConnection();

    try {
      const result = await this.executeTransaction(conn, email, timer);
      this.pool.release(conn);
      return result;
    } catch (err) {
      // Destroy connection on error
      await this.pool.destroy(conn);
      throw err;
    }
  }

  private async acquireAndPrepareConnection(): Promise<PooledConnection> {
    this.metrics.recordConnectionAttempt();
    const timer = Timer.start();

    const conn = await this.pool.acquire();
    const session = conn.transport.getSession();

    try {
      // If new connection, perform handshake
      if (session.getState() === TransactionState.Greeting) {
        await this.performHandshake(conn);
      }

      // Upgrade to TLS if needed
      if (!conn.transport.isTlsActive() && this.shouldUpgradeToTls(session)) {
        await this.upgradeTls(conn);
      }

      // Authenticate if needed
      if (!session.isSessionAuthenticated() && this.shouldAuthenticate()) {
        await this.authenticate(conn);
      }

      this.metrics.recordConnectionSuccess(timer.elapsed());
      this.tracingHooks.onConnect?.(this.config.host, this.config.port, timer.elapsed());

      return conn;
    } catch (err) {
      this.metrics.recordConnectionFailure();
      await this.pool.destroy(conn);
      throw err;
    }
  }

  private async performHandshake(conn: PooledConnection): Promise<void> {
    const clientId = this.config.clientId ?? 'localhost';
    const response = await conn.transport.sendCommand(`EHLO ${clientId}`);

    if (!isSuccessResponse(response)) {
      // Fall back to HELO
      const heloResponse = await conn.transport.sendCommand(`HELO ${clientId}`);
      if (!isSuccessResponse(heloResponse)) {
        throw SmtpError.fromSmtpResponse(heloResponse.code, heloResponse.message.join(' '));
      }
    } else {
      const caps = parseCapabilities(response);
      conn.transport.getSession().setCapabilities(caps);
    }

    conn.transport.getSession().transition(TransactionState.Ready);
  }

  private shouldUpgradeToTls(session: SmtpSession): boolean {
    const caps = session.getCapabilities();
    const mode = this.config.tls.mode;

    if (mode === TlsMode.None || mode === TlsMode.Implicit) {
      return false;
    }

    if (mode === TlsMode.StartTlsRequired) {
      if (!caps?.startTls) {
        throw new SmtpError(SmtpErrorKind.StarttlsNotSupported, 'Server does not support STARTTLS');
      }
      return true;
    }

    // Opportunistic STARTTLS
    return caps?.startTls ?? false;
  }

  private async upgradeTls(conn: PooledConnection): Promise<void> {
    const response = await conn.transport.sendCommand('STARTTLS');
    if (!isSuccessResponse(response)) {
      if (this.config.tls.mode === TlsMode.StartTlsRequired) {
        throw SmtpError.fromSmtpResponse(response.code, response.message.join(' '));
      }
      return;
    }

    await conn.transport.upgradeTls(this.config.tls);
    this.metrics.recordTlsUpgrade();
    this.tracingHooks.onTlsUpgrade?.(this.config.host, 'TLSv1.2'); // TODO: get actual version

    // Re-perform EHLO after TLS
    await this.performHandshake(conn);
  }

  private shouldAuthenticate(): boolean {
    return !!(this.config.username && this.config.password);
  }

  private async authenticate(conn: PooledConnection): Promise<void> {
    this.metrics.recordAuthAttempt();
    const session = conn.transport.getSession();
    const caps = session.getCapabilities();

    if (!caps?.authMethods || caps.authMethods.length === 0) {
      throw new SmtpError(SmtpErrorKind.AuthMethodNotSupported, 'Server does not support authentication');
    }

    const method = this.authenticator.selectMethod(caps.authMethods);
    if (!method) {
      throw new SmtpError(
        SmtpErrorKind.AuthMethodNotSupported,
        `No supported auth method. Server supports: ${caps.authMethods.join(', ')}`
      );
    }

    try {
      await this.performAuth(conn, method);
      session.authenticate();
      this.metrics.recordAuthSuccess();
      this.tracingHooks.onAuthenticate?.(method, true);
    } catch (err) {
      this.metrics.recordAuthFailure();
      this.tracingHooks.onAuthenticate?.(method, false);
      throw err;
    }
  }

  private async performAuth(conn: PooledConnection, method: AuthMethod): Promise<void> {
    const initialResponse = await this.authenticator.generateInitialResponse(method);

    let response: SmtpResponse;
    if (initialResponse) {
      response = await conn.transport.sendCommand(`AUTH ${method} ${initialResponse}`);
    } else {
      response = await conn.transport.sendCommand(`AUTH ${method}`);
    }

    // Handle challenge-response
    while (response.code === 334) {
      const challenge = response.message[0] ?? '';
      const challengeResponse = await this.authenticator.generateChallengeResponse(method, challenge);
      response = await conn.transport.sendCommand(challengeResponse);
    }

    if (!isSuccessResponse(response)) {
      throw SmtpError.fromSmtpResponse(response.code, response.message.join(' '));
    }
  }

  private async executeTransaction(
    conn: PooledConnection,
    email: Email,
    timer: Timer
  ): Promise<SendResult> {
    const messageId = email.messageId ?? generateMessageId(this.domain);
    const accepted: Address[] = [];
    const rejected: RejectedRecipient[] = [];

    // MAIL FROM
    const fromAddress = formatAddressForSmtp(email.from);
    const mailFromResponse = await conn.transport.sendCommand(`MAIL FROM:${fromAddress}`);
    if (!isSuccessResponse(mailFromResponse)) {
      throw SmtpError.fromSmtpResponse(mailFromResponse.code, mailFromResponse.message.join(' '));
    }

    // RCPT TO for all recipients
    const allRecipients = [...email.to, ...email.cc, ...email.bcc];
    for (const recipient of allRecipients) {
      const rcptAddress = formatAddressForSmtp(recipient);
      const rcptResponse = await conn.transport.sendCommand(`RCPT TO:${rcptAddress}`);

      if (isSuccessResponse(rcptResponse)) {
        accepted.push(recipient);
      } else {
        rejected.push({
          address: recipient,
          code: rcptResponse.code,
          message: rcptResponse.message.join(' '),
        });
      }
    }

    // Check if any recipients accepted
    if (accepted.length === 0) {
      // Reset and throw
      await conn.transport.sendCommand('RSET');
      throw new SmtpError(
        SmtpErrorKind.InvalidRecipientAddress,
        'All recipients were rejected'
      );
    }

    // DATA
    const dataResponse = await conn.transport.sendCommand('DATA');
    if (dataResponse.code !== 354) {
      await conn.transport.sendCommand('RSET');
      throw SmtpError.fromSmtpResponse(dataResponse.code, dataResponse.message.join(' '));
    }

    // Send message content
    const encodedEmail = this.mimeEncoder.encode({ ...email, messageId });
    const messageData = prepareMessageData(encodedEmail);
    await conn.transport.sendData(messageData);

    // Wait for final response
    const finalResponse = await this.waitForDataResponse(conn);
    if (!isSuccessResponse(finalResponse)) {
      throw SmtpError.fromSmtpResponse(finalResponse.code, finalResponse.message.join(' '));
    }

    return {
      messageId,
      serverId: this.extractServerId(finalResponse),
      accepted,
      rejected,
      response: finalResponse.message.join(' '),
      durationMs: timer.elapsed(),
    };
  }

  private async waitForDataResponse(conn: PooledConnection): Promise<SmtpResponse> {
    // The final . was already sent in sendData
    // We need to read the response
    return new Promise((resolve, reject) => {
      // Use a timeout for the response
      const timeout = setTimeout(() => {
        reject(new SmtpError(SmtpErrorKind.CommandTimeout, 'Timeout waiting for DATA response'));
      }, this.config.commandTimeout);

      // The response should come from the previous sendData call
      // In the real implementation, this would be handled by the transport
      conn.transport
        .sendCommand('')
        .then((response) => {
          clearTimeout(timeout);
          resolve(response);
        })
        .catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
    });
  }

  private extractServerId(response: SmtpResponse): string | undefined {
    // Try to extract queue ID from response
    // Common format: "250 OK queued as ABC123"
    const message = response.message.join(' ');
    const match = message.match(/queued\s+as\s+(\S+)/i);
    return match?.[1];
  }
}

/**
 * Builder for SmtpClient.
 */
export class SmtpClientBuilder {
  private options: Partial<SmtpClientOptions> = {};

  /** Sets the SMTP server host. */
  host(host: string): this {
    this.options.host = host;
    return this;
  }

  /** Sets the SMTP server port. */
  port(port: number): this {
    this.options.port = port;
    return this;
  }

  /** Sets credentials. */
  credentials(username: string, password: string): this {
    this.options.username = username;
    this.options.password = password;
    return this;
  }

  /** Sets the authentication method. */
  authMethod(method: AuthMethod): this {
    this.options.authMethod = method;
    return this;
  }

  /** Sets TLS mode. */
  tlsMode(mode: TlsMode): this {
    this.options.tls = { ...this.options.tls, mode };
    return this;
  }

  /** Sets the logger. */
  logger(logger: Logger): this {
    this.options.logger = logger;
    return this;
  }

  /** Sets the domain for message IDs. */
  domain(domain: string): this {
    this.options.domain = domain;
    return this;
  }

  /** Adds a tracing hook. */
  tracingHook(hook: TracingHook): this {
    this.options.tracingHooks = this.options.tracingHooks ?? [];
    this.options.tracingHooks.push(hook);
    return this;
  }

  /** Sets pool configuration. */
  pool(config: SmtpClientOptions['pool']): this {
    this.options.pool = config;
    return this;
  }

  /** Sets retry configuration. */
  retry(config: SmtpClientOptions['retry']): this {
    this.options.retry = config;
    return this;
  }

  /** Sets circuit breaker configuration. */
  circuitBreaker(config: SmtpClientOptions['circuitBreaker']): this {
    this.options.circuitBreaker = config;
    return this;
  }

  /** Sets rate limit configuration. */
  rateLimit(config: SmtpClientOptions['rateLimit']): this {
    this.options.rateLimit = config;
    return this;
  }

  /** Sets connect timeout. */
  connectTimeout(ms: number): this {
    this.options.connectTimeout = ms;
    return this;
  }

  /** Sets command timeout. */
  commandTimeout(ms: number): this {
    this.options.commandTimeout = ms;
    return this;
  }

  /** Builds the client. */
  build(): SmtpClient {
    if (!this.options.host) {
      throw new SmtpError(SmtpErrorKind.ConfigurationInvalid, 'Host is required');
    }
    return new SmtpClient(this.options as SmtpClientOptions);
  }
}

/**
 * Creates an SMTP client.
 */
export function createSmtpClient(options: SmtpClientOptions): SmtpClient {
  return new SmtpClient(options);
}

/**
 * Creates an SMTP client builder.
 */
export function smtpClient(): SmtpClientBuilder {
  return new SmtpClientBuilder();
}
