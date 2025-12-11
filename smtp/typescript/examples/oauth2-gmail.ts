/**
 * Gmail OAuth2 Authentication Example
 *
 * This example demonstrates how to send emails through Gmail using
 * OAuth2 authentication (XOAUTH2 SASL mechanism).
 *
 * Prerequisites:
 * 1. Create a project in Google Cloud Console
 * 2. Enable Gmail API
 * 3. Create OAuth 2.0 credentials (OAuth client ID)
 * 4. Get a refresh token using the OAuth 2.0 Playground or your own flow
 */

import {
  smtpClient,
  EmailBuilder,
  TlsMode,
  AuthMethod,
  createOAuth2Token,
  createOAuth2Authenticator,
  OAuth2Provider,
  OAuth2Token,
} from '@integrations/smtp';

/**
 * Gmail OAuth2 configuration
 * Replace these values with your actual credentials
 */
const GMAIL_CONFIG = {
  clientId: 'your-client-id.apps.googleusercontent.com',
  clientSecret: 'your-client-secret',
  refreshToken: 'your-refresh-token',
  userEmail: 'your-email@gmail.com',
};

/**
 * Custom OAuth2 provider that refreshes access tokens
 */
class GmailOAuth2Provider implements OAuth2Provider {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private userEmail: string;
  private cachedToken: OAuth2Token | null = null;
  private tokenExpiry: number = 0;

  constructor(config: typeof GMAIL_CONFIG) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.refreshToken = config.refreshToken;
    this.userEmail = config.userEmail;
  }

  async getToken(): Promise<OAuth2Token> {
    // Return cached token if still valid
    const now = Date.now();
    if (this.cachedToken && now < this.tokenExpiry) {
      console.log('Using cached OAuth2 token');
      return this.cachedToken;
    }

    console.log('Refreshing OAuth2 token...');

    // Request a new access token from Google
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh OAuth2 token: ${error}`);
    }

    const data = await response.json();

    // Create and cache the new token
    this.cachedToken = createOAuth2Token({
      user: this.userEmail,
      accessToken: data.access_token,
    });

    // Set token expiry (subtract 5 minutes for safety)
    const expiresIn = data.expires_in || 3600;
    this.tokenExpiry = now + (expiresIn - 300) * 1000;

    console.log('OAuth2 token refreshed successfully');
    return this.cachedToken;
  }
}

async function main() {
  // Create OAuth2 provider
  const oauth2Provider = new GmailOAuth2Provider(GMAIL_CONFIG);

  // Create OAuth2 authenticator
  const authenticator = createOAuth2Authenticator(oauth2Provider);

  // Create SMTP client configured for Gmail
  const client = smtpClient()
    .host('smtp.gmail.com')
    .port(587) // Gmail SMTP port with STARTTLS
    .tlsMode(TlsMode.StartTls)
    .authMethod(AuthMethod.XOAuth2)
    .authenticator(authenticator)
    .connectTimeout(15000)
    .commandTimeout(30000)
    .build();

  try {
    // Build the email
    const email = new EmailBuilder()
      .from(GMAIL_CONFIG.userEmail)
      .to('recipient@example.com')
      .subject('Test Email via Gmail OAuth2')
      .text('This email was sent using Gmail SMTP with OAuth2 authentication.')
      .html(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body>
  <h2>Gmail OAuth2 Test</h2>
  <p>This email was sent using Gmail SMTP with OAuth2 authentication.</p>
  <p>Benefits of OAuth2:</p>
  <ul>
    <li>More secure than password authentication</li>
    <li>Tokens can be revoked without changing password</li>
    <li>Granular permissions</li>
    <li>No need to enable "Less secure app access"</li>
  </ul>
</body>
</html>
      `)
      .build();

    console.log('Sending email via Gmail with OAuth2...');

    // Send the email
    const result = await client.send(email);

    console.log('Email sent successfully!');
    console.log('Message ID:', result.messageId);

  } catch (error) {
    console.error('Failed to send email via Gmail:', error);
    throw error;
  } finally {
    await client.close();
  }
}

/**
 * Example: Send multiple emails using connection pooling
 */
async function sendBatchWithGmail() {
  const oauth2Provider = new GmailOAuth2Provider(GMAIL_CONFIG);
  const authenticator = createOAuth2Authenticator(oauth2Provider);

  // Enable connection pooling for better performance
  const client = smtpClient()
    .host('smtp.gmail.com')
    .port(587)
    .tlsMode(TlsMode.StartTls)
    .authMethod(AuthMethod.XOAuth2)
    .authenticator(authenticator)
    // Configure connection pool
    .poolConfig({
      maxConnections: 3, // Gmail may rate limit, so use fewer connections
      minIdleConnections: 1,
      maxIdleTime: 60000,
      acquireTimeout: 10000,
    })
    // Configure rate limiting to respect Gmail's sending limits
    .rateLimitConfig({
      maxPerSecond: 2, // Send max 2 emails per second
      maxPerMinute: 50, // Gmail free tier: ~100/minute, be conservative
      maxPerHour: 500,
      onLimitBehavior: 'throttle' as const,
    })
    .build();

  try {
    const recipients = [
      'user1@example.com',
      'user2@example.com',
      'user3@example.com',
      'user4@example.com',
      'user5@example.com',
    ];

    const emails = recipients.map(recipient =>
      new EmailBuilder()
        .from(GMAIL_CONFIG.userEmail)
        .to(recipient)
        .subject('Newsletter - December 2025')
        .text('Check out our latest newsletter!')
        .build()
    );

    console.log(`Sending ${emails.length} emails via Gmail...`);

    // Send batch
    const result = await client.sendBatch(emails);

    console.log('Batch send complete!');
    console.log('Successful:', result.successful.length);
    console.log('Failed:', result.failed.length);

    if (result.failed.length > 0) {
      console.error('Failed emails:');
      for (const failed of result.failed) {
        console.error(`  - ${failed.email.to[0].address}: ${failed.error.message}`);
      }
    }

  } finally {
    await client.close();
  }
}

/**
 * Important notes for using Gmail:
 *
 * 1. Sending Limits:
 *    - Free Gmail: 500 emails/day, ~100/minute
 *    - Google Workspace: 2000 emails/day, ~200/minute
 *
 * 2. OAuth2 Setup:
 *    - Use Google Cloud Console to create OAuth credentials
 *    - Add https://mail.google.com/ to scopes
 *    - Use OAuth 2.0 Playground to get refresh token
 *
 * 3. Security:
 *    - Store credentials in environment variables or secure vault
 *    - Never commit OAuth credentials to version control
 *    - Rotate tokens regularly
 *
 * 4. Rate Limiting:
 *    - Gmail enforces rate limits
 *    - Use the rate limiter to avoid hitting limits
 *    - Monitor for 421 and 450 response codes
 *
 * 5. Best Practices:
 *    - Enable connection pooling for batch sends
 *    - Implement retry logic with exponential backoff
 *    - Monitor metrics for failures
 *    - Use SPF, DKIM, and DMARC for better deliverability
 */

// Run the example
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main, sendBatchWithGmail, GmailOAuth2Provider };
