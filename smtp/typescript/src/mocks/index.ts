/**
 * Mock implementations for testing.
 */

import { SmtpError, SmtpErrorKind } from '../errors';
import { TlsConfig } from '../config';
import {
  Email,
  SendResult,
  createEmail,
} from '../types';
import {
  Credentials,
  CredentialProvider,
  OAuth2Token,
  OAuth2Provider,
  SecretString,
} from '../auth';
import {
  SmtpTransport,
} from '../transport';
import {
  SmtpResponse,
  SmtpSession,
  TransactionState,
  EsmtpCapabilities,
} from '../protocol';
import { generateMessageId } from '../mime';

/**
 * Recorded SMTP command.
 */
export interface RecordedCommand {
  /** Command string. */
  command: string;
  /** Timestamp. */
  timestamp: Date;
  /** Response returned. */
  response?: SmtpResponse;
}

/**
 * Mock transport configuration.
 */
export interface MockTransportConfig {
  /** Server greeting. */
  greeting?: string;
  /** EHLO response capabilities. */
  capabilities?: Partial<EsmtpCapabilities>;
  /** Whether to accept all recipients. */
  acceptAllRecipients?: boolean;
  /** Recipients to reject. */
  rejectedRecipients?: string[];
  /** Whether authentication should succeed. */
  authSuccess?: boolean;
  /** Whether STARTTLS is available. */
  startTlsAvailable?: boolean;
  /** Custom response handlers. */
  responseHandlers?: Map<string, (command: string) => SmtpResponse>;
  /** Error to throw on connect. */
  connectError?: Error;
  /** Error to throw on send. */
  sendError?: Error;
  /** Delay before responding (ms). */
  responseDelay?: number;
}

/**
 * Mock SMTP transport for testing.
 */
export class MockTransport implements SmtpTransport {
  private readonly config: MockTransportConfig;
  private readonly session: SmtpSession;
  private readonly recordedCommands: RecordedCommand[] = [];
  private readonly sentEmails: Email[] = [];
  private connected = false;
  private tlsActive = false;

  constructor(config: MockTransportConfig = {}) {
    this.config = config;
    this.session = new SmtpSession();
  }

  async connect(): Promise<SmtpResponse> {
    if (this.config.connectError) {
      throw this.config.connectError;
    }

    await this.delay();
    this.connected = true;
    this.session.transition(TransactionState.Connected);
    this.session.transition(TransactionState.Greeting);

    const greeting = this.config.greeting ?? '220 mock.smtp.server ESMTP ready';
    return this.createResponse(220, [greeting]);
  }

  async sendCommand(command: string): Promise<SmtpResponse> {
    if (!this.connected) {
      throw new SmtpError(SmtpErrorKind.ConnectionReset, 'Not connected');
    }

    await this.delay();

    const response = this.handleCommand(command);
    this.recordedCommands.push({
      command,
      timestamp: new Date(),
      response,
    });

    return response;
  }

  async sendData(_data: Buffer | string): Promise<void> {
    if (!this.connected) {
      throw new SmtpError(SmtpErrorKind.ConnectionReset, 'Not connected');
    }

    if (this.config.sendError) {
      throw this.config.sendError;
    }

    await this.delay();
    // Data is recorded but not processed in the mock
  }

  async upgradeTls(_config: TlsConfig): Promise<void> {
    if (!this.config.startTlsAvailable) {
      throw new SmtpError(SmtpErrorKind.StarttlsNotSupported, 'STARTTLS not available');
    }

    await this.delay();
    this.tlsActive = true;
    this.session.enableTls();
    this.session.transition(TransactionState.TlsEstablished);
  }

  async close(): Promise<void> {
    this.connected = false;
    this.tlsActive = false;
    this.session.disconnect();
  }

  isConnected(): boolean {
    return this.connected;
  }

  isTlsActive(): boolean {
    return this.tlsActive;
  }

  getSession(): SmtpSession {
    return this.session;
  }

  // Mock-specific methods

  /** Gets recorded commands. */
  getRecordedCommands(): RecordedCommand[] {
    return [...this.recordedCommands];
  }

  /** Gets sent emails. */
  getSentEmails(): Email[] {
    return [...this.sentEmails];
  }

  /** Clears recorded data. */
  clear(): void {
    this.recordedCommands.length = 0;
    this.sentEmails.length = 0;
  }

  /** Records a sent email (called by mock client). */
  recordEmail(email: Email): void {
    this.sentEmails.push(email);
  }

