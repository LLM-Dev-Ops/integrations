/**
 * SMTP protocol implementation.
 */

import { SmtpError, SmtpErrorKind } from '../errors';

/**
 * SMTP command types.
 */
export enum SmtpCommandType {
  Ehlo = 'EHLO',
  Helo = 'HELO',
  MailFrom = 'MAIL FROM',
  RcptTo = 'RCPT TO',
  Data = 'DATA',
  Quit = 'QUIT',
  Rset = 'RSET',
  Noop = 'NOOP',
  Vrfy = 'VRFY',
  Auth = 'AUTH',
  StartTls = 'STARTTLS',
}

/**
 * SMTP command with parameters.
 */
export interface SmtpCommand {
  /** Command type. */
  type: SmtpCommandType;
  /** Command parameters. */
  params?: string;
  /** Full command string. */
  toString(): string;
}

/**
 * Creates an SMTP command.
 */
export function createCommand(type: SmtpCommandType, params?: string): SmtpCommand {
  return {
    type,
    params,
    toString() {
      return params ? `${type}:${params}` : type;
    },
  };
}

/**
 * Creates an EHLO command.
 */
export function ehlo(clientId: string): SmtpCommand {
  return createCommand(SmtpCommandType.Ehlo, clientId);
}

/**
 * Creates a HELO command.
 */
export function helo(clientId: string): SmtpCommand {
  return createCommand(SmtpCommandType.Helo, clientId);
}

/**
 * Creates a MAIL FROM command.
 */
export function mailFrom(address: string, params?: string): SmtpCommand {
  const paramStr = params ? ` ${params}` : '';
  return createCommand(SmtpCommandType.MailFrom, `<${address}>${paramStr}`);
}

/**
 * Creates a RCPT TO command.
 */
export function rcptTo(address: string): SmtpCommand {
  return createCommand(SmtpCommandType.RcptTo, `<${address}>`);
}

/**
 * Creates a DATA command.
 */
export function data(): SmtpCommand {
  return createCommand(SmtpCommandType.Data);
}

/**
 * Creates a QUIT command.
 */
export function quit(): SmtpCommand {
  return createCommand(SmtpCommandType.Quit);
}

/**
 * Creates a RSET command.
 */
export function rset(): SmtpCommand {
  return createCommand(SmtpCommandType.Rset);
}

/**
 * Creates a NOOP command.
 */
export function noop(): SmtpCommand {
  return createCommand(SmtpCommandType.Noop);
}

/**
 * Creates an AUTH command.
 */
export function auth(method: string, initialResponse?: string): SmtpCommand {
  const params = initialResponse ? `${method} ${initialResponse}` : method;
  return createCommand(SmtpCommandType.Auth, params);
}

/**
 * Creates a STARTTLS command.
 */
export function startTls(): SmtpCommand {
  return createCommand(SmtpCommandType.StartTls);
}

/**
 * Formats a command for transmission.
 */
export function formatCommand(command: SmtpCommand): string {
  if (command.params) {
    return `${command.type}:${command.params}\r\n`;
  }
  return `${command.type}\r\n`;
}

/**
 * SMTP response from server.
 */
export interface SmtpResponse {
  /** Three-digit status code. */
  code: number;
  /** Response message(s). */
  message: string[];
  /** Enhanced status code if present. */
  enhancedCode?: string;
  /** Whether this is a multiline response. */
  isMultiline: boolean;
}

/**
 * Parses an SMTP response from raw lines.
 */
export function parseResponse(lines: string[]): SmtpResponse {
  if (lines.length === 0) {
    throw new SmtpError(SmtpErrorKind.InvalidResponse, 'Empty response');
  }

  const messages: string[] = [];
  let code = 0;
  let enhancedCode: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length < 3) {
      throw new SmtpError(SmtpErrorKind.InvalidResponse, `Invalid response line: ${line}`);
    }

    const lineCode = parseInt(line.substring(0, 3), 10);
    if (isNaN(lineCode)) {
      throw new SmtpError(SmtpErrorKind.InvalidResponse, `Invalid status code in line: ${line}`);
    }

    if (i === 0) {
      code = lineCode;
    } else if (lineCode !== code) {
      throw new SmtpError(
        SmtpErrorKind.InvalidResponse,
        `Inconsistent status code in multiline response`
      );
    }

    // Extract message (skip code and separator)
    let message = line.length > 4 ? line.substring(4) : '';

    // Check for enhanced status code in first line
    if (i === 0 && message) {
      const enhancedMatch = message.match(/^(\d+\.\d+\.\d+)\s/);
      if (enhancedMatch && enhancedMatch[1]) {
        enhancedCode = enhancedMatch[1];
        message = message.substring(enhancedMatch[0].length);
      }
    }

    messages.push(message);
  }

  return {
    code,
    message: messages,
    enhancedCode,
    isMultiline: lines.length > 1,
  };
}

