# Microsoft Teams Integration Module - Completion

**SPARC Phase 5: Completion**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/microsoft/teams`

---

## 1. Final File Structure

### 1.1 Rust Implementation

```
integrations/
└── microsoft/
    └── teams/
        └── rust/
            ├── Cargo.toml
            ├── README.md
            ├── src/
            │   ├── lib.rs
            │   ├── client.rs
            │   ├── config.rs
            │   ├── error.rs
            │   ├── validation.rs
            │   │
            │   ├── services/
            │   │   ├── mod.rs
            │   │   ├── webhook/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs
            │   │   │   ├── payload.rs
            │   │   │   └── types.rs
            │   │   ├── bot/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs
            │   │   │   ├── activity.rs
            │   │   │   ├── conversation.rs
            │   │   │   └── types.rs
            │   │   └── graph/
            │   │       ├── mod.rs
            │   │       ├── service.rs
            │   │       ├── teams.rs
            │   │       ├── chats.rs
            │   │       ├── messages.rs
            │   │       └── types.rs
            │   │
            │   ├── cards/
            │   │   ├── mod.rs
            │   │   ├── builder.rs
            │   │   ├── elements.rs
            │   │   ├── actions.rs
            │   │   └── validation.rs
            │   │
            │   ├── routing/
            │   │   ├── mod.rs
            │   │   ├── router.rs
            │   │   ├── rules.rs
            │   │   └── destination.rs
            │   │
            │   ├── transport/
            │   │   ├── mod.rs
            │   │   ├── http.rs
            │   │   └── auth.rs
            │   │
            │   ├── types/
            │   │   ├── mod.rs
            │   │   ├── activity.rs
            │   │   ├── conversation.rs
            │   │   ├── channel.rs
            │   │   ├── chat.rs
            │   │   ├── card.rs
            │   │   └── common.rs
            │   │
            │   └── simulation/
            │       ├── mod.rs
            │       ├── mock_client.rs
            │       └── replay.rs
            │
            └── tests/
                ├── unit/
                │   ├── webhook_tests.rs
                │   ├── bot_tests.rs
                │   ├── graph_tests.rs
                │   ├── card_builder_tests.rs
                │   ├── router_tests.rs
                │   └── validation_tests.rs
                ├── integration/
                │   ├── webhook_integration.rs
                │   ├── bot_integration.rs
                │   ├── graph_integration.rs
                │   └── routing_integration.rs
                └── fixtures/
                    ├── activities/
                    │   ├── message_activity.json
                    │   ├── conversation_update.json
                    │   └── invoke_activity.json
                    ├── graph/
                    │   ├── teams_list.json
                    │   ├── channels_list.json
                    │   └── chat_message.json
                    ├── cards/
                    │   └── adaptive_card.json
                    └── errors/
                        ├── rate_limited.json
                        └── not_found.json
```

### 1.2 TypeScript Implementation

```
integrations/
└── microsoft/
    └── teams/
        └── typescript/
            ├── package.json
            ├── tsconfig.json
            ├── README.md
            ├── src/
            │   ├── index.ts
            │   ├── client.ts
            │   ├── config.ts
            │   ├── error.ts
            │   ├── validation.ts
            │   │
            │   ├── services/
            │   │   ├── index.ts
            │   │   ├── webhook/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts
            │   │   │   └── types.ts
            │   │   ├── bot/
            │   │   │   ├── index.ts
            │   │   │   ├── service.ts
            │   │   │   └── types.ts
            │   │   └── graph/
            │   │       ├── index.ts
            │   │       ├── service.ts
            │   │       └── types.ts
            │   │
            │   ├── cards/
            │   │   ├── index.ts
            │   │   ├── builder.ts
            │   │   └── validation.ts
            │   │
            │   ├── routing/
            │   │   ├── index.ts
            │   │   ├── router.ts
            │   │   └── rules.ts
            │   │
            │   ├── types/
            │   │   └── index.ts
            │   │
            │   └── simulation/
            │       ├── index.ts
            │       └── mockClient.ts
            │
            └── tests/
                ├── unit/
                ├── integration/
                └── fixtures/
