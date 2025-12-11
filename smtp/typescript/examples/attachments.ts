/**
 * Email with Attachments Example
 *
 * This example demonstrates how to send emails with file attachments
 * and inline images embedded in HTML content.
 */

import {
  smtpClient,
  EmailBuilder,
  TlsMode,
  createAttachment,
  createInlineImage,
} from '@integrations/smtp';
import { readFileSync } from 'fs';
import { join } from 'path';

async function main() {
  // Create SMTP client
  const client = smtpClient()
    .host('smtp.example.com')
    .port(587)
    .credentials('user@example.com', 'your-password')
    .tlsMode(TlsMode.StartTls)
    .build();

  try {
    // Example 1: Create attachment from file content
    // Load a PDF file to attach
    const pdfPath = join(__dirname, 'documents', 'report.pdf');
    const pdfContent = readFileSync(pdfPath);

    const pdfAttachment = createAttachment({
      filename: 'quarterly-report.pdf',
      content: pdfContent,
      contentType: 'application/pdf',
    });

    // Example 2: Create attachment from text content
    const csvContent = Buffer.from(`
Name,Email,Status
John Doe,john@example.com,Active
Jane Smith,jane@example.com,Active
    `.trim());

    const csvAttachment = createAttachment({
      filename: 'users.csv',
      content: csvContent,
      contentType: 'text/csv',
    });

    // Example 3: Create inline images for HTML email
    // Inline images are embedded in the HTML using Content-ID (CID)
    const logoPath = join(__dirname, 'images', 'logo.png');
    const logoContent = readFileSync(logoPath);

    const logoImage = createInlineImage({
      filename: 'logo.png',
      content: logoContent,
      contentType: 'image/png',
      contentId: 'logo123', // This CID is referenced in the HTML
    });

    const chartPath = join(__dirname, 'images', 'chart.png');
    const chartContent = readFileSync(chartPath);

    const chartImage = createInlineImage({
      filename: 'chart.png',
      content: chartContent,
      contentType: 'image/png',
      contentId: 'chart456',
    });

    // HTML content with inline images
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo {
      max-width: 200px;
      height: auto;
    }
    .chart {
      width: 100%;
      max-width: 500px;
      height: auto;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="header">
    <!-- Reference inline image using cid: scheme -->
    <img src="cid:logo123" alt="Company Logo" class="logo">
    <h1>Quarterly Report</h1>
  </div>

  <p>Dear Team,</p>

  <p>Please find attached the quarterly report for Q4 2025.</p>

  <h2>Performance Overview</h2>

  <!-- Reference another inline image -->
  <img src="cid:chart456" alt="Performance Chart" class="chart">

  <p>Key highlights:</p>
  <ul>
    <li>Revenue increased by 23%</li>
    <li>Customer satisfaction score: 9.2/10</li>
    <li>New customers: 1,247</li>
  </ul>

  <p>The full report is attached as a PDF. You'll also find a CSV file with the user statistics.</p>

  <p>Best regards,<br>The Analytics Team</p>
</body>
</html>
    `.trim();

    const textContent = `
Quarterly Report

Dear Team,

Please find attached the quarterly report for Q4 2025.

Key highlights:
- Revenue increased by 23%
- Customer satisfaction score: 9.2/10
- New customers: 1,247

The full report is attached as a PDF. You'll also find a CSV file with the user statistics.

Best regards,
The Analytics Team
    `.trim();

    // Build the email with attachments and inline images
    const email = new EmailBuilder()
      .from('analytics@example.com')
      .to('team@example.com')
      .subject('Q4 2025 Quarterly Report')
      .text(textContent)
      .html(htmlContent)
      // Add regular attachments
      .attachment(pdfAttachment)
      .attachment(csvAttachment)
      // Add inline images
      .inlineImage(logoImage)
      .inlineImage(chartImage)
      .build();

    console.log('Sending email with attachments...');
    console.log('Attachments:', email.attachments.length);
    console.log('Inline images:', email.inlineImages.length);

    // Calculate approximate email size
    const totalSize = email.attachments.reduce((sum, att) => sum + att.content.length, 0) +
                     email.inlineImages.reduce((sum, img) => sum + img.content.length, 0);
    console.log(`Total attachment size: ${(totalSize / 1024).toFixed(2)} KB`);

    // Send the email
    const result = await client.send(email);

    console.log('Email sent successfully!');
    console.log('Message ID:', result.messageId);

    // Note: Large attachments may take longer to send
    // Consider using connection pooling for batch operations

  } catch (error) {
    console.error('Failed to send email with attachments:', error);
    throw error;
  } finally {
    await client.close();
  }
}

// Alternative approach: Send multiple emails with attachments efficiently
async function batchSendWithAttachments() {
  // Enable connection pooling for better performance when sending multiple emails
  const client = smtpClient()
    .host('smtp.example.com')
    .port(587)
    .credentials('user@example.com', 'your-password')
    .tlsMode(TlsMode.StartTls)
    .poolConfig({
      maxConnections: 5,
      minIdleConnections: 2,
      maxIdleTime: 60000,
      acquireTimeout: 10000,
    })
    .build();

  try {
    const recipients = [
      'user1@example.com',
      'user2@example.com',
      'user3@example.com',
    ];

    // Prepare a common attachment
    const attachment = createAttachment({
      filename: 'welcome.pdf',
      content: Buffer.from('PDF content here...'),
      contentType: 'application/pdf',
    });

    const emails = recipients.map(recipient =>
      new EmailBuilder()
        .from('sender@example.com')
        .to(recipient)
        .subject('Welcome Package')
        .text('Please find the welcome package attached.')
        .attachment(attachment)
        .build()
    );

    console.log(`Sending ${emails.length} emails with attachments...`);

    // Send all emails
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

// Run the main example
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export for potential reuse
export { main, batchSendWithAttachments };