/**
 * Checks if a response indicates success.
 */
export function isSuccessResponse(response: SmtpResponse): boolean {
  return response.code >= 200 && response.code < 300;
}

/**
 * Checks if a response indicates an intermediate state.
 */
export function isIntermediateResponse(response: SmtpResponse): boolean {
  return response.code >= 300 && response.code < 400;
}

/**
 * Checks if a response indicates a temporary error.
 */
export function isTemporaryError(response: SmtpResponse): boolean {
  return response.code >= 400 && response.code < 500;
}

/**
 * Checks if a response indicates a permanent error.
 */
export function isPermanentError(response: SmtpResponse): boolean {
  return response.code >= 500 && response.code < 600;
}

/**
 * ESMTP server capabilities.
 */
export interface EsmtpCapabilities {
  /** Maximum message size in bytes. */
  maxSize?: number;
  /** Supported authentication methods. */
  authMethods: string[];
  /** STARTTLS is supported. */
  startTls: boolean;
  /** 8BITMIME extension is supported. */
  eightBitMime: boolean;
  /** PIPELINING extension is supported. */
  pipelining: boolean;
  /** CHUNKING extension is supported. */
  chunking: boolean;
  /** SMTPUTF8 extension is supported. */
  smtpUtf8: boolean;
  /** DSN extension is supported. */
  dsn: boolean;
  /** ENHANCEDSTATUSCODES extension is supported. */
  enhancedStatusCodes: boolean;
  /** Raw capability lines. */
  raw: string[];
}

/**
 * Parses ESMTP capabilities from EHLO response.
 */
export function parseCapabilities(response: SmtpResponse): EsmtpCapabilities {
  const caps: EsmtpCapabilities = {
    authMethods: [],
    startTls: false,
    eightBitMime: false,
    pipelining: false,
    chunking: false,
    smtpUtf8: false,
    dsn: false,
    enhancedStatusCodes: false,
    raw: [...response.message],
  };

  for (const line of response.message) {
    const upper = line.toUpperCase();
    const parts = line.split(/\s+/);
    const keyword = parts[0]?.toUpperCase() ?? '';

    switch (keyword) {
      case 'SIZE':
        if (parts[1]) {
          caps.maxSize = parseInt(parts[1], 10) || undefined;
        }
        break;
      case 'AUTH':
        caps.authMethods = parts.slice(1).map((m) => m.toUpperCase());
        break;
      case 'STARTTLS':
        caps.startTls = true;
        break;
      case '8BITMIME':
        caps.eightBitMime = true;
        break;
      case 'PIPELINING':
        caps.pipelining = true;
        break;
      case 'CHUNKING':
        caps.chunking = true;
        break;
      case 'SMTPUTF8':
        caps.smtpUtf8 = true;
        break;
      case 'DSN':
        caps.dsn = true;
        break;
      case 'ENHANCEDSTATUSCODES':
        caps.enhancedStatusCodes = true;
        break;
    }

    // Handle AUTH= prefix (some servers use this format)
    if (upper.startsWith('AUTH=')) {
      caps.authMethods = line
        .substring(5)
        .split(/\s+/)
        .map((m) => m.toUpperCase());
    }
  }

  return caps;
}

/**
 * SMTP transaction state machine.
 */
export enum TransactionState {
  /** Initial state, not connected. */
  Disconnected = 'disconnected',
  /** Connected, waiting for greeting. */
  Connected = 'connected',
  /** Received greeting, ready for EHLO/HELO. */
  Greeting = 'greeting',
  /** EHLO/HELO completed. */
  Ready = 'ready',
  /** TLS handshake in progress. */
  StartingTls = 'starting_tls',
  /** TLS established. */
  TlsEstablished = 'tls_established',
  /** Authentication in progress. */
  Authenticating = 'authenticating',
  /** Authenticated. */
  Authenticated = 'authenticated',
  /** MAIL FROM sent. */
  MailFrom = 'mail_from',
  /** At least one RCPT TO accepted. */
  RcptTo = 'rcpt_to',
  /** DATA command sent, ready for content. */
  Data = 'data',
  /** Message content being sent. */
  DataContent = 'data_content',
  /** Message sent successfully. */
  Completed = 'completed',
  /** Transaction failed. */
  Failed = 'failed',
}