```

---

## 2. Cargo.toml

```toml
[package]
name = "integrations-microsoft-teams"
version = "0.1.0"
edition = "2021"
authors = ["LLM Dev Ops Team"]
description = "Microsoft Teams integration for LLM Dev Ops platform"
license = "MIT"
repository = "https://github.com/org/integrations"
keywords = ["microsoft", "teams", "bot", "webhook", "graph"]
categories = ["api-bindings", "asynchronous"]

[features]
default = ["rustls"]
rustls = ["reqwest/rustls-tls"]
native-tls = ["reqwest/native-tls"]
simulation = []

[dependencies]
# Async runtime
tokio = { version = "1.35", features = ["rt-multi-thread", "macros", "sync"] }

# HTTP client
reqwest = { version = "0.11", default-features = false, features = ["json", "gzip"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Security
secrecy = { version = "0.8", features = ["serde"] }
zeroize = { version = "1.7", features = ["derive"] }

# Error handling
thiserror = "1.0"
anyhow = "1.0"

# Async traits
async-trait = "0.1"

# Time handling
chrono = { version = "0.4", features = ["serde"] }

# Tracing
tracing = "0.1"

# Shared modules (workspace dependencies)
azure-auth = { path = "../../azure/auth" }
shared-resilience = { path = "../../../shared/resilience" }
shared-observability = { path = "../../../shared/observability" }

# UUID generation
uuid = { version = "1.6", features = ["v4", "serde"] }

# URL handling
url = "2.5"

# HTML sanitization
ammonia = "3.3"

[dev-dependencies]
# Testing
tokio-test = "0.4"
mockall = "0.12"
wiremock = "0.5"
claims = "0.7"
proptest = "1.4"
test-case = "3.3"

# Fixtures
serde_yaml = "0.9"
```

---

## 3. Package.json

```json
{
  "name": "@integrations/microsoft-teams",
  "version": "0.1.0",
  "description": "Microsoft Teams integration for LLM Dev Ops platform",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:unit": "jest --testPathPattern=unit",
    "test:integration": "jest --testPathPattern=integration",
    "test:coverage": "jest --coverage",
    "lint": "eslint src --ext .ts",
    "format": "prettier --write src/**/*.ts"
  },
  "dependencies": {
    "@azure/identity": "^4.0.0",
    "@azure/msal-node": "^2.6.0",
    "axios": "^1.6.0",
    "axios-retry": "^4.0.0",
    "zod": "^3.22.0",
    "dompurify": "^3.0.0",
    "jsdom": "^23.0.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/dompurify": "^3.0.0",
    "@types/jest": "^29.5.0",
    "@types/jsdom": "^21.1.0",
    "@types/node": "^20.10.0",
    "@types/uuid": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.55.0",
    "jest": "^29.7.0",
    "nock": "^13.4.0",
    "prettier": "^3.1.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.3.0"
  },
  "peerDependencies": {
    "@integrations/azure-auth": "^0.1.0",
    "@integrations/shared-resilience": "^0.1.0",
    "@integrations/shared-observability": "^0.1.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "keywords": [
    "microsoft",
    "teams",
    "bot",
    "webhook",
    "graph",
    "adaptive-cards"
  ],
  "license": "MIT"
}
```

---

## 4. Implementation Order

### Phase 1: Core Types and Error Handling
1. `types/common.rs` - Common types (ResourceResponse, Mention, Attachment)
2. `types/activity.rs` - Activity, ActivityType, ChannelAccount
3. `types/conversation.rs` - ConversationReference, ConversationAccount
4. `types/channel.rs` - Team, Channel, TeamInfo
5. `types/chat.rs` - Chat, ChatMessage, ChatType
6. `types/card.rs` - AdaptiveCard, CardElement, CardAction
7. `error.rs` - TeamsError enum with all variants
8. `validation.rs` - Input validators

### Phase 2: Configuration and Transport
9. `config.rs` - TeamsConfig, TeamsAuthConfig, TeamsResilienceConfig
10. `transport/auth.rs` - Auth integration with azure/auth
11. `transport/http.rs` - HTTP client with resilience

### Phase 3: Card Builder
12. `cards/elements.rs` - TextBlock, Image, Container, ColumnSet
13. `cards/actions.rs` - OpenUrl, Submit, ShowCard, Execute
14. `cards/validation.rs` - Card validation logic
15. `cards/builder.rs` - CardBuilder fluent API

### Phase 4: Services
16. `services/webhook/types.rs` - WebhookResponse, MessageCard
17. `services/webhook/payload.rs` - Payload builders
18. `services/webhook/service.rs` - WebhookService implementation

19. `services/bot/types.rs` - BotConfig, ActivityHandler
20. `services/bot/activity.rs` - Activity processing
21. `services/bot/conversation.rs` - Conversation management
22. `services/bot/service.rs` - BotService implementation

23. `services/graph/types.rs` - Graph-specific types
24. `services/graph/teams.rs` - Team/channel operations
25. `services/graph/chats.rs` - Chat operations
26. `services/graph/messages.rs` - Message operations
27. `services/graph/service.rs` - GraphService implementation

### Phase 5: Message Routing
28. `routing/destination.rs` - Destination types
29. `routing/rules.rs` - RoutingRule, Condition types
30. `routing/router.rs` - MessageRouter implementation

### Phase 6: Client Facade
31. `client.rs` - TeamsClient facade
32. `lib.rs` - Public exports

### Phase 7: Simulation
33. `simulation/mock_client.rs` - MockTeamsClient
34. `simulation/replay.rs` - Message replay support

### Phase 8: Unit Tests
35. Unit tests for all components

### Phase 9: Integration Tests
36. Integration tests with wiremock

### Phase 10: Documentation
37. README.md and inline documentation

---

## 5. Public API Summary

### 5.1 Rust Public Exports (lib.rs)

```rust
//! Microsoft Teams Integration Module
//!
//! Provides a thin adapter layer for Microsoft Teams messaging, notifications,
//! and workflow interaction.
//!
//! # Features
//! - Webhook messaging (Incoming Webhooks/Connectors)
//! - Bot proactive messaging and activity processing
//! - Microsoft Graph API integration for Teams, Channels, Chats
//! - Adaptive Cards builder with validation
//! - Rule-based message routing
//! - Simulation and replay support
//!
//! # Example
//! ```rust
//! use integrations_microsoft_teams::{TeamsClient, TeamsConfig, CardBuilder};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let config = TeamsConfig::from_env()?;
//!     let client = TeamsClient::new(config).await?;
//!
//!     // Send webhook message
//!     let card = CardBuilder::new()
//!         .title("Alert")
//!         .text("System notification")
//!         .build()?;
//!
//!     client.webhook()
//!         .send_card(&webhook_url, card)
//!         .await?;
//!
//!     Ok(())
//! }
//! ```

// Re-export main client
pub use client::TeamsClient;
pub use config::{TeamsConfig, TeamsAuthConfig, TeamsResilienceConfig};
pub use error::{TeamsError, TeamsResult};

// Services
pub mod services {
    pub use crate::services::webhook::{WebhookService, WebhookResponse};
    pub use crate::services::bot::{BotService, ActivityHandler};
    pub use crate::services::graph::{GraphService, ListOptions, PaginatedResult};
}

// Cards
pub mod cards {
    pub use crate::cards::builder::CardBuilder;
    pub use crate::cards::elements::*;
    pub use crate::cards::actions::*;
}

// Routing
pub mod routing {
    pub use crate::routing::router::{MessageRouter, RoutingResult, DeliveryResult};
    pub use crate::routing::rules::{RoutingRule, RoutingCondition};
    pub use crate::routing::destination::{Destination, ChannelDestination, ChatDestination};
}

// Types
pub mod types {
    pub use crate::types::activity::{Activity, ActivityType};
    pub use crate::types::conversation::{ConversationReference, ConversationAccount};
    pub use crate::types::channel::{Team, Channel, TeamInfo};
    pub use crate::types::chat::{Chat, ChatMessage, ChatType};
    pub use crate::types::card::AdaptiveCard;
    pub use crate::types::common::{ResourceResponse, Mention, Attachment};
}

// Simulation (feature-gated)
#[cfg(feature = "simulation")]
pub mod simulation {
    pub use crate::simulation::mock_client::MockTeamsClient;
    pub use crate::simulation::replay::MessageReplay;
}
```

### 5.2 TypeScript Public Exports (index.ts)

```typescript
// Main client
export { TeamsClient } from './client';
export { TeamsConfig, TeamsAuthConfig, TeamsResilienceConfig } from './config';
export { TeamsError, TeamsErrorCode } from './error';

// Services
export { WebhookService, WebhookResponse } from './services/webhook';
export { BotService, ActivityHandler } from './services/bot';
export { GraphService, ListOptions, PaginatedResult } from './services/graph';

// Cards
export { CardBuilder } from './cards/builder';
export { TextBlock, Image, Container, ColumnSet, FactSet } from './cards/elements';
export { OpenUrlAction, SubmitAction, ShowCardAction } from './cards/actions';

// Routing
export { MessageRouter, RoutingResult, DeliveryResult } from './routing/router';
export { RoutingRule, RoutingCondition } from './routing/rules';
export { Destination, ChannelDestination, ChatDestination } from './routing/destination';

// Types
export {
  Activity,
  ActivityType,
  ConversationReference,
  ConversationAccount,
  Team,
  Channel,
  TeamInfo,
  Chat,
  ChatMessage,
  ChatType,
  AdaptiveCard,
  ResourceResponse,
  Mention,
  Attachment,
} from './types';

// Simulation
export { MockTeamsClient } from './simulation/mockClient';
```

---

## 6. Usage Examples

### 6.1 Webhook Messaging

```rust
use integrations_microsoft_teams::{
    TeamsClient, TeamsConfig,
    cards::CardBuilder,
};
use secrecy::SecretString;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize client
    let config = TeamsConfig::from_env()?;
    let client = TeamsClient::new(config).await?;

    // Webhook URL (stored securely)
    let webhook_url = SecretString::new(
        std::env::var("TEAMS_WEBHOOK_URL")?
    );

    // Simple text message
    client.webhook()
        .send_message(&webhook_url, "Build completed successfully!")
        .await?;

    // Adaptive Card
    let card = CardBuilder::new()
        .title("Deployment Status")
        .text("Production deployment completed")
        .add_fact("Environment", "production")
        .add_fact("Version", "v2.1.0")
        .add_fact("Duration", "3m 42s")
        .add_action_open_url("View Logs", "https://logs.example.com/123")
        .build()?;

    client.webhook()
        .send_card(&webhook_url, card)
        .await?;

    Ok(())
}
```

### 6.2 Bot Proactive Messaging

```rust
use integrations_microsoft_teams::{
    TeamsClient, TeamsConfig,
    types::{ConversationReference, Activity},
    cards::CardBuilder,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = TeamsConfig::from_env()?;
    let client = TeamsClient::new(config).await?;

    // Retrieve stored conversation reference
    let conv_ref = load_conversation_reference("user_123")?;

    // Send proactive message
    let response = client.bot()
        .send_proactive_message(&conv_ref, "Your report is ready!")
        .await?;

    println!("Sent activity: {}", response.id);

    // Send proactive card
    let card = CardBuilder::new()
        .title("Weekly Report")
        .text("Your weekly metrics are available")
        .add_action_open_url("View Report", "https://reports.example.com/weekly")
        .add_action_submit("Acknowledge", serde_json::json!({"action": "ack"}))
        .build()?;

    client.bot()
        .send_proactive_card(&conv_ref, card)
        .await?;

    Ok(())
}
```

### 6.3 Activity Processing

```rust
use integrations_microsoft_teams::{
    TeamsClient, TeamsConfig,
    types::{Activity, ActivityType},
    services::bot::ActivityHandler,
};
use async_trait::async_trait;

