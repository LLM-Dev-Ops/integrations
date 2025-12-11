/**
 * HTML Email with Text Alternative Example
 *
 * This example demonstrates how to send a multipart/alternative email
 * containing both HTML and plain text versions of the content.
 * Email clients will display the HTML version if supported, otherwise
 * fall back to the plain text version.
 */

import {
  smtpClient,
  EmailBuilder,
  TlsMode,
  createAddressWithName,
} from '@integrations/smtp';

async function main() {
  // Create SMTP client
  const client = smtpClient()
    .host('smtp.example.com')
    .port(587)
    .credentials('user@example.com', 'your-password')
    .tlsMode(TlsMode.StartTls)
    .build();

  try {
    // Create email addresses with display names
    const from = createAddressWithName('sender@example.com', 'Newsletter Team');
    const to = createAddressWithName('recipient@example.com', 'John Doe');

    // HTML content with styling
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background-color: #4CAF50;
      color: white;
      padding: 20px;
      text-align: center;
      border-radius: 5px 5px 0 0;
    }
    .content {
      background-color: #f9f9f9;
      padding: 20px;
      border: 1px solid #ddd;
      border-radius: 0 0 5px 5px;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #4CAF50;
      color: white;
      text-decoration: none;
      border-radius: 4px;
      margin-top: 15px;
    }
    .footer {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      font-size: 12px;
      color: #666;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Welcome to Our Newsletter!</h1>
  </div>
  <div class="content">
    <h2>Hello John,</h2>
    <p>Thank you for subscribing to our newsletter. We're excited to have you on board!</p>
    <p>Here's what you can expect:</p>
    <ul>
      <li>Weekly updates on our latest products</li>
      <li>Exclusive deals and promotions</li>
      <li>Industry news and insights</li>
    </ul>
    <p>
      <a href="https://example.com/confirm" class="button">Confirm Your Subscription</a>
    </p>
  </div>
  <div class="footer">
    <p>You received this email because you signed up at example.com</p>
    <p><a href="https://example.com/unsubscribe">Unsubscribe</a></p>
  </div>
</body>
</html>
    `.trim();

    // Plain text alternative
    // This will be displayed by email clients that don't support HTML
    const textContent = `
Welcome to Our Newsletter!

Hello John,

Thank you for subscribing to our newsletter. We're excited to have you on board!

Here's what you can expect:
- Weekly updates on our latest products
- Exclusive deals and promotions
- Industry news and insights

Confirm your subscription: https://example.com/confirm

---
You received this email because you signed up at example.com
Unsubscribe: https://example.com/unsubscribe
    `.trim();

    // Build the email with both HTML and text content
    // The library will automatically create a multipart/alternative message
    const email = new EmailBuilder()
      .from(from)
      .to(to)
      .subject('Welcome to Our Newsletter')
      .text(textContent) // Plain text version (fallback)
      .html(htmlContent) // HTML version (preferred)
      // Add CC and BCC if needed
      .cc('team@example.com')
      // Add custom headers
      .header('X-Campaign-ID', 'newsletter-welcome-001')
      .header('List-Unsubscribe', '<https://example.com/unsubscribe>')
      .build();

    console.log('Sending HTML email with text alternative...');

    // Send the email
    const result = await client.send(email);

    console.log('Email sent successfully!');
    console.log('Message ID:', result.messageId);
    console.log('Email size:', email.data ? email.data.length : 0, 'bytes');

  } catch (error) {
    console.error('Failed to send email:', error);
    throw error;
  } finally {
    await client.close();
  }
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
