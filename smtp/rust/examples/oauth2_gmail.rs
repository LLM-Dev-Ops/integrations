//! Gmail OAuth2 Authentication Example
//!
//! This example demonstrates how to:
//! - Configure XOAUTH2 authentication for Gmail
//! - Obtain OAuth2 access tokens
//! - Connect to Gmail's SMTP server
//! - Send emails using OAuth2 credentials

use smtp_integration::{
    SmtpClient, SmtpConfig, Email, EmailAddress, AuthMethod, SmtpError,
};

#[tokio::main]
async fn main() -> Result<(), SmtpError> {
    // Gmail SMTP server settings
    const GMAIL_SMTP_HOST: &str = "smtp.gmail.com";
    const GMAIL_SMTP_PORT: u16 = 587;

    // OAuth2 credentials
    // In a real application, you would:
    // 1. Register your app in Google Cloud Console
    // 2. Enable Gmail API
    // 3. Create OAuth 2.0 credentials
    // 4. Implement OAuth2 flow to get access token
    // 5. Refresh tokens when they expire

    // For this example, we'll show how to use an access token
    // Note: This is a placeholder - you need to implement the OAuth2 flow
    let oauth2_access_token = get_oauth2_access_token().await?;
    let user_email = "your-email@gmail.com";

    // Configure SMTP client with OAuth2
    let config = SmtpConfig::builder()
        .host(GMAIL_SMTP_HOST)
        .port(GMAIL_SMTP_PORT)
        .auth_method(AuthMethod::OAuth2 {
            user: user_email.to_string(),
            access_token: oauth2_access_token,
        })
        .use_tls(true)
        .use_starttls(true)
        .timeout_seconds(30)
        .build()?;

    println!("Creating Gmail SMTP client with OAuth2...");
    let client = SmtpClient::new(config)?;

    // Build the email
    let email = Email::builder()
        .from(EmailAddress::new(user_email, Some("Your Name")))
        .to(EmailAddress::new("recipient@example.com", Some("Recipient")))
        .subject("Test Email via Gmail OAuth2")
        .text_body("This email was sent using Gmail's SMTP server with OAuth2 authentication.")
        .html_body(r#"
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; }
        .success { color: #4CAF50; font-weight: bold; }
    </style>
</head>
<body>
    <h2>OAuth2 Authentication Success!</h2>
    <p class="success">This email was sent using Gmail's SMTP server with OAuth2 authentication.</p>
    <p>This demonstrates secure, token-based authentication without storing passwords.</p>
</body>
</html>
"#)
        .build()?;

    println!("Sending email via Gmail...");
    println!("  From: {}", email.from.email);
    println!("  To: {}", email.to.iter().map(|a| a.email.as_str()).collect::<Vec<_>>().join(", "));
    println!("  Subject: {}", email.subject);
    println!("  Auth: OAuth2");

    // Send the email
    match client.send(&email).await {
        Ok(response) => {
            println!("Email sent successfully via Gmail!");
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

/// Get OAuth2 access token for Gmail
///
/// In a real application, you would implement the full OAuth2 flow:
/// 1. Redirect user to Google's authorization endpoint
/// 2. User grants permission
/// 3. Exchange authorization code for access token and refresh token
/// 4. Store refresh token securely
/// 5. Use refresh token to get new access tokens when they expire
///
/// This is a simplified example showing the structure.
async fn get_oauth2_access_token() -> Result<String, SmtpError> {
    // Example OAuth2 flow (simplified)
    // You would typically use a library like `oauth2` or `yup-oauth2`

    println!("\n=== OAuth2 Setup Instructions ===");
    println!("1. Go to Google Cloud Console: https://console.cloud.google.com/");
    println!("2. Create a new project or select an existing one");
    println!("3. Enable Gmail API");
    println!("4. Create OAuth 2.0 credentials (Desktop app or Web app)");
    println!("5. Download the credentials JSON file");
    println!("\n6. Implement OAuth2 flow:");
    println!("   - Authorization URL: https://accounts.google.com/o/oauth2/v2/auth");
    println!("   - Token URL: https://oauth2.googleapis.com/token");
    println!("   - Scopes: https://mail.google.com/");
    println!("\n7. Example using `yup-oauth2` crate:");
    println!("   ```rust");
    println!("   use yup_oauth2::{{InstalledFlowAuthenticator, InstalledFlowReturnMethod}};");
    println!("   ");
    println!("   let secret = yup_oauth2::read_application_secret(\"credentials.json\").await?;");
    println!("   let auth = InstalledFlowAuthenticator::builder(");
    println!("       secret,");
    println!("       InstalledFlowReturnMethod::HTTPRedirect,");
    println!("   )");
    println!("   .build()");
    println!("   .await?;");
    println!("   ");
    println!("   let scopes = &[\"https://mail.google.com/\"];");
    println!("   let token = auth.token(scopes).await?;");
    println!("   ```");
    println!("================================\n");

    // In a real implementation, you would:
    // 1. Load credentials from file or environment
    // 2. Check if we have a valid cached token
    // 3. If not, perform OAuth2 flow
    // 4. Return the access token

    // For this example, we'll read from an environment variable
    std::env::var("GMAIL_OAUTH2_ACCESS_TOKEN")
        .map_err(|_| SmtpError::AuthenticationFailed(
            "GMAIL_OAUTH2_ACCESS_TOKEN environment variable not set.\n\
             Please obtain an OAuth2 access token and set it in the environment.\n\
             See the instructions above for details.".to_string()
        ))
}

// Advanced example: Using yup-oauth2 for token management
// Uncomment and add `yup-oauth2` to your Cargo.toml to use this

/*
use yup_oauth2::{InstalledFlowAuthenticator, InstalledFlowReturnMethod};

async fn get_oauth2_access_token_with_library() -> Result<String, SmtpError> {
    // Read OAuth2 credentials from file
    let secret = yup_oauth2::read_application_secret("credentials.json")
        .await
        .map_err(|e| SmtpError::ConfigurationError(format!("Failed to read credentials: {}", e)))?;

    // Create authenticator
    let auth = InstalledFlowAuthenticator::builder(
        secret,
        InstalledFlowReturnMethod::HTTPRedirect,
    )
    .persist_tokens_to_disk("tokens.json")
    .build()
    .await
    .map_err(|e| SmtpError::ConfigurationError(format!("Failed to create authenticator: {}", e)))?;

    // Get token (this will open a browser for first-time authorization)
    let scopes = &["https://mail.google.com/"];
    let token = auth
        .token(scopes)
        .await
        .map_err(|e| SmtpError::AuthenticationFailed(format!("Failed to get token: {}", e)))?;

    Ok(token.token().unwrap().to_string())
}
*/