struct MyActivityHandler;

#[async_trait]
impl ActivityHandler for MyActivityHandler {
    async fn on_message(&self, activity: &Activity) -> Result<Option<Activity>, TeamsError> {
        let text = activity.text.as_deref().unwrap_or("");

        if text.contains("help") {
            Ok(Some(Activity::reply(activity, "I can help with:\n- Status checks\n- Deployments\n- Reports")))
        } else if text.contains("status") {
            Ok(Some(Activity::reply(activity, "All systems operational")))
        } else {
            Ok(None) // No response
        }
    }

    async fn on_conversation_update(&self, activity: &Activity) -> Result<(), TeamsError> {
        if activity.members_added.is_some() {
            // Store conversation reference for proactive messaging
            let conv_ref = ConversationReference::from_activity(activity);
            store_conversation_reference(&conv_ref).await?;
        }
        Ok(())
    }

    async fn on_invoke(&self, activity: &Activity) -> Result<Activity, TeamsError> {
        // Handle adaptive card actions
        let value = activity.value.as_ref().ok_or(TeamsError::InvalidActivity)?;

        match value.get("action").and_then(|v| v.as_str()) {
            Some("approve") => {
                // Process approval
                Ok(Activity::invoke_response(200, serde_json::json!({"status": "approved"})))
            }
            Some("reject") => {
                Ok(Activity::invoke_response(200, serde_json::json!({"status": "rejected"})))
            }
            _ => Ok(Activity::invoke_response(400, serde_json::json!({"error": "Unknown action"})))
        }
    }
}