  private handleCommand(command: string): SmtpResponse {
    const upperCommand = command.toUpperCase();

    // Check custom handlers first
    if (this.config.responseHandlers) {
      for (const [pattern, handler] of this.config.responseHandlers) {
        if (upperCommand.startsWith(pattern.toUpperCase())) {
          return handler(command);
        }
      }
    }

    // Default handlers
    if (upperCommand.startsWith('EHLO')) {
      return this.handleEhlo();
    }
    if (upperCommand.startsWith('HELO')) {
      return this.handleHelo();
    }
    if (upperCommand.startsWith('AUTH')) {
      return this.handleAuth(command);
    }
    if (upperCommand === 'STARTTLS') {
      return this.handleStartTls();
    }
    if (upperCommand.startsWith('MAIL FROM')) {
      return this.handleMailFrom();
    }
    if (upperCommand.startsWith('RCPT TO')) {
      return this.handleRcptTo(command);
    }
    if (upperCommand === 'DATA') {
      return this.handleData();
    }
    if (upperCommand === 'RSET') {
      return this.handleRset();
    }
    if (upperCommand === 'NOOP') {
      return this.handleNoop();
    }
    if (upperCommand === 'QUIT') {
      return this.handleQuit();
    }

    // Check if this is DATA content terminator
    if (command === '.' || command === '') {
      return this.createResponse(250, ['OK queued as MOCK123']);
    }

    return this.createResponse(500, ['Command not recognized']);
  }

  private handleEhlo(): SmtpResponse {
    this.session.transition(TransactionState.Ready);

    const caps = this.config.capabilities ?? {};
    const lines = ['mock.smtp.server'];

    if (caps.maxSize) {
      lines.push(`SIZE ${caps.maxSize}`);
    }
    if (caps.startTls || this.config.startTlsAvailable) {
      lines.push('STARTTLS');
    }
    if (caps.authMethods && caps.authMethods.length > 0) {
      lines.push(`AUTH ${caps.authMethods.join(' ')}`);
    } else {
      lines.push('AUTH PLAIN LOGIN');
    }
    if (caps.eightBitMime) {
      lines.push('8BITMIME');
    }
    if (caps.pipelining) {
      lines.push('PIPELINING');
    }

    const response = this.createResponse(250, lines);

    // Parse and set capabilities
    const esmtpCaps: EsmtpCapabilities = {
      authMethods: caps.authMethods ?? ['PLAIN', 'LOGIN'],
      startTls: caps.startTls ?? this.config.startTlsAvailable ?? false,
      eightBitMime: caps.eightBitMime ?? false,
      pipelining: caps.pipelining ?? false,
      chunking: caps.chunking ?? false,
      smtpUtf8: caps.smtpUtf8 ?? false,
      dsn: caps.dsn ?? false,
      enhancedStatusCodes: caps.enhancedStatusCodes ?? false,
      maxSize: caps.maxSize,
      raw: lines,
    };
    this.session.setCapabilities(esmtpCaps);

    return response;
  }

  private handleHelo(): SmtpResponse {
    this.session.transition(TransactionState.Ready);
    return this.createResponse(250, ['mock.smtp.server Hello']);
  }

  private handleAuth(command: string): SmtpResponse {
    if (this.config.authSuccess === false) {
      return this.createResponse(535, ['Authentication failed']);
    }

    // Simulate challenge-response for LOGIN
    if (command.toUpperCase().includes('LOGIN') && !command.includes(' ', 11)) {
      return this.createResponse(334, [Buffer.from('Username:').toString('base64')]);
    }

    this.session.authenticate();
    return this.createResponse(235, ['Authentication successful']);
  }

  private handleStartTls(): SmtpResponse {
    if (!this.config.startTlsAvailable) {
      return this.createResponse(454, ['TLS not available']);
    }
    return this.createResponse(220, ['Ready to start TLS']);
  }

  private handleMailFrom(): SmtpResponse {
    this.session.transition(TransactionState.MailFrom);
    return this.createResponse(250, ['OK']);
  }

  private handleRcptTo(command: string): SmtpResponse {
    // Extract email address
    const match = command.match(/<([^>]+)>/);
    const email = match?.[1] ?? '';

    // Check if recipient should be rejected
    if (this.config.rejectedRecipients?.includes(email)) {
      return this.createResponse(550, ['Recipient rejected']);
    }

    if (!this.config.acceptAllRecipients && this.config.acceptAllRecipients !== undefined) {
      return this.createResponse(550, ['Recipient not accepted']);
    }

    this.session.transition(TransactionState.RcptTo);
    return this.createResponse(250, ['OK']);
  }

  private handleData(): SmtpResponse {
    this.session.transition(TransactionState.Data);
    return this.createResponse(354, ['Start mail input; end with <CRLF>.<CRLF>']);
  }

  private handleRset(): SmtpResponse {
    this.session.reset();
    return this.createResponse(250, ['OK']);
  }

  private handleNoop(): SmtpResponse {
    return this.createResponse(250, ['OK']);
  }

  private handleQuit(): SmtpResponse {
    this.connected = false;
    return this.createResponse(221, ['Bye']);
  }

  private createResponse(code: number, messages: string[]): SmtpResponse {
    return {
      code,
      message: messages,
      isMultiline: messages.length > 1,
    };
  }

  private delay(): Promise<void> {
    if (this.config.responseDelay) {
      return new Promise((resolve) => setTimeout(resolve, this.config.responseDelay));
    }
    return Promise.resolve();
  }
}

/**
 * Mock credential provider for testing.
 */
export class MockCredentialProvider implements CredentialProvider {
  private readonly username: string;
  private readonly password: string;
  private valid = true;
  private refreshCount = 0;

  constructor(username: string, password: string) {
    this.username = username;
    this.password = password;
  }

