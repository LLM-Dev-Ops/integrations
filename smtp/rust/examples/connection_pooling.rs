//! Connection Pooling Example
//!
//! This example demonstrates how to:
//! - Configure connection pool settings
//! - Send batch emails efficiently using pooled connections
//! - Monitor pool status and statistics
//! - Handle connection reuse and lifecycle

use smtp_integration::{
    SmtpClient, SmtpConfig, Email, EmailAddress, PoolConfig, SmtpError,
};
use std::time::Duration;
use tokio::time::sleep;

#[tokio::main]
async fn main() -> Result<(), SmtpError> {
    // Configure connection pooling for efficient batch sending
    let pool_config = PoolConfig::builder()
        .max_connections(10)           // Maximum number of pooled connections
        .min_idle_connections(2)        // Minimum number of idle connections to maintain
        .max_idle_time(Duration::from_secs(300))  // Close idle connections after 5 minutes
        .connection_timeout(Duration::from_secs(30))  // Timeout for establishing connections
        .idle_timeout(Duration::from_secs(60))    // Timeout for idle connections
        .test_on_checkout(true)         // Verify connection health before use
        .build()?;

    // Configure the SMTP client with pooling
    let config = SmtpConfig::builder()
        .host("smtp.example.com")
        .port(587)
        .username("user@example.com")
        .password("your-password")
        .use_tls(true)
        .use_starttls(true)
        .pool_config(pool_config)
        .build()?;

    println!("Creating SMTP client with connection pooling...");
    let client = SmtpClient::new(config)?;

    // Display initial pool status
    print_pool_status(&client);

    // Example 1: Send a batch of emails
    println!("\n=== Sending batch emails ===");
    send_batch_emails(&client).await?;

    // Display pool status after batch
    print_pool_status(&client);

    // Example 2: Send emails concurrently
    println!("\n=== Sending emails concurrently ===");
    send_concurrent_emails(&client).await?;

    // Display pool status after concurrent sends
    print_pool_status(&client);

    // Example 3: Monitor pool during sustained load
    println!("\n=== Sustained load test ===");
    sustained_load_test(&client).await?;

    // Final pool status
    print_pool_status(&client);

    // Graceful shutdown
    println!("\n=== Shutting down ===");
    client.close_pool().await?;
    println!("Connection pool closed gracefully");

    Ok(())
}

/// Send a batch of emails sequentially
async fn send_batch_emails(client: &SmtpClient) -> Result<(), SmtpError> {
    let recipients = vec![
        ("alice@example.com", "Alice"),
        ("bob@example.com", "Bob"),
        ("charlie@example.com", "Charlie"),
        ("diana@example.com", "Diana"),
        ("eve@example.com", "Eve"),
    ];

    for (i, (email, name)) in recipients.iter().enumerate() {
        let email_msg = Email::builder()
            .from(EmailAddress::new("newsletter@example.com", Some("Newsletter Team")))
            .to(EmailAddress::new(email, Some(name)))
            .subject(format!("Weekly Newsletter #{}", i + 1))
            .text_body(format!(
                "Hello {},\n\nWelcome to this week's newsletter!\n\nBest regards,\nThe Team",
                name
            ))
            .build()?;

        print!("  Sending to {}... ", name);
        match client.send(&email_msg).await {
            Ok(response) => println!("OK (Message ID: {:?})", response.message_id),
            Err(e) => println!("FAILED: {}", e),
        }

        // Small delay between sends
        sleep(Duration::from_millis(100)).await;
    }

    println!("Batch complete: {} emails sent", recipients.len());
    Ok(())
}