// In your web framework handler
async fn handle_bot_messages(body: Activity) -> impl IntoResponse {
    let handler = MyActivityHandler;
    let client = get_teams_client();

    match client.bot().process_activity(&body, &handler).await {
        Ok(response) => (StatusCode::OK, Json(response)),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(e.to_string())),
    }
}
```

### 6.4 Graph API Operations

```rust
use integrations_microsoft_teams::{
    TeamsClient, TeamsConfig,
    services::graph::ListOptions,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = TeamsConfig::from_env()?;
    let client = TeamsClient::new(config).await?;

    // List all teams the app has access to
    let teams = client.graph()
        .list_teams(ListOptions::default())
        .await?;

    for team in &teams.value {
        println!("Team: {} ({})", team.display_name, team.id);

        // List channels in each team
        let channels = client.graph()
            .list_channels(&team.id, ListOptions::default())
            .await?;

        for channel in &channels.value {
            println!("  Channel: {} ({})", channel.display_name, channel.id);
        }
    }

    // Send message to a channel
    let team_id = "team-uuid";
    let channel_id = "channel-uuid";

    let message = client.graph()
        .send_channel_message(team_id, channel_id, "Hello from the bot!")
        .await?;

    println!("Sent message: {}", message.id);

    // List chats
    let chats = client.graph()
        .list_chats(ListOptions::default())
        .await?;

    for chat in &chats.value {
        println!("Chat: {:?} with {} members", chat.chat_type, chat.members.len());
    }

    Ok(())
}
```

### 6.5 Message Routing

```rust
use integrations_microsoft_teams::{
    TeamsClient, TeamsConfig,
    routing::{
        MessageRouter, RoutingRule, RoutingCondition,
        ChannelDestination, ChatDestination, Destination,
    },
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = TeamsConfig::from_env()?;
    let client = TeamsClient::new(config).await?;

    // Build router with rules
    let router = MessageRouter::new(client.clone())
        // Critical alerts go to ops channel and on-call chat
        .add_rule(RoutingRule::new()
            .condition(RoutingCondition::severity_gte("critical"))
            .destination(ChannelDestination::new("team-id", "ops-channel-id"))
            .destination(ChatDestination::new("oncall-chat-id"))
            .priority(100)
            .build()?)

        // Security alerts go to security channel
        .add_rule(RoutingRule::new()
            .condition(RoutingCondition::tag("security"))
            .destination(ChannelDestination::new("team-id", "security-channel-id"))
            .priority(90)
            .build()?)

        // Everything else goes to general
        .add_rule(RoutingRule::new()
            .condition(RoutingCondition::always())
            .destination(ChannelDestination::new("team-id", "general-channel-id"))
            .priority(0)
            .build()?)

        .build();

    // Route a message
    let message = RoutableMessage::new("Database connection failed")
        .severity("critical")
        .tag("database")
        .tag("infrastructure");

    let result = router.route(message).await?;

    println!("Routed to {} destinations", result.successful_deliveries().len());
    for delivery in result.successful_deliveries() {
        println!("  - {:?}: {}", delivery.destination, delivery.message_id);
    }

    if !result.failed_deliveries().is_empty() {
        println!("Failed deliveries:");
        for failure in result.failed_deliveries() {
            println!("  - {:?}: {}", failure.destination, failure.error);
        }
    }

    Ok(())
}
```

### 6.6 Simulation and Testing

```rust
use integrations_microsoft_teams::{
    simulation::MockTeamsClient,
    types::{Activity, ActivityType},
    cards::CardBuilder,
};

