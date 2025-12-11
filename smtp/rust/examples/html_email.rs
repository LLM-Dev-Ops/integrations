//! HTML Email with Text Alternative Example
//!
//! This example demonstrates how to:
//! - Create an email with both HTML and text body parts
//! - Use multipart/alternative for email client compatibility
//! - Include rich formatting with HTML

use smtp_integration::{SmtpClient, SmtpConfig, Email, EmailAddress, SmtpError};

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

    // Define the plain text version
    // This is what users with text-only email clients will see
    let text_body = r#"
Welcome to Our Service!

Hello there,

Thank you for signing up for our service. We're excited to have you on board!

Here are your next steps:
1. Verify your email address
2. Complete your profile
3. Explore our features

If you have any questions, feel free to reach out to our support team.

Best regards,
The Team
"#.trim();

    // Define the HTML version
    // This provides a richer experience for modern email clients
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
            background-color: #4CAF50;
            color: white;
            padding: 20px;
            text-align: center;
        }
        .content {
            padding: 20px;
            background-color: #f9f9f9;
        }
        .steps {
            background-color: white;
            padding: 15px;
            margin: 15px 0;
            border-left: 4px solid #4CAF50;
        }
        .footer {
            text-align: center;
            padding: 20px;
            font-size: 12px;
            color: #666;
        }
        .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #4CAF50;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Welcome to Our Service!</h1>
    </div>
    <div class="content">
        <p>Hello there,</p>
        <p>Thank you for signing up for our service. We're excited to have you on board!</p>

        <div class="steps">
            <h3>Your Next Steps:</h3>
            <ol>
                <li>Verify your email address</li>
                <li>Complete your profile</li>
                <li>Explore our features</li>
            </ol>
        </div>

        <p style="text-align: center;">
            <a href="https://example.com/verify" class="button">Verify Email Address</a>
        </p>

        <p>If you have any questions, feel free to reach out to our support team.</p>
        <p>Best regards,<br><strong>The Team</strong></p>
    </div>
    <div class="footer">
        <p>© 2025 Example Company. All rights reserved.</p>
    </div>
</body>
</html>
"#.trim();

    // Build the multipart/alternative email
    // Email clients will display the HTML version if supported, otherwise fall back to text
    let email = Email::builder()
        .from(EmailAddress::new("noreply@example.com", Some("Example Service")))
        .to(EmailAddress::new("user@example.com", Some("New User")))
        .subject("Welcome to Our Service!")
        .text_body(text_body)
        .html_body(html_body)
        .build()?;

    println!("Sending HTML email with text alternative...");
    println!("  From: {}", email.from.email);
    println!("  To: {}", email.to.iter().map(|a| a.email.as_str()).collect::<Vec<_>>().join(", "));
    println!("  Subject: {}", email.subject);
    println!("  Content-Type: multipart/alternative");

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