  async getCredentials(): Promise<Credentials> {
    return {
      username: this.username,
      password: new SecretString(this.password),
    };
  }

  async isValid(): Promise<boolean> {
    return this.valid;
  }

  async refresh(): Promise<void> {
    this.refreshCount++;
  }

  // Mock-specific methods

  /** Sets validity. */
  setValid(valid: boolean): void {
    this.valid = valid;
  }

  /** Gets refresh count. */
  getRefreshCount(): number {
    return this.refreshCount;
  }
}

/**
 * Mock OAuth2 provider for testing.
 */
export class MockOAuth2Provider implements OAuth2Provider {
  private token: OAuth2Token;
  private tokenValid = true;
  private refreshCount = 0;

  constructor(accessToken: string, expiresAt?: Date) {
    this.token = {
      accessToken: new SecretString(accessToken),
      expiresAt,
    };
  }

  async getToken(): Promise<OAuth2Token> {
    return this.token;
  }

  async refreshToken(): Promise<OAuth2Token> {
    this.refreshCount++;
    this.token = {
      accessToken: new SecretString(`refreshed-token-${this.refreshCount}`),
      expiresAt: new Date(Date.now() + 3600000),
    };
    this.tokenValid = true;
    return this.token;
  }

  isTokenValid(): boolean {
    return this.tokenValid;
  }

  // Mock-specific methods

  /** Sets token validity. */
  setTokenValid(valid: boolean): void {
    this.tokenValid = valid;
  }

  /** Gets refresh count. */
  getRefreshCount(): number {
    return this.refreshCount;
  }
}

/**
 * Test fixtures for common scenarios.
 */
export const TestFixtures = {
  /** Creates a simple test email. */
  createSimpleEmail(): Email {
    return createEmail({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Test Email',
      text: 'This is a test email.',
    });
  },

  /** Creates an email with HTML. */
  createHtmlEmail(): Email {
    return createEmail({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'HTML Test Email',
      text: 'This is the plain text version.',
      html: '<html><body><h1>Hello</h1><p>This is HTML content.</p></body></html>',
    });
  },

  /** Creates an email with multiple recipients. */
  createMultiRecipientEmail(): Email {
    return createEmail({
      from: 'sender@example.com',
      to: ['recipient1@example.com', 'recipient2@example.com'],
      cc: 'cc@example.com',
      bcc: 'bcc@example.com',
      subject: 'Multi-Recipient Test',
      text: 'This goes to multiple recipients.',
    });
  },

  /** Creates a mock transport with default settings. */
  createMockTransport(config?: MockTransportConfig): MockTransport {
    return new MockTransport({
      startTlsAvailable: true,
      authSuccess: true,
      acceptAllRecipients: true,
      capabilities: {
        authMethods: ['PLAIN', 'LOGIN'],
        startTls: true,
        eightBitMime: true,
        pipelining: true,
        maxSize: 10 * 1024 * 1024,
      },
      ...config,
    });
  },

  /** Creates a mock transport that fails to connect. */
  createFailingTransport(error?: Error): MockTransport {
    return new MockTransport({
      connectError: error ?? new SmtpError(SmtpErrorKind.ConnectionRefused, 'Connection refused'),
    });
  },

  /** Creates a mock transport that fails on send. */
  createSendFailingTransport(error?: Error): MockTransport {
    return new MockTransport({
      sendError: error ?? new SmtpError(SmtpErrorKind.UnexpectedResponse, 'Send failed'),
    });
  },

  /** Creates mock credentials. */
  createMockCredentials(username = 'testuser', password = 'testpass'): MockCredentialProvider {
    return new MockCredentialProvider(username, password);
  },

  /** Creates mock OAuth2 provider. */
  createMockOAuth2(accessToken = 'test-token'): MockOAuth2Provider {
    return new MockOAuth2Provider(accessToken, new Date(Date.now() + 3600000));
  },

  /** Creates a successful send result. */
  createSuccessResult(email: Email): SendResult {
    return {
      messageId: generateMessageId(),
      accepted: [...email.to, ...email.cc, ...email.bcc],
      rejected: [],
      response: '250 OK queued as MOCK123',
      durationMs: 100,
    };
  },

  /** Valid addresses for testing. */
  validAddresses: [
    'user@example.com',
    'user.name@example.com',
    'user+tag@example.com',
    'user@subdomain.example.com',
  ],

  /** Invalid addresses for testing. */
  invalidAddresses: [
    '',
    '@example.com',
    'user@',
    'user@.com',
    'user@@example.com',
    'user example.com',
  ],
};

/**
 * Creates a mock transport.
 */
export function createMockTransport(config?: MockTransportConfig): MockTransport {
  return new MockTransport(config);
}

/**
 * Creates a mock credential provider.
 */
export function createMockCredentialProvider(
  username: string,
  password: string
): MockCredentialProvider {
  return new MockCredentialProvider(username, password);
}

/**
 * Creates a mock OAuth2 provider.
 */
export function createMockOAuth2Provider(
  accessToken: string,
  expiresAt?: Date
): MockOAuth2Provider {
  return new MockOAuth2Provider(accessToken, expiresAt);
}
