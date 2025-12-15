# Refinement: Stripe Integration Module

## SPARC Phase 4: Refinement

**Version:** 1.0.0
**Date:** 2025-12-14
**Status:** Draft
**Module:** `integrations/stripe`

---

## Table of Contents

1. [Interface Contracts](#1-interface-contracts)
2. [Type Definitions](#2-type-definitions)
3. [Validation Rules](#3-validation-rules)
4. [Security Hardening](#4-security-hardening)
5. [Performance Optimization](#5-performance-optimization)
6. [Testing Strategy](#6-testing-strategy)
7. [CI/CD Configuration](#7-cicd-configuration)

---

## 1. Interface Contracts

### 1.1 Core Client Trait

```rust
/// Primary interface for Stripe operations
#[async_trait]
pub trait StripeOperations: Send + Sync {
    /// Get payment intents service
    fn payment_intents(&self) -> &dyn PaymentIntentsService;

    /// Get subscriptions service
    fn subscriptions(&self) -> &dyn SubscriptionsService;

    /// Get invoices service
    fn invoices(&self) -> &dyn InvoicesService;

    /// Get webhooks service
    fn webhooks(&self) -> &dyn WebhookService;

    /// Get sessions service
    fn sessions(&self) -> &dyn SessionsService;

    /// Get customers service
    fn customers(&self) -> &dyn CustomersService;

    /// Check Stripe API health
    async fn health_check(&self) -> Result<HealthStatus, StripeError>;
}
```

### 1.2 Payment Intents Trait

```rust
/// Payment intent operations
#[async_trait]
pub trait PaymentIntentsService: Send + Sync {
    /// Create a new payment intent
    async fn create(&self, request: CreatePaymentIntentRequest)
        -> Result<PaymentIntent, StripeError>;

    /// Retrieve a payment intent by ID
    async fn retrieve(&self, id: &str) -> Result<PaymentIntent, StripeError>;

    /// Update a payment intent
    async fn update(&self, id: &str, request: UpdatePaymentIntentRequest)
        -> Result<PaymentIntent, StripeError>;

    /// Confirm a payment intent
    async fn confirm(&self, id: &str, request: ConfirmPaymentIntentRequest)
        -> Result<PaymentIntent, StripeError>;

    /// Capture a payment intent
    async fn capture(&self, id: &str, amount: Option<i64>)
        -> Result<PaymentIntent, StripeError>;

    /// Cancel a payment intent
    async fn cancel(&self, id: &str, reason: Option<CancellationReason>)
        -> Result<PaymentIntent, StripeError>;

    /// List payment intents with filters
    async fn list(&self, params: ListPaymentIntentsParams)
        -> Result<PaginatedList<PaymentIntent>, StripeError>;
}
```

### 1.3 Subscriptions Trait

```rust
/// Subscription lifecycle operations
#[async_trait]
pub trait SubscriptionsService: Send + Sync {
    /// Create a new subscription
    async fn create(&self, request: CreateSubscriptionRequest)
        -> Result<Subscription, StripeError>;

    /// Retrieve a subscription by ID
    async fn retrieve(&self, id: &str) -> Result<Subscription, StripeError>;

    /// Update a subscription
    async fn update(&self, id: &str, request: UpdateSubscriptionRequest)
        -> Result<Subscription, StripeError>;

    /// Cancel a subscription
    async fn cancel(&self, id: &str, at_period_end: bool)
        -> Result<Subscription, StripeError>;

    /// Pause collection on a subscription
    async fn pause(&self, id: &str) -> Result<Subscription, StripeError>;

    /// Resume collection on a subscription
    async fn resume(&self, id: &str) -> Result<Subscription, StripeError>;

    /// List subscriptions with filters
    async fn list(&self, params: ListSubscriptionsParams)
        -> Result<PaginatedList<Subscription>, StripeError>;

    /// Preview proration for subscription changes
    async fn preview_proration(&self, id: &str, items: Vec<SubscriptionItemParams>)
        -> Result<Invoice, StripeError>;
}
```

### 1.4 Invoices Trait

```rust
/// Invoice operations
#[async_trait]
pub trait InvoicesService: Send + Sync {
    /// Retrieve an invoice by ID
    async fn retrieve(&self, id: &str) -> Result<Invoice, StripeError>;

    /// List invoices with filters
    async fn list(&self, params: ListInvoicesParams)
        -> Result<PaginatedList<Invoice>, StripeError>;

    /// Finalize a draft invoice
    async fn finalize(&self, id: &str) -> Result<Invoice, StripeError>;

    /// Pay an invoice
    async fn pay(&self, id: &str, payment_method: Option<String>)
        -> Result<Invoice, StripeError>;

    /// Void an invoice
    async fn void(&self, id: &str) -> Result<Invoice, StripeError>;

    /// Send an invoice to customer
    async fn send(&self, id: &str) -> Result<Invoice, StripeError>;

    /// Get upcoming invoice for a customer
    async fn upcoming(&self, customer: &str, subscription: Option<String>)
        -> Result<Invoice, StripeError>;
}
```

### 1.5 Webhook Trait

```rust
/// Webhook processing operations
#[async_trait]
pub trait WebhookService: Send + Sync {
    /// Verify webhook signature and parse event
    fn verify_and_parse(&self, payload: &WebhookPayload, tolerance: Duration)
        -> Result<WebhookEvent, StripeError>;

    /// Register an event handler
    fn on(&mut self, event_type: &str, handler: EventHandler) -> &mut Self;

    /// Process a verified event through registered handlers
    async fn process_event(&self, event: WebhookEvent) -> Result<(), StripeError>;

    /// Check if an event has been processed (idempotency)
    async fn is_processed(&self, event_id: &str) -> bool;
}

/// Event handler function type
pub type EventHandler = Box<dyn Fn(WebhookEvent) -> BoxFuture<'static, Result<(), StripeError>>
    + Send + Sync>;
```

### 1.6 Sessions Trait

```rust
/// Checkout and billing portal session operations
#[async_trait]
pub trait SessionsService: Send + Sync {
    /// Create a checkout session
    async fn create_checkout(&self, request: CreateCheckoutSessionRequest)
        -> Result<CheckoutSession, StripeError>;

    /// Retrieve a checkout session
    async fn retrieve_checkout(&self, id: &str)
        -> Result<CheckoutSession, StripeError>;

    /// Expire a checkout session
    async fn expire_checkout(&self, id: &str)
        -> Result<CheckoutSession, StripeError>;

    /// Create a billing portal session
    async fn create_billing_portal(&self, request: CreateBillingPortalSessionRequest)
        -> Result<BillingPortalSession, StripeError>;
}
```

### 1.7 Idempotency Trait

```rust
/// Idempotency key management
pub trait IdempotencyManager: Send + Sync {
    /// Generate an idempotency key for a request
    fn generate<T: Serialize>(&self, operation: &str, request: &T) -> String;

    /// Check if a response is cached for this key
    async fn get_cached(&self, key: &str) -> Option<Bytes>;

    /// Cache a response for an idempotency key
    async fn cache_response(&self, key: &str, response: Bytes);

    /// Check if an event has been processed
    async fn has_processed(&self, event_id: &str) -> bool;

    /// Mark an event as processed
    async fn mark_processed(&self, event_id: &str);
}
```

---

## 2. Type Definitions

### 2.1 Configuration Types

```rust
/// Stripe client configuration
#[derive(Debug, Clone, Deserialize)]
pub struct StripeConfig {
    /// Secret API key
    pub api_key: SecretString,

    /// Webhook signing secret
    pub webhook_secret: SecretString,

    /// API version (e.g., "2024-12-18.acacia")
    #[serde(default = "default_api_version")]
    pub api_version: String,

    /// Base API URL
    #[serde(default = "default_base_url")]
    pub base_url: Url,

    /// Request timeout
    #[serde(default = "default_timeout")]
    #[serde(with = "humantime_serde")]
    pub timeout: Duration,

    /// Maximum retry attempts
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,

    /// Idempotency key strategy
    #[serde(default)]
    pub idempotency_strategy: IdempotencyStrategy,

    /// Simulation mode
    #[serde(default)]
    pub simulation_mode: SimulationMode,
}

fn default_api_version() -> String { "2024-12-18.acacia".to_string() }
fn default_base_url() -> Url { Url::parse("https://api.stripe.com/v1").unwrap() }
fn default_timeout() -> Duration { Duration::from_secs(30) }
fn default_max_retries() -> u32 { 3 }

/// Idempotency key generation strategy
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IdempotencyStrategy {
    #[default]
    UuidV4,
    ContentHash,
    Custom,
}

/// Simulation mode for testing
#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SimulationMode {
    #[default]
    Disabled,
    Record,
    Replay,
}
```

### 2.2 Payment Intent Types

```rust
/// Payment intent object
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentIntent {
    pub id: String,
    pub amount: i64,
    pub currency: Currency,
    pub status: PaymentIntentStatus,
    pub customer: Option<String>,
    pub payment_method: Option<String>,
    pub capture_method: CaptureMethod,
    pub confirmation_method: ConfirmationMethod,
    pub metadata: HashMap<String, String>,
    pub created: i64,
    pub livemode: bool,
    pub latest_charge: Option<String>,
    pub client_secret: Option<String>,
}

/// Payment intent status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaymentIntentStatus {
    RequiresPaymentMethod,
    RequiresConfirmation,
    RequiresAction,
    Processing,
    RequiresCapture,
    Canceled,
    Succeeded,
}

/// Capture method
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CaptureMethod {
    #[default]
    Automatic,
    Manual,
}

/// Create payment intent request
#[derive(Debug, Clone, Serialize)]
pub struct CreatePaymentIntentRequest {
    pub amount: i64,
    pub currency: Currency,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub customer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capture_method: Option<CaptureMethod>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confirm: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// Cancellation reason
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CancellationReason {
    Duplicate,
    Fraudulent,
    RequestedByCustomer,
    Abandoned,
}
```

### 2.3 Subscription Types

```rust
/// Subscription object
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subscription {
    pub id: String,
    pub customer: String,
    pub status: SubscriptionStatus,
    pub items: SubscriptionItems,
    pub current_period_start: i64,
    pub current_period_end: i64,
    pub cancel_at_period_end: bool,
    pub canceled_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub trial_start: Option<i64>,
    pub trial_end: Option<i64>,
    pub default_payment_method: Option<String>,
    pub latest_invoice: Option<String>,
    pub metadata: HashMap<String, String>,
    pub created: i64,
    pub livemode: bool,
}

/// Subscription status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SubscriptionStatus {
    Incomplete,
    IncompleteExpired,
    Trialing,
    Active,
    PastDue,
    Canceled,
    Unpaid,
    Paused,
}

/// Subscription items wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionItems {
    pub data: Vec<SubscriptionItem>,
    pub has_more: bool,
}

/// Subscription item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionItem {
    pub id: String,
    pub price: Price,
    pub quantity: u32,
    pub metadata: HashMap<String, String>,
}

/// Create subscription request
#[derive(Debug, Clone, Serialize)]
pub struct CreateSubscriptionRequest {
    pub customer: String,
    pub items: Vec<SubscriptionItemParams>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_payment_method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trial_period_days: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_cycle_anchor: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cancel_at_period_end: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
}

/// Subscription item params for creation/update
#[derive(Debug, Clone, Serialize)]
pub struct SubscriptionItemParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub price: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quantity: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted: Option<bool>,
}

/// Proration behavior
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProrationBehavior {
    #[default]
    CreateProrations,
    None,
    AlwaysInvoice,
}
```

### 2.4 Webhook Types

```rust
/// Incoming webhook payload
#[derive(Debug)]
pub struct WebhookPayload {
    pub raw_body: Bytes,
    pub signature: String,
}

/// Parsed webhook event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookEvent {
    pub id: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub data: EventData,
    pub created: i64,
    pub livemode: bool,
    pub api_version: String,
    pub pending_webhooks: u32,
}

/// Event data wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventData {
    pub object: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_attributes: Option<serde_json::Value>,
}

/// Parsed signature header
#[derive(Debug)]
pub struct SignatureParts {
    pub timestamp: i64,
    pub signatures: Vec<String>,
}

/// Supported webhook event types
pub mod event_types {
    pub const PAYMENT_INTENT_SUCCEEDED: &str = "payment_intent.succeeded";
    pub const PAYMENT_INTENT_FAILED: &str = "payment_intent.payment_failed";
    pub const PAYMENT_INTENT_CANCELED: &str = "payment_intent.canceled";
    pub const INVOICE_PAID: &str = "invoice.paid";
    pub const INVOICE_PAYMENT_FAILED: &str = "invoice.payment_failed";
    pub const INVOICE_FINALIZED: &str = "invoice.finalized";
    pub const SUBSCRIPTION_CREATED: &str = "customer.subscription.created";
    pub const SUBSCRIPTION_UPDATED: &str = "customer.subscription.updated";
    pub const SUBSCRIPTION_DELETED: &str = "customer.subscription.deleted";
    pub const SUBSCRIPTION_PAUSED: &str = "customer.subscription.paused";
    pub const SUBSCRIPTION_RESUMED: &str = "customer.subscription.resumed";
    pub const CHECKOUT_COMPLETED: &str = "checkout.session.completed";
    pub const CHECKOUT_EXPIRED: &str = "checkout.session.expired";
}
```

### 2.5 Error Types

```rust
/// Stripe integration errors
#[derive(Debug, thiserror::Error)]
pub enum StripeError {
    // Configuration errors
    #[error("Configuration error: {message}")]
    Configuration { message: String },

    #[error("Missing API key")]
    MissingApiKey,

    // Authentication errors
    #[error("Authentication failed: {message}")]
    Authentication { message: String },

    #[error("Invalid API key")]
    InvalidApiKey,

    // Network errors
    #[error("Network error: {message}")]
    Network { message: String, source: Option<Box<dyn std::error::Error + Send + Sync>> },

    #[error("Request timeout after {timeout:?}")]
    Timeout { timeout: Duration },

    #[error("Connection failed: {message}")]
    Connection { message: String },

    // Rate limiting
    #[error("Rate limited, retry after {retry_after:?}")]
    RateLimited { retry_after: Option<Duration> },

    // API errors
    #[error("API error: {message} (code: {code}, type: {error_type})")]
    Api { code: String, error_type: String, message: String, param: Option<String> },

    #[error("Card error: {message} (code: {code})")]
    Card { code: String, message: String, decline_code: Option<String> },

    #[error("Invalid request: {message}")]
    InvalidRequest { message: String, param: Option<String> },

    #[error("Resource not found: {resource_type} {resource_id}")]
    NotFound { resource_type: String, resource_id: String },

    // Idempotency errors
    #[error("Idempotency key already used with different parameters")]
    IdempotencyMismatch,

    #[error("Idempotency key collision")]
    IdempotencyCollision,

    // Webhook errors
    #[error("Invalid webhook signature")]
    InvalidSignature,

    #[error("Webhook timestamp outside tolerance")]
    TimestampOutsideTolerance,

    #[error("Webhook event parse error: {message}")]
    WebhookParse { message: String },

    // Validation errors
    #[error("Validation error: {message}")]
    Validation { message: String, field: Option<String> },

    // Simulation errors
    #[error("Simulation: no recording found for operation")]
    SimulationNotRecorded,

    #[error("Simulation mode mismatch")]
    SimulationModeMismatch,

    // Serialization errors
    #[error("Serialization error: {message}")]
    Serialization { message: String },

    #[error("Deserialization error: {message}")]
    Deserialization { message: String },
}

impl StripeError {
    /// Check if error is retryable
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            StripeError::Network { .. }
            | StripeError::Timeout { .. }
            | StripeError::Connection { .. }
            | StripeError::RateLimited { .. }
        )
    }

    /// Get retry-after duration if applicable
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            StripeError::RateLimited { retry_after } => *retry_after,
            _ => None,
        }
    }
}
```

---

## 3. Validation Rules

### 3.1 Configuration Validation

```rust
impl StripeConfig {
    /// Validate configuration
    pub fn validate(&self) -> Result<(), StripeError> {
        // API key validation
        let key = self.api_key.expose_secret();
        if key.is_empty() {
            return Err(StripeError::MissingApiKey);
        }

        if !key.starts_with("sk_live_") && !key.starts_with("sk_test_") {
            return Err(StripeError::Configuration {
                message: "API key must start with 'sk_live_' or 'sk_test_'".to_string(),
            });
        }

        // API version validation
        if !self.api_version.is_empty() {
            let version_regex = regex::Regex::new(r"^\d{4}-\d{2}-\d{2}(\.\w+)?$").unwrap();
            if !version_regex.is_match(&self.api_version) {
                return Err(StripeError::Configuration {
                    message: format!("Invalid API version format: {}", self.api_version),
                });
            }
        }

        // Timeout validation
        if self.timeout.is_zero() {
            return Err(StripeError::Configuration {
                message: "Timeout must be positive".to_string(),
            });
        }

        if self.timeout > Duration::from_secs(120) {
            tracing::warn!("Timeout exceeds 2 minutes, may cause issues with Stripe");
        }

        // Base URL validation
        if self.base_url.scheme() != "https" {
            return Err(StripeError::Configuration {
                message: "Base URL must use HTTPS".to_string(),
            });
        }

        Ok(())
    }
}
```

### 3.2 Payment Intent Validation

```rust
/// Minimum payment amount by currency (in cents/smallest unit)
const MIN_AMOUNTS: &[(&str, i64)] = &[
    ("usd", 50), ("eur", 50), ("gbp", 30), ("jpy", 50),
    ("cad", 50), ("aud", 50), ("sgd", 50), ("hkd", 400),
];

impl CreatePaymentIntentRequest {
    /// Validate payment intent request
    pub fn validate(&self) -> Result<(), StripeError> {
        // Amount validation
        if self.amount <= 0 {
            return Err(StripeError::Validation {
                message: "Amount must be positive".to_string(),
                field: Some("amount".to_string()),
            });
        }

        // Check minimum amount for currency
        let min_amount = MIN_AMOUNTS
            .iter()
            .find(|(c, _)| *c == self.currency.to_string().to_lowercase())
            .map(|(_, min)| *min)
            .unwrap_or(50);

        if self.amount < min_amount {
            return Err(StripeError::Validation {
                message: format!(
                    "Amount {} is below minimum {} for currency {}",
                    self.amount, min_amount, self.currency
                ),
                field: Some("amount".to_string()),
            });
        }

        // Maximum amount (Stripe limit)
        const MAX_AMOUNT: i64 = 99999999;
        if self.amount > MAX_AMOUNT {
            return Err(StripeError::Validation {
                message: format!("Amount exceeds maximum of {}", MAX_AMOUNT),
                field: Some("amount".to_string()),
            });
        }

        // Customer ID format
        if let Some(ref customer) = self.customer {
            if !customer.starts_with("cus_") {
                return Err(StripeError::Validation {
                    message: "Customer ID must start with 'cus_'".to_string(),
                    field: Some("customer".to_string()),
                });
            }
        }

        // Metadata validation
        if let Some(ref metadata) = self.metadata {
            validate_metadata(metadata)?;
        }

        Ok(())
    }
}

/// Validate metadata constraints
fn validate_metadata(metadata: &HashMap<String, String>) -> Result<(), StripeError> {
    const MAX_KEYS: usize = 50;
    const MAX_KEY_LENGTH: usize = 40;
    const MAX_VALUE_LENGTH: usize = 500;

    if metadata.len() > MAX_KEYS {
        return Err(StripeError::Validation {
            message: format!("Metadata cannot exceed {} keys", MAX_KEYS),
            field: Some("metadata".to_string()),
        });
    }

    for (key, value) in metadata {
        if key.len() > MAX_KEY_LENGTH {
            return Err(StripeError::Validation {
                message: format!("Metadata key '{}' exceeds {} characters", key, MAX_KEY_LENGTH),
                field: Some("metadata".to_string()),
            });
        }

        if value.len() > MAX_VALUE_LENGTH {
            return Err(StripeError::Validation {
                message: format!("Metadata value for '{}' exceeds {} characters", key, MAX_VALUE_LENGTH),
                field: Some("metadata".to_string()),
            });
        }
    }

    Ok(())
}
```

### 3.3 Subscription Validation

```rust
impl CreateSubscriptionRequest {
    /// Validate subscription request
    pub fn validate(&self) -> Result<(), StripeError> {
        // Customer ID validation
        if !self.customer.starts_with("cus_") {
            return Err(StripeError::Validation {
                message: "Customer ID must start with 'cus_'".to_string(),
                field: Some("customer".to_string()),
            });
        }

        // Items validation
        if self.items.is_empty() {
            return Err(StripeError::Validation {
                message: "Subscription must have at least one item".to_string(),
                field: Some("items".to_string()),
            });
        }

        for (i, item) in self.items.iter().enumerate() {
            if !item.price.starts_with("price_") {
                return Err(StripeError::Validation {
                    message: format!("Price ID at index {} must start with 'price_'", i),
                    field: Some("items".to_string()),
                });
            }

            if let Some(qty) = item.quantity {
                if qty == 0 {
                    return Err(StripeError::Validation {
                        message: format!("Quantity at index {} must be positive", i),
                        field: Some("items".to_string()),
                    });
                }
            }
        }

        // Trial validation
        if let Some(trial_days) = self.trial_period_days {
            if trial_days > 730 {
                return Err(StripeError::Validation {
                    message: "Trial period cannot exceed 730 days (2 years)".to_string(),
                    field: Some("trial_period_days".to_string()),
                });
            }
        }

        // Metadata validation
        if let Some(ref metadata) = self.metadata {
            validate_metadata(metadata)?;
        }

        Ok(())
    }
}
```

### 3.4 Webhook Signature Validation

```rust
/// Webhook signature tolerance (default 5 minutes)
const DEFAULT_TOLERANCE: Duration = Duration::from_secs(300);

/// Validate webhook signature
pub fn validate_webhook_signature(
    payload: &WebhookPayload,
    secret: &str,
    tolerance: Option<Duration>,
) -> Result<SignatureParts, StripeError> {
    let tolerance = tolerance.unwrap_or(DEFAULT_TOLERANCE);

    // Parse signature header
    let parts = parse_signature_header(&payload.signature)?;

    // Validate timestamp
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    let time_diff = (now - parts.timestamp).abs();
    if time_diff > tolerance.as_secs() as i64 {
        return Err(StripeError::TimestampOutsideTolerance);
    }

    // Compute expected signature
    let signed_payload = format!("{}.{}", parts.timestamp, String::from_utf8_lossy(&payload.raw_body));
    let expected_signature = compute_hmac_sha256(secret.as_bytes(), signed_payload.as_bytes());

    // Constant-time comparison
    let signature_valid = parts.signatures.iter().any(|sig| {
        constant_time_compare(sig.as_bytes(), expected_signature.as_bytes())
    });

    if !signature_valid {
        return Err(StripeError::InvalidSignature);
    }

    Ok(parts)
}

/// Parse signature header (t=timestamp,v1=signature)
fn parse_signature_header(header: &str) -> Result<SignatureParts, StripeError> {
    let mut timestamp: Option<i64> = None;
    let mut signatures: Vec<String> = Vec::new();

    for part in header.split(',') {
        let part = part.trim();
        if part.starts_with("t=") {
            timestamp = Some(part[2..].parse().map_err(|_| StripeError::WebhookParse {
                message: "Invalid timestamp in signature header".to_string(),
            })?);
        } else if part.starts_with("v1=") {
            signatures.push(part[3..].to_string());
        }
    }

    let timestamp = timestamp.ok_or(StripeError::WebhookParse {
        message: "Missing timestamp in signature header".to_string(),
    })?;

    if signatures.is_empty() {
        return Err(StripeError::WebhookParse {
            message: "Missing v1 signature in header".to_string(),
        });
    }

    Ok(SignatureParts { timestamp, signatures })
}
```

---

## 4. Security Hardening

### 4.1 Secret Management

```rust
/// Secure secret string wrapper
#[derive(Clone)]
pub struct SecretString(String);

impl SecretString {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn expose_secret(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Debug for SecretString {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[REDACTED]")
    }
}

impl std::fmt::Display for SecretString {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[REDACTED]")
    }
}

impl Drop for SecretString {
    fn drop(&mut self) {
        // Zero out memory on drop
        unsafe {
            let bytes = self.0.as_bytes_mut();
            std::ptr::write_bytes(bytes.as_mut_ptr(), 0, bytes.len());
        }
    }
}

/// Credential provider trait
#[async_trait]
pub trait CredentialProvider: Send + Sync {
    /// Get current API key
    async fn get_api_key(&self) -> Result<SecretString, StripeError>;

    /// Get webhook secret
    async fn get_webhook_secret(&self) -> Result<SecretString, StripeError>;

    /// Refresh credentials (for rotation support)
    async fn refresh(&self) -> Result<(), StripeError>;
}
```

### 4.2 Request Sanitization

```rust
/// Headers that should never be logged
const SENSITIVE_HEADERS: &[&str] = &[
    "authorization",
    "stripe-signature",
    "idempotency-key",
];

/// Fields that should be redacted in logs
const SENSITIVE_FIELDS: &[&str] = &[
    "api_key",
    "secret",
    "password",
    "card",
    "number",
    "cvc",
    "exp_month",
    "exp_year",
    "client_secret",
];

/// Sanitize request for logging
pub fn sanitize_request_for_logging(request: &serde_json::Value) -> serde_json::Value {
    match request {
        serde_json::Value::Object(map) => {
            let mut sanitized = serde_json::Map::new();
            for (key, value) in map {
                let sanitized_value = if SENSITIVE_FIELDS.iter().any(|f| key.to_lowercase().contains(f)) {
                    serde_json::Value::String("[REDACTED]".to_string())
                } else {
                    sanitize_request_for_logging(value)
                };
                sanitized.insert(key.clone(), sanitized_value);
            }
            serde_json::Value::Object(sanitized)
        }
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(
                arr.iter().map(sanitize_request_for_logging).collect()
            )
        }
        _ => request.clone(),
    }
}

/// Sanitize headers for logging
pub fn sanitize_headers_for_logging(headers: &http::HeaderMap) -> HashMap<String, String> {
    headers.iter()
        .map(|(name, value)| {
            let name_str = name.to_string().to_lowercase();
            let value_str = if SENSITIVE_HEADERS.contains(&name_str.as_str()) {
                "[REDACTED]".to_string()
            } else {
                value.to_str().unwrap_or("[non-utf8]").to_string()
            };
            (name_str, value_str)
        })
        .collect()
}
```

### 4.3 TLS Configuration

```rust
/// Build secure TLS configuration
pub fn build_tls_config() -> Result<rustls::ClientConfig, StripeError> {
    use rustls::{ClientConfig, RootCertStore};

    let mut root_store = RootCertStore::empty();

    // Use Mozilla's root certificates
    root_store.add_trust_anchors(
        webpki_roots::TLS_SERVER_ROOTS.iter().map(|ta| {
            rustls::OwnedTrustAnchor::from_subject_spki_name_constraints(
                ta.subject,
                ta.spki,
                ta.name_constraints,
            )
        })
    );

    let config = ClientConfig::builder()
        .with_safe_defaults()
        .with_root_certificates(root_store)
        .with_no_client_auth();

    Ok(config)
}

/// Verify connection uses TLS 1.2+
pub fn verify_tls_version(version: &str) -> Result<(), StripeError> {
    match version {
        "TLSv1.2" | "TLSv1.3" => Ok(()),
        _ => Err(StripeError::Configuration {
            message: format!("TLS version {} is not supported, minimum is TLS 1.2", version),
        }),
    }
}
```

### 4.4 Audit Logging

```rust
/// Audit record for Stripe operations
#[derive(Debug, Serialize)]
pub struct AuditRecord {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub operation: String,
    pub resource_type: String,
    pub resource_id: Option<String>,
    pub request_id: String,
    pub idempotency_key: Option<String>,
    pub duration_ms: u64,
    pub result: AuditResult,
    pub livemode: bool,
}

#[derive(Debug, Serialize)]
pub enum AuditResult {
    Success { status_code: u16 },
    Error { error_type: String, message: String },
}

/// Audit logger
pub struct AuditLogger {
    enabled: bool,
}

impl AuditLogger {
    pub fn log(&self, record: &AuditRecord) {
        if !self.enabled {
            return;
        }

        tracing::info!(
            target: "stripe_audit",
            operation = %record.operation,
            resource_type = %record.resource_type,
            resource_id = ?record.resource_id,
            request_id = %record.request_id,
            duration_ms = record.duration_ms,
            livemode = record.livemode,
            result = ?record.result,
            "Stripe API operation"
        );
    }
}
```

---

## 5. Performance Optimization

### 5.1 Connection Pooling

```rust
/// HTTP client configuration for optimal performance
pub struct HttpClientConfig {
    /// Idle connection timeout
    pub pool_idle_timeout: Duration,

    /// Maximum idle connections per host
    pub pool_max_idle_per_host: usize,

    /// Connection timeout
    pub connect_timeout: Duration,

    /// Request timeout
    pub request_timeout: Duration,

    /// Enable HTTP/2
    pub http2_only: bool,
}

impl Default for HttpClientConfig {
    fn default() -> Self {
        Self {
            pool_idle_timeout: Duration::from_secs(90),
            pool_max_idle_per_host: 10,
            connect_timeout: Duration::from_secs(10),
            request_timeout: Duration::from_secs(30),
            http2_only: false,
        }
    }
}

/// Build optimized HTTP client
pub fn build_http_client(config: &HttpClientConfig) -> Result<reqwest::Client, StripeError> {
    let tls_config = build_tls_config()?;

    let client = reqwest::Client::builder()
        .pool_idle_timeout(config.pool_idle_timeout)
        .pool_max_idle_per_host(config.pool_max_idle_per_host)
        .connect_timeout(config.connect_timeout)
        .timeout(config.request_timeout)
        .use_preconfigured_tls(tls_config)
        .gzip(true)
        .build()
        .map_err(|e| StripeError::Configuration {
            message: format!("Failed to build HTTP client: {}", e),
        })?;

    Ok(client)
}
```

### 5.2 Request Batching

```rust
/// Batch multiple list operations with pagination
pub async fn batch_list<T, F, Fut>(
    list_fn: F,
    initial_params: ListParams,
    max_items: Option<usize>,
) -> Result<Vec<T>, StripeError>
where
    F: Fn(ListParams) -> Fut,
    Fut: std::future::Future<Output = Result<PaginatedList<T>, StripeError>>,
{
    let mut all_items = Vec::new();
    let mut params = initial_params;
    let mut items_fetched = 0;

    loop {
        let page = list_fn(params.clone()).await?;

        all_items.extend(page.data);
        items_fetched += page.data.len();

        // Check if we've reached the limit
        if let Some(max) = max_items {
            if items_fetched >= max {
                all_items.truncate(max);
                break;
            }
        }

        // Check if there are more pages
        if !page.has_more {
            break;
        }

        // Update cursor for next page
        if let Some(last) = all_items.last() {
            params.starting_after = Some(last.id.clone());
        } else {
            break;
        }
    }

    Ok(all_items)
}
```

### 5.3 Idempotency Cache

```rust
use lru::LruCache;
use std::num::NonZeroUsize;

/// Idempotency cache for response deduplication
pub struct IdempotencyCache {
    cache: tokio::sync::RwLock<LruCache<String, CacheEntry>>,
    ttl: Duration,
}

#[derive(Clone)]
struct CacheEntry {
    response: Bytes,
    created_at: std::time::Instant,
}

impl IdempotencyCache {
    pub fn new(capacity: usize, ttl: Duration) -> Self {
        Self {
            cache: tokio::sync::RwLock::new(
                LruCache::new(NonZeroUsize::new(capacity).unwrap())
            ),
            ttl,
        }
    }

    pub async fn get(&self, key: &str) -> Option<Bytes> {
        let cache = self.cache.read().await;
        cache.peek(key).and_then(|entry| {
            if entry.created_at.elapsed() < self.ttl {
                Some(entry.response.clone())
            } else {
                None
            }
        })
    }

    pub async fn set(&self, key: String, response: Bytes) {
        let mut cache = self.cache.write().await;
        cache.put(key, CacheEntry {
            response,
            created_at: std::time::Instant::now(),
        });
    }

    pub async fn contains(&self, key: &str) -> bool {
        let cache = self.cache.read().await;
        cache.peek(key).map_or(false, |entry| {
            entry.created_at.elapsed() < self.ttl
        })
    }
}
```

### 5.4 Webhook Processing Optimization

```rust
/// Concurrent webhook event processor
pub struct WebhookProcessor {
    handlers: Arc<HashMap<String, Vec<EventHandler>>>,
    idempotency: Arc<IdempotencyCache>,
    concurrency_limit: usize,
}

impl WebhookProcessor {
    /// Process events with concurrency control
    pub async fn process_batch(
        &self,
        events: Vec<WebhookEvent>,
    ) -> Vec<Result<(), StripeError>> {
        let semaphore = Arc::new(tokio::sync::Semaphore::new(self.concurrency_limit));

        let futures: Vec<_> = events.into_iter().map(|event| {
            let sem = semaphore.clone();
            let handlers = self.handlers.clone();
            let idempotency = self.idempotency.clone();

            async move {
                let _permit = sem.acquire().await.unwrap();

                // Check idempotency
                if idempotency.contains(&event.id).await {
                    return Ok(());
                }

                // Find and execute handlers
                if let Some(event_handlers) = handlers.get(&event.event_type) {
                    for handler in event_handlers {
                        handler(event.clone()).await?;
                    }
                }

                // Mark as processed
                idempotency.set(event.id.clone(), Bytes::new()).await;

                Ok(())
            }
        }).collect();

        futures::future::join_all(futures).await
    }
}
```

---

## 6. Testing Strategy

### 6.1 Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    mod config_validation {
        use super::*;

        #[test]
        fn test_valid_config() {
            let config = StripeConfig {
                api_key: SecretString::new("sk_test_123456789"),
                webhook_secret: SecretString::new("whsec_test_123"),
                api_version: "2024-12-18.acacia".to_string(),
                ..Default::default()
            };

            assert!(config.validate().is_ok());
        }

        #[test]
        fn test_invalid_api_key_format() {
            let config = StripeConfig {
                api_key: SecretString::new("invalid_key"),
                ..Default::default()
            };

            assert!(matches!(
                config.validate(),
                Err(StripeError::Configuration { .. })
            ));
        }

        #[test]
        fn test_missing_api_key() {
            let config = StripeConfig {
                api_key: SecretString::new(""),
                ..Default::default()
            };

            assert!(matches!(
                config.validate(),
                Err(StripeError::MissingApiKey)
            ));
        }
    }

    mod payment_intent_validation {
        use super::*;

        #[test]
        fn test_valid_payment_intent() {
            let request = CreatePaymentIntentRequest {
                amount: 1000,
                currency: Currency::Usd,
                customer: Some("cus_123".to_string()),
                ..Default::default()
            };

            assert!(request.validate().is_ok());
        }

        #[test]
        fn test_amount_below_minimum() {
            let request = CreatePaymentIntentRequest {
                amount: 10, // Below $0.50 minimum for USD
                currency: Currency::Usd,
                ..Default::default()
            };

            assert!(matches!(
                request.validate(),
                Err(StripeError::Validation { field: Some(f), .. }) if f == "amount"
            ));
        }

        #[test]
        fn test_invalid_customer_id() {
            let request = CreatePaymentIntentRequest {
                amount: 1000,
                currency: Currency::Usd,
                customer: Some("invalid_customer".to_string()),
                ..Default::default()
            };

            assert!(matches!(
                request.validate(),
                Err(StripeError::Validation { field: Some(f), .. }) if f == "customer"
            ));
        }
    }

    mod webhook_signature {
        use super::*;

        #[test]
        fn test_parse_signature_header() {
            let header = "t=1234567890,v1=abc123,v1=def456";
            let parts = parse_signature_header(header).unwrap();

            assert_eq!(parts.timestamp, 1234567890);
            assert_eq!(parts.signatures.len(), 2);
            assert_eq!(parts.signatures[0], "abc123");
            assert_eq!(parts.signatures[1], "def456");
        }

        #[test]
        fn test_missing_timestamp() {
            let header = "v1=abc123";
            assert!(matches!(
                parse_signature_header(header),
                Err(StripeError::WebhookParse { .. })
            ));
        }

        #[test]
        fn test_missing_signature() {
            let header = "t=1234567890";
            assert!(matches!(
                parse_signature_header(header),
                Err(StripeError::WebhookParse { .. })
            ));
        }
    }

    mod metadata_validation {
        use super::*;

        #[test]
        fn test_valid_metadata() {
            let mut metadata = HashMap::new();
            metadata.insert("order_id".to_string(), "12345".to_string());
            metadata.insert("user_id".to_string(), "67890".to_string());

            assert!(validate_metadata(&metadata).is_ok());
        }

        #[test]
        fn test_too_many_keys() {
            let metadata: HashMap<String, String> = (0..51)
                .map(|i| (format!("key_{}", i), format!("value_{}", i)))
                .collect();

            assert!(matches!(
                validate_metadata(&metadata),
                Err(StripeError::Validation { .. })
            ));
        }

        #[test]
        fn test_key_too_long() {
            let mut metadata = HashMap::new();
            metadata.insert("a".repeat(50), "value".to_string());

            assert!(matches!(
                validate_metadata(&metadata),
                Err(StripeError::Validation { .. })
            ));
        }
    }
}
```

### 6.2 Integration Tests

```rust
#[cfg(test)]
mod integration_tests {
    use super::*;
    use wiremock::{MockServer, Mock, ResponseTemplate};
    use wiremock::matchers::{method, path, header};

    async fn setup_mock_server() -> MockServer {
        MockServer::start().await
    }

    #[tokio::test]
    async fn test_create_payment_intent() {
        let server = setup_mock_server().await;

        Mock::given(method("POST"))
            .and(path("/v1/payment_intents"))
            .and(header("Authorization", "Bearer sk_test_123"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "id": "pi_test_123",
                "amount": 1000,
                "currency": "usd",
                "status": "requires_payment_method",
                "created": 1234567890,
                "livemode": false
            })))
            .expect(1)
            .mount(&server)
            .await;

        let config = StripeConfig {
            api_key: SecretString::new("sk_test_123"),
            base_url: Url::parse(&server.uri()).unwrap(),
            ..Default::default()
        };

        let client = StripeClient::new(config).await.unwrap();

        let result = client.payment_intents().create(CreatePaymentIntentRequest {
            amount: 1000,
            currency: Currency::Usd,
            ..Default::default()
        }).await;

        assert!(result.is_ok());
        let pi = result.unwrap();
        assert_eq!(pi.id, "pi_test_123");
        assert_eq!(pi.amount, 1000);
    }

    #[tokio::test]
    async fn test_webhook_verification() {
        let secret = "whsec_test_secret";
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let payload = r#"{"id":"evt_test_123","type":"payment_intent.succeeded"}"#;
        let signed_payload = format!("{}.{}", timestamp, payload);
        let signature = compute_hmac_sha256(secret.as_bytes(), signed_payload.as_bytes());

        let webhook_payload = WebhookPayload {
            raw_body: Bytes::from(payload),
            signature: format!("t={},v1={}", timestamp, signature),
        };

        let result = validate_webhook_signature(&webhook_payload, secret, None);
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_rate_limit_handling() {
        let server = setup_mock_server().await;

        Mock::given(method("GET"))
            .and(path("/v1/payment_intents/pi_123"))
            .respond_with(
                ResponseTemplate::new(429)
                    .insert_header("Retry-After", "2")
                    .set_body_json(json!({
                        "error": {
                            "type": "rate_limit_error",
                            "message": "Too many requests"
                        }
                    }))
            )
            .expect(1)
            .mount(&server)
            .await;

        let config = StripeConfig {
            api_key: SecretString::new("sk_test_123"),
            base_url: Url::parse(&server.uri()).unwrap(),
            max_retries: 0, // Disable retries for this test
            ..Default::default()
        };

        let client = StripeClient::new(config).await.unwrap();
        let result = client.payment_intents().retrieve("pi_123").await;

        assert!(matches!(
            result,
            Err(StripeError::RateLimited { retry_after: Some(d) }) if d == Duration::from_secs(2)
        ));
    }
}
```

### 6.3 Simulation Tests

```rust
#[cfg(test)]
mod simulation_tests {
    use super::*;

    #[tokio::test]
    async fn test_record_replay() {
        let temp_dir = tempfile::tempdir().unwrap();
        let recording_path = temp_dir.path().join("recordings.json");

        // Phase 1: Record
        {
            let config = StripeConfig {
                simulation_mode: SimulationMode::Record,
                ..test_config()
            };

            let client = StripeClient::new(config).await.unwrap();

            // Make API calls
            let pi = client.payment_intents().create(CreatePaymentIntentRequest {
                amount: 1000,
                currency: Currency::Usd,
                ..Default::default()
            }).await.unwrap();

            assert!(pi.id.starts_with("pi_"));

            // Save recordings
            client.simulation().save(&recording_path).await.unwrap();
        }

        // Phase 2: Replay
        {
            let config = StripeConfig {
                simulation_mode: SimulationMode::Replay,
                ..test_config()
            };

            let client = StripeClient::with_recordings(config, &recording_path).await.unwrap();

            // Same request should return recorded response
            let pi = client.payment_intents().create(CreatePaymentIntentRequest {
                amount: 1000,
                currency: Currency::Usd,
                ..Default::default()
            }).await.unwrap();

            assert!(pi.id.starts_with("pi_"));
        }
    }

    #[tokio::test]
    async fn test_mock_webhook_events() {
        let event = SimulationLayer::mock_payment_intent_succeeded(1000, "usd");

        assert_eq!(event.event_type, "payment_intent.succeeded");
        assert!(event.id.starts_with("evt_mock_"));

        let object = event.data.object.as_object().unwrap();
        assert_eq!(object.get("amount").unwrap().as_i64().unwrap(), 1000);
        assert_eq!(object.get("currency").unwrap().as_str().unwrap(), "usd");
    }
}
```

---

## 7. CI/CD Configuration

### 7.1 GitHub Actions

```yaml
name: Stripe Integration CI

on:
  push:
    branches: [main]
    paths:
      - 'integrations/stripe/**'
  pull_request:
    branches: [main]
    paths:
      - 'integrations/stripe/**'

env:
  CARGO_TERM_COLOR: always
  RUST_BACKTRACE: 1

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-action@stable
        with:
          components: clippy, rustfmt

      - name: Check formatting
        run: cargo fmt --all -- --check
        working-directory: integrations/stripe

      - name: Run Clippy
        run: cargo clippy --all-targets --all-features -- -D warnings
        working-directory: integrations/stripe

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-action@stable

      - name: Cache cargo
        uses: actions/cache@v3
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}

      - name: Run unit tests
        run: cargo test --lib
        working-directory: integrations/stripe

      - name: Run integration tests
        run: cargo test --test '*'
        working-directory: integrations/stripe
        env:
          STRIPE_TEST_MODE: simulation

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-action@stable

      - name: Install cargo-audit
        run: cargo install cargo-audit

      - name: Run security audit
        run: cargo audit
        working-directory: integrations/stripe

  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-action@stable
        with:
          components: llvm-tools-preview

      - name: Install cargo-llvm-cov
        run: cargo install cargo-llvm-cov

      - name: Generate coverage report
        run: cargo llvm-cov --all-features --lcov --output-path lcov.info
        working-directory: integrations/stripe

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v3
        with:
          files: integrations/stripe/lcov.info
          flags: stripe
```

### 7.2 Cargo Configuration

```toml
# Cargo.toml
[package]
name = "llm-devops-stripe"
version = "0.1.0"
edition = "2021"
authors = ["LLM DevOps Team"]
description = "Stripe integration for LLM DevOps platform"
license = "MIT"

[dependencies]
# HTTP client
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }
http = "1.0"

# Async runtime
tokio = { version = "1.35", features = ["full"] }
async-trait = "0.1"
futures = "0.3"

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Cryptography
hmac = "0.12"
sha2 = "0.10"
subtle = "2.5"

# Error handling
thiserror = "1.0"
anyhow = "1.0"

# Configuration
config = "0.14"
humantime-serde = "1.1"
url = "2.5"

# Logging
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

# Utilities
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1.6", features = ["v4"] }
bytes = "1.5"
lru = "0.12"
regex = "1.10"

# TLS
rustls = "0.22"
webpki-roots = "0.26"

[dev-dependencies]
tokio-test = "0.4"
wiremock = "0.6"
tempfile = "3.9"
pretty_assertions = "1.4"
criterion = "0.5"

[features]
default = []
simulation = []
full-validation = []

[[bench]]
name = "benchmarks"
harness = false
```

### 7.3 TypeScript Package Configuration

```json
{
  "name": "@integrations/stripe",
  "version": "0.1.0",
  "description": "Stripe integration for LLM DevOps platform",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./payment-intents": {
      "import": "./dist/services/payment-intents/index.mjs",
      "require": "./dist/services/payment-intents/index.js",
      "types": "./dist/services/payment-intents/index.d.ts"
    },
    "./subscriptions": {
      "import": "./dist/services/subscriptions/index.mjs",
      "require": "./dist/services/subscriptions/index.js",
      "types": "./dist/services/subscriptions/index.d.ts"
    },
    "./webhooks": {
      "import": "./dist/services/webhooks/index.mjs",
      "require": "./dist/services/webhooks/index.js",
      "types": "./dist/services/webhooks/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@integrations/errors": "workspace:*",
    "@integrations/retry": "workspace:*",
    "@integrations/circuit-breaker": "workspace:*",
    "@integrations/rate-limits": "workspace:*",
    "@integrations/tracing": "workspace:*",
    "@integrations/logging": "workspace:*",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "@vitest/coverage-v8": "^1.0.0",
    "msw": "^2.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-STRIPE-REF-001 |
| Version | 1.0.0 |
| Created | 2025-12-14 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Refinement Document**

*Proceed to Completion phase upon approval.*
