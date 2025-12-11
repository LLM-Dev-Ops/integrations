//! Email with Attachments Example
//!
//! This example demonstrates how to:
//! - Attach files to an email
//! - Include inline images in HTML body
//! - Handle different attachment types (documents, images, etc.)

use smtp_integration::{
    SmtpClient, SmtpConfig, Email, EmailAddress, Attachment, SmtpError,
};
use std::fs;

#[tokio::main]
async fn main() -> Result<(), SmtpError> {
    // Configure the SMTP client
    let config = SmtpConfig::builder()
        .host("smtp.example.com")
        .port(587)
        .username("user@example.com")
        .password("your-password")
        .use_tls(true)
        .use_starttls(true)
        .build()?;

    // Create the SMTP client
    println!("Creating SMTP client...");
    let client = SmtpClient::new(config)?;

    // Plain text version
    let text_body = r#"
Monthly Report - December 2025

Please find attached the monthly report for December 2025.

The report includes:
- Sales summary
- Performance metrics
- Regional breakdowns

If you have any questions about the report, please don't hesitate to reach out.

Best regards,
Analytics Team
"#.trim();

    // HTML version with inline image reference
    let html_body = r#"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
        }
        .header {
            background-color: #2196F3;
            color: white;
            padding: 20px;
            text-align: center;
        }
        .content {
            padding: 20px;
        }
        .logo {
            max-width: 200px;
            margin: 20px auto;
            display: block;
        }
        .highlights {
            background-color: #f0f8ff;
            padding: 15px;
            margin: 15px 0;
            border-radius: 5px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Monthly Report - December 2025</h1>
    </div>
    <div class="content">
        <!-- Inline image reference using Content-ID -->
        <img src="cid:company-logo" alt="Company Logo" class="logo">

        <p>Please find attached the monthly report for December 2025.</p>

        <div class="highlights">
            <h3>Report Contents:</h3>
            <ul>
                <li>Sales summary</li>
                <li>Performance metrics</li>
                <li>Regional breakdowns</li>
            </ul>
        </div>

        <p>If you have any questions about the report, please don't hesitate to reach out.</p>
        <p>Best regards,<br><strong>Analytics Team</strong></p>
    </div>
</body>
</html>
"#.trim();

    // Create a sample PDF attachment (in real use, you'd read an actual file)
    // For demonstration, we'll create a simple text file as an attachment
    let report_content = b"Monthly Report - December 2025\n\nSales: $1,234,567\nGrowth: +15%\n";
    let report_attachment = Attachment::builder()
        .filename("monthly_report_dec2025.pdf")
        .content_type("application/pdf")
        .data(report_content.to_vec())
        .build()?;

    // Create a CSV attachment
    let csv_content = b"Date,Sales,Region\n2025-12-01,50000,North\n2025-12-02,45000,South\n";
    let csv_attachment = Attachment::builder()
        .filename("sales_data.csv")
        .content_type("text/csv")
        .data(csv_content.to_vec())
        .build()?;

    // Create an inline image attachment
    // This is a simple 1x1 PNG (in real use, you'd read an actual logo file)
    let logo_data = vec![
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        // ... (simplified for example)
    ];
    let logo_attachment = Attachment::builder()
        .filename("logo.png")
        .content_type("image/png")
        .data(logo_data)
        .content_id("company-logo") // Content-ID for inline reference
        .inline(true) // Mark as inline
        .build()?;

    // Alternative: Read attachments from files
    // Uncomment these lines if you have actual files to attach
    /*
    let report_data = fs::read("path/to/monthly_report.pdf")
        .map_err(|e| SmtpError::IoError(e))?;
    let report_attachment = Attachment::builder()
        .filename("monthly_report_dec2025.pdf")
        .content_type("application/pdf")
        .data(report_data)
        .build()?;

    let logo_data = fs::read("path/to/company_logo.png")
        .map_err(|e| SmtpError::IoError(e))?;
    let logo_attachment = Attachment::builder()
        .filename("logo.png")
        .content_type("image/png")
        .data(logo_data)
        .content_id("company-logo")
        .inline(true)
        .build()?;
    */

    // Build the email with attachments
    let email = Email::builder()
        .from(EmailAddress::new("analytics@example.com", Some("Analytics Team")))
        .to(EmailAddress::new("manager@example.com", Some("Department Manager")))
        .cc(EmailAddress::new("director@example.com", Some("Director")))
        .subject("Monthly Report - December 2025")
        .text_body(text_body)
        .html_body(html_body)
        .attachment(report_attachment)
        .attachment(csv_attachment)
        .attachment(logo_attachment)
        .build()?;

    println!("Sending email with attachments...");
    println!("  From: {}", email.from.email);
    println!("  To: {}", email.to.iter().map(|a| a.email.as_str()).collect::<Vec<_>>().join(", "));
    println!("  Subject: {}", email.subject);
    println!("  Attachments: {}", email.attachments.len());

    for attachment in &email.attachments {
        if attachment.inline {
            println!("    - {} (inline, Content-ID: {})",
                attachment.filename,
                attachment.content_id.as_deref().unwrap_or("N/A"));
        } else {
            println!("    - {} ({} bytes)",
                attachment.filename,
                attachment.data.len());
        }
    }

    // Send the email
    match client.send(&email).await {
        Ok(response) => {
            println!("Email sent successfully!");
            println!("  Message ID: {:?}", response.message_id);
            println!("  Status: {}", response.status);
        }
        Err(e) => {
            eprintln!("Failed to send email: {}", e);
            return Err(e);
        }
    }

    Ok(())
}