/**
 * Validates state transitions.
 */
export function canTransition(from: TransactionState, to: TransactionState): boolean {
  const validTransitions: Record<TransactionState, TransactionState[]> = {
    [TransactionState.Disconnected]: [TransactionState.Connected],
    [TransactionState.Connected]: [TransactionState.Greeting, TransactionState.Disconnected],
    [TransactionState.Greeting]: [TransactionState.Ready, TransactionState.Failed],
    [TransactionState.Ready]: [
      TransactionState.StartingTls,
      TransactionState.Authenticating,
      TransactionState.MailFrom,
      TransactionState.Disconnected,
    ],
    [TransactionState.StartingTls]: [TransactionState.TlsEstablished, TransactionState.Failed],
    [TransactionState.TlsEstablished]: [
      TransactionState.Greeting, // Re-EHLO after STARTTLS
      TransactionState.Authenticating,
      TransactionState.MailFrom,
    ],
    [TransactionState.Authenticating]: [
      TransactionState.Authenticated,
      TransactionState.Ready,
      TransactionState.Failed,
    ],
    [TransactionState.Authenticated]: [
      TransactionState.MailFrom,
      TransactionState.Disconnected,
    ],
    [TransactionState.MailFrom]: [TransactionState.RcptTo, TransactionState.Ready, TransactionState.Failed],
    [TransactionState.RcptTo]: [
      TransactionState.RcptTo, // Additional recipients
      TransactionState.Data,
      TransactionState.Ready,
      TransactionState.Failed,
    ],
    [TransactionState.Data]: [TransactionState.DataContent, TransactionState.Failed],
    [TransactionState.DataContent]: [TransactionState.Completed, TransactionState.Failed],
    [TransactionState.Completed]: [TransactionState.MailFrom, TransactionState.Ready, TransactionState.Disconnected],
    [TransactionState.Failed]: [TransactionState.Ready, TransactionState.Disconnected],
  };

  return validTransitions[from]?.includes(to) ?? false;
}

/**
 * SMTP session state manager.
 */
export class SmtpSession {
  private state: TransactionState = TransactionState.Disconnected;
  private capabilities?: EsmtpCapabilities;
  private isAuthenticated = false;
  private isTlsEnabled = false;

  /** Gets the current state. */
  getState(): TransactionState {
    return this.state;
  }

  /** Gets server capabilities. */
  getCapabilities(): EsmtpCapabilities | undefined {
    return this.capabilities;
  }

  /** Checks if authenticated. */
  isSessionAuthenticated(): boolean {
    return this.isAuthenticated;
  }

  /** Checks if TLS is enabled. */
  isTlsActive(): boolean {
    return this.isTlsEnabled;
  }

  /**
   * Transitions to a new state.
   */
  transition(to: TransactionState): void {
    if (!canTransition(this.state, to)) {
      throw new SmtpError(
        SmtpErrorKind.CommandSequenceError,
        `Invalid state transition from ${this.state} to ${to}`
      );
    }
    this.state = to;
  }

  /**
   * Sets capabilities from EHLO response.
   */
  setCapabilities(caps: EsmtpCapabilities): void {
    this.capabilities = caps;
  }

  /**
   * Marks TLS as enabled.
   */
  enableTls(): void {
    this.isTlsEnabled = true;
  }

  /**
   * Marks as authenticated.
   */
  authenticate(): void {
    this.isAuthenticated = true;
    this.state = TransactionState.Authenticated;
  }

  /**
   * Resets the transaction (RSET command).
   */
  reset(): void {
    if (this.isAuthenticated) {
      this.state = TransactionState.Authenticated;
    } else if (this.isTlsEnabled) {
      this.state = TransactionState.TlsEstablished;
    } else {
      this.state = TransactionState.Ready;
    }
  }

  /**
   * Marks the session as disconnected.
   */
  disconnect(): void {
    this.state = TransactionState.Disconnected;
    this.capabilities = undefined;
    this.isAuthenticated = false;
    this.isTlsEnabled = false;
  }
}