#[tokio::test]
async fn test_webhook_send() {
    // Create mock client
    let mock = MockTeamsClient::new();

    // Configure expected behavior
    mock.webhook()
        .expect_send_card()
        .with_url_matching(".*webhook.*")
        .returning(|_, _| Ok(WebhookResponse::success()));

    // Use mock in tests
    let card = CardBuilder::new()
        .title("Test")
        .text("Test message")
        .build()
        .unwrap();

    let result = mock.webhook()
        .send_card(&test_webhook_url(), card)
        .await;

    assert!(result.is_ok());

    // Verify expectations
    mock.verify();
}

#[tokio::test]
async fn test_activity_processing() {
    let mock = MockTeamsClient::new();

    // Simulate incoming activity
    let activity = Activity {
        activity_type: ActivityType::Message,
        text: Some("help".to_string()),
        from: ChannelAccount {
            id: "user-123".to_string(),
            name: "Test User".to_string(),
        },
        conversation: ConversationAccount {
            id: "conv-123".to_string(),
            ..Default::default()
        },
        ..Default::default()
    };

    // Process with handler
    let handler = MyActivityHandler;
    let response = mock.bot()
        .process_activity(&activity, &handler)
        .await
        .unwrap();

    assert!(response.is_some());
    assert!(response.unwrap().text.unwrap().contains("help"));
}

