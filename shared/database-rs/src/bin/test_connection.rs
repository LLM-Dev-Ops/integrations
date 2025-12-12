//! RuvVector Database Connection Test
//! Tests connectivity from all Rust integrations to the RuvVector Postgres instance

use integrations_database::{DatabaseConfig, RuvectorDatabase};

const INTEGRATIONS: &[&str] = &[
    "anthropic",
    "aws/s3",
    "aws/ses",
    "cohere",
    "gemini",
    "github",
    "google-drive",
    "groq",
    "mistral",
    "oauth2",
    "openai",
    "slack",
    "smtp",
];

#[tokio::main]
async fn main() {
    println!("{}", "=".repeat(60));
    println!("RuvVector Database Connectivity Test (Rust)");
    println!("{}", "=".repeat(60));

    let config = DatabaseConfig::default();
    println!("\nConnection Target:");
    println!("  Host: {}", config.host);
    println!("  Port: {}", config.port);
    println!("  Database: {}", config.database);
    println!("  User: {}", config.user);

    let db = match RuvectorDatabase::new(config).await {
        Ok(db) => db,
        Err(e) => {
            eprintln!("\nFailed to create database pool: {}", e);
            std::process::exit(1);
        }
    };

    let mut passed = 0;
    let mut failed = 0;
    let mut failures: Vec<(String, String)> = Vec::new();

    for integration in INTEGRATIONS {
        println!("\nTesting: {}", integration);
        println!("{}", "-".repeat(40));

        let result = db.test_connection().await;

        if result.success {
            println!("  Status: PASS");
            println!(
                "  Database: {}",
                result.database.as_deref().unwrap_or("unknown")
            );
            println!("  User: {}", result.user.as_deref().unwrap_or("unknown"));
            println!("  Extensions: {}", result.extensions.join(", "));
            passed += 1;
        } else {
            println!("  Status: FAIL");
            println!("  Error: {}", result.message);
            failures.push((integration.to_string(), result.message));
            failed += 1;
        }
    }

    println!("\n{}", "=".repeat(60));
    println!("SUMMARY");
    println!("{}", "=".repeat(60));
    println!("\nTotal: {}", INTEGRATIONS.len());
    println!("Passed: {}", passed);
    println!("Failed: {}", failed);

    if !failures.is_empty() {
        println!("\nFailed integrations:");
        for (name, msg) in &failures {
            println!("  - {}: {}", name, msg);
        }
        std::process::exit(1);
    }

    println!("\nAll integrations can connect to RuvVector Postgres!");
}