/// Send emails concurrently using the connection pool
async fn send_concurrent_emails(client: &SmtpClient) -> Result<(), SmtpError> {
    let recipients = vec![
        ("user1@example.com", "User 1"),
        ("user2@example.com", "User 2"),
        ("user3@example.com", "User 3"),
        ("user4@example.com", "User 4"),
        ("user5@example.com", "User 5"),
        ("user6@example.com", "User 6"),
        ("user7@example.com", "User 7"),
        ("user8@example.com", "User 8"),
    ];

    println!("  Sending {} emails concurrently...", recipients.len());

    // Create futures for all email sends
    let send_futures: Vec<_> = recipients
        .into_iter()
        .map(|(email, name)| {
            let client = client.clone();
            async move {
                let email_msg = Email::builder()
                    .from(EmailAddress::new("notifications@example.com", Some("Notification Service")))
                    .to(EmailAddress::new(email, Some(name)))
                    .subject("Important Update")
                    .text_body(format!("Hello {},\n\nThis is an important update.\n", name))
                    .build()?;

                client.send(&email_msg).await
            }
        })
        .collect();

    // Execute all sends concurrently
    let results = futures::future::join_all(send_futures).await;

    // Count successes and failures
    let successful = results.iter().filter(|r| r.is_ok()).count();
    let failed = results.iter().filter(|r| r.is_err()).count();

    println!("  Concurrent sends complete:");
    println!("    Successful: {}", successful);
    println!("    Failed: {}", failed);

    Ok(())
}

/// Simulate sustained load to observe pool behavior
async fn sustained_load_test(client: &SmtpClient) -> Result<(), SmtpError> {
    println!("  Running sustained load test (30 emails over 10 seconds)...");

    let start = std::time::Instant::now();
    let mut sent_count = 0;

    // Send emails for 10 seconds
    while start.elapsed() < Duration::from_secs(10) {
        let email = Email::builder()
            .from(EmailAddress::new("loadtest@example.com", Some("Load Test")))
            .to(EmailAddress::new("recipient@example.com", Some("Recipient")))
            .subject(format!("Load Test Email #{}", sent_count + 1))
            .text_body("This is a load test email.")
            .build()?;

        if let Ok(_) = client.send(&email).await {
            sent_count += 1;
            if sent_count % 10 == 0 {
                print_pool_status(client);
            }
        }

        sleep(Duration::from_millis(333)).await; // ~3 emails per second
    }

    let duration = start.elapsed();
    let rate = sent_count as f64 / duration.as_secs_f64();

    println!("  Sustained load test complete:");
    println!("    Emails sent: {}", sent_count);
    println!("    Duration: {:.2}s", duration.as_secs_f64());
    println!("    Rate: {:.2} emails/second", rate);

    Ok(())
}

/// Print current pool status
fn print_pool_status(client: &SmtpClient) {
    if let Some(status) = client.pool_status() {
        println!("\n  Pool Status:");
        println!("    Total connections: {}", status.total_connections);
        println!("    Active connections: {}", status.active_connections);
        println!("    Idle connections: {}", status.idle_connections);
        println!("    Waiting requests: {}", status.waiting_requests);
        println!("    Max connections: {}", status.max_connections);

        let utilization = if status.max_connections > 0 {
            (status.active_connections as f64 / status.max_connections as f64) * 100.0
        } else {
            0.0
        };
        println!("    Utilization: {:.1}%", utilization);
    } else {
        println!("  Connection pooling is not enabled");
    }
}

// Advanced example: Custom pool monitoring with metrics
#[allow(dead_code)]
async fn monitor_pool_with_metrics(client: &SmtpClient) -> Result<(), SmtpError> {
    println!("\n=== Pool Monitoring ===");

    // Spawn a background task to monitor pool health
    let client_clone = client.clone();
    let monitor_handle = tokio::spawn(async move {
        loop {
            if let Some(status) = client_clone.pool_status() {
                // Log metrics (in production, you'd send these to a monitoring system)
                println!("[MONITOR] Active: {}, Idle: {}, Waiting: {}",
                    status.active_connections,
                    status.idle_connections,
                    status.waiting_requests
                );

                // Alert if pool is exhausted
                if status.waiting_requests > 0 {
                    eprintln!("[ALERT] Pool exhausted! {} requests waiting",
                        status.waiting_requests);
                }

                // Alert if utilization is high
                let utilization = status.active_connections as f64 / status.max_connections as f64;
                if utilization > 0.8 {
                    println!("[WARNING] High pool utilization: {:.1}%", utilization * 100.0);
                }
            }

            sleep(Duration::from_secs(5)).await;
        }
    });

    // Let it run for a bit
    sleep(Duration::from_secs(30)).await;

    // Cancel monitoring
    monitor_handle.abort();

    Ok(())
}