#[tokio::test]
async fn test_message_replay() {
    use integrations_microsoft_teams::simulation::MessageReplay;

    // Load recorded messages
    let replay = MessageReplay::from_file("fixtures/recorded_session.json").unwrap();

    let mock = MockTeamsClient::with_replay(replay);

    // Replay will return recorded responses
    let result = mock.graph()
        .list_teams(ListOptions::default())
        .await
        .unwrap();

    assert_eq!(result.value.len(), 3); // As recorded
}
```

---

## 7. Configuration Reference

### 7.1 Environment Variables

```bash
# Required: Azure AD / Microsoft Entra ID
TEAMS_CLIENT_ID=<application-client-id>
TEAMS_CLIENT_SECRET=<application-client-secret>
TEAMS_TENANT_ID=<tenant-id-or-common>

# Required for Bot: Bot Framework
TEAMS_BOT_APP_ID=<bot-app-id>
TEAMS_BOT_APP_SECRET=<bot-app-secret>

# Optional: Endpoints (defaults shown)
TEAMS_GRAPH_URL=https://graph.microsoft.com/v1.0
TEAMS_BOT_FRAMEWORK_URL=https://smba.trafficmanager.net

# Optional: Resilience
TEAMS_MAX_RETRIES=3
TEAMS_INITIAL_BACKOFF_MS=1000
TEAMS_MAX_BACKOFF_MS=30000
TEAMS_REQUEST_TIMEOUT_MS=30000
TEAMS_CONNECTION_TIMEOUT_MS=10000

# Optional: Circuit Breaker
TEAMS_CIRCUIT_BREAKER_THRESHOLD=5
TEAMS_CIRCUIT_BREAKER_TIMEOUT_MS=30000

# Optional: Rate Limiting
TEAMS_WEBHOOK_RATE_LIMIT_PER_SECOND=4.0
TEAMS_BOT_RATE_LIMIT_PER_SECOND=1.0

# Optional: Multi-tenant
TEAMS_MULTI_TENANT_ENABLED=false
TEAMS_ALLOWED_TENANTS=tenant-1,tenant-2,tenant-3

# Testing
TEAMS_E2E_TESTS=false
TEAMS_WEBHOOK_URL=<test-webhook-url>
```

### 7.2 Programmatic Configuration

```rust
use integrations_microsoft_teams::{
    TeamsConfig, TeamsAuthConfig, TeamsResilienceConfig,
    MultiTenantConfig, TenantIsolation,
};
use secrecy::SecretString;
use std::time::Duration;

