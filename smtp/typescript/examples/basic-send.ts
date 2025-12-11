/**
 * Basic Email Sending Example
 *
 * This example demonstrates the simplest way to send a plain text email
 * using the SMTP client.
 */

import {
  smtpClient,
  EmailBuilder,
  TlsMode,
  SmtpError,
} from '@integrations/smtp';

async function main() {
  // Create an SMTP client using the builder pattern
  // This example uses a typical SMTP configuration with STARTTLS on port 587
  const client = smtpClient()
    .host('smtp.example.com')
    .port(587)
    .credentials('user@example.com', 'your-password')
    .tlsMode(TlsMode.StartTls) // Use STARTTLS for secure connection
    .connectTimeout(10000) // 10 second connection timeout
    .commandTimeout(30000) // 30 second command timeout
    .build();

  try {
    // Build a simple text email using the EmailBuilder
    const email = new EmailBuilder()
      .from('sender@example.com')
      .to('recipient@example.com')
      .subject('Hello from SMTP Client')
      .text('This is a simple plain text email sent using the SMTP client library.')
      .build();

    console.log('Sending email...');

    // Send the email and get the result
    const result = await client.send(email);

    // The result contains information about the sent email
    console.log('Email sent successfully!');
    console.log('Message ID:', result.messageId);
    console.log('Accepted recipients:', result.acceptedRecipients.length);

    // You can also check if there were any rejected recipients
    if (result.rejectedRecipients.length > 0) {
      console.warn('Some recipients were rejected:');
      for (const rejected of result.rejectedRecipients) {
        console.warn(`  - ${rejected.recipient}: ${rejected.reason}`);
      }
    }

  } catch (error) {
    // Handle SMTP-specific errors
    if (error instanceof SmtpError) {
      console.error('SMTP Error:', error.message);
      console.error('Error kind:', error.kind);

      // Check if the error is retryable
      if (error.isRetryable) {
        console.error('This error might be temporary. Consider retrying.');
      }

      // Access enhanced status code if available
      if (error.enhancedCode) {
        console.error('Enhanced code:', error.enhancedCode.format());
      }
    } else {
      console.error('Unexpected error:', error);
    }
  } finally {
    // Always close the client to release resources
    await client.close();
    console.log('Client closed.');
  }
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
