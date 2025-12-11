//! Basic SMTP Email Sending Example
//!
//! This example demonstrates how to:
//! - Create an SMTP client with the builder pattern
//! - Construct a simple text email
//! - Send the email and handle the result

use smtp_integration::{SmtpClient, SmtpConfig, Email, EmailAddress, SmtpError};

#[tokio::main]
async fn main() -> Result<(), SmtpError> {
    // Configure the SMTP client
    // For this example, we'll use a local mail server or testing service
    let config = SmtpConfig::builder()
        .host("smtp.example.com")
        .port(587)
        .username("user@example.com")
        .password("your-password")
        .use_tls(true)
        .use_starttls(true)
        .timeout_seconds(30)
        .build()?;

    // Create the SMTP client
    println!("Creating SMTP client...");
    let client = SmtpClient::new(config)?;

    // Build a simple text email
    let email = Email::builder()
        .from(EmailAddress::new("sender@example.com", Some("Sender Name")))
        .to(EmailAddress::new("recipient@example.com", Some("Recipient Name")))
        .subject("Hello from Rust SMTP!")
        .text_body("This is a simple text email sent using the Rust SMTP integration.\n\nBest regards,\nThe SMTP Bot")
        .build()?;

    println!("Sending email...");
    println!("  From: {}", email.from.email);
    println!("  To: {}", email.to.iter().map(|a| a.email.as_str()).collect::<Vec<_>>().join(", "));
    println!("  Subject: {}", email.subject);

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