let config = TeamsConfig {
    auth: TeamsAuthConfig {
        client_id: "app-id".to_string(),
        client_secret: SecretString::new("secret".to_string()),
        tenant_id: "tenant-id".to_string(),
        bot_app_id: "bot-id".to_string(),
        bot_app_secret: SecretString::new("bot-secret".to_string()),
    },
    endpoints: TeamsEndpoints::default(),
    resilience: TeamsResilienceConfig {
        max_retries: 3,
        initial_backoff: Duration::from_secs(1),
        max_backoff: Duration::from_secs(30),
        circuit_breaker_threshold: 5,
        circuit_breaker_timeout: Duration::from_secs(30),
        request_timeout: Duration::from_secs(30),
        connection_timeout: Duration::from_secs(10),
        webhook_rate_limit_per_second: 4.0,
        bot_rate_limit_per_second: 1.0,
    },
    routing: None, // Optional routing config
    multi_tenant: MultiTenantConfig {
        enabled: true,
        allowed_tenants: Some(vec!["tenant-1".to_string(), "tenant-2".to_string()]),
        tenant_isolation: TenantIsolation::Strict,
    },
};

let client = TeamsClient::new(config).await?;
```

---

## 8. Error Handling Reference

### 8.1 Error Types

```rust
#[derive(Debug, thiserror::Error)]
pub enum TeamsError {
    // Authentication
    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),

    #[error("Token expired")]
    TokenExpired,

    #[error("Tenant not authorized: {0}")]
    TenantNotAuthorized(String),

    // Webhook
    #[error("Webhook configuration error: {0}")]
    WebhookConfigurationError(String),

    #[error("Webhook not found")]
    WebhookNotFound,

    // Bot
    #[error("Conversation not found: {0}")]
    ConversationNotFound(String),

    #[error("Bot not in team: {0}")]
    BotNotInTeam(String),

    #[error("User blocked bot: {0}")]
    UserBlockedBot(String),

    #[error("Activity not found: {0}")]
    ActivityNotFound(String),

    // Graph
    #[error("Team not found: {0}")]
    TeamNotFound(String),

    #[error("Channel not found: {0}")]
    ChannelNotFound(String),

    #[error("Channel archived: {0}")]
    ChannelArchived(String),

    #[error("Insufficient permissions: requires {0}")]
    InsufficientPermissions(String),

    // Validation
    #[error("Validation error: {0}")]
    ValidationError(String),

    #[error("Card too large: {0} bytes (max {1})")]
    CardTooLarge(usize, usize),

    #[error("Text too long: {0} chars (max {1})")]
    TextTooLong(usize, usize),

    // Resilience
    #[error("Rate limited, retry after {0} seconds")]
    RateLimited(u64),

    #[error("Circuit breaker open for endpoint: {0}")]
    CircuitBreakerOpen(String),

    #[error("Request timeout")]
    Timeout,

    // Transport
    #[error("HTTP error: {status} - {message}")]
    HttpError { status: u16, message: String },

    #[error("Network error: {0}")]
    NetworkError(String),

    // Routing
    #[error("Circular routing detected")]
    CircularRoutingDetected,

    #[error("All destinations failed")]
    AllDestinationsFailed,

    // Serialization
    #[error("Serialization error: {0}")]
    SerializationError(String),
}

impl TeamsError {
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            TeamsError::RateLimited(_)
                | TeamsError::Timeout
                | TeamsError::NetworkError(_)
                | TeamsError::HttpError { status, .. } if *status >= 500
        )
    }

    pub fn error_code(&self) -> &'static str {
        match self {
            TeamsError::AuthenticationFailed(_) => "AUTH_FAILED",
            TeamsError::TokenExpired => "TOKEN_EXPIRED",
            TeamsError::TenantNotAuthorized(_) => "TENANT_NOT_AUTHORIZED",
            TeamsError::WebhookConfigurationError(_) => "WEBHOOK_CONFIG_ERROR",
            TeamsError::WebhookNotFound => "WEBHOOK_NOT_FOUND",
            TeamsError::ConversationNotFound(_) => "CONVERSATION_NOT_FOUND",
            TeamsError::BotNotInTeam(_) => "BOT_NOT_IN_TEAM",
            TeamsError::UserBlockedBot(_) => "USER_BLOCKED_BOT",
            TeamsError::TeamNotFound(_) => "TEAM_NOT_FOUND",
            TeamsError::ChannelNotFound(_) => "CHANNEL_NOT_FOUND",
            TeamsError::ChannelArchived(_) => "CHANNEL_ARCHIVED",
            TeamsError::InsufficientPermissions(_) => "INSUFFICIENT_PERMISSIONS",
            TeamsError::ValidationError(_) => "VALIDATION_ERROR",
            TeamsError::CardTooLarge(_, _) => "CARD_TOO_LARGE",
            TeamsError::TextTooLong(_, _) => "TEXT_TOO_LONG",
            TeamsError::RateLimited(_) => "RATE_LIMITED",
            TeamsError::CircuitBreakerOpen(_) => "CIRCUIT_BREAKER_OPEN",
            TeamsError::Timeout => "TIMEOUT",
            TeamsError::HttpError { .. } => "HTTP_ERROR",
            TeamsError::NetworkError(_) => "NETWORK_ERROR",
            TeamsError::CircularRoutingDetected => "CIRCULAR_ROUTING",
            TeamsError::AllDestinationsFailed => "ALL_DESTINATIONS_FAILED",
            TeamsError::SerializationError(_) => "SERIALIZATION_ERROR",
            _ => "UNKNOWN_ERROR",
        }
    }
}
```

---

## 9. Acceptance Criteria

### 9.1 Functional Requirements

| Requirement | Acceptance Criteria | Test Coverage |
|-------------|---------------------|---------------|
| Webhook messaging | Send text and cards to configured webhooks | Unit + Integration |
| Bot proactive messaging | Send messages using stored conversation references | Unit + Integration |
| Activity processing | Handle message, invoke, conversation update activities | Unit + Integration |
| Graph API - Teams | List teams, get team details | Unit + Integration |
| Graph API - Channels | List channels, send channel messages | Unit + Integration |
| Graph API - Chats | List chats, send chat messages | Unit + Integration |
| Adaptive Cards | Build cards with all element types, validate schema | Unit |
| Message routing | Route by tag, severity, source with multi-destination | Unit + Integration |
| Simulation | MockTeamsClient for all operations | Unit |

### 9.2 Non-Functional Requirements

| Requirement | Acceptance Criteria | Validation |
|-------------|---------------------|------------|
| Performance | Webhook < 500ms p95, Bot < 1s p95 | Load test |
| Reliability | Retry with exponential backoff, circuit breaker | Integration test |
| Security | SecretString for credentials, HTML sanitization | Security review |
| Observability | Metrics, traces, structured logs | Manual verification |
| Code coverage | >90% unit test coverage | CI gate |

### 9.3 API Compatibility

| API | Version | Compatibility |
|-----|---------|---------------|
| Microsoft Graph | v1.0 | Full |
| Bot Framework | v3 | Full |
| Adaptive Cards | 1.5 | Full |
| OAuth 2.0 | RFC 6749 | Full |

---

## 10. SPARC Completion Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-microsoft-teams.md | Complete |
| 2. Pseudocode | pseudocode-microsoft-teams.md | Complete |
| 3. Architecture | architecture-microsoft-teams.md | Complete |
| 4. Refinement | refinement-microsoft-teams.md | Complete |
| 5. Completion | completion-microsoft-teams.md | Complete |

---

## 11. Next Steps

1. **Create directory structure** - Set up Rust and TypeScript project scaffolding
2. **Implement core types** - Start with Phase 1 types and error handling
3. **Integrate shared modules** - Connect azure/auth, shared/resilience, shared/observability
4. **Build services incrementally** - Follow implementation order
5. **Write tests alongside code** - Maintain >90% coverage
6. **Document as you build** - Keep README current

---

*Phase 5: Completion - Complete*
*SPARC Process for Microsoft Teams Integration - Complete*
